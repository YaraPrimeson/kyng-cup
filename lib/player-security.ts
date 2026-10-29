import { supabase, SUPABASE_URL, SUPABASE_PUBLIC_KEY } from "./supabase";
import { authCallbackUrl } from "./player-account";

const VERIFICATION_KEY = "kyng-account-verification";
const OAUTH_KEY = "kyng-account-oauth";
// A UI freshness hint, never an authorization source. Auth and RLS enforce access.
export function rememberVerification(userId: string) {
  sessionStorage.setItem(VERIFICATION_KEY, JSON.stringify({ userId, at: Date.now() }));
}
export function recentlyVerified(userId: string) {
  try {
    const value = JSON.parse(sessionStorage.getItem(VERIFICATION_KEY) || "null");
    return value?.userId === userId && Date.now() - value.at >= 0 && Date.now() - value.at < 300_000;
  } catch { return false; }
}
export function clearVerification() {
  sessionStorage.removeItem(VERIFICATION_KEY);
  sessionStorage.removeItem(OAUTH_KEY);
}
export function takeOAuthExpectation() {
  const raw = sessionStorage.getItem(OAUTH_KEY);
  sessionStorage.removeItem(OAUTH_KEY);
  try {
    const value = JSON.parse(raw || "null");
    return typeof value?.userId === "string" && Date.now() - value.at >= 0 && Date.now() - value.at < 600_000 ? value as { userId: string; at: number; intent: string } : null;
  } catch { return null; }
}
export async function googleEnabled() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLIC_KEY }, cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось проверить доступность Google.");
  const data = await response.json();
  return data.external?.google === true;
}
export async function startGoogle(intent: "google" | "link" | "reauthenticate", userId?: string) {
  if (!await googleEnabled()) throw new Error("Вход через Google ещё настраивается. Используйте почту и пароль.");
  if (userId) sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ userId, intent, at: Date.now() }));
  else sessionStorage.removeItem(OAUTH_KEY);
  const options = { redirectTo: authCallbackUrl(location.origin, location.pathname, intent), queryParams: { prompt: "select_account", ...(intent === "reauthenticate" ? { max_age: "0" } : {}) } };
  const result = intent === "link"
    ? await supabase.auth.linkIdentity({ provider: "google", options })
    : await supabase.auth.signInWithOAuth({ provider: "google", options });
  if (result.error) { sessionStorage.removeItem(OAUTH_KEY); throw result.error; }
}
