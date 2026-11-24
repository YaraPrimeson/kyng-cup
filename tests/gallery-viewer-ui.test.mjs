import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";

test("photo viewer crosses page boundaries, supports touch, downloads, and restores focus", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test/gallery/?tournament=vienna" });
  const { window } = dom;
  const { document } = window;
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

  const ids = Array.from({ length: 38 }, (_, index) => String(index + 1).padStart(8, "0"));
  const pages = [];
  const urlRequests = [];
  let downloaded;
  window.HTMLAnchorElement.prototype.click = function () {
    downloaded = { href: this.href, name: this.download };
  };
  globalThis.fetch = async url => {
    assert.equal(url, "https://photos.example.test/web/00000037");
    return new Response(new Blob(["photo"], { type: "image/webp" }));
  };

  const { createRoot } = await import("react-dom/client");
  globalThis.galleryFixture = {
    async getAlbum() { return { id: "album", slug: "vienna", name: "Vienna", sport: "padel" }; },
    async getAlbumPhotos(id, offset) {
      assert.equal(id, "album");
      pages.push(offset);
      return { ids: ids.slice(offset, offset + 36), count: ids.length };
    },
    async getPublicPhotoUrls(photoIds, variant) {
      urlRequests.push([variant, ...photoIds]);
      return Object.fromEntries(photoIds.map(id => [id, `https://photos.example.test/${variant}/${id}`]));
    },
  };
  const mocks = {
    "next/navigation": 'export const usePathname = () => "/gallery/";',
    "@/lib/sports": 'export const visibleSports = ["padel"];',
    "../public-tournaments": 'export const formatTournamentDate = () => "20 November 2026";',
    "../i18n": 'export const useLanguage = () => ({ language: "en" });',
    "./public-gallery": `export const { getAlbum, getAlbumPhotos, getPublicPhotoUrls } = globalThis.galleryFixture;
      export const archivePageSize = 10, photoPageSize = 36;
      export const galleryAlbumHref = () => "/gallery/";
      export const getArchive = () => { throw new Error("Unexpected archive request"); };
      export const getArchivePhotoCounts = () => {};`,
  };
  const result = await build({
    entryPoints: ["app/gallery/page.tsx"],
    absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
    platform: "node", format: "cjs", jsx: "automatic", bundle: true, write: false,
    loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime"],
    plugins: [{
      name: "gallery-fixture",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args =>
          Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "gallery-fixture" } : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "gallery-fixture" }, args => ({ contents: mocks[args.path] }));
      },
    }],
  });
  const compiled = { exports: {} };
  new Function("require", "module", result.outputFiles[0].text)(createRequire(import.meta.url), compiled);
  const root = createRoot(document.getElementById("root"));
  const selector = name => document.querySelector(`[aria-label="${name}"]`);
  const current = () => document.querySelector(".gallery-viewer-counter")?.textContent;
  const click = button => act(async () => button.click());

  try {
    await act(async () => root.render(createElement(compiled.exports.default)));
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    assert.deepEqual(pages, [0]);
    assert.equal(urlRequests.some(([variant]) => variant === "web"), false);
    const opener = selector("Vienna · Photos 36");
    await click(opener);
    assert.equal(current(), "36 / 38");
    assert.equal(document.activeElement, selector("Close photo"));
    assert.equal(document.body.style.overflow, "hidden");

    await click(selector("Next photo"));
    assert.deepEqual(pages, [0, 36]);
    assert.equal(current(), "37 / 38");
    assert.match(document.querySelector(".gallery-viewer-image").src, /\/web\/00000037$/);

    const downloadButton = Array.from(document.querySelectorAll("dialog button"))
      .find(button => button.textContent === "Download photo");
    await click(downloadButton);
    for (let i = 0; !downloaded && i < 20; i += 1) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
    }
    assert.ok(downloaded, document.querySelector(".gallery-viewer-feedback")?.textContent);
    assert.match(downloaded.href, /^blob:/);
    assert.equal(downloaded.name, "kyng-cup-vienna-00000037.webp");
    assert.equal(urlRequests.filter(([variant, id]) => variant === "web" && id === "00000037").length, 2);

    const dialog = document.querySelector("dialog");
    const stage = document.querySelector(".gallery-viewer-stage");
    function touchEvent(name, x, y) {
      return Object.assign(new window.Event(name, { bubbles: true }), {
        pointerType: "touch", pointerId: 1, isPrimary: true, clientX: x, clientY: y,
      });
    }
    await act(async () => {
      stage.dispatchEvent(touchEvent("pointerdown", 140, 50));
      stage.dispatchEvent(touchEvent("pointerup", 40, 53));
    });
    assert.equal(current(), "38 / 38");
    assert.equal(selector("Next photo").disabled, true);
    await act(async () => dialog.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    assert.equal(current(), "37 / 38");
    await act(async () => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })));
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(document.activeElement, opener);
    assert.equal(document.body.style.overflow, "");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
