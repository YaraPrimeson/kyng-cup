import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const fixture = `
const { promise, resolve } = Promise.withResolvers();
window.finishGalleryLoad = resolve;
const album = {id: "album", slug: "vienna", name: "KYNG CUP Padel", sport: "padel", location: "Court One", starts_at: "2026-11-20", cover_photo_id: "cover", has_public_bracket: true};
export const archivePageSize = 10;
export const galleryAlbumHref = () => "/gallery/?tournament=vienna";
export const getArchive = async () => { await promise; return {albums: [album, {...album, id:"older"}], more: false}; };
export const getArchivePhotoCounts = async () => ({album: 8, older: 8});
export const getAlbum = async () => album;
export const getAlbumPhotos = async () => { await promise; return {ids: ["one", "two", "three", "four", "five", "six", "seven", "eight"], count: 8}; };
export const getPublicPhotoUrls = async ids => Object.fromEntries(ids.map(id => [id, "http://gallery.test/image/" + id]));
`;
const modules = {
  "next/navigation": 'export const usePathname = () => "/gallery/";',
  "@/lib/player-account": 'export const siteBasePath = () => "";',
  "@/lib/sports": 'export const visibleSports = ["padel"];',
  "../public-tournaments": 'export const formatTournamentDate = () => "20 November 2026";',
  "../i18n": 'export const useLanguage = () => ({language:"en"});',
  "./public-gallery": fixture,
};
const bundle = await build({
  stdin: { contents: `import { createRoot } from "react-dom/client";
    import Gallery from "./app/gallery/page";
    createRoot(document.getElementById("app")).render(<Gallery />);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, jsx: "automatic", write: false, loader: {".css":"empty"}, define: {"process.env.NODE_ENV": '"production"'},
  plugins: [{name:"fixture", setup(b) {
    b.onResolve({filter: /.*/}, a => Object.hasOwn(modules, a.path) ? {path: a.path, namespace: "fixture"} : undefined);
    b.onLoad({filter: /.*/, namespace: "fixture"}, a => ({contents: modules[a.path]}));
  }}],
});
const browser = await chromium.launch({executablePath: execFileSync("which", ["google-chrome"], {encoding:"utf8"}).trim()});
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({viewport: {width, height:800}, reducedMotion: width === 390 ? "reduce" : "no-preference"});
    await page.route("http://gallery.test/**", async route => {
      if (!route.request().url().includes("/image/")) {
        return route.fulfill({contentType:"text/html", body:'<!doctype html><div id="app"></div>'});
      }
      await new Promise(resolve => setTimeout(resolve, 800));
      return route.fulfill({contentType:"image/svg+xml", body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="green"/></svg>'});
    });
    for (const album of [false, true]) {
      await page.goto("http://gallery.test/gallery/" + (album ? "?tournament=vienna" : ""));
      await page.addStyleTag({content:":root {--line:#ddd;--paper:#fff;--forest-dark:#294736} * {box-sizing:border-box} body{margin:0}"});
      await page.addStyleTag({path:"app/gallery/gallery.css"});
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      if (album) await page.getByRole("heading", {name:"KYNG CUP Padel"}).waitFor();
      const shape = page.locator(album ? ".gallery-photo-placeholder" : ".gallery-feature-image").first();
      await shape.waitFor();
      const before = await shape.boundingBox();
      const animationName = await shape.locator(".gallery-skeleton").evaluate(el=>getComputedStyle(el,"::after").animationName);
      if (width === 390) assert.equal(animationName, "none");
      else assert.notEqual(animationName, "none");
      await page.evaluate(()=>window.finishGalleryLoad());
      const card = page.locator(album ? "button.gallery-photo" : "a.gallery-feature .gallery-feature-image").first();
      await card.locator("img[data-loading=true]").waitFor({state:"attached"});
      assert.deepEqual(await card.boundingBox(), before);
      await card.locator("img[data-loading=false]").waitFor();
      assert.deepEqual(await card.boundingBox(), before);
      assert.equal(await card.locator(".gallery-skeleton").count(), 0);
      console.log(width + "px " + (album ? "album" : "gallery") + ": placeholder and photo occupied the same box");
    }
    await page.close();
  }
} finally {
  await browser.close();
}
