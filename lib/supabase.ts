import { createClient } from "@supabase/supabase-js";

// Publishable browser credentials. Database writes are protected by Supabase RLS.
export const SUPABASE_URL = "https://omkytvxgjhdjfglnarfe.supabase.co";
export const SUPABASE_PUBLIC_KEY = "sb_publishable_UWUPO6sWX6KD3BtwMetz2A_0LKuI4b7";
// Capture only the recovery-link shape before Auth consumes and clears its
// fragment during client initialization. Never retain or expose the tokens.
const recoveryRedirect = (() => {
  if (typeof window === "undefined" || !/\/auth\/callback\/?$/.test(window.location.pathname)) return false;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  return fragment.get("type") === "recovery" && ["access_token", "refresh_token", "expires_in", "token_type"].every(key => Boolean(fragment.get(key)));
})();
export function hasRecoveryRedirect() { return recoveryRedirect; }
// Client-only static site: keep the supported implicit flow so email links can
// open on another device. The callback clears credentials before navigation.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
