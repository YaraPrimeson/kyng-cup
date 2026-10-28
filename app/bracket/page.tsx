"use client";

import KnockoutBoard from "../knockout-board";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Language, useLanguage } from "../i18n";
import { calculateStandings, GroupMatch, GroupMember, TournamentGroup } from "../group-stage";

type Sport = "tennis" | "padel";

type Tournament = {
  id: string;
  slug: string;
  name: string;
  sport: Sport;
  location: string | null;
  starts_at: string | null;
  bracket_size: number;
  format: "knockout" | "group_knockout";
  participant_count: number;
  status: "published" | "live" | "completed";
};

type Pair = { id: string; name: string; player_one: string; player_two: string; seed: number | null; country_code: string | null };
type Match = { next_match_id: string | null; next_slot: number | null; bracket_kind: "playoffs" | "basement"; id: string; round: number; position: number; pair_one_id: string | null; pair_two_id: string | null; pair_one_sets: number[]; pair_two_sets: number[]; winner_id: string | null; status: "scheduled" | "live" | "completed"; court: string | null; scheduled_at: string | null };

const bracketCopy = {
  en: { headingA: "Tournament", headingB: "bracket", groups: "Group stage", playoffs: "Playoffs", qualified: "Qualifies", played: "P", won: "W", lost: "L", sets: "Sets", games: "Games", points: "Pts", groupRule: "Highlighted positions advance to the playoffs.", decided: "To be decided", previousWinner: "Winner of previous match", scheduleTba: "Schedule TBA", courtTba: "Court TBA", final: "Final", live: "Live", scheduled: "Scheduled", locationTba: "Location TBA", pairs: "doubles pairs", previous: "Previous", next: "Next", noBracket: "No published tournament bracket is available yet.", loadError: "The latest match data could not be loaded." },
  uk: { headingA: "Турнірна", headingB: "сітка", groups: "Груповий етап", playoffs: "Плей-оф", qualified: "Виходить", played: "І", won: "В", lost: "П", sets: "Сети", games: "Гейми", points: "Очки", groupRule: "Виділені позиції виходять у плей-оф.", decided: "Ще не визначено", previousWinner: "Переможець попереднього матчу", scheduleTba: "Розклад уточнюється", courtTba: "Корт уточнюється", final: "Фінал", live: "Наживо", scheduled: "Заплановано", locationTba: "Локація уточнюється", pairs: "пар", previous: "Назад", next: "Далі", noBracket: "Опублікованої турнірної сітки поки немає.", loadError: "Не вдалося завантажити актуальні дані матчів." },
  de: { headingA: "Turnier-", headingB: "baum", groups: "Gruppenphase", playoffs: "K.-o.-Runde", qualified: "Qualifiziert", played: "Sp", won: "S", lost: "N", sets: "Sätze", games: "Spiele", points: "Pkt", groupRule: "Die markierten Plätze erreichen die K.-o.-Runde.", decided: "Noch offen", previousWinner: "Sieger des vorherigen Matches", scheduleTba: "Zeitplan folgt", courtTba: "Court folgt", final: "Finale", live: "Live", scheduled: "Geplant", locationTba: "Ort folgt", pairs: "Doppelpaare", previous: "Zurück", next: "Weiter", noBracket: "Noch kein veröffentlichter Turnierbaum verfügbar.", loadError: "Die aktuellen Matchdaten konnten nicht geladen werden." },
  ru: { headingA: "Турнирная", headingB: "сетка", groups: "Групповой этап", playoffs: "Плей-офф", qualified: "Выходит", played: "И", won: "В", lost: "П", sets: "Сеты", games: "Геймы", points: "Очки", groupRule: "Выделенные позиции выходят в плей-офф.", decided: "Ещё не определено", previousWinner: "Победитель предыдущего матча", scheduleTba: "Расписание уточняется", courtTba: "Корт уточняется", final: "Финал", live: "В эфире", scheduled: "Запланирован", locationTba: "Локация уточняется", pairs: "пар", previous: "Назад", next: "Далее", noBracket: "Опубликованной турнирной сетки пока нет.", loadError: "Не удалось загрузить актуальные данные матчей." },
} as const;

const basementCopy = {
  en: { tab: "Basement King", title: "The Basement King", intro: "Pairs that do not advance from their group continue in a separate consolation bracket.", waiting: "The bracket will be formed automatically when every group match is complete.", players: "Future bracket participants", round: "Consolation round" },
  uk: { tab: "Король підвалу", title: "Король підвалу", intro: "Пари, які не вийшли з групи, продовжують грати в окремій втішній сітці.", waiting: "Сітка сформується автоматично після завершення всіх матчів у групах.", players: "Майбутні учасники сітки", round: "Втішний раунд" },
  de: { tab: "König des Kellers", title: "König des Kellers", intro: "Paare, die ihre Gruppe nicht überstehen, spielen in einem eigenen Trostturnier weiter.", waiting: "Der Turnierbaum wird nach Abschluss aller Gruppenspiele automatisch erstellt.", players: "Künftige Teilnehmer", round: "Trostrunde" },
  ru: { tab: "Король подвала", title: "Король подвала", intro: "Пары, которые не вышли из группы, продолжают играть в отдельной утешительной сетке.", waiting: "Сетка сформируется автоматически после завершения всех матчей в группах.", players: "Будущие участники сетки", round: "Утешительный раунд" },
} as const;

function getRounds(size: number, language: Language) {
  const labelsByLanguage: Record<Language, Record<number, string[]>> = {
    en: {
    2: ["Final"],
    4: ["Semifinal", "Final"],
    8: ["Quarterfinal", "Semifinal", "Final"],
    16: ["Round of 16", "Quarterfinal", "Semifinal", "Final"],
    32: ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"],
    64: ["Round of 64", "Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"],
    },
    uk: { 2: ["Фінал"], 4: ["Півфінал", "Фінал"], 8: ["Чвертьфінал", "Півфінал", "Фінал"], 16: ["1/8 фіналу", "Чвертьфінал", "Півфінал", "Фінал"], 32: ["1/16 фіналу", "1/8 фіналу", "Чвертьфінал", "Півфінал", "Фінал"], 64: ["1/32 фіналу", "1/16 фіналу", "1/8 фіналу", "Чвертьфінал", "Півфінал", "Фінал"] },
    de: { 2: ["Finale"], 4: ["Halbfinale", "Finale"], 8: ["Viertelfinale", "Halbfinale", "Finale"], 16: ["Achtelfinale", "Viertelfinale", "Halbfinale", "Finale"], 32: ["Sechzehntelfinale", "Achtelfinale", "Viertelfinale", "Halbfinale", "Finale"], 64: ["Runde der 64", "Sechzehntelfinale", "Achtelfinale", "Viertelfinale", "Halbfinale", "Finale"] },
    ru: { 2: ["Финал"], 4: ["Полуфинал", "Финал"], 8: ["Четвертьфинал", "Полуфинал", "Финал"], 16: ["1/8 финала", "Четвертьфинал", "Полуфинал", "Финал"], 32: ["1/16 финала", "1/8 финала", "Четвертьфинал", "Полуфинал", "Финал"], 64: ["1/32 финала", "1/16 финала", "1/8 финала", "Четвертьфинал", "Полуфинал", "Финал"] },
  };
  const labels = labelsByLanguage[language];
  return (labels[size] ?? labels[16]).map((label, index) => ({ number: index + 1, label }));
}

function PairRow({ pair, scores, winner, language }: { pair?: Pair; scores: number[]; winner: boolean; language: Language }) {
  const text = bracketCopy[language];
  return <div className={`bracket-pair${winner ? " is-winner" : ""}${!pair ? " is-pending" : ""}`}><span className="pair-seed">{pair?.seed ? String(pair.seed).padStart(2, "0") : "—"}</span><span className="pair-name"><strong>{pair?.name ?? text.decided}</strong><small>{pair ? `${pair.player_one} · ${pair.player_two}` : text.previousWinner}</small></span><span className="pair-score">{scores.length ? scores.join(" · ") : "—"}</span></div>;
}

const dateLocales: Record<Language, string> = { en: "en-GB", uk: "uk-UA", de: "de-DE", ru: "ru-RU" };

function MatchCard({ match, pairMap, language }: { match: Match; pairMap: Map<string, Pair>; language: Language }) {
  const pairOne = match.pair_one_id ? pairMap.get(match.pair_one_id) : undefined;
  const pairTwo = match.pair_two_id ? pairMap.get(match.pair_two_id) : undefined;
  const text = bracketCopy[language];
  const date = match.scheduled_at ? new Intl.DateTimeFormat(dateLocales[language], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(match.scheduled_at)) : text.scheduleTba;
  return <article className={`bracket-match status-${match.status}`}><span className="match-connector" aria-hidden="true" /><div className="match-meta"><span>{date}</span><span>{match.court ?? text.courtTba}</span><strong>{match.status === "completed" ? text.final : match.status === "live" ? text.live : text.scheduled}</strong></div><PairRow pair={pairOne} scores={match.pair_one_sets} winner={match.winner_id === match.pair_one_id && !!match.winner_id} language={language} /><PairRow pair={pairTwo} scores={match.pair_two_sets} winner={match.winner_id === match.pair_two_id && !!match.winner_id} language={language} /></article>;
}

function PublicGroupStage({ groups, members, matches, pairMap, language }: { groups: TournamentGroup[]; members: GroupMember[]; matches: GroupMatch[]; pairMap: Map<string, Pair>; language: Language }) {
  const text = bracketCopy[language];
  const [activeGroup, setActiveGroup] = useState(groups[0]?.code ?? "A");
  const visibleGroups = groups.filter((group) => group.code === activeGroup);
  return <section className="groups-stage">
    <div className="groups-stage-heading"><p>{text.groupRule}</p><nav aria-label={text.groups}>{groups.map((group) => <button type="button" className={activeGroup === group.code ? "is-active" : ""} onClick={() => setActiveGroup(group.code)} key={group.id}>{group.code}</button>)}</nav></div>
    <div className="public-groups-grid">{groups.map((group) => {
      const groupMembers = members.filter((member) => member.group_id === group.id);
      const groupMatches = matches.filter((match) => match.group_id === group.id);
      const standings = calculateStandings(groupMembers, groupMatches);
      const groupCompleted = groupMatches.length > 0 && groupMatches.every((match) => match.status === "completed");
      return <article className={`${visibleGroups.includes(group) ? "is-active" : ""}`} key={group.id}>
        <header><span>Group</span><h2>{group.code}</h2></header>
        <div className="group-table-scroll"><table><thead><tr><th>#</th><th>Pair</th><th>{text.played}</th><th>{text.won}</th><th>{text.lost}</th><th>{text.sets}</th><th>{text.games}</th><th>{text.points}</th></tr></thead><tbody>{standings.map((row) => { const pair = pairMap.get(row.pairId); const qualifies = row.place <= group.qualify_count; return <tr className={qualifies ? "is-qualified" : ""} key={row.pairId}><td><b>{row.place}</b></td><td><strong>{pair?.name}</strong><small>{pair?.player_one} · {pair?.player_two}</small>{qualifies && groupCompleted && <em>{text.qualified}</em>}</td><td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td><td>{row.setsFor}:{row.setsAgainst}</td><td>{row.gamesFor}:{row.gamesAgainst}</td><td><b>{row.points}</b></td></tr>; })}</tbody></table></div>
        <div className="group-match-list">{groupMatches.map((match) => { const one = pairMap.get(match.pair_one_id); const two = pairMap.get(match.pair_two_id); const date = match.scheduled_at ? new Intl.DateTimeFormat(dateLocales[language], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(match.scheduled_at)) : text.scheduleTba; return <div className={`group-match-row status-${match.status}`} key={match.id}><span>{date}<small>{match.court ?? text.courtTba}</small></span><strong>{one?.name}<i>{match.pair_one_sets.length ? match.pair_one_sets.join(" · ") : "—"}</i></strong><strong>{two?.name}<i>{match.pair_two_sets.length ? match.pair_two_sets.join(" · ") : "—"}</i></strong></div>; })}</div>
      </article>;
    })}</div>
  </section>;
}

function BasementKing({ groups, members, matches, games, pairMap, language }: { groups: TournamentGroup[]; members: GroupMember[]; matches: GroupMatch[]; games: Match[]; pairMap: Map<string, Pair>; language: Language }) {
  const text = basementCopy[language];
  const allGroupsComplete = groups.length > 0 && groups.every((group) => {
    const groupMatches = matches.filter((match) => match.group_id === group.id);
    return groupMatches.length > 0 && groupMatches.every((match) => match.status === "completed");
  });
  const eliminated = groups.flatMap((group) => {
    const groupMembers = members.filter((member) => member.group_id === group.id);
    const standings = calculateStandings(groupMembers, matches.filter((match) => match.group_id === group.id));
    const actualIds = new Set(games.flatMap(game => [game.pair_one_id, game.pair_two_id]).filter(Boolean));
    return standings.filter((row) => games.length ? actualIds.has(row.pairId) : row.place > group.qualify_count).map((row) => ({ ...row, group: group.code }));
  });

  return <section className="basement-stage">
    <header><div><span>KYNG CUP · SECOND CHANCE</span><h2>{text.title}<b>.</b></h2><p>{text.intro}</p></div><div className="basement-crown" aria-hidden="true">♛</div></header>
    {!allGroupsComplete && <div className="basement-waiting"><i /><div><strong>{text.waiting}</strong><span>{text.players}: {eliminated.length || "—"}</span></div></div>}
    <div className="basement-pairs">{eliminated.map((row, index) => { const pair = pairMap.get(row.pairId); return <article key={row.pairId}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{pair?.name}</strong><small>{pair?.player_one} · {pair?.player_two}</small></div><b>GROUP {row.group} · #{row.place}</b></article>; })}</div>
    {!games.length && allGroupsComplete && eliminated.length > 1 && <div className="basement-preview"><span>{text.round}</span><div>{Array.from({ length: Math.ceil(eliminated.length / 2) }, (_, index) => { const one = pairMap.get(eliminated[index * 2]?.pairId); const two = pairMap.get(eliminated[index * 2 + 1]?.pairId); return <article key={index}><small>MATCH {String(index + 1).padStart(2, "0")}</small><strong>{one?.name ?? "TBD"}</strong><i>vs</i><strong>{two?.name ?? "BYE"}</strong></article>; })}</div></div>}
    {games.length > 0 && <KnockoutBoard matches={games} size={2 ** Math.max(1,...games.map(game => game.round))} label="Basement King bracket" renderMatch={match => <MatchCard match={match} pairMap={pairMap} language={language} />} />}
  </section>;
}

export default function BracketPage() {
  const { language } = useLanguage();
  const text = bracketCopy[language];
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groups, setGroups] = useState<TournamentGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupMatches, setGroupMatches] = useState<GroupMatch[]>([]);
  const [stage, setStage] = useState<"groups" | "playoffs" | "basement">("groups");
  const [activeRound, setActiveRound] = useState(1);
  const displayedTournament = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBracket = useCallback(async (requestedSlug?: string) => {
    const tournamentResult = await supabase.from("tournaments").select("id,slug,name,sport,location,starts_at,bracket_size,format,participant_count,status").in("status", ["published", "live", "completed"]).order("starts_at", { ascending: false, nullsFirst: false });
    if (tournamentResult.error || !tournamentResult.data?.length) { setError(text.noBracket); setLoading(false); return; }
    const available = tournamentResult.data as Tournament[];
    const urlSlug = requestedSlug ?? new URLSearchParams(window.location.search).get("tournament") ?? undefined;
    const requestedSport = new URLSearchParams(window.location.search).get("sport") as Sport | null;
    const sportAvailable = requestedSport ? available.filter((item) => item.sport === requestedSport) : available;
    const now = Date.now();
    const current = available.find((item) => item.slug === urlSlug)
      ?? sportAvailable.find((item) => item.status === "live")
      ?? [...sportAvailable].reverse().find((item) => item.status === "published" && item.starts_at && new Date(item.starts_at).getTime() >= now)
      ?? sportAvailable.find((item) => item.status === "completed")
      ?? sportAvailable[0]
      ?? available[0];
    const groupsResult = await supabase.from("tournament_groups").select("id,code,qualify_count").eq("tournament_id", current.id).order("code");
    const groupIds = (groupsResult.data ?? []).map((item) => item.id);
    const [pairsResult, matchesResult, membersResult, groupMatchesResult] = await Promise.all([
      supabase.from("pairs").select("id,name,player_one,player_two,seed,country_code").eq("tournament_id", current.id).order("seed"),
      supabase.from("matches").select("id,round,bracket_kind,position,next_match_id,next_slot,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court,scheduled_at").eq("tournament_id", current.id).order("round").order("position"),
      groupIds.length ? supabase.from("group_members").select("group_id,pair_id,position").in("group_id", groupIds) : Promise.resolve({ data: [], error: null }),
      supabase.from("group_matches").select("id,tournament_id,group_id,position,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court,scheduled_at,updated_at").eq("tournament_id", current.id).order("group_id").order("position"),
    ]);
    if (pairsResult.error || matchesResult.error || groupsResult.error || membersResult.error || groupMatchesResult.error) setError(text.loadError);
    else { setTournaments(available); setTournament(current); setPairs((pairsResult.data ?? []) as Pair[]); setMatches((matchesResult.data ?? []) as Match[]); setGroups((groupsResult.data ?? []) as TournamentGroup[]); setGroupMembers((membersResult.data ?? []) as GroupMember[]); setGroupMatches((groupMatchesResult.data ?? []) as GroupMatch[]); if (displayedTournament.current !== current.id) { setStage(current.format === "group_knockout" && !(matchesResult.data ?? []).some((match) => (match.round === 0 || match.round === 1) && match.pair_one_id && match.bracket_kind !== "basement") ? "groups" : "playoffs"); displayedTournament.current = current.id; } setError(null); }
    setLoading(false);
  }, [text.loadError, text.noBracket]);

  useEffect(() => { const timer = window.setTimeout(() => void loadBracket(), 0); return () => window.clearTimeout(timer); }, [loadBracket]);
  useEffect(() => {
    if (!tournament?.id) return;
    const channel = supabase.channel(`public:${tournament.id}`).on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tournament.id}` }, () => void loadBracket(tournament.slug)).on("postgres_changes", { event: "*", schema: "public", table: "group_matches", filter: `tournament_id=eq.${tournament.id}` }, () => void loadBracket(tournament.slug)).on("postgres_changes", { event: "*", schema: "public", table: "pairs", filter: `tournament_id=eq.${tournament.id}` }, () => void loadBracket(tournament.slug)).on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${tournament.id}` }, () => void loadBracket(tournament.slug)).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadBracket, tournament?.id, tournament?.slug]);

  const pairMap = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);
  const playoffMatches = useMemo(() => matches.filter(match => match.bracket_kind !== "basement"), [matches]);
  const basementMatches = useMemo(() => matches.filter(match => match.bracket_kind === "basement"), [matches]);
  const rounds = useMemo(() => {
    const main = getRounds(tournament?.bracket_size ?? 16, language);
    return playoffMatches.some(match => match.round === 0) ? [{ number: 0, label: { en: "Preliminary", ru: "Предварительная игра", uk: "Попередня гра", de: "Vorrunde" }[language] }, ...main] : main;
  }, [language, tournament?.bracket_size, playoffMatches]);
  const activeIndex = Math.max(0, rounds.findIndex(round => round.number === activeRound));
  const finalMatch = playoffMatches.find((match) => match.round === Math.log2(tournament?.bracket_size ?? 16) && match.position === 1);
  const champion = finalMatch?.winner_id ? pairMap.get(finalMatch.winner_id) : undefined;

  function selectTournament(slug: string) {
    const next = tournaments.find((item) => item.slug === slug);
    const url = new URL(window.location.href); url.searchParams.set("tournament", slug); if (next) url.searchParams.set("sport", next.sport); window.history.replaceState({}, "", url);
    setLoading(true); setActiveRound(1); void loadBracket(slug);
  }

  return <main className="bracket-page">
    <section className="bracket-intro"><div><p className="eyebrow">Live tournament experience</p><h1>{text.headingA}<br />{text.headingB}<span className="accent-dot">.</span></h1></div><div className="bracket-summary"><span className={`live-indicator${tournament?.status === "live" ? " is-live" : ""}`}><i /> {tournament?.status === "live" ? "Live updates" : "Tournament schedule"}</span><strong>{tournament?.name ?? "KYNG CUP"}</strong><span>{tournament?.location ?? text.locationTba} · {tournament?.participant_count ?? tournament?.bracket_size ?? 16} {text.pairs}</span>{tournaments.length > 1 && <label className="bracket-selector"><span>Choose tournament</span><select value={tournament?.slug ?? ""} onChange={(event) => selectTournament(event.target.value)}>{tournaments.map((item) => <option value={item.slug} key={item.id}>{item.name}</option>)}</select></label>}</div></section>
    {champion && <section className="champion-banner"><span>Champion</span><div><strong>{champion.name}</strong><small>{champion.player_one} · {champion.player_two}</small></div><b>KYNG CUP</b></section>}
    {loading ? <div className="bracket-state" role="status" aria-live="polite">Loading the draw…</div> : error ? <div className="bracket-state is-error" role="alert">{error}</div> : <>
      {tournament?.format === "group_knockout" && <nav className="stage-tabs" aria-label="Tournament stages"><button type="button" className={stage === "groups" ? "is-active" : ""} onClick={() => setStage("groups")}>{text.groups}</button><button type="button" className={stage === "playoffs" ? "is-active" : ""} onClick={() => setStage("playoffs")}>{text.playoffs}</button><button type="button" className={stage === "basement" ? "is-active basement-tab" : "basement-tab"} onClick={() => setStage("basement")}>{basementCopy[language].tab}</button></nav>}
      {tournament?.format === "group_knockout" && stage === "groups" ? <PublicGroupStage groups={groups} members={groupMembers} matches={groupMatches} pairMap={pairMap} language={language} /> : tournament?.format === "group_knockout" && stage === "basement" ? <BasementKing groups={groups} members={groupMembers} matches={groupMatches} games={basementMatches} pairMap={pairMap} language={language} /> : <>
      <nav className="round-tabs" aria-label="Tournament rounds">{rounds.map((round) => <button className={activeRound === round.number ? "is-active" : ""} type="button" onClick={() => setActiveRound(round.number)} key={round.number}><span>0{round.number}</span>{round.label}</button>)}</nav>
      <section className="bracket-scroll" aria-label="Tournament bracket"><KnockoutBoard matches={playoffMatches} size={tournament?.bracket_size ?? 16} activeRound={activeRound} roundLabel={round => rounds.find(item => item.number === round)?.label ?? ""} renderMatch={match => <MatchCard match={match} pairMap={pairMap} language={language} />} /></section>
      <div className="round-mobile-controls"><button type="button" onClick={() => setActiveRound(rounds[Math.max(0, activeIndex - 1)].number)} disabled={activeIndex === 0}>← {text.previous}</button><span>{activeIndex + 1} / {rounds.length}</span><button type="button" onClick={() => setActiveRound(rounds[Math.min(rounds.length - 1, activeIndex + 1)].number)} disabled={activeIndex === rounds.length - 1}>{text.next} →</button></div>
      </>}
    </>}
    <footer className="bracket-footer"><span>Results update automatically</span><span>KYNG CUP{tournament?.starts_at ? ` · ${new Intl.DateTimeFormat("en", { timeZone: "Europe/Vienna", year: "numeric" }).format(new Date(tournament.starts_at))}` : ""}</span></footer>
  </main>;
}
