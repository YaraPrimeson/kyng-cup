function escapeCalendarText(text: string) {
  return text.replaceAll("\\", "\\\\").replace(/\r?\n|\r/g, "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function calendarTimestamp(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  let folded = "", bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { folded += "\r\n "; bytes = 1; }
    folded += character;
    bytes += size;
  }
  return folded;
}

export function calendarEvent({ id, startsAt, summary, location, link }: {
  id: string; startsAt: string; summary: string; location: string; link: string;
}) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KYNG CUP//Tournament Matches//EN",
    "BEGIN:VEVENT", `UID:${id}@kyngcup.com`, `DTSTAMP:${calendarTimestamp(new Date().toISOString())}`,
    `DTSTART:${calendarTimestamp(startsAt)}`, `SUMMARY:${escapeCalendarText(summary)}`,
    `LOCATION:${escapeCalendarText(location)}`, `URL:${link}`, "END:VEVENT", "END:VCALENDAR",
  ].map(foldCalendarLine).join("\r\n") + "\r\n";
}
