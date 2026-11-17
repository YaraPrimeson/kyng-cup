"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerCardResult } from "@/lib/player-results";
import { createResultCardFile } from "@/lib/result-card-image";
import { cardHeights, type CardContent, type CardFormat } from "@/lib/result-card-svg";
import { useProfileLanguage } from "./profile-i18n";
import ProfileIcon from "./profile-icon";

type CardAsset = { key: string; file: File; url: string; photoOmitted: boolean };

export default function ResultCard({ userId, name, photo, result }: { userId: string; name: string; photo: string; result: PlayerCardResult }) {
  const { text: t, language, locale } = useProfileLanguage();
  const [format, setFormat] = useState<CardFormat>("story");
  const [includePhoto, setIncludePhoto] = useState(false);
  const [asset, setAsset] = useState<CardAsset | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [sharingKey, setSharingKey] = useState<string | null>(null);
  const sharing = useRef(false);
  const content = useMemo<CardContent>(() => ({
    player: name || t("Игрок KYNG"), tournament: result.name, sport: result.sport === "tennis" ? "Tennis" : "Padel",
    date: result.date ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Europe/Vienna" }).format(new Date(result.date)) : t("Дата не указана"),
    result: t(result.result), consolation: result.consolation ? t(result.consolation) : null,
    partner: result.partner || t("Не указан"), matches: result.matches, wins: result.wins, losses: result.losses,
    labels: { partner: t("Партнёр"), matches: t("Матчей"), wins: t("Побед"), losses: t("Поражений"), verified: t("Подтверждённые результаты") },
  }), [name, result, locale, t]);
  const photoUrl = includePhoto && photo ? photo : undefined;
  const fileName = `kyng-cup-${result.slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 64) || "result"}-${format}-${language}.png`;
  const key = JSON.stringify([userId, content, photoUrl, format, retry]);
  const ready = asset?.key === key ? asset : null;
  const failed = failure === key;
  const busy = sharingKey === key;
  const caption = [content.player, content.tournament, `${content.sport} · ${content.date}`, content.result, content.consolation,
    `${content.labels.matches}: ${content.matches} · ${content.labels.wins}: ${content.wins} · ${content.labels.losses}: ${content.losses}`,
    `${content.labels.partner}: ${content.partner}`, "KYNGCUP.COM"].filter(Boolean).join("\n");

  useEffect(() => {
    let active = true, url: string | undefined;
    void createResultCardFile(content, format, fileName, photoUrl).then(({ file, photoOmitted }) => {
      if (!active) return;
      url = URL.createObjectURL(file); setAsset({ key, file, url, photoOmitted });
    }).catch(() => { if (active) setFailure(key); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [key, content, format, fileName, photoUrl]);

  async function share() {
    if (!ready || sharing.current) return;
    sharing.current = true; setSharingKey(key); setNotice(null); setFallback(null);
    try {
      if (!navigator.canShare?.({ files: [ready.file] }) || !navigator.share) { setFallback(key); return; }
      await navigator.share({ files: [ready.file], title: t("Мой результат KYNG CUP") });
      setNotice({ key, text: "Карточка передана выбранному приложению." });
    } catch (cause) {
      if (!(cause && typeof cause === "object" && "name" in cause && cause.name === "AbortError")) setFallback(key);
    } finally { sharing.current = false; setSharingKey(null); }
  }
  function download() {
    if (!ready) return;
    const link = document.createElement("a"); link.href = ready.url; link.download = ready.file.name;
    link.click(); setNotice({ key, text: "Изображение подготовлено для сохранения." });
  }
  return <section className="kv-section" aria-label={t("Карточка результата")}>
    <p className="kv-muted kv-small">{content.tournament} · {content.date}</p>
    <div className="kv-segment" aria-label={t("Формат изображения")}>{([["story", "История", "9:16"], ["post", "Пост", "4:5"], ["square", "Квадрат", "1:1"]] as const).map(([id, label, ratio]) => <button type="button" key={id} disabled={busy} aria-pressed={format === id} onClick={() => setFormat(id)}>{t(label)}<small>{ratio}</small></button>)}</div>
    {photo && <label className="player-card-photo-option"><input type="checkbox" checked={includePhoto} disabled={busy} onChange={event => setIncludePhoto(event.target.checked)} />{t("Добавить фото профиля")}</label>}
    <div className={`player-card-image format-${format}`} aria-busy={!ready && !failed}>
      {ready ? <img src={ready.url} alt={`${t("Карточка результата")}: ${content.player} — ${content.result}, ${content.tournament}`} width="1080" height={cardHeights[format]} /> : <p role={failed ? "alert" : "status"}>{t(failed ? "Не удалось подготовить карточку." : "Готовим вашу карточку…")}</p>}
    </div>
    {ready?.photoOmitted && <p className="kv-note">{t("Фото недоступно. Карточка подготовлена без фото.")}</p>}
    <div className="kv-card-tools">
      {failed ? <button type="button" className="kv-primary" onClick={() => setRetry(value => value + 1)}>{t("Повторить")}</button> : <button type="button" className="kv-primary" disabled={!ready || busy} onClick={() => void share()}><ProfileIcon name="share" />{t(busy ? "Открываем меню…" : "Поделиться")}</button>}
      <button type="button" className="kv-secondary" disabled={!ready || busy} onClick={download}>{t("Скачать PNG")}</button>
      <button type="button" className="kv-link" onClick={() => setCaptionOpen(value => !value)} aria-expanded={captionOpen}>{t("Подпись к публикации")}</button>
    </div>
    {fallback === key && <p className="kv-note">{t("В этом браузере отправка изображения недоступна. Скачайте PNG и прикрепите его в нужном приложении.")}</p>}
    {captionOpen && <label className="player-caption-label">{t("Текст для публикации")}<textarea readOnly value={caption} /></label>}
    {notice?.key === key && <p className="kv-message" role="status">{t(notice.text)}</p>}
  </section>;
}
