import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const port = 4173;
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] || "kyng-cup";
const owner = process.env.GITHUB_REPOSITORY_OWNER || "YaraPrimeson";
const basePath = process.env.PAGES_BASE_PATH || `/${repository}`;
const pagesOrigin = `https://${owner.toLowerCase()}.github.io`;
const outputDir = join(process.cwd(), "_site");

const server = spawn(join(process.cwd(), "node_modules", ".bin", "vinext"), ["start"], {
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

  const cssDirectory = join(outputDir, "_next", "static", "css");
  const cssFiles = (await readdir(cssDirectory)).filter((file) => file.endsWith(".css"));
  for (const cssFile of cssFiles) {
    const cssPath = join(cssDirectory, cssFile);
    const css = await readFile(cssPath, "utf8");
    await writeFile(cssPath, css.replaceAll("url(/", `url(${basePath}/`));
  }

  for (const route of ["/", "/bracket/", "/admin/", "/offline/", "/cookies/"]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    if (!response.ok) throw new Error(`Failed to export ${route}: ${response.status}`);

    let html = await response.text();
    if (route === "/") {
      html = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi, "")
        .replace(/\sdata-rsc-[a-z-]+=["'][^"']*["']/gi, "");
    }

    html = html
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
