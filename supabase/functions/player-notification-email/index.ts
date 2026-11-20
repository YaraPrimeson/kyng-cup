type EmailJob = {
  id: string;
  email: string;
  locale: string;
  kind: "registration_confirmed" | "match_scheduled" | "match_changed";
  tournament_name: string;
  scheduled_at: string | null;
  court: string | null;
  attempt: number;
};

const copy = {
  en: { registration_confirmed: "Entry confirmed", match_scheduled: "Match scheduled", match_changed: "Match schedule changed", court: "Court", timePending: "Check your account for the latest schedule.", account: "Open your KYNG CUP account" },
  uk: { registration_confirmed: "Участь підтверджено", match_scheduled: "Матч заплановано", match_changed: "Розклад матчу змінився", court: "Корт", timePending: "Перевірте актуальний розклад у своєму кабінеті.", account: "Відкрити кабінет KYNG CUP" },
  de: { registration_confirmed: "Teilnahme bestätigt", match_scheduled: "Match angesetzt", match_changed: "Spielplan geändert", court: "Platz", timePending: "Den aktuellen Spielplan findest du in deinem Konto.", account: "KYNG CUP-Konto öffnen" },
  ru: { registration_confirmed: "Участие подтверждено", match_scheduled: "Матч назначен", match_changed: "Расписание матча изменилось", court: "Корт", timePending: "Проверьте актуальное расписание в кабинете.", account: "Открыть кабинет KYNG CUP" },
} as const;

async function validSecret(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const [first, second] = await Promise.all([actual, expected].map(value => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  const expectedBytes = new Uint8Array(second);
  return new Uint8Array(first).reduce((diff, byte, index) => diff | (byte ^ expectedBytes[index]), 0) === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const workerSecret = Deno.env.get("PLAYER_EMAIL_WORKER_SECRET");
  if (!workerSecret || !await validSecret(request.headers.get("x-player-email-secret") ?? "", workerSecret)) {
    return new Response(null, { status: 401 });
  }
  const sender = Deno.env.get("PLAYER_EMAIL_FROM");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const databaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sender || !apiKey || !databaseUrl || !serviceKey) return new Response(null, { status: 503 });

  function rpc(name: string, args: Record<string, unknown> = {}) {
    return fetch(`${databaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST", signal: AbortSignal.timeout(8000),
      headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  }

  try {
    const response = await rpc("claim_player_notification_emails");
    if (!response.ok) return new Response(null, { status: 502 });
    const jobs = await response.json() as EmailJob[];
    for (const job of jobs) {
      const locale = Object.hasOwn(copy, job.locale) ? job.locale as keyof typeof copy : "en";
      const words = copy[locale];
      const subject = `${words[job.kind]} · ${job.tournament_name.replace(/[\r\n]+/g, " ")}`;
      const schedule = job.scheduled_at
        ? `${new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Vienna" }).format(new Date(job.scheduled_at))} (Europe/Vienna)`
        : job.kind === "match_changed" ? words.timePending : "";
      let result = "retry";
      try {
        const delivery = await fetch("https://api.resend.com/emails", {
          method: "POST", signal: AbortSignal.timeout(6000),
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `kyng-player-notice/${job.id}` },
          body: JSON.stringify({ from: sender, to: [job.email], subject,
            text: [subject, schedule, job.court && `${words.court} ${job.court}`, `${words.account}\nhttps://kyngcup.com/profile/`].filter(Boolean).join("\n\n") }),
        });
        if (delivery.ok) result = "sent";
        else if (delivery.status === 422) result = "failed";
        await delivery.body?.cancel();
      } catch { /* The lease and idempotency key make retry safe after ambiguous delivery. */ }
      const saved = await rpc("finish_player_notification_email", { p_id: job.id, p_attempt: job.attempt, p_result: result });
      if (!saved.ok) return new Response(null, { status: 502 });
    }
    return Response.json({ processed: jobs.length });
  } catch {
    return new Response(null, { status: 502 });
  }
});
