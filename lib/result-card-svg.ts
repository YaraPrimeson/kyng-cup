export type CardFormat = "story" | "post" | "square";
export const cardHeights: Record<CardFormat, number> = { story: 1920, post: 1350, square: 1080 };
export type CardContent = {
  player: string; tournament: string; sport: string; date: string; result: string;
  consolation: string | null; partner: string; wins: number; losses: number; matches: number;
  labels: { partner: string; matches: string; wins: string; losses: string; verified: string };
  photoDataUrl?: string;
};

function clean(value: string) { return Array.from(value).filter(char => char.charCodeAt(0) >= 32 || "\t\n\r".includes(char)).join("").replace(/\s+/g, " ").trim(); }
function xml(value: string) {
  return clean(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}
// Conservative widths keep long names inside the card without browser-only measurement.
function width(text: string, size: number) {
  return Array.from(text).reduce((sum, char) => sum + (/\s/.test(char) ? .33 : /[ilI.,:!|'’]/.test(char) ? .3 : /[MW@ЖШЩЮ]/.test(char) ? .96 : .66), 0) * size;
}
function lines(text: string, size: number, maxWidth: number, limit: number) {
  const result = [""];
  for (const word of clean(text).split(" ")) {
    const current = result[result.length - 1];
    if (current && width(`${current} ${word}`, size) > maxWidth) result.push(word);
    else result[result.length - 1] = current ? `${current} ${word}` : word;
  }
  return result.length <= limit && result.every(line => width(line, size) <= maxWidth) ? result : null;
}
function textBlock(text: string, x: number, y: number, size: number, maxWidth: number, limit = 1, fill = "#f6f2e6", family = "Arial, sans-serif") {
  let fitted = lines(text, size, maxWidth, limit);
  while (!fitted && size > 24) { size -= 2; fitted = lines(text, size, maxWidth, limit); }
  if (!fitted) {
    const chars = Array.from(clean(text));
    while (chars.length && width(`${chars.join("")}…`, size) > maxWidth) chars.pop();
    fitted = [`${chars.join("")}…`];
  }
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}">${fitted.map((line, index) => `<tspan x="${x}" dy="${index ? size * 1.15 : 0}">${xml(line)}</tspan>`).join("")}</text>`;
}

export function renderResultCard(content: CardContent, format: CardFormat): string {
  const h = cardHeights[format], pad = 82, w = 916, footer = h - 365;
  const photo = content.photoDataUrl && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(content.photoDataUrl) ? content.photoDataUrl : null;
  const heroTop = 350, heroHeight = footer - heroTop - 30;
  const imageHeight = photo ? Math.max(90, Math.min(Math.floor(heroHeight * .52), heroHeight - (content.consolation ? 225 : 150))) : 0;
  const resultTop = heroTop + (photo ? imageHeight + 36 : 0);
  const resultHeight = footer - resultTop - (content.consolation ? 105 : 40);
  const resultSize = Math.min(148, Math.max(40, Math.floor(resultHeight / 2.6)));
  const resultY = resultTop + resultSize + Math.max(0, (resultHeight - resultSize * 2.3) / 2);
  const stats = [[content.matches, content.labels.matches], [content.wins, content.labels.wins], [content.losses, content.labels.losses]];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}">
<rect width="1080" height="${h}" fill="#214c36"/>
<g fill="none" stroke="#f6f2e6" stroke-opacity=".1" stroke-width="2" transform="rotate(-22 1030 200)"><rect x="810" y="-80" width="480" height="1120"/><path d="M810 480h480M1050-80v1120"/></g>
${textBlock("KYNG CUP", pad, 108, 38, w, 1, "#f6f2e6", "Georgia, serif")}
${textBlock(`${content.sport} · ${content.date}`, pad, 158, 24, w, 1, "#dba27d")}
${textBlock(content.tournament, pad, 240, 44, w, 2)}
${photo ? `<image href="${photo}" x="${pad}" y="${heroTop}" width="${w}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice"/>` : ""}
${textBlock(content.result, pad, resultY, resultSize, w, 2, "#f6f2e6", "Georgia, serif")}
${content.consolation ? textBlock(content.consolation, pad, footer - 64, 28, w, 2, "#dba27d") : ""}
<path d="M${pad} ${footer}h${w}" stroke="#f6f2e6" stroke-opacity=".35"/>
${textBlock(content.player, pad, footer + 59, 43, w, 2)}
${textBlock(`${content.labels.partner}: ${content.partner}`, pad, footer + 153, 27, w)}
${stats.map(([value, label], index) => textBlock(String(value), pad + index * 310, footer + 229, 50, 280) + textBlock(String(label), pad + index * 310, footer + 267, 23, 280)).join("")}
${textBlock(content.labels.verified, pad, h - 39, 20, 640, 1, "#dba27d")}
<text x="998" y="${h - 39}" text-anchor="end" fill="#f6f2e6" font-family="Arial, sans-serif" font-size="20">KYNGCUP.COM</text>
</svg>`;
}
