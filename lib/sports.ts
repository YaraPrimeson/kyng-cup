import visibility from "./sports-config.json";

// Visibility is a presentation setting, not a change to supported sports or data.
export const supportedSports = ["tennis", "padel"] as const;
export type Sport = typeof supportedSports[number];
export function isSportVisible(sport: string | null | undefined): sport is Sport {
  return supportedSports.some(value => value === sport && visibility[value]);
}
export const visibleSports = supportedSports.filter(isSportVisible);
export function visibleSportItems<T extends { sport: string }>(items: readonly T[]): T[] {
  return items.filter(item => isSportVisible(item.sport));
}
export function sportCopy<T>(bothSports: T, padelOnly: T): T {
  return isSportVisible("tennis") ? bothSports : padelOnly;
}
