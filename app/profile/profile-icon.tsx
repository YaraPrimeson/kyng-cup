type IconName = "home" | "user" | "calendar" | "back" | "next" | "settings" | "pin" | "people" | "check" | "lock" | "share" | "plus";
const paths: Record<IconName, string[]> = {
  home: ["m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"],
  user: ["M20 21v-2a7 7 0 0 0-14 0v2", "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  calendar: ["M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z", "M7 2v4M17 2v4M3 10h18M8 14h2M14 14h2"],
  back: ["m15 18-6-6 6-6"], next: ["m9 18 6-6-6-6"],
  settings: ["m10 3-1 3-3 1-3 3 2 3 1 4 4 1 2 3 3-2 4-1 1-4 2-3-3-3-3-1-1-3Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  pin: ["M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z", "M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  people: ["M16 21v-2a5 5 0 0 0-10 0v2M22 21v-2a4 4 0 0 0-3-4", "M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM18 3a4 4 0 0 1 0 8"],
  check: ["m5 12 4 4L19 6"], lock: ["M5 10h14v11H5ZM8 10V6a4 4 0 0 1 8 0v4"],
  share: ["M12 16V3m-5 5 5-5 5 5M5 13v8h14v-8"], plus: ["M12 5v14M5 12h14"],
};
export default function ProfileIcon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name].map((d, index) => <path d={d} key={index} />)}</svg>;
}
