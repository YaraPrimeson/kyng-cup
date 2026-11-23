import { createClient } from "@supabase/supabase-js";

import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "./supabase-public-config";
export { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "./supabase-public-config";

// Capture only the redirect shape before Auth consumes and clears its fragment.
// Do not retain credentials. These flags are UI checks, not authorization.
const redirectShape = (() => {
  if (typeof window === "undefined" || !/\/auth\/callback\/?$/.test(window.location.pathname)) return { recovery: false, oauth: false };
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const hasSession = ["access_token", "refresh_token", "expires_in", "token_type"].every(key => Boolean(fragment.get(key)));
  return { recovery: hasSession && fragment.get("type") === "recovery", oauth: hasSession && !fragment.get("type") };
})();
export function hasRecoveryRedirect() { return redirectShape.recovery; }
export function hasOAuthRedirect() { return redirectShape.oauth; }
// Client-only static site: keep the supported implicit flow so email links can
// open on another device. The callback clears credentials before navigation.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
