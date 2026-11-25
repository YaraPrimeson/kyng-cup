import { calculateStandings, type GroupMatch, type GroupMember, type TournamentGroup } from "./group-stage.ts";
import type { Message } from "./demo.ts";

type Data = Record<string, unknown>;
type Command = Data & { screen: string; tournament_id?: string; match_id?: string; page?: number; group_id?: string; stage?: string };
type Pair = { id: string; name: string; player_one: string; player_two: string; version: string; linked: boolean };
type Play = { one: number; two: number; sets: [number, number, boolean?][] };
type Match = Omit<GroupMatch, "group_id"> & {
  group_id: string | null;
  bracket_kind: "playoffs" | "basement" | null;
  next_match_id: string | null;
  round: number | null;
  play: Play;
  can_undo: boolean;
  entry_one: boolean;
  entry_two: boolean;
};
type Group = TournamentGroup & { members: GroupMember[] };
type Tournament = { id: string; name: string; sport?: string; status: string };
type Board = {
  tournament?: Tournament;
  tournaments?: Tournament[];
  pairs?: Pair[];
  groups?: Group[];
  matches?: Match[];
  draw_version?: string;
  linked?: boolean;
  error?: string;
  command?: Command;
  ok?: boolean;
};
type Callback = { id: string; from: { id: number }; message?: Message; data?: string };
type Button = [string, Command];
type Slot = { match_id: string; side: number; version: string };
const statuses: Record<string,string> = { draft:"Черновик", published:"Опубликован", live:"Идёт", scheduled:"Ожидает старта", completed:"Завершён" };
const stages: Record<string,string> = { groups:"Группы", playoffs:"Основная сетка", basement:"Короли подвала" };
const pageSize = 8;
const root: Command = { screen:"list", page:0 };
const nonce = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte=>byte.toString(16).padStart(2,"0")).join("");
const totals = (sets: Play["sets"]) => sets.reduce<[number,number]>(([a,b],[x,y])=>[a+Number(x>y),b+Number(y>x)],[0,0]);
const score = (value: number[]) => value.join(":");
const pairName = (pairs: Pair[], id: string | null) => pairs.find(pair=>pair.id===id)?.name ?? "Ожидается пара";
const matchTitle = (match: Match, groups: Group[]) =>
  match.group_id ? "Группа "+(groups.find(group=>group.id===match.group_id)?.code??"")+" · Матч "+match.position
    : match.round===0 ? "Предварительный матч "+match.position : "Раунд "+match.round+" · Матч "+match.position;
const matchLine = (match: Match,pairs: Pair[]) => pairName(pairs,match.pair_one_id)+" — "+pairName(pairs,match.pair_two_id);
const readScore = (text: string) => text.match(/^(\d{1,2})\s*[:–-]\s*(\d{1,2})$/)?.slice(1).map(Number);
function paginate<T>(items: T[], command: Command): [T[], Button[]] {
  const last=Math.max(0,Math.ceil(items.length/pageSize)-1);
  const page=Math.max(0,Math.min(command.page??0,last));
  const nav: Button[]=[];
  if(page>0)nav.push(["← Предыдущие",{...command,page:page-1}]);
  if(page<last)nav.push(["Следующие →",{...command,page:page+1}]);
  return [items.slice(page*pageSize,(page+1)*pageSize),nav];
}
export function telegramOrganiser(
  control: (userId: number, action: string, payload?: Data)=>Promise<unknown>,
  telegram: (method: string,payload: Data)=>Promise<void>,
  botId: ()=>Promise<number>,
) {
  const rpc = (id: number,action: string,payload?: Data)=>control(id,action,payload) as Promise<Board>;
  const reply = (id: number,text: string)=>telegram("sendMessage",{chat_id:id,text});
  async function card(id: number,text: string,rows: Button[][],messageId?: number,input?: Command){
    const key=nonce(12);
    const buttons: Command[]=[];
    const keyboard=rows.filter(row=>row.length).map(row=>row.map(([label,command])=>{
      const index=buttons.push(command)-1;
      return {text:label.slice(0,95),callback_data:"ko:"+key+":"+index};
    }));
    const saved=await rpc(id,"save_panel",{key,buttons,input:input??null});
    if(!saved.ok)return reply(id,saved.error??"Откройте /admin.");
    const panelText=text.slice(0,input?3960:4050);
    if(input)return telegram("sendMessage",{chat_id:id,text:panelText+"\n#ko:"+key,reply_markup:{force_reply:true}});
    return telegram(messageId===undefined?"sendMessage":"editMessageText",{
      chat_id:id,message_id:messageId,text:panelText,reply_markup:{inline_keyboard:keyboard},
    });
  }
  async function list(id: number,command=root,messageId?: number,label?: string){
    const code=nonce(24);
    const result=await rpc(id,label===undefined?"list":"link",{code,label});
    if(!result.linked){
      if(label===undefined)return reply(id,"Для подключения откройте /admin в личном чате.");
      return telegram("sendMessage",{chat_id:id,text:"Подтвердите привязку Telegram в админке KYNG CUP. Ссылка действует 10 минут. Затем снова откройте /admin.",
        reply_markup:{inline_keyboard:[[{text:"Подтвердить в админке",url:"https://kyngcup.com/admin/#telegram="+code}]]},
      });
    }
    const [items,nav]=paginate(result.tournaments??[],command);
    return card(id,"Мои турниры"+(items.length?"":"\nДоступных турниров пока нет."),
      [...items.map((t):Button[]=>[[t.name+" · "+(t.sport??"")+" · "+(statuses[t.status]??t.status),{screen:"board",tournament_id:t.id,stage:"groups"}]]),nav],messageId);
  }
  async function render(id: number,command: Command,messageId?: number,previous?: Board){
    if(command.screen==="list")return list(id,command,messageId);
    const data=previous??await rpc(id,"board",{tournament_id:command.tournament_id});
    if(!data.tournament||!data.pairs||!data.matches||!data.groups)return reply(id,data.error??"Турнир недоступен. Откройте /admin.");
    const {tournament,pairs,matches,groups}=data;
    const stage=command.stage==="groups"&&tournament && !groups.length?"playoffs":command.stage??"groups";
    const home:Command={screen:"board",tournament_id:tournament.id,stage};
    const groupBack:Command={...home,screen:command.group_id?"group":"board",group_id:command.group_id};
    const base:Command={...groupBack,match_id:command.match_id};
    const cardBack:Command={...base,screen:"match"};
    const show=(text:string,rows:Button[][],input?:Command)=>card(id,[data.error,text].filter(Boolean).join("\n\n"),rows,messageId,input);
    const back:Button[]=[["← К матчам",groupBack]];
    const match=matches.find(item=>item.id===command.match_id);
    const active=tournament.status!=="completed";
    const describe=(m:Match)=>matchTitle(m,groups)+(m.court?" · "+m.court:"")+" · "+(statuses[m.status]??m.status);
    const matchButton=(m:Match):Button[]=>[[matchLine(m,pairs)+" · "+(statuses[m.status]??m.status),{...base,screen:"match",match_id:m.id}]];
    const groupMatches=(group:Group)=>matches.filter(m=>m.group_id===group.id) as GroupMatch[];
    const bracket=matches.filter(m=>!m.group_id&&(m.pair_one_id||m.pair_two_id));
    const done=matches.length>0&&matches.every(m=>m.status==="completed");
    const groupReady=groups.length>0&&matches.some(m=>m.group_id)&&matches.filter(m=>m.group_id).every(m=>m.status==="completed");
    const table=(group:Group)=>calculateStandings(group.members,groupMatches(group));
    if(command.screen==="board"){
      const rows:Button[][]=[
        [["Группы",{...home,stage:"groups"}],["Основная",{...home,stage:"playoffs"}],["Короли подвала",{...home,stage:"basement"}]],
      ];
      if(stage==="groups"){
        const [items,nav]=paginate(groups,command);
        rows.push(...items.map((g):Button[]=>[["Группа "+g.code+" · "+groupMatches(g).filter(m=>m.status==="completed").length+"/"+groupMatches(g).length,{...home,screen:"group",group_id:g.id}]]),nav);
      } else {
        const [items,nav]=paginate(matches.filter(m=>m.bracket_kind===stage),command);
        rows.push(...items.map(matchButton),nav);
        if(active&&new Set(slots().map(slot=>slot.match_id)).size>=2)rows.push([["Поменять пары местами",{...home,screen:"swapFirst"}]]);
      }
      if(active&&groupReady&&!bracket.length)rows.push([["Посмотреть обе сетки",{...home,screen:"drawReview"}]]);
      if(active&&done&&bracket.some(m=>m.bracket_kind==="playoffs"&&m.winner_id))rows.push([["Завершить турнир",{...home,screen:"closeReview"}]]);
      rows.push([["Журнал изменений",{...home,screen:"log"}],["← Мои турниры",root]]);
      const champions=tournament.status==="completed"?bracket.filter(m=>m.winner_id&&!m.next_match_id)
        .map(m=>(stages[m.bracket_kind??""]??"Победители")+" · "+pairName(pairs,m.winner_id)).join("\n"):"";
      return show(tournament.name+" · "+(statuses[tournament.status]??tournament.status)+"\n"+(stages[stage]??"Матчи")+
        "\nЗавершено "+matches.filter(m=>m.status==="completed").length+" из "+matches.length+(champions?"\n"+champions:""),rows);
    }
    if(command.screen==="log"){
      const records=await rpc(id,"log",{tournament_id:tournament.id}) as Board & { log?: {created_at:string;action:string;before_state:Data;after_state:Data}[] };
      const labels:Record<string,string>={telegram_correct:"Правка счёта",telegram_finish:"Итог матча",telegram_undo:"Отмена действия",telegram_replace_player:"Замена игрока",telegram_correct_name:"Правка имени",telegram_swap:"Перестановка пар",telegram_close:"Турнир завершён",telegram_draw:"Сетки подтверждены"};
      const lines=(records.log??[]).map(log=>labels[log.action]+
        (log.after_state?.name?" · "+log.before_state?.name+" → "+log.after_state.name:"")+
        (log.after_state?.reason?" · "+log.after_state.reason:"")+" · "+log.created_at.slice(0,16).replace("T"," ")+" UTC");
      return show("Журнал изменений\n"+(lines.join("\n")||"Записей пока нет."),[[["← К турниру",home]]]);
    }
    if(command.screen==="drawReview"&&active&&groupReady&&!bracket.length){
      const qualified=groups.flatMap(group=>table(group).slice(0,group.qualify_count).map(row=>row.pairId));
      const main=qualified.map(pair=>pairName(pairs,pair));
      const basement=pairs.filter(pair=>!qualified.includes(pair.id)).map(pair=>pair.name);
      return show("Подтвердить состав сеток\n\nОсновная сетка\n"+main.join(", ")+"\n\nКороли подвала\n"+
        (basement.length>=2?basement.join(", "):"Недостаточно пар для второй сетки."),
        [[["Подтвердить состав",{...home,screen:"write",action:"draw",qualified,version:data.draw_version}]],back]);
    }
    if(command.screen==="closeReview"&&active&&done){
      return show("Завершить турнир?\nИтоги матчей сохранены. Турнир перейдёт в архив.",[
        [["Подтвердить завершение",{...home,screen:"write",action:"close"}]],back,
      ]);
    }
    const group=groups.find(group=>group.id===command.group_id);
    if((command.screen==="group"||command.screen==="roster")&&group){
      if(command.screen==="roster"){
        const [members,nav]=paginate(group.members,command);
        return show("Состав группы "+group.code,[...members.map(({pair_id}):Button[]=>[[pairName(pairs,pair_id),{...groupBack,screen:"pair",pair_id}]]),nav,
          [["← К группе",groupBack]]]);
      }
      const standings=table(group).map(row=>
        row.place+". "+pairName(pairs,row.pairId)+" · "+row.played+" игр · "+row.won+" побед · Δ сетов "+(row.setsFor-row.setsAgainst)+" · Δ геймов "+(row.gamesFor-row.gamesAgainst));
      const [items,nav]=paginate(groupMatches(group),command);
      return show("Группа "+group.code+" · в основную сетку: "+group.qualify_count+"\n"+standings.join("\n"),[
        ...items.map(m=>matchButton(m as Match)),nav,[["Состав группы",{...groupBack,screen:"roster"}]],[["← К группам",home]],
      ]);
    }
    const pair=pairs.find(pair=>pair.id===command.pair_id);
    if(pair&&(command.screen==="pair"||command.screen==="playerInput"||command.screen==="playerPreview")){
      const pairBack:Command={...groupBack,screen:"pair",pair_id:pair.id};
      if(command.screen==="pair"){
        const lock=pair.linked||matches.some(m=>(m.pair_one_id===pair.id||m.pair_two_id===pair.id)&&(m.status!=="scheduled"||m.bracket_kind));
        const rows:Button[][]=[1,2].map(side=>[
          ["Исправить имя "+side,{...pairBack,screen:"playerInput",side,mode:"name",version:pair.version}],
          ...(!lock?[["Заменить игрока "+side,{...pairBack,screen:"playerInput",side,mode:"replace",version:pair.version}] as Button]:[]),
        ]);
        return show(pair.name+"\n"+pair.player_one+" / "+pair.player_two+(lock?"\nЗамена участника доступна через админку.":""),[
          ...rows,[["← К составу",{...groupBack,screen:"roster"}]],
        ]);
      }
      if(command.version!==pair.version)return show("Состав уже изменился.",[[["Открыть пару",pairBack]]]);
      const old=command.side===1?pair.player_one:pair.player_two;
      if(command.screen==="playerInput")return show((command.mode==="replace"?"Заменить игрока":"Исправить имя")+" · "+pair.name+"\n"+old+
        "\nОтветьте на это сообщение новым именем или отправьте /admin для выхода.",[],command);
      const affected=matches.filter(m=>m.status==="scheduled"&&(m.pair_one_id===pair.id||m.pair_two_id===pair.id)).map(describe);
      return show(pair.name+"\n"+old+" → "+command.name+
        (command.mode==="replace"&&affected.length?"\nБудущие матчи\n"+affected.join("\n"):""),
        [[["Сохранить",{...command,screen:"write",action:"player",return_to:pairBack}]],[["← Назад",pairBack]]]);
    }
    function slots(): Slot[]{
      return matches.filter(m=>m.bracket_kind===stage&&m.status==="scheduled").flatMap(m=>[
        ...(m.entry_one&&m.pair_one_id?[{match_id:m.id,side:1,version:m.updated_at}]:[]),
        ...(m.entry_two&&m.pair_two_id?[{match_id:m.id,side:2,version:m.updated_at}]:[]),
      ]);
    }
    if(command.screen.startsWith("swap")&&active){
      const all=slots();
      const first=all.find(slot=>slot.match_id===command.match_id&&slot.side===command.side&&slot.version===command.version);
      const second=all.find(slot=>slot.match_id===command.other_id&&slot.side===command.other_side&&slot.version===command.other_version);
      const find=(slot:Slot)=>matches.find(m=>m.id===slot.match_id)!;
      const sides=(m:Match)=>[pairName(pairs,m.pair_one_id),pairName(pairs,m.pair_two_id)];
      if(command.screen==="swapPreview"&&first&&second&&first.match_id!==second.match_id){
        const a=find(first),b=find(second),aNames=sides(a),bNames=sides(b);
        const before=[aNames.join(" — "),bNames.join(" — ")].join("\n");
        [aNames[first.side-1],bNames[second.side-1]]=[bNames[second.side-1],aNames[first.side-1]];
        return show((stages[stage]??"")+"\nБыло\n"+before+"\n\nСтанет\n"+[aNames.join(" — "),bNames.join(" — ")].join("\n"),[
          [["Подтвердить перестановку",{...command,screen:"write",action:"swap"}]],[["← К сетке",home]],
        ]);
      }
      const secondPick=command.screen==="swapSecond"&&first;
      const pick=secondPick?all.filter(slot=>slot.match_id!==first.match_id):all;
      const [items,nav]=paginate(pick,secondPick?command:{...home,screen:"swapFirst",page:command.page});
      return show((secondPick?"Выберите вторую пару":"Выберите первую пару")+" · "+(stages[stage]??""),
        [...items.map((slot):Button[]=>[[sides(find(slot))[slot.side-1]+" · "+describe(find(slot)),
          secondPick?{...command,screen:"swapPreview",other_id:slot.match_id,other_side:slot.side,other_version:slot.version}
            :{...home,...slot,screen:"swapSecond"}]]),nav,[["← К сетке",home]]]);
    }
    if(!match)return show("Карточка изменилась. Откройте список матчей.",[back]);
    const names=[pairName(pairs,match.pair_one_id),pairName(pairs,match.pair_two_id)];
    const context={...cardBack,version:match.updated_at,group:!!match.group_id};
    const timeSafe=command.version===undefined||command.version===match.updated_at;
    const make=(screen:string,extra:Data={}):Command=>({...context,screen,...extra});
    const move=(name:string,extra:Data={}):Command=>make("write",{action:"match",move:name,...extra});
    const matchBack:Button[]=[["← К счёту",cardBack]];
    const play=match.play;
    const wins=totals(play.sets);
    const live=score([play.one,play.two]);
    function lines(sets:Play["sets"]){
      const start=Math.max(0,sets.length-pageSize);
      return ["Сеты · "+score(totals(sets)),...sets.slice(start).map(([a,b,award],i)=>
        "Сет "+(start+i+1)+" · "+(award?names[a>b?0:1]+" · без счёта по геймам":a+":"+b))].join("\n");
    }
    if(command.screen!=="match"&&!timeSafe)return show("Счёт обновился. Откройте актуальную карточку.",[matchBack]);
    if(command.screen==="match"){
      const rows:Button[][]=[];
      if(active&&match.status==="scheduled"&&match.pair_one_id&&match.pair_two_id)rows.push([["Начать матч",move("start")]]);
      if(active&&match.status==="live"){
        names.forEach((name,index)=>rows.push([
          ["+1 гейм · "+name,move("plus"+(index+1))],["+1 сет",make("reviewMove",{move:"setplus"+(index+1),side:index})],
          ...((wins[index]??0)>0?[["−1 сет",make("reviewMove",{move:"setminus"+(index+1),side:index})] as Button]:[]),
        ]));
        rows.push([["Ввести геймы",make("scoreInput",{mode:"score"})],["Ввести сеты",make("scoreInput",{mode:"setsscore"})]],
          [["Завершить сет",make("reviewMove",{move:"set"})],["Завершить матч",make("finish")]],
        );
        if(play.sets.length)rows.push([["Исправить сет",make("edit")]]);
        if(match.can_undo)rows.push([["Отменить последнее",make("reviewMove",{move:"undo"})]]);
      }
      if(match.status==="completed"&&match.winner_id)rows.push([["Исправить результат",make("scoreInput",{mode:"correct"})]]);
      return show(describe(match)+"\n"+names.join(" — ")+"\n"+lines(play.sets)+(match.status==="live"?"\nТекущий сет · "+live:"")+
        (match.winner_id?"\nПобедители · "+pairName(pairs,match.winner_id):""),[...rows,back]);
    }
    if(command.screen==="edit"){
      const [sets,nav]=paginate(play.sets,command);
      return show("Какой сет исправить?",[
        ...sets.map((set,i):Button[]=>{const index=(command.page??0)*pageSize+i+1;return [["Сет "+index+" · "+(set[2]?"без счёта по геймам":score(set.slice(0,2) as number[])),make("scoreInput",{mode:"edit"+index})]];}),nav,matchBack,
      ]);
    }
    if(command.screen==="reviewMove"){
      const action=String(command.move);
      if(action==="set"&&play.one===play.two)return show("Счёт геймов равный. Укажите победителя сета через счёт или начислите сет кнопкой +1.",[matchBack]);
      const side=Number(command.side);
      const label=action.startsWith("setplus")?"Начислить сет без геймов · "+names[side]:
        action.startsWith("setminus")?"Убрать последний выигранный сет · "+names[side]:
        action==="undo"?"Отменить последнее действие?":"Завершить сет · "+live;
      return show(label,[[["Подтвердить",move(action)]],matchBack]);
    }
    if(command.screen==="finish"){
      const rows:Button[][]=[];
      if(play.one!==play.two){
        const sets:Play["sets"]=[...play.sets,[play.one,play.two]];
        const [a,b]=totals(sets);
        if(a!==b)rows.push([["Учесть текущий сет · "+score([a,b]),make("finishPreview",{move:"finishwithset"})]]);
      }
      if(wins[0]!==wins[1])rows.push([[play.one||play.two?"Только завершённые сеты · "+score(wins):"Проверить итог · "+score(wins),
        make("finishPreview",{move:play.one||play.two?"finishsets":"finish"})]]);
      return show("Завершить матч\n"+lines(play.sets)+"\nТекущий сет · "+live+
        (rows.length?"":"\nУкажите решающий сет."),[...rows,matchBack]);
    }
    if(command.screen==="finishPreview"){
      const sets:Play["sets"]=command.move==="finishwithset"?[...play.sets,[play.one,play.two]]:play.sets;
      const [a,b]=totals(sets);
      return show("Итог матча\n"+lines(sets)+"\nПобедители · "+names[a>b?0:1]+
        (command.move==="finishsets"?"\nТекущий сет не войдёт в итог.":""),[[["Подтвердить итог матча",move(String(command.move))]],matchBack]);
    }
    if(command.screen==="scoreInput"){
      return show(names.join(" — ")+"\nОтветьте "+(command.mode==="correct"?"новыми итоговыми сетами, например 7:5, 6:4.":"счётом, например "+(command.mode==="setsscore"?"2:1.":"7:5."))+
        "\nДля отмены отправьте /admin.",[],command);
    }
    if(command.screen==="scorePreview"){
      const mode=String(command.mode);
      const index=Number(mode.slice(4))-1;
      const old=mode==="setsscore"?score(wins):mode.startsWith("edit")?(play.sets[index]?.[2]?"без геймов":play.sets[index]?.slice(0,2).join(":")):live;
      return show(names.join(" — ")+"\n"+old+" → "+command.one+":"+command.two,[
        [["Сохранить",move(mode,{one:command.one,two:command.two})]],matchBack,
      ]);
    }
    if(command.screen==="reason"){
      return show("Укажите причину исправления результата · до 300 символов. Для отмены отправьте /admin.",[],command);
    }
    if(command.screen==="correctionPreview"){
      return show("Подтвердить исправление\nБыло\n"+lines(play.sets)+"\n\nСтанет\n"+lines(command.sets as Play["sets"])+
        "\nПричина · "+command.reason,[[["Сохранить исправление",move("correct",{sets:command.sets,reason:command.reason})]],matchBack]);
    }
    return show("Выберите действие заново.",[matchBack]);
  }
  async function handle(id:number,command:Command,messageId?:number){
    if(command.screen==="write"){
      const result=await rpc(id,String(command.action),command);
      const next=(command.return_to as Command|undefined)??{...command,screen:command.match_id&&command.action==="match"?"match":"board"};
      return render(id,next,messageId,result);
    }
    return render(id,command,messageId);
  }
  return {
    open:(id:number,label:string)=>list(id,root,undefined,label),
    async callback(update:Callback){
      const data=update.data?.match(/^ko:([a-f0-9]{24}):(\d{1,3})$/);
      if(!data||update.message?.chat?.type!=="private"||update.message.chat.id!==update.from.id){
        await telegram("answerCallbackQuery",{callback_query_id:update.id});
        return;
      }
      const id=update.from.id;
      const panel=await rpc(id,"button",{key:data[1],index:Number(data[2])});
      await telegram("answerCallbackQuery",{callback_query_id:update.id,...(panel.command?{}:{text:panel.error??"Откройте /admin."})});
      if(panel.command)await handle(id,panel.command,update.message.message_id);
    },
    async textReply(id:number,message:Message,text:string){
      const original=message.reply_to_message;
      const key=original?.text?.match(/\n#ko:([a-f0-9]{24})$/)?.[1];
      if(!key||original?.from?.id!==await botId())return false;
      const panel=await rpc(id,"input",{key});
      const command=panel.command;
      if(!command){await reply(id,panel.error??"Откройте /admin.");return true;}
      if(command.screen==="playerInput"){
        if(text.length<=75&&!/[\r\n]/.test(text))await handle(id,{...command,screen:"playerPreview",name:text});
        else {await reply(id,"Введите имя до 75 символов в одной строке.");await handle(id,command);}
      }else if(command.screen==="reason"){
        if(text.length<=300)await handle(id,{...command,screen:"correctionPreview",reason:text});
        else{await reply(id,"Причина должна быть до 300 символов.");await handle(id,command);}
      }else if(command.mode==="correct"){
        const sets=text.split(",").map(readScore);
        if(sets.length<=198&&sets.every(set=>set&&set[0]!==set[1])&&totals(sets as Play["sets"])[0]!==totals(sets as Play["sets"])[1]){
          await handle(id,{...command,screen:"reason",sets});
        }else{await reply(id,"Укажите завершённые сеты и решающий счёт, например 7:5, 6:4.");await handle(id,command);}
      }else{
        const values=readScore(text);
        if(values&&(!String(command.mode).startsWith("edit")||values[0]!==values[1])){
          await handle(id,{...command,screen:"scorePreview",one:values[0],two:values[1]});
        }else{await reply(id,"Проверьте формат счёта, например 7:5.");await handle(id,command);}
      }
      return true;
    },
  };
}
