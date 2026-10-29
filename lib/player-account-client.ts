import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { AVATAR_BUCKET, PROFILE_COLUMNS, ownsAvatar, profileName, type AccountProfile } from "./player-account";

export async function getPlayerProfile(userId: string): Promise<AccountProfile | null> {
  const result = await supabase.from("player_profiles").select(PROFILE_COLUMNS).eq("auth_user_id", userId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export function suggestedPlayerName(user: User): string | null {
  const identity = user.identities?.find(value => value.provider === "google");
  for (const candidate of [identity?.identity_data?.full_name, identity?.identity_data?.name, user.user_metadata?.display_name]) {
    if (typeof candidate !== "string") continue;
    try { return profileName(candidate); }
    catch { /* Try the next name source. */ }
  }
  return null;
}

export function initialPlayerName(user: User) {
  return suggestedPlayerName(user) ?? "Игрок KYNG";
}

export async function createPlayerProfile(user: User, name: string): Promise<AccountProfile> {
  if (!user.email_confirmed_at || user.is_anonymous) throw new Error("Сначала подтвердите почту.");
  const result = await supabase.from("player_profiles").insert({ auth_user_id: user.id, display_name: profileName(name) }).select(PROFILE_COLUMNS).single();
  if (result.error?.code === "23505") {
    const existing = await getPlayerProfile(user.id);
    if (existing) return existing;
  }
  if (result.error) throw result.error;
  return result.data;
}

export async function avatarUrl(userId: string, path: string | null) {
  if (!path || !ownsAvatar(userId, path)) return "";
  const result = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}

export async function saveAccountProfile(profile: AccountProfile, name: string, photo: Blob | null | undefined) {
  const displayName = profileName(name);
  let path = profile.avatar_path;
  let uploaded: string | null = null;
  if (photo instanceof Blob) {
    if (photo.type !== "image/jpeg" || photo.size > 1_048_576) throw new Error("Не удалось подготовить фото. Выберите другое изображение.");
    uploaded = `${profile.auth_user_id}/${crypto.randomUUID()}.jpg`;
    const result = await supabase.storage.from(AVATAR_BUCKET).upload(uploaded, photo, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
    if (result.error) throw result.error;
    path = uploaded;
  } else if (photo === null) path = null;

  const result = await supabase.from("player_profiles").update({ display_name: displayName, avatar_path: path })
    .eq("auth_user_id", profile.auth_user_id).eq("version", profile.version).select(PROFILE_COLUMNS).maybeSingle();
  if (result.error || !result.data) {
    // A lost response can follow a successful commit. Never delete that upload
    // on an ambiguous network failure; it may already be the active avatar.
    if (uploaded && (!result.error || /^[0-9A-Z]{5}$/.test(result.error.code))) await supabase.storage.from(AVATAR_BUCKET).remove([uploaded]);
    if (result.error) throw result.error;
    throw new Error("Профиль изменён на другом устройстве. Загрузите актуальные данные перед сохранением.");
  }
  let cleanupFailed = false;
  if (profile.avatar_path && profile.avatar_path !== path) {
    const cleanup = await supabase.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
    cleanupFailed = Boolean(cleanup.error);
  }
  return { profile: result.data as AccountProfile, cleanupFailed };
}

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Выберите JPG, PNG или WebP до 5 МБ.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Не удалось открыть изображение.")); image.src = url; });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("Изображение слишком большое.");
    const canvas = document.createElement("canvas"), size = 720;
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось обработать фото.");
    context.fillStyle = "#f4f1eb"; context.fillRect(0, 0, size, size);
    context.drawImage(image, (size - image.naturalWidth * scale) / 2, (size - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Не удалось обработать фото.")), "image/jpeg", .82));
  } finally { URL.revokeObjectURL(url); }
}
