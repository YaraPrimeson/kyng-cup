"use client";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { balancePairs, blankPairs, buildTournamentSetup, groupSummary, parsePairList, SetupPair, tournamentSlug } from "@/lib/tournament-setup";

export default function CreateTournament({ onCreated, onClose }: { onCreated: (id: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [fallbackSlug] = useState(() => `kyng-cup-${Date.now().toString(36)}`);
  const [location, setLocation] = useState("Vienna, Austria");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sport, setSport] = useState("padel");
  const [status, setStatus] = useState("draft");
  const [format, setFormat] = useState("group_knockout");
  const [groups, setGroups] = useState(4);
  const [pairs, setPairs] = useState<SetupPair[]>(() => balancePairs(blankPairs(16), 4));
  const [qualifiers, setQualifiers] = useState<Record<string, number>>({ A: 2, B: 2, C: 2, D: 2 });
  const [list, setList] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const summaries = groupSummary(pairs, groups);
  const playoffCount = format === "knockout" ? pairs.length : summaries.reduce((total, group) => total + (qualifiers[group.code] ?? 2), 0);
  const invalidGroups = format === "group_knockout" && summaries.some((group) => group.size < 2 || (qualifiers[group.code] ?? 2) > group.size);
  function redistribute(next: SetupPair[], count: number) {
    const actual = Math.max(1, Math.min(count, Math.floor(next.length / 2), 26));
    const balanced = balancePairs(next, actual);
    setPairs(balanced); setGroups(actual);
    setQualifiers((current) => Object.fromEntries(groupSummary(balanced, actual).map((group) => [group.code, Math.min(current[group.code] ?? 2, group.size)])));
  }
  function updatePair(index: number, key: keyof SetupPair, value: string) {
    setPairs((current) => current.map((pair, row) => row === index ? { ...pair, [key]: value } : pair));
  }
  function importList() {
    try { redistribute(parsePairList(list), groups); setMessage(null); }
    catch (error) { setMessage((error as Error).message); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    let payload;
    try { payload = buildTournamentSetup({ name, slug, fallbackSlug, location, date, endDate, sport, status, format, pairs, groups, qualifiers }); }
    catch (error) { setMessage((error as Error).message); return; }
    setSaving(true); setMessage(null);
    try {
      const { data, error } = await supabase.rpc("create_tournament_setup", payload);
      if (error) { setMessage(error.message); return; }
      onCreated(data as string);
    } catch { setMessage("Не удалось сохранить турнир. Проверьте соединение и попробуйте снова."); }
    finally { setSaving(false); }
  }
  return <form className="admin-create-card quick-tournament" onSubmit={create}>
    <div className="admin-section-heading compact-heading"><div><span>+</span><h2>Новый парный турнир</h2></div><p>Данные → пары → группы. Имена можно заполнить позже.</p></div>
    <fieldset disabled={saving}>
      <section className="setup-step"><h3>1. Основное</h3><div className="admin-form-grid">
        <label className="admin-field"><span>Название</span><input value={name} onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(tournamentSlug(event.target.value)); }} placeholder="KYNG Padel Cup" required /></label>
        <label className="admin-field"><span>Дата</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label className="admin-field"><span>Вид спорта</span><select value={sport} onChange={(event) => setSport(event.target.value)}><option value="padel">Падел</option><option value="tennis">Теннис</option></select></label>
        <label className="admin-field"><span>Локация</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
      </div></section>
      <section className="setup-step"><h3>2. Пары</h3><p>Вставьте список: одна пара на строку. Поддерживается вставка двух или трёх колонок из таблицы.</p>
        <label className="admin-field"><span>Список пар</span><textarea value={list} onChange={(event) => setList(event.target.value)} rows={4} placeholder={"Алексей Иванов / Даниил Петров\nМария Коваль / Анна Новак\nИли: название пары | первый игрок | второй игрок"} /></label>
        <div className="setup-actions"><button type="button" onClick={importList} disabled={!list.trim()}>Применить список</button><span>Список заменит текущие пары и распределит их по группам.</span></div>
        <div className="setup-actions"><label className="admin-field"><span>Количество пар</span><input type="number" min={2} max={64} value={pairs.length} onChange={(event) => { const count = Math.max(2, Math.min(64, Number(event.target.value))); redistribute(Array.from({ length: count }, (_, index) => pairs[index] ?? blankPairs(1)[0]), groups); }} /></label><button type="button" disabled={pairs.length >= 64} onClick={() => redistribute([...pairs, ...blankPairs(1)], groups)}>+ Добавить пару</button></div>
        <details className="setup-edit-pairs"><summary>Имена и названия · {pairs.length} пар</summary><div className="setup-pair-table">{pairs.map((pair, index) => <div key={index}><b>{index + 1}</b><input aria-label={`Пара ${index + 1}: название`} value={pair.name} placeholder="Название · необязательно" onChange={(event) => updatePair(index, "name", event.target.value)} /><input aria-label={`Пара ${index + 1}: первый игрок`} value={pair.player_one} placeholder="Первый игрок" onChange={(event) => updatePair(index, "player_one", event.target.value)} /><input aria-label={`Пара ${index + 1}: второй игрок`} value={pair.player_two} placeholder="Второй игрок" onChange={(event) => updatePair(index, "player_two", event.target.value)} /><button type="button" disabled={pairs.length <= 2} aria-label={`Удалить пару ${index + 1}`} onClick={() => redistribute(pairs.filter((_, row) => row !== index), groups)}>×</button></div>)}</div></details>
      </section>
      <section className="setup-step"><h3>3. Формат и группы</h3><div className="admin-form-grid"><label className="admin-field"><span>Формат</span><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="group_knockout">Группы → плей-офф</option><option value="knockout">Только плей-офф</option></select></label>{format === "group_knockout" && <label className="admin-field"><span>Количество групп</span><input type="number" min={1} max={Math.min(26, Math.floor(pairs.length / 2))} value={groups} onChange={(event) => redistribute(pairs, Number(event.target.value))} /></label>}</div>
        {format === "group_knockout" && <><div className="setup-actions"><button type="button" onClick={() => redistribute(pairs, groups)}>Распределить равномерно</button><span>Пары можно перенести вручную. В группе — минимум две пары.</span></div><div className="setup-group-grid">{summaries.map((group) => <article className={group.size < 2 ? "is-invalid" : ""} key={group.code}><header><h4>Группа {group.code}</h4><span>{group.size} пар · {group.matches} матчей</span></header><label className="admin-field"><span>Выходят в плей-офф</span><input type="number" min={0} max={group.size} value={qualifiers[group.code] ?? 2} onChange={(event) => setQualifiers((current) => ({ ...current, [group.code]: Math.max(0, Math.min(group.size, Number(event.target.value))) }))} /></label>{pairs.map((pair, index) => pair.group === group.code ? <div className="setup-group-pair" key={index}><span><strong>{pair.name || (pair.player_one && pair.player_two ? `${pair.player_one} / ${pair.player_two}` : `Пара ${String(index + 1).padStart(2, "0")}`)}</strong></span><select aria-label={`Группа пары ${index + 1}`} value={pair.group} onChange={(event) => updatePair(index, "group", event.target.value)}>{summaries.map((target) => <option value={target.code} key={target.code}>{target.code}</option>)}</select></div> : null)}</article>)}</div></>}
      </section>
      <details className="setup-step"><summary>Дополнительные настройки</summary><div className="admin-form-grid"><label className="admin-field"><span>Адрес турнира</span><input value={slug} placeholder={tournamentSlug(name) || fallbackSlug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }} /></label><label className="admin-field"><span>Дата завершения · необязательно</span><input type="date" value={endDate} min={date || undefined} onChange={(event) => setEndDate(event.target.value)} /></label><label className="admin-field"><span>Видимость</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="draft">Черновик · только организаторам</option><option value="published">Опубликовать на сайте</option></select></label></div></details>
    </fieldset>
    <p className="setup-summary" role="status">{pairs.length} пар{format === "group_knockout" ? ` · группы ${summaries.map((group) => group.size).join(" + ")} · ${summaries.reduce((total, group) => total + group.matches, 0)} групповых матчей` : " · плей-офф"} · {playoffCount} пар в сетке. {status === "draft" ? "Сохранится черновиком." : "Будет опубликован."}</p>
    {invalidGroups && <p role="alert" className="setup-error">Проверьте группы: минимум 2 пары, число выходящих не больше состава группы.</p>}
    {message && <p role="alert" className="setup-error">{message}</p>}
    <div className="admin-create-actions"><button className="admin-save-button" type="submit" disabled={saving || invalidGroups || playoffCount < 2}>{saving ? "Создаём…" : "Создать турнир"}</button><button className="admin-close-button" type="button" disabled={saving} onClick={onClose}>Закрыть</button></div>
  </form>;
}
