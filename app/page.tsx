"use client";

import { usePathname } from "next/navigation";
import SiteFooter from "./site-footer";
import { Language, useLanguage } from "./i18n";
import { formatTournamentDate, formatTournamentMonth, usePublicTournaments } from "./public-tournaments";

const copy: Record<Language, { eyebrow: string; title: string; intro: string; datesLabel: string; datesTitle: string; datesIntro: string; details: string; aboutLabel: string; aboutTitle: string; aboutText: string; choose: string; chooseTitle: string; padelText: string; enter: string }> = {
  en: { eyebrow: "Padel · Community", title: "More than a game. A standard.", intro: "High-level play. Uncompromising organization. An experience worth repeating.", datesLabel: "Vienna · Upcoming tournaments", datesTitle: "Your next tournament in Vienna.", datesIntro: "Discover the next KYNG CUP padel tournament in Vienna.", details: "Details", aboutLabel: "What is KYNG CUP", aboutTitle: "Competition creates the moment. Community gives it meaning.", aboutText: "We create padel tournaments for people who value a high level of play, quality company, and an exceptional experience.\n\nThoughtful formats. Attention to detail. Strong players. An atmosphere you want to come back to.", choose: "Your court", chooseTitle: "Ready to play?", padelText: "Speed, instinct and a game built around partnership.", enter: "Explore" },
  uk: { eyebrow: "Падел · Спільнота", title: "Більше ніж гра. Стандарт.", intro: "Гра високого рівня. Безкомпромісна організація. Досвід, який хочеться повторити.", datesLabel: "Відень · Найближчі турніри", datesTitle: "Ваш наступний турнір у Відні.", datesIntro: "Відкрийте для себе найближчий падел-турнір KYNG CUP у Відні.", details: "Деталі", aboutLabel: "Що таке KYNG CUP", aboutTitle: "Змагання створює момент. Спільнота надає йому сенсу.", aboutText: "Ми створюємо падел-турніри для людей, які цінують високий рівень гри, якісне оточення та винятковий досвід.\n\nПродумані формати. Увага до деталей. Сильні гравці. Атмосфера, до якої хочеться повертатися.", choose: "Ваш корт", chooseTitle: "Готові грати?", padelText: "Швидкість, інстинкт і гра, побудована на партнерстві.", enter: "Дізнатися більше" },
  de: { eyebrow: "Padel · Community", title: "Mehr als ein Spiel. Ein Standard.", intro: "Spiel auf hohem Niveau. Kompromisslose Organisation. Ein Erlebnis, das man wiederholen möchte.", datesLabel: "Wien · Kommende Turniere", datesTitle: "Dein nächstes Turnier in Wien.", datesIntro: "Entdecke das nächste KYNG CUP Padel-Turnier in Wien.", details: "Details", aboutLabel: "Was ist KYNG CUP", aboutTitle: "Wettbewerb schafft den Moment. Community gibt ihm Bedeutung.", aboutText: "Wir gestalten Padel-Turniere für Menschen, die hohes Spielniveau, gute Gesellschaft und ein außergewöhnliches Erlebnis schätzen.\n\nDurchdachte Formate. Liebe zum Detail. Starke Spieler. Eine Atmosphäre, zu der man zurückkehren möchte.", choose: "Dein Court", chooseTitle: "Bereit zu spielen?", padelText: "Tempo, Instinkt und ein Spiel, das von Partnerschaft lebt.", enter: "Entdecken" },
  ru: { eyebrow: "Падел · Сообщество", title: "Больше чем игра. Стандарт.", intro: "Игра высокого уровня. Бескомпромиссная организация. Опыт, который хочется повторить.", datesLabel: "Вена · Ближайшие турниры", datesTitle: "Ваш следующий турнир в Вене.", datesIntro: "Посмотрите ближайший падел-турнир KYNG CUP в Вене.", details: "Подробнее", aboutLabel: "Что такое KYNG CUP", aboutTitle: "Соревнование создаёт момент. Сообщество придаёт ему смысл.", aboutText: "Мы создаём падел-турниры для людей, которые ценят высокий уровень игры, качественное окружение и исключительный опыт.\n\nПродуманные форматы. Внимание к деталям. Сильные игроки. Атмосфера, в которую хочется возвращаться.", choose: "Ваш корт", chooseTitle: "Готовы играть?", padelText: "Скорость, инстинкт и игра, построенная на партнёрстве.", enter: "Подробнее" },
};

export default function Home() {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  const { language } = useLanguage();
  const c = copy[language];
  const { tournaments, loading } = usePublicTournaments();
  const featured = tournaments.filter((item) => item.sport === "padel");
  const tournamentYear = featured.find((item) => item.starts_at)?.starts_at
    ? new Intl.DateTimeFormat("en", { timeZone: "Europe/Vienna", year: "numeric" }).format(new Date(featured.find((item) => item.starts_at)!.starts_at!))
    : null;
  return <main className="universal-page" data-language={language} key={language}>
    <section className="universal-hero"><div><p className="eyebrow">{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div><span className="universal-scroll">KYNG CUP{tournamentYear ? ` · ${tournamentYear}` : ""}</span></section>
    <section className="home-dates" aria-labelledby="home-dates-title"><div className="section-index"><span>01</span><span>{loading ? c.datesLabel : formatTournamentMonth(featured, language)}</span></div><div className="home-dates__intro"><h2 id="home-dates-title">{c.datesTitle}</h2><p>{c.datesIntro}</p></div><div className="home-dates__events">
      {featured.map((tournament) => <a href={`${basePath}/upcoming-tournaments/#padel-${tournament.slug}`} key={tournament.id}><span>Padel</span><strong>{formatTournamentDate(tournament, language)}</strong><small>{c.details} <i aria-hidden="true">↗</i></small></a>)}
    </div></section>
    <section className="universal-about"><div className="section-index"><span>02</span><span>{c.aboutLabel}</span></div><div><h2>{c.aboutTitle}</h2><p>{c.aboutText}</p></div></section>
    <section className="sport-choice"><div className="section-index"><span>02</span><span>{c.choose}</span></div><h2>{c.chooseTitle}</h2><div className="sport-choice-grid">
      <a className="sport-choice-card padel-choice" href={`${basePath}/padel/`}><span>Padel</span><p>{c.padelText}</p><strong>{c.enter} ↗</strong></a>
    </div></section>
    <SiteFooter />
  </main>;
}
