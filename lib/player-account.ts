export type AccountProfile = {
  player_id: string;
  auth_user_id: string;
  display_name: string;
  avatar_path: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export const AVATAR_BUCKET = "player-avatars";
export const PROFILE_COLUMNS = "player_id,auth_user_id,display_name,avatar_path,version,created_at,updated_at";

export function profileName(value: string) {
  const name = value.trim();
  if (!name || [...name].length > 80 || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error("Укажите имя от 1 до 80 символов.");
  return name;
}

export function accountEmail(value: string) {
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Проверьте адрес почты.");
  return email;
}

export function accountPassword(value: string) {
  if (value.length < 12 || value.length > 128) throw new Error("Пароль должен содержать от 12 до 128 символов.");
  return value;
}

export function siteBasePath(pathname: string) {
  // Compare the segment: Hostinger also replaces /kyng-cup/ inside built JS.
  return pathname.split("/")[1] === "kyng-cup" ? "/kyng-cup" : "";
}

export function authCallbackUrl(origin: string, pathname: string, intent: "signup" | "recovery" | "google" | "link" | "reauthenticate" | "email") {
  const source = new URL(origin);
  // Return only to our production deployments or local development.
  if (!["https://kyngcup.com", "https://www.kyngcup.com", "https://yaraprimeson.github.io"].includes(source.origin)
    && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(source.origin)) throw new Error("Откройте кабинет на kyngcup.com.");
  return `${source.origin}${siteBasePath(pathname)}/auth/callback/?intent=${intent}`;
}

export function accountError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["over_request_rate_limit", "over_email_send_rate_limit"].includes(code)) return "Слишком много запросов. Подождите несколько минут и повторите.";
  if (code === "email_not_confirmed") return "Подтвердите почту. Можно запросить письмо ещё раз.";
  if (code === "invalid_credentials") return "Почта или пароль указаны неверно.";
  if (["identity_already_exists", "email_exists", "user_already_exists"].includes(code)) return "Этот способ входа уже используется. Войдите в существующий аккаунт; автоматически объединять аккаунты нельзя.";
  if (code === "weak_password") return "Выберите более надёжный пароль: от 12 символов.";
  if (["otp_expired", "flow_state_expired", "flow_state_not_found"].includes(code)) return "Ссылка истекла или уже использована. Запросите новую.";
  if (code === "reauthentication_needed" || code === "reauthentication_not_valid") return "Подтвердите вход ещё раз и повторите действие.";
  if (error instanceof Error && !code && !/fetch|network|http|json|database/i.test(error.message)) return error.message;
  return "Не удалось выполнить действие. Проверьте соединение и повторите попытку.";
}

export function ownsAvatar(userId: string, path: string) {
  return /^[0-9a-f-]{36}$/.test(userId) && new RegExp(`^${userId}/[0-9a-f-]{36}\\.jpg$`).test(path);
}
