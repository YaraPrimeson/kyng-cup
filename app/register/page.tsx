"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Language, useLanguage } from "../i18n";
import SiteFooter from "../site-footer";
import { getLeadAttribution, trackEvent } from "../analytics";

type Sport = "tennis" | "padel";
type RegistrationStatus = "open" | "waitlist" | "closed";
type Tournament = {
  id: string;
  slug: string;
  name: string;
  sport: Sport;
  location: string | null;
  format_description: string | null;
  prize_pool: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: "published" | "live";
  registration_status: RegistrationStatus;
};

const copy = {
  en: {
    eyebrow: "Pair registration", title: "Your next match starts here", intro: "Applications are accepted for ready-made pairs. Complete the details for both players and we will confirm your place personally.",
    tournament: "Tournament", choose: "Choose tournament", loading: "Loading available tournaments…", unavailable: "There are no tournaments accepting applications right now.", loadError: "Tournament information could not be loaded. Please try again.",
    tennis: "Tennis", padel: "Padel", open: "Registration open", waitlist: "Waitlist", location: "Location", format: "Format", prizePool: "Prize pool", dates: "Dates", singleDate: "Tournament date", to: "to",
    pairDetails: "Pair details", pairIntro: "We accept complete pairs only. A pair name is optional.", pairName: "Pair name (optional)", pairPlaceholder: "For example, Vienna Pair", comment: "Message to the organisers (optional)", commentPlaceholder: "Anything we should know about your pair?",
    playerOne: "Player 1", playerTwo: "Player 2", firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone number", messenger: "Telegram or WhatsApp (optional)", level: "Playing level", chooseLevel: "Choose level", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", competitive: "Tournament / competitive", ratingSystem: "Rating system (optional)", ratingValue: "Rating (optional)", tennisRating: "ITN, UTR or LK", padelRating: "Playtomic or other", ratingExample: "For example, 7.5",
    review: "Confirmation", accurate: "I confirm that the information provided is accurate.", partner: "My partner has agreed to this application and the use of their contact details.", rulesPrefix: "I agree to the", rulesLink: "Tournament Rules", privacyPrefix: "and have read the", privacyNotice: "privacy notice", marketing: "Send me occasional KYNG CUP tournament news (optional).", submit: "Submit pair application", submitting: "Sending application…", privacy: "Your application is sent securely to the KYNG CUP team.", required: "Required fields", sameEmail: "Use a different email address for each player.", duplicate: "This pair has already applied for the selected tournament.", unavailableError: "Registration for this tournament is no longer available. Please choose another tournament.", invalidError: "Please check the highlighted fields and try again.", submitError: "The application could not be sent. Please try again.", success: "Application received", successTitle: "Your pair is in the game", successBody: "Thank you, {pair}. We received your application for {tournament}. We will get back to you shortly.", waitlistBody: "", backTournament: "Back to tournament",
  },
  uk: {
    eyebrow: "Реєстрація пари", title: "Ваш наступний матч починається тут", intro: "Ми приймаємо заявки лише від сформованих пар. Заповніть дані обох гравців — і ми особисто підтвердимо вашу участь.",
    tournament: "Турнір", choose: "Оберіть турнір", loading: "Завантажуємо доступні турніри…", unavailable: "Наразі немає турнірів, що приймають заявки.", loadError: "Не вдалося завантажити інформацію про турнір. Спробуйте ще раз.",
    tennis: "Теніс", padel: "Падел", open: "Реєстрацію відкрито", waitlist: "Лист очікування", location: "Локація", format: "Формат", prizePool: "Призовий фонд", dates: "Дати", singleDate: "Дата проведення", to: "—",
    pairDetails: "Дані пари", pairIntro: "Ми приймаємо лише готові пари. Назва пари — за бажанням.", pairName: "Назва пари (за бажанням)", pairPlaceholder: "Наприклад, Vienna Pair", comment: "Повідомлення організаторам (за бажанням)", commentPlaceholder: "Що нам варто знати про вашу пару?",
    playerOne: "Гравець 1", playerTwo: "Гравець 2", firstName: "Ім’я", lastName: "Прізвище", email: "Email", phone: "Номер телефону", messenger: "Telegram або WhatsApp (за бажанням)", level: "Рівень гри", chooseLevel: "Оберіть рівень", beginner: "Початковий", intermediate: "Середній", advanced: "Просунутий", competitive: "Турнірний / змагальний", ratingSystem: "Система рейтингу (за бажанням)", ratingValue: "Рейтинг (за бажанням)", tennisRating: "ITN, UTR або LK", padelRating: "Playtomic або інша", ratingExample: "Наприклад, 7.5",
    review: "Підтвердження", accurate: "Підтверджую, що надані дані правильні.", partner: "Мій партнер погодився на цю заявку та використання його контактних даних.", rulesPrefix: "Я погоджуюся з", rulesLink: "правилами турніру", privacyPrefix: "та ознайомився(-лася) з", privacyNotice: "повідомленням про приватність", marketing: "Надсилайте мені новини про турніри KYNG CUP (за бажанням).", submit: "Подати заявку пари", submitting: "Надсилаємо заявку…", privacy: "Ваша заявка безпечно передається команді KYNG CUP.", required: "Обов’язкові поля", sameEmail: "Вкажіть різні email для кожного гравця.", duplicate: "Ця пара вже подала заявку на обраний турнір.", unavailableError: "Реєстрація на цей турнір уже недоступна. Оберіть інший турнір.", invalidError: "Перевірте виділені поля та спробуйте ще раз.", submitError: "Не вдалося надіслати заявку. Спробуйте ще раз.", success: "Заявку отримано", successTitle: "Ваша пара у грі", successBody: "Дякуємо, {pair}. Ми отримали вашу заявку на {tournament}. Ми відповімо вам найближчим часом.", waitlistBody: "", backTournament: "До турніру",
  },
  de: {
    eyebrow: "Paaranmeldung", title: "Euer nächstes Match beginnt hier", intro: "Anmeldungen sind nur für vollständige Paare möglich. Tragt die Daten beider Spieler ein — wir bestätigen euren Platz persönlich.",
    tournament: "Turnier", choose: "Turnier wählen", loading: "Verfügbare Turniere werden geladen…", unavailable: "Aktuell nimmt kein Turnier Anmeldungen an.", loadError: "Die Turnierinformationen konnten nicht geladen werden. Bitte erneut versuchen.",
    tennis: "Tennis", padel: "Padel", open: "Anmeldung geöffnet", waitlist: "Warteliste", location: "Ort", format: "Format", prizePool: "Preisgeld", dates: "Zeitraum", singleDate: "Turniertag", to: "bis",
    pairDetails: "Angaben zum Paar", pairIntro: "Wir nehmen nur vollständige Paare an. Ein Paarname ist optional.", pairName: "Paarname (optional)", pairPlaceholder: "Zum Beispiel Vienna Pair", comment: "Nachricht an die Organisation (optional)", commentPlaceholder: "Was sollten wir über euer Paar wissen?",
    playerOne: "Spieler 1", playerTwo: "Spieler 2", firstName: "Vorname", lastName: "Nachname", email: "E-Mail", phone: "Telefonnummer", messenger: "Telegram oder WhatsApp (optional)", level: "Spielniveau", chooseLevel: "Niveau wählen", beginner: "Einsteiger", intermediate: "Fortgeschritten", advanced: "Sehr fortgeschritten", competitive: "Turnier / Wettkampf", ratingSystem: "Ratingsystem (optional)", ratingValue: "Rating (optional)", tennisRating: "ITN, UTR oder LK", padelRating: "Playtomic oder anderes", ratingExample: "Zum Beispiel 7,5",
    review: "Bestätigung", accurate: "Ich bestätige, dass die Angaben korrekt sind.", partner: "Mein Partner stimmt dieser Anmeldung und der Nutzung seiner Kontaktdaten zu.", rulesPrefix: "Ich akzeptiere die", rulesLink: "Turnierregeln", privacyPrefix: "und habe den", privacyNotice: "Datenschutzhinweis", marketing: "Ich möchte gelegentlich KYNG CUP Turniernews erhalten (optional).", submit: "Paar anmelden", submitting: "Anmeldung wird gesendet…", privacy: "Eure Anmeldung wird sicher an das KYNG CUP Team übermittelt.", required: "Pflichtfelder", sameEmail: "Bitte verwendet für jeden Spieler eine andere E-Mail-Adresse.", duplicate: "Dieses Paar ist bereits für das gewählte Turnier angemeldet.", unavailableError: "Die Anmeldung für dieses Turnier ist nicht mehr verfügbar. Bitte wählt ein anderes Turnier.", invalidError: "Bitte überprüft die markierten Felder und versucht es erneut.", submitError: "Die Anmeldung konnte nicht gesendet werden. Bitte versucht es erneut.", success: "Anmeldung eingegangen", successTitle: "Euer Paar ist im Spiel", successBody: "Danke, {pair}. Wir haben eure Anmeldung für {tournament} erhalten. Wir melden uns in Kürze.", waitlistBody: "", backTournament: "Zurück zum Turnier",
  },
  ru: {
    eyebrow: "Регистрация пары", title: "Ваш следующий матч начинается здесь", intro: "Мы принимаем заявки только от готовых пар. Заполните данные обоих игроков — и мы лично подтвердим ваше участие.",
    tournament: "Турнир", choose: "Выберите турнир", loading: "Загружаем доступные турниры…", unavailable: "Сейчас нет турниров, принимающих заявки.", loadError: "Не удалось загрузить информацию о турнире. Попробуйте ещё раз.",
    tennis: "Теннис", padel: "Падел", open: "Регистрация открыта", waitlist: "Лист ожидания", location: "Локация", format: "Формат", prizePool: "Призовой фонд", dates: "Даты", singleDate: "Дата проведения", to: "—",
    pairDetails: "Данные пары", pairIntro: "Мы принимаем только готовые пары. Название пары — по желанию.", pairName: "Название пары (по желанию)", pairPlaceholder: "Например, Vienna Pair", comment: "Сообщение организаторам (по желанию)", commentPlaceholder: "Что нам стоит знать о вашей паре?",
    playerOne: "Игрок 1", playerTwo: "Игрок 2", firstName: "Имя", lastName: "Фамилия", email: "Email", phone: "Номер телефона", messenger: "Telegram или WhatsApp (по желанию)", level: "Уровень игры", chooseLevel: "Выберите уровень", beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый", competitive: "Турнирный / соревновательный", ratingSystem: "Система рейтинга (по желанию)", ratingValue: "Рейтинг (по желанию)", tennisRating: "ITN, UTR или LK", padelRating: "Playtomic или другая", ratingExample: "Например, 7.5",
    review: "Подтверждение", accurate: "Подтверждаю, что указанные данные верны.", partner: "Мой партнёр согласился на эту заявку и использование его контактных данных.", rulesPrefix: "Я согласен с", rulesLink: "правилами турнира", privacyPrefix: "и ознакомился с", privacyNotice: "уведомлением о конфиденциальности", marketing: "Присылайте мне новости о турнирах KYNG CUP (по желанию).", submit: "Подать заявку пары", submitting: "Отправляем заявку…", privacy: "Ваша заявка безопасно передаётся команде KYNG CUP.", required: "Обязательные поля", sameEmail: "Укажите разные email для каждого игрока.", duplicate: "Эта пара уже подала заявку на выбранный турнир.", unavailableError: "Регистрация на этот турнир уже недоступна. Выберите другой турнир.", invalidError: "Проверьте выделенные поля и попробуйте ещё раз.", submitError: "Не удалось отправить заявку. Попробуйте ещё раз.", success: "Заявка получена", successTitle: "Ваша пара в игре", successBody: "Спасибо, {pair}. Мы получили вашу заявку на {tournament}. Мы ответим вам в ближайшее время.", waitlistBody: "", backTournament: "К турниру",
  },
} as const;

const dateLocales: Record<Language, string> = { en: "en-GB", uk: "uk-UA", de: "de-AT", ru: "ru-RU" };

function ContactFields({ language, disabled }: { language: Language; disabled: boolean }) {
  const text = copy[language];
  return <fieldset className="registration-player-card" disabled={disabled}>
    <legend><span>01</span>{text.playerOne}</legend>
    <div className="registration-form-grid">
      <label><span>{text.firstName} *</span><input name="player_one_first_name" autoComplete="given-name" minLength={1} maxLength={80} required /></label>
      <label><span>{text.lastName} *</span><input name="player_one_last_name" autoComplete="family-name" minLength={1} maxLength={80} required /></label>
      <label><span>{text.email} *</span><input name="player_one_email" type="email" autoComplete="email" maxLength={320} required /></label>
      <label><span>{text.phone} *</span><input name="player_one_phone" type="tel" autoComplete="tel" minLength={5} maxLength={100} placeholder="+43… / @username" required /></label>
      <label className="registration-field-wide"><span>{text.level} *</span><select name="player_one_level" defaultValue="" required><option value="" disabled>{text.chooseLevel}</option><option value="beginner">{text.beginner}</option><option value="intermediate">{text.intermediate}</option><option value="advanced">{text.advanced}</option><option value="competitive">{text.competitive}</option></select></label>
    </div>
  </fieldset>;
}

function PairFields({ sport, language, disabled }: { sport: Sport; language: Language; disabled: boolean }) {
  const text = copy[language];
  return <fieldset className="registration-pair-card" disabled={disabled}>
    <legend><span>02</span>{text.pairDetails}</legend>
    <p>{text.pairIntro}</p>
    <div className="registration-form-grid">
      <label><span>{text.firstName} *</span><input name="player_two_first_name" autoComplete="given-name" minLength={1} maxLength={80} required /></label>
      <label><span>{text.lastName} *</span><input name="player_two_last_name" autoComplete="family-name" minLength={1} maxLength={80} required /></label>
      <label className="registration-field-wide"><span>{text.level} *</span><select name="player_two_level" defaultValue="" required><option value="" disabled>{text.chooseLevel}</option><option value="beginner">{text.beginner}</option><option value="intermediate">{text.intermediate}</option><option value="advanced">{text.advanced}</option><option value="competitive">{text.competitive}</option></select></label>
      <label><span>{text.ratingSystem}</span><input name="player_one_rating_system" maxLength={40} placeholder={sport === "tennis" ? text.tennisRating : text.padelRating} /></label>
      <label><span>{text.ratingValue}</span><input name="player_one_rating_value" maxLength={40} placeholder={text.ratingExample} /></label>
      <label><span>{text.ratingSystem}</span><input name="player_two_rating_system" maxLength={40} placeholder={sport === "tennis" ? text.tennisRating : text.padelRating} /></label>
      <label><span>{text.ratingValue}</span><input name="player_two_rating_value" maxLength={40} placeholder={text.ratingExample} /></label>
      <label className="registration-field-wide"><span>{text.pairName}</span><input name="pair_name" maxLength={120} placeholder={text.pairPlaceholder} /></label>
      <label className="registration-field-wide registration-comment"><span>{text.comment}</span><textarea name="comment" rows={4} maxLength={1000} placeholder={text.commentPlaceholder} /></label>
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
  const [submissionState, setSubmissionState] = useState<"idle" | "submitting" | "success">("idle");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submittedPair, setSubmittedPair] = useState("");
  const formOpenedAt = useRef<number | null>(null);

  const loadTournaments = useCallback(async () => {
    const result = await supabase.from("tournaments").select("id,slug,name,sport,location,format_description,prize_pool,starts_at,ends_at,status,registration_status").in("status", ["published", "live"]).in("registration_status", ["open", "waitlist"]).order("starts_at", { ascending: true, nullsFirst: false });
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

  useEffect(() => {
    formOpenedAt.current = Date.now();
    const timer = window.setTimeout(() => void loadTournaments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTournaments]);
  const tournament = useMemo(() => tournaments.find((item) => item.slug === selectedSlug) ?? null, [selectedSlug, tournaments]);

  function selectTournament(slug: string) {
    const next = tournaments.find((item) => item.slug === slug);
    setSelectedSlug(slug);
    setSubmissionError(null);
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

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!tournament || submissionState === "submitting") return;
    if (!form.reportValidity()) { setSubmissionError(text.invalidError); return; }

    const data = new FormData(form);
    if (String(data.get("website") ?? "").trim() || formOpenedAt.current === null || Date.now() - formOpenedAt.current < 1500) {
      setSubmissionError(text.submitError);
      trackEvent("form_submit_error", { reason: "spam_check", sport: tournament.sport });
      return;
    }
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const optional = (name: string) => value(name) || null;
    const firstEmail = value("player_one_email").toLowerCase();
    const pairLabel = optional("pair_name") ?? `${value("player_one_last_name")} & ${value("player_two_last_name")}`;
    setSubmissionState("submitting");
    setSubmissionError(null);
    let error: { code?: string } | null = null;
    try {
      const result = await supabase.from("tournament_registrations").insert({
      tournament_id: tournament.id,
      pair_name: optional("pair_name"),
      player_one_first_name: value("player_one_first_name"),
      player_one_last_name: value("player_one_last_name"),
      player_one_email: firstEmail,
      player_one_phone: value("player_one_phone"),
      player_one_messenger: null,
      player_one_level: value("player_one_level"),
      player_one_rating_system: optional("player_one_rating_system"),
      player_one_rating_value: optional("player_one_rating_value"),
      player_two_first_name: value("player_two_first_name"),
      player_two_last_name: value("player_two_last_name"),
      player_two_email: null,
      player_two_phone: null,
      player_two_messenger: null,
      player_two_level: value("player_two_level"),
      player_two_rating_system: optional("player_two_rating_system"),
      player_two_rating_value: optional("player_two_rating_value"),
      comment: optional("comment"),
      locale: language,
        marketing_opt_in: data.get("marketing_opt_in") === "on",
        ...getLeadAttribution(),
      });
      error = result.error;
    } catch {
      setSubmissionError(text.submitError);
      setSubmissionState("idle");
      return;
    }

    if (error) {
      const message = error.code === "23505" ? text.duplicate : error.code === "23514" ? text.invalidError : error.code === "42501" || error.code?.startsWith("PGRST") ? text.unavailableError : text.submitError;
      setSubmissionError(message);
      setSubmissionState("idle");
      trackEvent("form_submit_error", { reason: error.code ?? "unknown", sport: tournament.sport, tournament_slug: tournament.slug });
      return;
    }
    setSubmittedPair(pairLabel);
    setSubmissionState("success");
    trackEvent("generate_lead", { sport: tournament.sport, tournament_slug: tournament.slug, registration_status: tournament.registration_status });
    window.setTimeout(() => document.getElementById("registration-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

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
          <dl><div><dt>{text.location}</dt><dd>{tournament.location ?? "Vienna, Austria"}</dd></div>{tournament.format_description && <div><dt>{text.format}</dt><dd>{tournament.format_description}</dd></div>}{tournament.prize_pool && <div><dt>{text.prizePool}</dt><dd>{tournament.prize_pool}</dd></div>}<div><dt>{singleDay ? text.singleDate : text.dates}</dt><dd>{singleDay ? formatDate(tournament.starts_at) : <>{formatDate(tournament.starts_at)} <span>{text.to}</span> {formatDate(tournament.ends_at)}</>}</dd></div></dl>
        </>}
        <a className="registration-back-link" href={`${basePath}/${tournament?.sport ?? ""}`}>← KYNG CUP</a>
      </aside>

      {submissionState === "success" && tournament ? <article className="registration-success" id="registration-form" role="status" aria-live="polite">
        <div className="registration-success-mark" aria-hidden="true"><span>✓</span></div>
        <p className="eyebrow">{text.success}</p>
        <h2>{text.successTitle}<span className="accent-dot">.</span></h2>
        <p>{text.successBody.replace("{pair}", submittedPair).replace("{tournament}", tournament.name)}</p>
        <a href={`${basePath}/${tournament.sport}/#tournament`}>{text.backTournament}<span>↗</span></a>
      </article> : <form className="registration-application" id="registration-form" onSubmit={submitRegistration} onChange={() => submissionError && setSubmissionError(null)}>
        <div className="registration-honeypot" aria-hidden="true"><label>Website<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label></div>
        <ContactFields language={language} disabled={!tournament || submissionState === "submitting"} />
        <PairFields sport={tournament?.sport ?? "tennis"} language={language} disabled={!tournament || submissionState === "submitting"} />
        <fieldset className="registration-review-card" disabled={!tournament || submissionState === "submitting"}>
          <legend><span>03</span>{text.review}</legend>
          <div className="registration-consents">
            <label><input name="accuracy_confirmed" type="checkbox" required /><span>{text.accurate}</span></label>
            <label><input name="partner_consent" type="checkbox" required /><span>{text.partner}</span></label>
            <label><input name="rules_privacy_accepted" type="checkbox" required /><span>{text.rulesPrefix} <a href={`${basePath}/rules/`} target="_blank" rel="noreferrer">{text.rulesLink}</a> {text.privacyPrefix} <a href={`${basePath}/cookies/`} target="_blank" rel="noreferrer">{text.privacyNotice}</a>.</span></label>
            <label><input name="marketing_opt_in" type="checkbox" /><span>{text.marketing}</span></label>
          </div>
          {submissionError && <p className="registration-submit-error" role="alert">{submissionError}</p>}
          <div className="registration-submit-row"><button type="submit" disabled={!tournament || submissionState === "submitting"}>{submissionState === "submitting" ? text.submitting : text.submit}<span>{submissionState === "submitting" ? "…" : "↗"}</span></button><div><small>* {text.required}</small><p>{text.privacy}</p></div></div>
        </fieldset>
      </form>}
    </section>
    <SiteFooter />
  </main>;
}
