export type PlayerProfile = { name: string; email: string; photo: string };

export const PLAYER_PROFILE_KEY = "kyng-player-profile-v1";
export const PLAYER_PROFILE_EVENT = "kyng-player-profile-change";
export const EMPTY_PLAYER_PROFILE: PlayerProfile = { name: "", email: "", photo: "" };

export function parsePlayerProfile(raw: string | null): PlayerProfile | null {
  if (!raw || raw.length > 800_000) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const value = data as Record<string, unknown>;
    const photo = typeof value.photo === "string" && value.photo.length <= 700_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value.photo) ? value.photo : "";
    return {
      name: typeof value.name === "string" ? value.name.trim().slice(0, 80) : "",
      email: typeof value.email === "string" ? value.email.trim().slice(0, 254) : "",
      photo,
    };
  } catch { return null; }
}

export function readPlayerProfile(): PlayerProfile | null {
  try { return parsePlayerProfile(window.localStorage.getItem(PLAYER_PROFILE_KEY)); }
  catch { return null; }
}

export function savePlayerProfile(profile: PlayerProfile): boolean {
  const safe = parsePlayerProfile(JSON.stringify(profile));
  if (!safe) return false;
  try {
    window.localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(safe));
    window.dispatchEvent(new Event(PLAYER_PROFILE_EVENT));
    return true;
  } catch { return false; }
}

export function registrationIdentity(profile: PlayerProfile) {
  const [firstName = "", ...lastName] = profile.name.trim().split(/\s+/);
  return { firstName, lastName: lastName.join(" "), email: profile.email };
}
