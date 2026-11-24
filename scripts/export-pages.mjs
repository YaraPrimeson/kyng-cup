import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sportsVisibility from "../lib/sports-config.json" with { type: "json" };
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "../lib/supabase-public-config.ts";

const port = 4173;
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] || "kyng-cup";
const owner = process.env.GITHUB_REPOSITORY_OWNER || "YaraPrimeson";
const basePath = process.env.PAGES_BASE_PATH ?? `/${repository}`;
const pagesOrigin = `https://${owner.toLowerCase()}.github.io`;
const outputDir = join(process.cwd(), "_site");

const server = spawn(process.execPath, [join(process.cwd(), "node_modules", "vinext", "dist", "cli.js"), "start"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return response;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Production server did not start.\n${serverLog}`);
}

try {
  await waitForServer();

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(join(process.cwd(), "dist", "client"), outputDir, { recursive: true });

  // Keep the source sitemap complete; publish only currently visible sports.
  const sitemapPath = join(outputDir, "sitemap.xml");
  let sitemap = await readFile(sitemapPath, "utf8");
  for (const [sport, visible] of Object.entries(sportsVisibility)) {
    if (!visible) sitemap = sitemap.replace(new RegExp(`\\s*<url><loc>[^<]*/${sport}/</loc>.*?</url>`, "g"), "");
  }
  await writeFile(sitemapPath, sitemap);

  const cssDirectory = join(outputDir, "_next", "static", "css");
  const cssFiles = (await readdir(cssDirectory)).filter((file) => file.endsWith(".css"));
  for (const cssFile of cssFiles) {
    const cssPath = join(cssDirectory, cssFile);
    const css = await readFile(cssPath, "utf8");
    await writeFile(cssPath, css.replaceAll("url(/", `url(${basePath}/`));
  }

  for (const route of ["/", "/tennis/", "/padel/", "/bracket/", "/gallery/", "/telegram-demo/", "/profile/", "/auth/callback/", "/admin/", "/cookies/", "/rules/", "/register/", "/upcoming-tournaments/"]) {
    const sport = route.split("/")[1];
    if (Object.hasOwn(sportsVisibility, sport) && !sportsVisibility[sport]) {
      const routeDir = join(outputDir, route);
      await mkdir(routeDir, { recursive: true });
      // Relative navigation works on both GitHub Pages and the root domain.
      await writeFile(join(routeDir, "index.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><meta http-equiv="refresh" content="0;url=../padel/"><link rel="canonical" href="https://kyngcup.com/padel/"><title>KYNG CUP</title></head><body><a href="../padel/">KYNG CUP Padel</a></body></html>');
      continue;
    }
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    if (!response.ok) throw new Error(`Failed to export ${route}: ${response.status}`);

    const html = (await response.text())
      .replaceAll(`http://localhost:${port}`, `${pagesOrigin}${basePath}`)
      .replaceAll('href="/', `href="${basePath}/`)
      .replaceAll('src="/', `src="${basePath}/`)
      .replaceAll('"/_next/', `"${basePath}/_next/`)
      .replaceAll('"/assets/', `"${basePath}/assets/`)
      .replaceAll("url(/", `url(${basePath}/`);

    const routeDir = route === "/" ? outputDir : join(outputDir, route);
    await mkdir(routeDir, { recursive: true });
    await writeFile(join(routeDir, "index.html"), html);
  }
  const calendarDir = join(outputDir, "upcoming-tournaments");
  const calendarHtml = await readFile(join(calendarDir, "index.html"), "utf8");
  if (calendarHtml.split('<div data-calendar-initial=""><!--KYNG_CALENDAR_INITIAL--></div>').length !== 2) {
    throw new Error("The calendar export is missing its server-rendering slot.");
  }
  await cp(new URL("./hostinger-calendar/", import.meta.url), calendarDir, { recursive: true });
  await writeFile(join(calendarDir, "calendar-config.json"), JSON.stringify({
    supabaseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLIC_KEY,
    sports: Object.keys(sportsVisibility).filter((sport) => sportsVisibility[sport]),
  }));
  await writeFile(join(outputDir, ".nojekyll"), "");
  console.log(`Static GitHub Pages export created in ${outputDir}`);
} finally {
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await Promise.race([
    stopped,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}
