"use client";

import { usePathname } from "next/navigation";
import { useLanguage } from "./i18n";
import { formatTournamentDate, selectUpcomingTournaments, usePublicTournaments } from "./public-tournaments";

const locales = { en: "en-GB", uk: "uk-UA", de: "de-AT", ru: "ru-RU" } as const;

export default function UpcomingTournament({ sport }: { sport: "tennis" | "padel" }) {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  const { language, t } = useLanguage();
  const { tournaments } = usePublicTournaments();
  const upcoming = selectUpcomingTournaments(tournaments).filter((tournament) => tournament.sport === sport);

  const dateOptions = { timeZone: "Europe/Vienna" } as const;
  const day = new Intl.DateTimeFormat(locales[language], { ...dateOptions, day: "2-digit" });
  const month = new Intl.DateTimeFormat(locales[language], { ...dateOptions, month: "long", year: "numeric" });

  if (!upcoming.length) return null;
  return <section className="upcoming-dynamic" id="tournament">
    <div className="section-index"><span>03</span><span>{t("upcoming")}</span></div>
    {upcoming.map((tournament) => {
      const tournamentSlug = encodeURIComponent(tournament.slug);
      const registrationHref = `${basePath}/register/?tournament=${tournamentSlug}&sport=${sport}`;
      const start = tournament.starts_at ? new Date(tournament.starts_at) : null;
      const end = tournament.ends_at ? new Date(tournament.ends_at) : null;
      const dateLabel = formatTournamentDate(tournament, language, true);
      const isRange = start && end && dateLabel.includes(" – ");
      const datePoint = (date: Date | null) => <div className="upcoming-date-point">
        <strong>{date ? day.format(date) : "—"}</strong><span>{date ? month.format(date) : t("scheduled")}</span>
      </div>;
      return <div className="upcoming-layout" key={tournament.id}>
        <div className={`upcoming-date${isRange ? "" : " is-single-day"}`} aria-label={dateLabel}>
          {datePoint(start)}{isRange && <><i aria-hidden="true">—</i>{datePoint(end)}</>}
        </div>
        <div className="upcoming-copy">
          <span className={`live-indicator${tournament.status === "live" ? " is-live" : ""}`}><i />{tournament.status === "live" ? t("live") : t("scheduled")}</span>
          <h2>{tournament.name}</h2>
          <div><span>{t("location")}<strong>{tournament.location ?? "Vienna, Austria"}</strong></span></div>
          <div className="upcoming-actions">
            <a href={`${basePath}/bracket/?tournament=${tournamentSlug}&sport=${sport}`}>{t("viewBracket")} ↗</a>
            {tournament.registration_status === "closed"
              ? <span className="registration-cta is-disabled" aria-disabled="true">{t("registrationClosed")}</span>
              : <a className="registration-cta" href={registrationHref}>{tournament.registration_status === "waitlist" ? t("joinWaitlist") : t("participate")} ↗</a>}
          </div>
        </div>
      </div>;
    })}
  </section>;
}
