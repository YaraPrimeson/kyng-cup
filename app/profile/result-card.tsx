"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerProfile } from "@/lib/player-profile";
import type { PlayerCardResult } from "./profile-data";
import ProfileIcon from "./profile-icon";

type Format = "story" | "post" | "square";
type CardAsset = { key: string; file: File; url: string };
const heights: Record<Format, number> = { story: 1920, post: 1350, square: 1080 };

function textFit(context: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, width = 916, family = "Georgia") {
  context.font = `${size}px ${family}`;
  while (context.measureText(text).width > width && size > 24) { size -= 2; context.font = `${size}px ${family}`; }
  context.fillText(text, x, y);
}

async function createCard(profile: PlayerProfile, result: PlayerCardResult, format: Format): Promise<File> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = heights[format];
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  const h = canvas.height, pad = 82;
  context.fillStyle = "#214c36"; context.fillRect(0, 0, 1080, h);
  context.strokeStyle = "#f6f2e6"; context.globalAlpha = .13;
  context.save(); context.translate(1030, 120); context.rotate(-.35); context.strokeRect(0, 0, 550, 1100); context.restore(); context.globalAlpha = 1;
  context.fillStyle = "#f6f2e6"; context.font = "36px Georgia"; context.fillText("KYNG CUP", pad, 100);
  context.font = "22px Arial"; context.fillText("PLAYER SERIES / 2026", pad, 142);
  const y = format === "story" ? h * .39 : h * .30;
  if (profile.photo) {
    const photo = new Image();
    await new Promise<void>((resolve, reject) => { photo.onload = () => resolve(); photo.onerror = reject; photo.src = profile.photo; });
    const py = h * .18, ph = h * .34, pw = 916;
    const scale = Math.max(pw / photo.width, ph / photo.height);
    context.save(); context.beginPath(); context.rect(pad, py, pw, ph); context.clip();
    context.drawImage(photo, (1080 - photo.width * scale) / 2, py + (ph - photo.height * scale) / 2, photo.width * scale, photo.height * scale); context.restore();
    context.fillStyle = "#dba27d"; textFit(context, result.name.toUpperCase(), pad, h * .59, 26, 916, "Arial");
    context.fillStyle = "#f6f2e6"; textFit(context, result.result, pad, h * .67, 75);
  } else {
    context.fillStyle = "#dba27d"; textFit(context, result.name.toUpperCase(), pad, y - 40, 26, 916, "Arial");
    context.fillStyle = "#f6f2e6";
    const size = format === "story" ? 235 : 155;
    context.font = `${size}px Georgia`; context.fillText(result.topEight ? "TOP" : "I", pad, y + size * .65); context.fillText(result.topEight ? "8." : "PLAYED", pad, y + size * 1.55, 916);
    context.font = "50px Georgia"; context.fillText("До встречи на корте.", pad, y + size * 1.55 + 78);
  }
  context.fillStyle = "#f6f2e6"; textFit(context, `${result.result} · ${result.date}`, pad, h - 270, 27, 916, "Arial");
  context.strokeStyle = "#f6f2e6"; context.globalAlpha = .3; context.beginPath(); context.moveTo(pad, h - 220); context.lineTo(998, h - 220); context.stroke(); context.globalAlpha = 1;
  textFit(context, profile.name || "KYNG Player", pad, h - 151, 51, 916, "Arial");
  context.font = "25px Arial"; context.fillText(`В паре с ${result.partner}`, pad, h - 99);
  context.globalAlpha = .7; context.font = "20px Arial"; context.fillText("ПРИМЕР РЕЗУЛЬТАТА · KYNGCUP.COM", pad, h - 45);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Card export failed");
  return new File([blob], `kyng-cup-${format}.png`, { type: "image/png" });
}

export default function ResultCard({ profile, result }: { profile: PlayerProfile; result: PlayerCardResult }) {
  const [format, setFormat] = useState<Format>("story");
  const [asset, setAsset] = useState<CardAsset | null>(null);
  const [failed, setFailed] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const sharing = useRef(false);
  const key = JSON.stringify([profile, result, format, retry]);
  const ready = asset?.key === key ? asset : null;
  const caption = `${profile.name || "KYNG Player"} · ${result.name}\n${result.result} · ${result.wins} победы в ${result.matches} матчах\nПартнёр: ${result.partner}\n@kyngcup\nДемонстрационная карточка`;

  useEffect(() => {
    let cancelled = false, url: string | undefined;
    createCard(profile, result, format).then(file => {
      if (cancelled) return;
      url = URL.createObjectURL(file); setFailed(false); setAsset({ key, file, url });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [key, profile, result, format]);

  async function share() {
    if (!ready || sharing.current) return;
    sharing.current = true; setNotice("");
    try {
      if (!navigator.canShare?.({ files: [ready.file] }) || !navigator.share) { setFallback(true); return; }
      await navigator.share({ files: [ready.file], title: "Мой результат KYNG CUP" });
      setNotice("Карточка передана выбранному приложению.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setFallback(true);
    } finally { sharing.current = false; }
  }

  function saveImage() {
    if (!ready) return;
    const link = document.createElement("a"); link.href = ready.url; link.download = ready.file.name;
    link.click(); setNotice("Изображение подготовлено для сохранения.");
  }

  return <>
    <p className="kv-muted kv-small">{result.name} · {result.date}</p>
    <div className="kv-segment" aria-label="Формат изображения">{([ ["story", "История", "9:16"], ["post", "Пост", "4:5"], ["square", "Квадрат", "1:1"] ] as const).map(([id, label, ratio]) => <button type="button" key={id} aria-pressed={format === id} onClick={() => { setFormat(id); setFailed(false); setNotice(""); }} >{label}<small>{ratio}</small></button>)}</div>
    <div className={`player-card-image format-${format}`} aria-busy={!ready && !failed}>
      {ready ? <img src={ready.url} alt={`${profile.name || "KYNG Player"} — ${result.result}, ${result.name}. Демонстрационная карточка.`} width="1080" height={heights[format]} /> : <p role="status">{failed ? "Не удалось подготовить карточку." : "Готовим вашу карточку…"}</p>}
    </div>
    <div className="kv-card-tools">
      {failed ? <button type="button" className="kv-primary" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>Повторить</button> : <button type="button" className="kv-primary" disabled={!ready} onClick={() => void share()}><ProfileIcon name="share" />Поделиться</button>}
      <button type="button" className="kv-secondary" onClick={() => setCaptionOpen(value => !value)} aria-expanded={captionOpen}>Подпись к публикации</button>
    </div>
    {fallback && <section className="kv-share-fallback"><h3>Отправить через приложение</h3><p>В этом браузере отправка изображения недоступна. Сохраните карточку и прикрепите её в нужной соцсети.</p><button type="button" className="kv-secondary" onClick={saveImage} disabled={!ready}>Сохранить изображение</button></section>}
    {captionOpen && <label className="player-caption-label">Текст для публикации<textarea readOnly value={caption} /></label>}
    <p className="kv-message" role="status">{notice}</p>
  </>;
}
