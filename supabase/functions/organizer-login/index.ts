import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set(["https://kyngcup.com", "https://www.kyngcup.com", "https://yaraprimeson.github.io"]);

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) || local ? origin : "https://kyngcup.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const respond = (body: object, status: number) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  if (origin && !allowedOrigins.has(origin) && !local) return respond({ error: "Origin not allowed" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 8192) return respond({ error: "Invalid request" }, 400);
    const { username, password } = JSON.parse(raw);
    if (typeof username !== "string" || typeof password !== "string" || !password || password.length > 1024 || username.length > 80) return respond({ error: "Invalid credentials" }, 400);
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    // The database owns the attempt counter; cold starts cannot reset it.
    const attempt = await admin.rpc("consume_organizer_login_attempt");
    if (attempt.error) return respond({ error: "Sign-in unavailable" }, 503);
    if (!attempt.data) return respond({ error: "Try again in a minute" }, 429);
    const account = await admin.rpc("resolve_organizer_login", { p_username: username.trim().toLowerCase() });
    if (account.error) return respond({ error: "Sign-in unavailable" }, 503);
    const identity = account.data?.[0];
    if (!identity) return respond({ error: "Invalid credentials" }, 401);
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error || !data.session || data.user?.id !== identity.user_id) return respond({ error: "Invalid credentials" }, 401);
    return respond({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, 200);
  } catch {
    return respond({ error: "Sign-in unavailable" }, 400);
  }
});
