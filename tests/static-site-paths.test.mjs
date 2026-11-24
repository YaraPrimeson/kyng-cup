import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";

// Exercise the shipped helper after bundling AND the existing publish-hostinger
// substitutions: source-only tests miss a startsWith("/kyng-cup/") becoming "/".
async function deployedPaths(hostinger) {
  const { outputFiles } = await build({
    entryPoints: [new URL("../lib/player-account.ts", import.meta.url).pathname],
    bundle: true, write: false, format: "esm", minify: true,
  });
  let code = outputFiles[0].text;
  if (hostinger) code = code
    .replaceAll("https://yaraprimeson.github.io/kyng-cup", "https://kyngcup.com")
    .replaceAll("/kyng-cup/", "/");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

test("Hostinger adaptation keeps root profile navigation and signed-in URL at root", async () => {
  const { siteBasePath, authCallbackUrl } = await deployedPaths(true);
  for (const pathname of ["/", "/tennis/", "/padel/", "/profile/"]) {
    assert.equal(`${siteBasePath(pathname)}/profile/`, "/profile/", pathname);
  }
  // Use the actual signed-profile replaceState expression without authenticating
  // or creating an account. This runs once the account component mounts.
  const profile = await readFile(new URL("../app/profile/page.tsx", import.meta.url), "utf8");
  const expression = profile.match(/history\.replaceState\([^;]+\);/)?.[0];
  assert.ok(expression, "profile still normalizes its URL");
  const calls = [];
  Function("history", "basePath", expression)({ replaceState: (...args) => calls.push(args) }, siteBasePath("/profile/"));
  assert.equal(calls[0][2], "/profile/");
  assert.equal(authCallbackUrl("https://kyngcup.com", "/profile/", "google"), "https://kyngcup.com/auth/callback/?intent=google");
});

test("GitHub Pages retains the repository prefix and its path boundary", async () => {
  const { siteBasePath, authCallbackUrl } = await deployedPaths(false);
  for (const pathname of ["/kyng-cup", "/kyng-cup/", "/kyng-cup/tennis/", "/kyng-cup/padel/", "/kyng-cup/profile/"]) {
    assert.equal(`${siteBasePath(pathname)}/profile/`, "/kyng-cup/profile/", pathname);
  }
  assert.equal(siteBasePath("/kyng-cupboard/profile/"), "");
  assert.equal(authCallbackUrl("https://yaraprimeson.github.io", "/kyng-cup/profile/", "google"), "https://yaraprimeson.github.io/kyng-cup/auth/callback/?intent=google");
});

test("gallery and bracket links use the correct prefix after the Hostinger rewrite", async () => {
  const { siteBasePath } = await deployedPaths(true);
  for (const page of ["gallery", "bracket"]) {
    const source = await readFile(new URL(`../app/${page}/page.tsx`, import.meta.url), "utf8");
    const declaration = source.match(/^ {2}const basePath = .+;$/m)?.[0];
    assert.ok(declaration, `${page} uses the deployed site base path`);
    const getBasePath = Function("pathname", "siteBasePath", `${declaration.replaceAll("/kyng-cup/", "/")} return basePath;`);
    assert.equal(`${getBasePath(`/${page}/`, siteBasePath)}/gallery/?tournament=vienna`,
      "/gallery/?tournament=vienna");
    const pagesBasePath = Function("pathname", "siteBasePath", `${declaration} return basePath;`);
    assert.equal(`${pagesBasePath(`/kyng-cup/${page}/`, siteBasePath)}/gallery/?tournament=vienna`,
      "/kyng-cup/gallery/?tournament=vienna");
  }
});
