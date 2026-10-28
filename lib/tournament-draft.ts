import { balancePairs, blankPairs } from "./tournament-setup";
import type { TournamentSetup } from "./tournament-setup";

export type TournamentDraft = TournamentSetup & { slugEdited: boolean; list: string };
const key = (userId: string) => `kyng-tournament-draft:v1:${userId}`;

export function newTournamentDraft(): TournamentDraft {
  return {
    name: "", slug: "", slugEdited: false, fallbackSlug: `kyng-cup-${Date.now().toString(36)}`,
    location: "Vienna, Austria", date: "", endDate: "", sport: "padel", status: "draft",
    format: "group_knockout", groups: 4, pairs: balancePairs(blankPairs(16), 4),
    qualifiers: { A: 2, B: 2, C: 2, D: 2 }, list: "",
  };
}

export function readTournamentDraft(userId: string): TournamentDraft | null {
  try {
    const raw = window.sessionStorage.getItem(key(userId));
    if (!raw) return null;
    const { version, draft } = JSON.parse(raw);
    if (version !== 1 || !draft || typeof draft !== "object") return null;
    if (!["name", "slug", "fallbackSlug", "location", "date", "endDate", "list"].every(field => typeof draft[field] === "string")
      || typeof draft.slugEdited !== "boolean"
      || !["tennis", "padel"].includes(draft.sport) || !["draft", "published"].includes(draft.status)
      || !["knockout", "group_knockout"].includes(draft.format)
      || !Number.isInteger(draft.groups) || draft.groups < 1 || draft.groups > 26
      || !Array.isArray(draft.pairs) || draft.pairs.length < 2 || draft.pairs.length > 64
      || !draft.pairs.every((pair: Record<string, unknown> | null) => pair && ["name", "player_one", "player_two", "group"].every(field => typeof pair[field] === "string"))
      || !draft.qualifiers || typeof draft.qualifiers !== "object" || Array.isArray(draft.qualifiers)
      || !Object.values(draft.qualifiers).every(count => Number.isInteger(count) && Number(count) >= 0 && Number(count) <= 64)) return null;
    return draft as TournamentDraft;
  } catch { return null; }
}

export function saveTournamentDraft(userId: string, draft: TournamentDraft) {
  try { window.sessionStorage.setItem(key(userId), JSON.stringify({ version: 1, draft })); }
  catch { /* Storage may be disabled or full; editing must still work. */ }
}

export function clearTournamentDraft(userId: string) {
  try { window.sessionStorage.removeItem(key(userId)); }
  catch { /* Storage access must never turn a successful creation into an error. */ }
}
