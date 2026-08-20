"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Language, useLanguage } from "../i18n";
import SiteFooter from "../site-footer";

type Sport = "tennis" | "padel";
type RegistrationStatus = "open" | "waitlist" | "closed";
type Tournament = {
  id: string;
  slug: string;
  name: string;
  sport: Sport;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: "published" | "live";
  registration_status: RegistrationStatus;
};

const copy = {
  en: {
    eyebrow: "Pair registration", title: "Your next match starts here", intro: "Applications are accepted for ready-made pairs. Complete the details for both players and we will confirm your place personally.",
    tournament: "Tournament", choose: "Choose tournament", loading: "Loading available tournaments…", unavailable: "There are no tournaments accepting applications right now.", loadError: "Tournament information could not be loaded. Please try again.",
    tennis: "Tennis", padel: "Padel", open: "Registration open", waitlist: "Waitlist", location: "Location", dates: "Dates", singleDate: "Tournament date", to: "to",
    pairDetails: "Pair details", pairIntro: "We accept complete pairs only. A pair name is optional.", pairName: "Pair name (optional)", pairPlaceholder: "For example, Vienna Pair", comment: "Message to the organisers (optional)", commentPlaceholder: "Anything we should know about your pair?",
    playerOne: "Player 1", playerTwo: "Player 2", firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone number", messenger: "Telegram or WhatsApp (optional)", level: "Playing level", chooseLevel: "Choose level", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", competitive: "Tournament / competitive", ratingSystem: "Rating system (optional)", ratingValue: "Rating (optional)", tennisRating: "ITN, UTR or LK", padelRating: "Playtomic or other", ratingExample: "For example, 7.5",
    review: "Confirmation", accurate: "I confirm that the information provided is accurate.", partner: "My partner has agreed to this application and the use of their contact details.", rules: "I agree to the tournament rules and privacy notice.", marketing: "Send me occasional KYNG CUP tournament news (optional).", submit: "Submit pair application", preview: "Form preview — online submission will be enabled in the next stage.", required: "Required fields",
  },
  uk: {
    eyebrow: "Реєстрація пари", title: "Ваш наступний матч починається тут", intro: "Ми приймаємо заявки лише від сформованих пар. Заповніть дані обох гравців — і ми особисто підтвердимо вашу участь.",
    tournament: "Турнір", choose: "Оберіть турнір", loading: "Завантажуємо доступні турніри…", unavailable: "Наразі немає турнірів, що приймають заявки.", loadError: "Не вдалося завантажити інформацію про турнір. Спробуйте ще раз.",
    tennis: "Теніс", padel: "Падел", open: "Реєстрацію відкрито", waitlist: "Лист очікування", location: "Локація", dates: "Дати", singleDate: "Дата проведення", to: "—",
    pairDetails: "Дані пари", pairIntro: "Ми приймаємо лише готові пари. Назва пари — за бажанням.", pairName: "Назва пари (за бажанням)", pairPlaceholder: "Наприклад, Vienna Pair", comment: "Повідомлення організаторам (за бажанням)", commentPlaceholder: "Що нам варто знати про вашу пару?",
    playerOne: "Гравець 1", playerTwo: "Гравець 2", firstName: "Ім’я", lastName: "Прізвище", email: "Email", phone: "Номер телефону", messenger: "Telegram або WhatsApp (за бажанням)", level: "Рівень гри", chooseLevel: "Оберіть рівень", beginner: "Початковий", intermediate: "Середній", advanced: "Просунутий", competitive: "Турнірний / змагальний", ratingSystem: "Система рейтингу (за бажанням)", ratingValue: "Рейтинг (за бажанням)", tennisRating: "ITN, UTR або LK", padelRating: "Playtomic або інша", ratingExample: "Наприклад, 7.5",
    review: "Підтвердження", accurate: "Підтверджую, що надані дані правильні.", partner: "Мій партнер погодився на цю заявку та використання його контактних даних.", rules: "Я погоджуюся з правилами турніру та повідомленням про приватність.", marketing: "Надсилайте мені новини про турніри KYNG CUP (за бажанням).", submit: "Подати заявку пари", preview: "Попередній перегляд форми — онлайн-відправлення підключимо на наступному етапі.", required: "Обов’язкові поля",
  },
  de: {
    eyebrow: "Paaranmeldung", title: "Euer nächstes Match beginnt hier", intro: "Anmeldungen sind nur für vollständige Paare möglich. Tragt die Daten beider Spieler ein — wir bestätigen euren Platz persönlich.",
    tournament: "Turnier", choose: "Turnier wählen", loading: "Verfügbare Turniere werden geladen…", unavailable: "Aktuell nimmt kein Turnier Anmeldungen an.", loadError: "Die Turnierinformationen konnten nicht geladen werden. Bitte erneut versuchen.",
    tennis: "Tennis", padel: "Padel", open: "Anmeldung geöffnet", waitlist: "Warteliste", location: "Ort", dates: "Zeitraum", singleDate: "Turniertag", to: "bis",
    pairDetails: "Angaben zum Paar", pairIntro: "Wir nehmen nur vollständige Paare an. Ein Paarname ist optional.", pairName: "Paarname (optional)", pairPlaceholder: "Zum Beispiel Vienna Pair", comment: "Nachricht an die Organisation (optional)", commentPlaceholder: "Was sollten wir über euer Paar wissen?",
    playerOne: "Spieler 1", playerTwo: "Spieler 2", firstName: "Vorname", lastName: "Nachname", email: "E-Mail", phone: "Telefonnummer", messenger: "Telegram oder WhatsApp (optional)", level: "Spielniveau", chooseLevel: "Niveau wählen", beginner: "Einsteiger", intermediate: "Fortgeschritten", advanced: "Sehr fortgeschritten", competitive: "Turnier / Wettkampf", ratingSystem: "Ratingsystem (optional)", ratingValue: "Rating (optional)", tennisRating: "ITN, UTR oder LK", padelRating: "Playtomic oder anderes", ratingExample: "Zum Beispiel 7,5",
    review: "Bestätigung", accurate: "Ich bestätige, dass die Angaben korrekt sind.", partner: "Mein Partner stimmt dieser Anmeldung und der Nutzung seiner Kontaktdaten zu.", rules: "Ich akzeptiere die Turnierregeln und den Datenschutzhinweis.", marketing: "Ich möchte gelegentlich KYNG CUP Turniernews erhalten (optional).", submit: "Paar anmelden", preview: "Formularvorschau — die Online-Übermittlung wird im nächsten Schritt aktiviert.", required: "Pflichtfelder",
  },
  ru: {
    eyebrow: "Регистрация пары", title: "Ваш следующий матч начинается здесь", intro: "Мы принимаем заявки только от готовых пар. Заполните данные обоих игроков — и мы лично подтвердим ваше участие.",
    tournament: "Турнир", choose: "Выберите турнир", loading: "Загружаем доступные турниры…", unavailable: "Сейчас нет турниров, принимающих заявки.", loadError: "Не удалось загрузить информацию о турнире. Попробуйте ещё раз.",
    tennis: "Теннис", padel: "Падел", open: "Регистрация открыта", waitlist: "Лист ожидания", location: "Локация", dates: "Даты", singleDate: "Дата проведения", to: "—",
    pairDetails: "Данные пары", pairIntro: "Мы принимаем только готовые пары. Название пары — по желанию.", pairName: "Название пары (по желанию)", pairPlaceholder: "Например, Vienna Pair", comment: "Сообщение организаторам (по желанию)", commentPlaceholder: "Что нам стоит знать о вашей паре?",
    playerOne: "Игрок 1", playerTwo: "Игрок 2", firstName: "Имя", lastName: "Фамилия", email: "Email", phone: "Номер телефона", messenger: "Telegram или WhatsApp (по желанию)", level: "Уровень игры", chooseLevel: "Выберите уровень", beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый", competitive: "Турнирный / соревновательный", ratingSystem: "Система рейтинга (по желанию)", ratingValue: "Рейтинг (по желанию)", tennisRating: "ITN, UTR или LK", padelRating: "Playtomic или другая", ratingExample: "Например, 7.5",
    review: "Подтверждение", accurate: "Подтверждаю, что указанные данные верны.", partner: "Мой партнёр согласился на эту заявку и использование его контактных данных.", rules: "Я согласен с правилами турнира и уведомлением о конфиденциальности.", marketing: "Присылайте мне новости о турнирах KYNG CUP (по желанию).", submit: "Подать заявку пары", preview: "Предварительный просмотр формы — онлайн-отправку подключим на следующем этапе.", required: "Обязательные поля",
  },
} as const;

const dateLocales: Record<Language, string> = { en: "en-GB", uk: "uk-UA", de: "de-AT", ru: "ru-RU" };

function PlayerFields({ number, sport, language }: { number: 1 | 2; sport: Sport; language: Language }) {
  const text = copy[language];
  const prefix = number === 1 ? "player_one" : "player_two";
  return <fieldset className="registration-player-card">
    <legend><span>0{number + 1}</span>{number === 1 ? text.playerOne : text.playerTwo}</legend>
    <div className="registration-form-grid">
      <label><span>{text.firstName} *</span><input name={`${prefix}_first_name`} autoComplete="given-name" required /></label>
      <label><span>{text.lastName} *</span><input name={`${prefix}_last_name`} autoComplete="family-name" required /></label>
      <label><span>{text.email} *</span><input name={`${prefix}_email`} type="email" autoComplete="email" required /></label>
      <label><span>{text.phone} *</span><input name={`${prefix}_phone`} type="tel" autoComplete="tel" required /></label>
      <label className="registration-field-wide"><span>{text.messenger}</span><input name={`${prefix}_messenger`} placeholder="@username / +43…" /></label>
      <label><span>{text.level} *</span><select name={`${prefix}_level`} defaultValue="" required><option value="" disabled>{text.chooseLevel}</option><option value="beginner">{text.beginner}</option><option value="intermediate">{text.intermediate}</option><option value="advanced">{text.advanced}</option><option value="competitive">{text.competitive}</option></select></label>
      <label><span>{text.ratingSystem}</span><input name={`${prefix}_rating_system`} placeholder={sport === "tennis" ? text.tennisRating : text.padelRating} /></label>
      <label><span>{text.ratingValue}</span><input name={`${prefix}_rating_value`} inputMode="decimal" placeholder={text.ratingExample} /></label>
    </div>
  </fieldset>;
}

export default function RegisterPage() {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  const { language } = useLanguage();
  const text = copy[language];
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadTournaments = useCallback(async () => {
    const result = await supabase.from("tournaments").select("id,slug,name,sport,location,starts_at,ends_at,status,registration_status").in("status", ["published", "live"]).in("registration_status", ["open", "waitlist"]).order("starts_at", { ascending: true, nullsFirst: false });
    if (result.error) { setLoadError(true); setLoading(false); return; }
    const available = (result.data ?? []) as Tournament[];
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tournament");
    const requestedSport = params.get("sport") as Sport | null;
    const chosen = available.find((item) => item.slug === requested) ?? available.find((item) => item.sport === requestedSport && item.status === "live") ?? available.find((item) => item.sport === requestedSport) ?? available.find((item) => item.status === "live") ?? available[0];
    setTournaments(available);
    setSelectedSlug(chosen?.slug ?? "");
    setLoadError(false);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void loadTournaments(), 0); return () => window.clearTimeout(timer); }, [loadTournaments]);
  const tournament = useMemo(() => tournaments.find((item) => item.slug === selectedSlug) ?? null, [selectedSlug, tournaments]);

  function selectTournament(slug: string) {
    const next = tournaments.find((item) => item.slug === slug);
    setSelectedSlug(slug);
    const url = new URL(window.location.href);
    url.searchParams.set("tournament", slug);
    if (next) url.searchParams.set("sport", next.sport);
    window.history.replaceState({}, "", url);
  }

  function formatDate(value: string | null) {
    return value ? new Intl.DateTimeFormat(dateLocales[language], { timeZone: "Europe/Vienna", day: "2-digit", month: "long", year: "numeric" }).format(new Date(value)) : "—";
  }
  function dateKey(value: string | null) {
    return value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : null;
  }
  const singleDay = Boolean(tournament?.starts_at && tournament?.ends_at && dateKey(tournament.starts_at) === dateKey(tournament.ends_at));

  function previewSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); }

  return <main className="registration-page">
    <section className="registration-intro">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1>{text.title}<span className="accent-dot">.</span></h1>
      <p>{text.intro}</p>
    </section>

    <section className="registration-shell">
      <aside className="registration-tournament-card">
        <div className="registration-card-index"><span>01</span><span>{text.tournament}</span></div>
        {loading ? <p className="registration-message" role="status">{text.loading}</p> : loadError ? <p className="registration-message is-error" role="alert">{text.loadError}</p> : !tournament ? <p className="registration-message">{text.unavailable}</p> : <>
          {tournaments.length > 1 && <label className="registration-tournament-select"><span>{text.choose}</span><select value={selectedSlug} onChange={(event) => selectTournament(event.target.value)}>{tournaments.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>}
          <span className={`registration-status is-${tournament.registration_status}`}><i />{tournament.registration_status === "waitlist" ? text.waitlist : text.open}</span>
          <strong className="registration-tournament-name">{tournament.name}</strong>
          <span className="registration-sport">{tournament.sport === "tennis" ? text.tennis : text.padel}</span>
          <dl><div><dt>{text.location}</dt><dd>{tournament.location ?? "Vienna, Austria"}</dd></div><div><dt>{singleDay ? text.singleDate : text.dates}</dt><dd>{singleDay ? formatDate(tournament.starts_at) : <>{formatDate(tournament.starts_at)} <span>{text.to}</span> {formatDate(tournament.ends_at)}</>}</dd></div></dl>
        </>}
        <a className="registration-back-link" href={`${basePath}/${tournament?.sport ?? ""}`}>← KYNG CUP</a>
      </aside>

      <form className="registration-application" onSubmit={previewSubmit}>
        <fieldset className="registration-pair-card" disabled={!tournament}>
          <legend><span>01</span>{text.pairDetails}</legend>
          <p>{text.pairIntro}</p>
          <div className="registration-form-grid">
            <label className="registration-field-wide"><span>{text.pairName}</span><input name="pair_name" placeholder={text.pairPlaceholder} /></label>
          </div>
        </fieldset>
        <PlayerFields number={1} sport={tournament?.sport ?? "tennis"} language={language} />
        <PlayerFields number={2} sport={tournament?.sport ?? "tennis"} language={language} />
        <fieldset className="registration-review-card">
          <legend><span>04</span>{text.review}</legend>
          <label className="registration-comment"><span>{text.comment}</span><textarea name="comment" rows={4} placeholder={text.commentPlaceholder} /></label>
          <div className="registration-consents">
            <label><input name="accuracy_confirmed" type="checkbox" required /><span>{text.accurate}</span></label>
            <label><input name="partner_consent" type="checkbox" required /><span>{text.partner}</span></label>
            <label><input name="rules_privacy_accepted" type="checkbox" required /><span>{text.rules}</span></label>
            <label><input name="marketing_opt_in" type="checkbox" /><span>{text.marketing}</span></label>
          </div>
          <div className="registration-submit-row"><button type="submit" disabled>{text.submit}<span>↗</span></button><div><small>* {text.required}</small><p>{text.preview}</p></div></div>
        </fieldset>
      </form>
    </section>
    <SiteFooter />
  </main>;
}
