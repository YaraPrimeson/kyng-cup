"use client";

import { usePathname } from "next/navigation";
import SiteFooter from "../site-footer";
import { Language, useLanguage } from "../i18n";

type TournamentCopy = {
  eyebrow: string; title: string; intro: string; month: string; dates: string; choose: string;
  tennis: string; padel: string; tennisDate: string; padelDate: string; tennisLine: string; padelLine: string;
  tennisTitle: string; padelTitle: string; tennisDescription: string; padelDescription: string;
  venue: string; venueValue: string; registration: string; registrationValue: string; note: string;
  registerTennis: string; registerPadel: string; processLabel: string; processTitle: string;
  steps: [string, string, string]; stepCopy: [string, string, string];
};

const copy: Record<Language, TournamentCopy> = {
  en: {
    eyebrow: "KYNG CUP · International Tennis & Padel Community", title: "Upcoming tournaments.", intro: "Two courts. One community. Find your next match with KYNG CUP.", month: "September 2026", dates: "Tennis — 20 September\nPadel — 26 September", choose: "Choose your tournament",
    tennis: "Tennis", padel: "Padel", tennisDate: "20 September 2026", padelDate: "26 September 2026", tennisLine: "The long rhythm of the match.", padelLine: "Fast decisions. Shared momentum.",
    tennisTitle: "KYNG CUP Tennis", padelTitle: "KYNG CUP Padel", tennisDescription: "A day for focused play, considered organisation and people who value the game.", padelDescription: "Dynamic play, respectful competition and the atmosphere that carries beyond the court.",
    venue: "Venue", venueValue: "Vienna, Austria", registration: "Registration", registrationValue: "Open", note: "The form opens with the chosen discipline already selected.", registerTennis: "Register for Tennis", registerPadel: "Register for Padel", processLabel: "Registration", processTitle: "Clear from the first click to the first serve.",
    steps: ["Choose a tournament", "Send your details", "Receive confirmation"], stepCopy: ["Select Tennis or Padel. The form remembers your choice.", "We ask only for the information needed to confirm participation.", "The KYNG CUP team contacts you with the next steps."],
  },
  uk: {
    eyebrow: "KYNG CUP · Міжнародна тенісна та падел-спільнота", title: "Найближчі турніри.", intro: "Два корти. Одна спільнота. Знайдіть свій наступний матч з KYNG CUP.", month: "Вересень 2026", dates: "Теніс — 20 вересня\nПадел — 26 вересня", choose: "Обрати турнір",
    tennis: "Теніс", padel: "Падел", tennisDate: "20 вересня 2026", padelDate: "26 вересня 2026", tennisLine: "Довгий ритм матчу.", padelLine: "Швидкі рішення. Спільний темп.",
    tennisTitle: "KYNG CUP Tennis", padelTitle: "KYNG CUP Padel", tennisDescription: "День для зосередженої гри, продуманої організації та людей, які цінують саму гру.", padelDescription: "Динамічна гра, повага в суперництві та атмосфера, що триває за межами корту.",
    venue: "Локація", venueValue: "Відень, Австрія", registration: "Реєстрація", registrationValue: "Відкрита", note: "Форма відкриється з уже обраною дисципліною.", registerTennis: "Зареєструватися на теніс", registerPadel: "Зареєструватися на падел", processLabel: "Реєстрація", processTitle: "Зрозумілий шлях від першого кліку до першої подачі.",
    steps: ["Оберіть турнір", "Надішліть дані", "Отримайте підтвердження"], stepCopy: ["Оберіть теніс або падел. Форма запам’ятає ваш вибір.", "Ми просимо лише дані, необхідні для підтвердження участі.", "Команда KYNG CUP зв’яжеться з вами щодо наступних кроків."],
  },
  de: {
    eyebrow: "KYNG CUP · Internationale Tennis- & Padel-Community", title: "Kommende Turniere.", intro: "Zwei Courts. Eine Community. Finden Sie Ihr nächstes Match mit KYNG CUP.", month: "September 2026", dates: "Tennis — 20. September\nPadel — 26. September", choose: "Turnier wählen",
    tennis: "Tennis", padel: "Padel", tennisDate: "20. September 2026", padelDate: "26. September 2026", tennisLine: "Der lange Rhythmus des Matches.", padelLine: "Schnelle Entscheidungen. Gemeinsamer Rhythmus.",
    tennisTitle: "KYNG CUP Tennis", padelTitle: "KYNG CUP Padel", tennisDescription: "Ein Tag für konzentriertes Spiel, durchdachte Organisation und Menschen, die das Spiel schätzen.", padelDescription: "Dynamisches Spiel, respektvoller Wettbewerb und eine Atmosphäre, die über den Court hinausgeht.",
    venue: "Ort", venueValue: "Wien, Österreich", registration: "Anmeldung", registrationValue: "Geöffnet", note: "Das Formular öffnet sich mit der gewählten Sportart.", registerTennis: "Für Tennis anmelden", registerPadel: "Für Padel anmelden", processLabel: "Anmeldung", processTitle: "Klar vom ersten Klick bis zum ersten Aufschlag.",
    steps: ["Turnier wählen", "Daten senden", "Bestätigung erhalten"], stepCopy: ["Wählen Sie Tennis oder Padel. Das Formular merkt sich Ihre Auswahl.", "Wir fragen nur die Daten ab, die für die Teilnahmebestätigung nötig sind.", "Das KYNG CUP Team meldet sich mit den nächsten Schritten."],
  },
  ru: {
    eyebrow: "KYNG CUP · Международное сообщество тенниса и падела", title: "Ближайшие турниры.", intro: "Два корта. Одно сообщество. Найдите свой следующий матч вместе с KYNG CUP.", month: "Сентябрь 2026", dates: "Теннис — 20 сентября\nПадел — 26 сентября", choose: "Выбрать турнир",
    tennis: "Теннис", padel: "Падел", tennisDate: "20 сентября 2026", padelDate: "26 сентября 2026", tennisLine: "Длинный ритм матча.", padelLine: "Быстрые решения. Общий темп.",
    tennisTitle: "KYNG CUP Tennis", padelTitle: "KYNG CUP Padel", tennisDescription: "День для сосредоточенной игры, продуманной организации и людей, которые ценят саму игру.", padelDescription: "Динамичная игра, уважение в соперничестве и атмосфера, которая остаётся за пределами корта.",
    venue: "Локация", venueValue: "Вена, Австрия", registration: "Регистрация", registrationValue: "Открыта", note: "Форма откроется с уже выбранной дисциплиной.", registerTennis: "Зарегистрироваться на теннис", registerPadel: "Зарегистрироваться на падел", processLabel: "Регистрация", processTitle: "Понятный путь от первого клика до первой подачи.",
    steps: ["Выберите турнир", "Отправьте данные", "Получите подтверждение"], stepCopy: ["Выберите теннис или падел. Форма запомнит ваш выбор.", "Мы запрашиваем только данные, необходимые для подтверждения участия.", "Команда KYNG CUP свяжется с вами и расскажет о следующих шагах."],
  },
};

function TournamentCard({ sport, date, label, processLabel, sportLabel }: { sport: "tennis" | "padel"; date: string; label: string; processLabel: string; sportLabel: string }) {
  return <a className={`upcoming-page__card upcoming-page__card--${sport}`} href={`#${sport}`}><span>{processLabel}</span><div><strong>{sportLabel}</strong><p>{date}</p></div><b>{label} ↗</b></a>;
}

function TournamentDetail({ sport, title, line, description, date, register, copy: c, registrationHref }: { sport: "tennis" | "padel"; title: string; line: string; description: string; date: string; register: string; copy: TournamentCopy; registrationHref: string }) {
  const sportLabel = sport === "tennis" ? c.tennis : c.padel;
  return <section className="upcoming-page__detail" id={sport}><div className="upcoming-page__detail-intro"><span>{sport === "tennis" ? "02" : "03"} — {sportLabel}</span><h2>{line}</h2><p>{description}</p></div><div className="upcoming-page__detail-body"><div className={`upcoming-page__texture upcoming-page__texture--${sport}`} aria-hidden="true" /><div><p className="upcoming-page__date">{date}</p><h3>{title}</h3><dl><div><dt>{c.venue}</dt><dd>{c.venueValue}</dd></div><div><dt>{c.registration}</dt><dd>{c.registrationValue}</dd></div></dl><p className="upcoming-page__note">{c.note}</p><a className="upcoming-page__button" href={registrationHref}>{register} <span>↗</span></a></div></div></section>;
}

export default function UpcomingTournamentsPage() {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  const { language } = useLanguage();
  const c = copy[language];

  return <main className="upcoming-page" key={language}>
    <section className="upcoming-page__hero"><div><p>{c.eyebrow}</p><h1>{c.title}</h1><p className="upcoming-page__hero-intro">{c.intro}</p></div><aside><span>{c.month}</span><strong>{c.dates}</strong><a className="upcoming-page__button" href="#choose">{c.choose} <span>↓</span></a></aside></section>
    <section className="upcoming-page__selector" id="choose"><p className="upcoming-page__label">01 — {c.choose}</p><div><TournamentCard sport="tennis" date={c.tennisDate} label={c.registerTennis} processLabel={c.processLabel} sportLabel={c.tennis} /><TournamentCard sport="padel" date={c.padelDate} label={c.registerPadel} processLabel={c.processLabel} sportLabel={c.padel} /></div></section>
    <TournamentDetail sport="tennis" title={c.tennisTitle} line={c.tennisLine} description={c.tennisDescription} date={c.tennisDate} register={c.registerTennis} copy={c} registrationHref={`${basePath}/register/?sport=tennis`} />
    <TournamentDetail sport="padel" title={c.padelTitle} line={c.padelLine} description={c.padelDescription} date={c.padelDate} register={c.registerPadel} copy={c} registrationHref={`${basePath}/register/?sport=padel`} />
    <section className="upcoming-page__process"><p className="upcoming-page__label">04 — {c.processLabel}</p><h2>{c.processTitle}</h2><div>{c.steps.map((step, index) => <article key={step}><span>0{index + 1}</span><h3>{step}</h3><p>{c.stepCopy[index]}</p></article>)}</div></section>
    <SiteFooter />
  </main>;
}
