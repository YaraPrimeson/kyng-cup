"use client";

import { usePathname } from "next/navigation";
import SiteFooter from "../site-footer";
import { Language, useLanguage } from "../i18n";
import { trackEvent, withAttribution } from "../analytics";
import { formatTournamentDate, formatTournamentMonth, usePublicTournaments } from "../public-tournaments";
import type { PublicTournament } from "../public-tournaments";

type TournamentCopy = {
  eyebrow: string; title: string; intro: string; choose: string;
  tennis: string; padel: string; tennisLine: string; padelLine: string;
  tennisTitle: string; padelTitle: string; tennisDescription: string; padelDescription: string;
  venue: string; venueValue: string; registration: string; registrationValue: string; note: string;
  waitlist: string; closed: string;
  registerTennis: string; registerPadel: string; processLabel: string; processTitle: string;
  steps: [string, string, string]; stepCopy: [string, string, string];
};

const copy: Record<Language, TournamentCopy> = {
  en: {
    eyebrow: "KYNG CUP · International Tennis & Padel Community", title: "Upcoming tournaments.", intro: "Two courts. One community. Find your next match with KYNG CUP.", choose: "Choose your tournament",
    tennis: "Tennis", padel: "Padel", tennisLine: "The long rhythm of the match.", padelLine: "Fast decisions. Shared momentum.",
    tennisTitle: "KYNG CUP Tennis", padelTitle: "KYNG CUP Padel", tennisDescription: "A day for focused play, considered organisation and people who value the game.", padelDescription: "Dynamic play, respectful competition and the atmosphere that carries beyond the court.",
    venue: "Venue", venueValue: "Vienna, Austria", registration: "Registration", registrationValue: "Open", waitlist: "Waitlist", closed: "Closed", note: "The form opens with the chosen discipline already selected.", registerTennis: "Register for Tennis", registerPadel: "Register for Padel", processLabel: "Registration", processTitle: "Clear from the first click to the first serve.",
    steps: ["Choose a tournament", "Send your details", "Receive confirmation"], stepCopy: ["Select Tennis or Padel. The form remembers your choice.", "We ask only for the information needed to confirm participation.", "The KYNG CUP team contacts you with the next steps."],
  },
  uk: {
    eyebrow: "KYNG CUP · Міжнародна тенісна та падел-спільнота", title: "Найближчі турніри.", intro: "Два корти. Одна спільнота. Знайдіть свій наступний матч з KYNG CUP.", choose: "Обрати турнір",
    tennis: "Теніс", padel: "Падел", tennisLine: "Довгий ритм матчу.", padelLine: "Швидкі рішення. Спільний темп.",
    tennisTitle: "KYNG CUP Tennis", padelTitle: "KYNG CUP Padel", tennisDescription: "День для зосередженої гри, продуманої організації та людей, які цінують саму гру.", padelDescription: "Динамічна гра, повага в суперництві та атмосфера, що триває за межами корту.",
    venue: "Локація", venueValue: "Відень, Австрія", registration: "Реєстрація", registrationValue: "Відкрита", waitlist: "Лист очікування", closed: "Закрита", note: "Форма відкриється з уже обраною дисципліною.", registerTennis: "Зареєструватися на теніс", registerPadel: "Зареєструватися на падел", processLabel: "Реєстрація", processTitle: "Зрозумілий шлях від першого кліку до першої подачі.",
    steps: ["Оберіть турнір", "Надішліть дані", "Отримайте підтвердження"], stepCopy: ["Оберіть теніс або падел. Форма запам’ятає ваш вибір.", "Ми просимо лише дані, необхідні для підтвердження участі.", "Команда KYNG CUP зв’яжеться з вами щодо наступних кроків."],
  },
  de: {
    eyebrow: "KYNG CUP · Internationale Tennis- & Padel-Community", title: "Kommende Turniere.", intro: "Zwei Courts. Eine Community. Finden Sie Ihr nächstes Match mit KYNG CUP.", choose: "Turnier wählen",
    tennis: "Tennis", padel: "Padel", tennisLine: "Der lange Rhythmus des Matches.", padelLine: "Schnelle Entscheidungen. Gemeinsamer Rhythmus.",
    tennisTitle: "KYNG CUP Tennis", padelTitle: "KYNG CUP Padel", tennisDescription: "Ein Tag für konzentriertes Spiel, durchdachte Organisation und Menschen, die das Spiel schätzen.", padelDescription: "Dynamisches Spiel, respektvoller Wettbewerb und eine Atmosphäre, die über den Court hinausgeht.",
    venue: "Ort", venueValue: "Wien, Österreich", registration: "Anmeldung", registrationValue: "Geöffnet", waitlist: "Warteliste", closed: "Geschlossen", note: "Das Formular öffnet sich mit der gewählten Sportart.", registerTennis: "Für Tennis anmelden", registerPadel: "Für Padel anmelden", processLabel: "Anmeldung", processTitle: "Klar vom ersten Klick bis zum ersten Aufschlag.",
    steps: ["Turnier wählen", "Daten senden", "Bestätigung erhalten"], stepCopy: ["Wählen Sie Tennis oder Padel. Das Formular merkt sich Ihre Auswahl.", "Wir fragen nur die Daten ab, die für die Teilnahmebestätigung nötig sind.", "Das KYNG CUP Team meldet sich mit den nächsten Schritten."],
  },
  ru: {
    eyebrow: "KYNG CUP · Международное сообщество тенниса и падела", title: "Ближайшие турниры.", intro: "Два корта. Одно сообщество. Найдите свой следующий матч вместе с KYNG CUP.", choose: "Выбрать турнир",
    tennis: "Теннис", padel: "Падел", tennisLine: "Длинный ритм матча.", padelLine: "Быстрые решения. Общий темп.",
    tennisTitle: "KYNG CUP Tennis", padelTitle: "KYNG CUP Padel", tennisDescription: "День для сосредоточенной игры, продуманной организации и людей, которые ценят саму игру.", padelDescription: "Динамичная игра, уважение в соперничестве и атмосфера, которая остаётся за пределами корта.",
    venue: "Локация", venueValue: "Вена, Австрия", registration: "Регистрация", registrationValue: "Открыта", waitlist: "Лист ожидания", closed: "Закрыта", note: "Форма откроется с уже выбранной дисциплиной.", registerTennis: "Зарегистрироваться на теннис", registerPadel: "Зарегистрироваться на падел", processLabel: "Регистрация", processTitle: "Понятный путь от первого клика до первой подачи.",
    steps: ["Выберите турнир", "Отправьте данные", "Получите подтверждение"], stepCopy: ["Выберите теннис или падел. Форма запомнит ваш выбор.", "Мы запрашиваем только данные, необходимые для подтверждения участия.", "Команда KYNG CUP свяжется с вами и расскажет о следующих шагах."],
  },
};

function TournamentCard({ sport, date, label, processLabel, sportLabel, registrationHref }: { sport: "tennis" | "padel"; date: string; label: string; processLabel: string; sportLabel: string; registrationHref: string }) {
  return <a className={`upcoming-page__card upcoming-page__card--${sport}`} href={registrationHref} onClick={(event) => { event.currentTarget.href = withAttribution(registrationHref); trackEvent("select_tournament", { sport, placement: "tournament_card" }); }}><span>{processLabel}</span><div><strong>{sportLabel}</strong><p>{date}</p></div><b>{label} →</b></a>;
}

function TournamentDetail({ tournament, title, line, description, date, register, copy: c, registrationHref }: { tournament: PublicTournament; title: string; line: string; description: string; date: string; register: string; copy: TournamentCopy; registrationHref: string }) {
  const sport = tournament.sport;
  const sportLabel = sport === "tennis" ? c.tennis : c.padel;
  const registrationLabel = tournament.registration_status === "waitlist" ? c.waitlist : tournament.registration_status === "closed" ? c.closed : c.registrationValue;
  return <section className="upcoming-page__detail" id={sport}><div className="upcoming-page__detail-intro"><span>{sport === "tennis" ? "02" : "03"} — {sportLabel}</span><h2>{line}</h2><p>{description}</p></div><div className="upcoming-page__detail-body"><div className={`upcoming-page__texture upcoming-page__texture--${sport}`} aria-hidden="true" /><div><p className="upcoming-page__date">{date}</p><h3>{tournament.name || title}</h3><dl><div><dt>{c.venue}</dt><dd>{tournament.location ?? c.venueValue}</dd></div><div><dt>{c.registration}</dt><dd>{registrationLabel}</dd></div></dl><p className="upcoming-page__note">{c.note}</p>{tournament.registration_status !== "closed" && <a className="upcoming-page__button" href={registrationHref} onClick={(event) => { event.currentTarget.href = withAttribution(registrationHref); trackEvent("select_tournament", { sport, placement: "tournament_detail" }); }}>{register} <span>↗</span></a>}</div></div></section>;
}

export default function UpcomingTournamentsPage() {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  const { language } = useLanguage();
  const c = copy[language];
  const { tournaments, loading, error } = usePublicTournaments();
  const featured = (["tennis", "padel"] as const)
    .map((sport) => tournaments.find((item) => item.sport === sport && item.status === "live") ?? tournaments.find((item) => item.sport === sport))
    .filter((item) => item !== undefined);
  return <main className="upcoming-page" key={language}>
    <section className="upcoming-page__hero"><div><p>{c.eyebrow}</p><h1>{c.title}</h1><p className="upcoming-page__hero-intro">{c.intro}</p></div><aside><span>{loading ? "…" : formatTournamentMonth(featured, language)}</span><strong>{featured.map((tournament) => `${tournament.sport === "tennis" ? c.tennis : c.padel} — ${formatTournamentDate(tournament, language)}`).join("\n") || (error ? "—" : "…")}</strong><a className="upcoming-page__button" href="#choose">{c.choose} <span>↓</span></a></aside></section>
    <section className="upcoming-page__selector" id="choose"><p className="upcoming-page__label">01 — {c.choose}</p><div>{featured.map((tournament) => <TournamentCard key={tournament.id} sport={tournament.sport} date={formatTournamentDate(tournament, language, true)} label={tournament.sport === "tennis" ? c.registerTennis : c.registerPadel} processLabel={c.processLabel} sportLabel={tournament.sport === "tennis" ? c.tennis : c.padel} registrationHref={`${basePath}/register/?tournament=${encodeURIComponent(tournament.slug)}&sport=${tournament.sport}`} />)}</div></section>
    {featured.map((tournament) => <TournamentDetail key={tournament.id} tournament={tournament} title={tournament.sport === "tennis" ? c.tennisTitle : c.padelTitle} line={tournament.sport === "tennis" ? c.tennisLine : c.padelLine} description={tournament.sport === "tennis" ? c.tennisDescription : c.padelDescription} date={formatTournamentDate(tournament, language, true)} register={tournament.sport === "tennis" ? c.registerTennis : c.registerPadel} copy={c} registrationHref={`${basePath}/register/?tournament=${encodeURIComponent(tournament.slug)}&sport=${tournament.sport}`} />)}
    <section className="upcoming-page__process"><p className="upcoming-page__label">04 — {c.processLabel}</p><h2>{c.processTitle}</h2><div>{c.steps.map((step, index) => <article key={step}><span>0{index + 1}</span><h3>{step}</h3><p>{c.stepCopy[index]}</p></article>)}</div></section>
    <SiteFooter />
  </main>;
}
