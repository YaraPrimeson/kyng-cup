import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";

test("large albums paginate, and the viewer crosses page boundaries, supports touch, downloads, and restores focus", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test/gallery/?tournament=vienna" });
  const { window } = dom;
  const { document } = window;
  const originalHTMLElement = globalThis.HTMLElement;
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

  const ids = Array.from({ length: 502 }, (_, index) => String(index + 1).padStart(8, "0"));
  let albumSize = ids.length;
  let finishInitialPage;
  const initialPage = new Promise(resolve => { finishInitialPage = resolve; });
  const pageBoundary = Promise.withResolvers();
  const pages = [];
  const urlRequests = [];
  const decoded = [];
  const boundaryDecode = Promise.withResolvers();
  window.HTMLImageElement.prototype.decode = async function () {
    decoded.push(this.src);
    if (this.src.endsWith("/web/00000021")) await boundaryDecode.promise;
  };
  let downloaded;
  window.HTMLAnchorElement.prototype.click = function () {
    downloaded = { href: this.href, name: this.download };
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, "https://photos.example.test/web/00000021");
    return new Response(new Blob(["photo"], { type: "image/webp" }));
  };

  const { createRoot } = await import("react-dom/client");
  globalThis.galleryFixture = {
    async getAlbum() { return { id: "album", slug: "vienna", name: "Vienna | November 20, 2026", starts_at: "2026-11-20", sport: "padel" }; },
    async getAlbumPhotos(id, offset, limit) {
      assert.equal(id, "album");
      pages.push([offset, limit]);
      if (pages.length === 1) await initialPage;
      if (pages.length === 2) await pageBoundary.promise;
      return { ids: ids.slice(offset, Math.min(offset + limit, albumSize)), count: albumSize };
    },
    async getPublicPhotoUrls(photoIds, variant) {
      urlRequests.push([variant, ...photoIds]);
      return Object.fromEntries(photoIds.map(id => [id, `https://photos.example.test/${variant}/${id}`]));
    },
  };
  const mocks = {
    "@mui/material/Skeleton": `import { createElement } from "react";
      export default function Skeleton({ className }) { return createElement("span", { className }); }`,
    "next/navigation": 'export const usePathname = () => "/gallery/";',
    "@/lib/sports": 'export const visibleSports = ["padel"];',
    "../public-tournaments": 'export const formatTournamentDate = () => "20 November 2026";',
    "../i18n": 'export const useLanguage = () => ({ language: "en" });',
    "./public-gallery": `export const { getAlbum, getAlbumPhotos, getPublicPhotoUrls } = globalThis.galleryFixture;
      export const archivePageSize = 10;
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
    assert.deepEqual(pages, [[0, 20]]);
    assert.equal(document.querySelectorAll(".gallery-photo-placeholder").length, 4);
    assert.equal(document.querySelector("[role=status]").className, "gallery-visually-hidden");
    await act(async () => finishInitialPage());
    assert.equal(document.querySelectorAll(".gallery-photo-placeholder").length, 0);
    assert.equal(document.querySelectorAll(".gallery-photo").length, 20);
    const firstTile = selector("Vienna · Photos 1");
    const thumbnail = firstTile.querySelector("img");
    assert.equal(thumbnail.dataset.loading, "true");
    assert.ok(firstTile.querySelector(".gallery-skeleton-fill"));
    await act(async () => thumbnail.dispatchEvent(new window.Event("load")));
    assert.equal(thumbnail.dataset.loading, "false");
    assert.equal(firstTile.querySelector(".gallery-skeleton-fill"), null);
    assert.deepEqual(urlRequests[0], ["thumb", ...ids.slice(0, 20)]);
    assert.equal(urlRequests.some(([variant]) => variant === "web"), false);
    assert.equal(document.querySelector("h1").textContent, "Vienna");
    const opener = selector("Vienna · Photos 20");
    await click(opener);
    assert.equal(current(), "20 / 502");
    const preview = document.querySelector(".gallery-viewer-preview");
    const image = document.querySelector(".gallery-viewer-image");
    assert.match(preview.src, /\/thumb\/00000020$/);
    assert.equal(image.dataset.loading, "true");
    await act(async () => image.dispatchEvent(new window.Event("load")));
    assert.equal(document.querySelector(".gallery-viewer-preview"), null);
    assert.equal(image.dataset.loading, "false");
    assert.equal(document.activeElement, selector("Close photo"));
    assert.equal(document.body.style.overflow, "hidden");

    assert.deepEqual(pages, [[0, 20], [20, 20]]);
    assert.ok(decoded.some(url => url.endsWith("/web/00000019")));
    await click(selector("Next photo"));
    assert.equal(document.querySelector("dialog [role=status]").className, "gallery-visually-hidden");
    await act(async () => pageBoundary.resolve());
    assert.equal(urlRequests.filter(([variant]) => variant === "thumb").length, 1);
    assert.equal(current(), "21 / 502");
    assert.equal(document.querySelector("dialog [role=status]").className, "gallery-visually-hidden");
    assert.equal(document.querySelector(".gallery-viewer-slides").dataset.direction, "1");
    assert.equal(document.querySelector(".gallery-viewer-slides").dataset.ready, "false");
    assert.match(document.querySelector(".gallery-viewer-outgoing").src, /\/web\/00000020$/);
    const nextImage = document.querySelector(".gallery-viewer-image");
    assert.match(nextImage.src, /\/web\/00000021$/);
    await act(async () => nextImage.dispatchEvent(new window.Event("load")));
    assert.equal(document.querySelector(".gallery-viewer-slides").dataset.ready, "true");
    await act(async () => boundaryDecode.resolve());

    const downloadButton = selector("Download photo");
    await click(downloadButton);
    for (let i = 0; !downloaded && i < 20; i += 1) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
    }
    assert.ok(downloaded, document.querySelector(".gallery-viewer-feedback")?.textContent);
    assert.match(downloaded.href, /^blob:/);
    assert.equal(downloaded.name, "kyng-cup-vienna-00000021.webp");
    assert.ok(decoded.some(url => url.endsWith("/web/00000022")));
    const requestsFor22 = () => urlRequests.filter(([variant, ...photoIds]) => variant === "web" && photoIds.includes("00000022")).length;
    const warmRequestsFor22 = requestsFor22();

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
    assert.equal(current(), "22 / 502");
    assert.equal(document.querySelector(".gallery-viewer-slides").dataset.ready, "true");
    assert.match(document.querySelector(".gallery-viewer-image").src, /\/web\/00000022$/);
    assert.equal(requestsFor22(), warmRequestsFor22);
    assert.equal(document.querySelector("dialog [role=status]"), null);
    await act(async () => dialog.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    assert.equal(current(), "21 / 502");
    await click(selector("Previous photo"));
    assert.equal(current(), "20 / 502");
    assert.deepEqual(pages, [[0, 20], [20, 20]]);
    await act(async () => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })));
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(document.activeElement, opener);
    assert.equal(document.body.style.overflow, "");

    const setSelect = (element, value) => act(async () => {
      element.value = String(value);
      element.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    const perPage = document.querySelector(".gallery-photo-controls > label select");
    const page = document.querySelector(".gallery-pagination select");
    assert.deepEqual(Array.from(perPage.options, option => option.value), ["20", "50", "100"]);
    assert.equal(page.options.length, 26);
    assert.equal(selector("Previous page").disabled, true);

    await click(selector("Next page"));
    assert.deepEqual(pages.at(-1), [20, 20]);
    assert.equal(document.querySelectorAll(".gallery-photo").length, 20);
    assert.equal(selector("Vienna · Photos 20"), null);
    assert.ok(selector("Vienna · Photos 21"));

    await setSelect(perPage, 50);
    assert.deepEqual(pages.at(-1), [0, 50]);
    assert.equal(page.value, "1");
    assert.equal(document.querySelectorAll(".gallery-photo").length, 50);

    await setSelect(perPage, 100);
    assert.deepEqual(pages.at(-1), [0, 100]);
    assert.equal(page.options.length, 6);
    assert.equal(document.querySelectorAll(".gallery-photo").length, 100);
    assert.deepEqual(urlRequests.at(-1), ["thumb", ...ids.slice(0, 100)]);

    await setSelect(page, 6);
    assert.deepEqual(pages.at(-1), [500, 100]);
    assert.equal(document.querySelectorAll(".gallery-photo").length, 2);
    assert.ok(selector("Vienna · Photos 501"));
    assert.equal(selector("Next page").disabled, true);

    const beforeViewer = pages.length;
    await click(selector("Vienna · Photos 501"));
    assert.deepEqual(pages.slice(beforeViewer), [[400, 100], [0, 100]]);
    await click(selector("Previous photo"));
    assert.equal(pages.length, beforeViewer + 2);
    assert.equal(document.querySelector(".gallery-viewer-slides").dataset.ready, "true");
    assert.equal(current(), "500 / 502");
    await click(selector("Next photo"));
    await click(selector("Next photo"));
    assert.equal(current(), "502 / 502");
    assert.equal(selector("Next photo").disabled, false);
    await act(async () => {
      const lastStage = document.querySelector(".gallery-viewer-stage");
      lastStage.dispatchEvent(touchEvent("pointerdown", 140, 50));
      lastStage.dispatchEvent(touchEvent("pointerup", 40, 50));
    });
    assert.equal(current(), "1 / 502");
    assert.equal(pages.length, beforeViewer + 2);
    assert.equal(document.querySelector(".gallery-viewer-slides").dataset.ready, "true");
    await act(async () => {
      const firstStage = document.querySelector(".gallery-viewer-stage");
      firstStage.dispatchEvent(touchEvent("pointerdown", 40, 50));
      firstStage.dispatchEvent(touchEvent("pointerup", 140, 50));
    });
    assert.equal(current(), "502 / 502");
    assert.equal(document.querySelector(".gallery-viewer-slides").dataset.direction, "-1");

    await click(selector("Close photo"));
    await act(async () => root.render(null));
    albumSize = 8;
    await act(async () => root.render(createElement(compiled.exports.default)));
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    assert.equal(document.querySelectorAll(".gallery-photo").length, 8);
    assert.equal(document.querySelector(".gallery-photo-controls"), null);
    assert.equal(document.querySelector(".gallery-pagination"), null);

    await act(async () => root.render(null));
    albumSize = 1;
    await act(async () => root.render(createElement(compiled.exports.default)));
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    await click(selector("Vienna · Photos 1"));
    assert.equal(current(), "1 / 1");
    assert.equal(selector("Previous photo").disabled, true);
    assert.equal(selector("Next photo").disabled, true);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.HTMLElement = originalHTMLElement;
    globalThis.fetch = originalFetch;
  }
});

test("album API requests the selected range and signs 100 thumbnails in two batches", async () => {
  const ids = Array.from({ length: 100 }, (_, index) => String(401 + index));
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    requests.push({ url, options });
    if (url.pathname === "/rest/v1/tournament_gallery_photos") {
      return Response.json(ids.map(id => ({ id })), { headers: { "Content-Range": "400-499/502" } });
    }
    assert.equal(url.pathname, "/functions/v1/gallery-photo-urls");
    const { photoIds, variant } = JSON.parse(options.body);
    assert.equal(variant, "thumb");
    assert.equal(photoIds.length, 50);
    return Response.json({ urls: Object.fromEntries(photoIds.map(id => [id, `https://photos.example.test/${id}`])) });
  };

  try {
    const result = await build({
      entryPoints: ["app/gallery/public-gallery.ts"],
      absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
      platform: "node", format: "cjs", bundle: true, write: false,
      external: ["@supabase/supabase-js"],
    });
    const compiled = { exports: {} };
    new Function("require", "module", result.outputFiles[0].text)(createRequire(import.meta.url), compiled);
    const { getAlbumPhotos, getPublicPhotoUrls } = compiled.exports;

    const { signal } = new AbortController();
    assert.deepEqual(await getAlbumPhotos("album", 400, 100, signal), { ids, count: 502 });
    const [query] = requests;
    assert.equal(query.url.searchParams.get("offset"), "400");
    assert.equal(query.url.searchParams.get("limit"), "100");
    assert.equal(query.url.searchParams.get("order"), "sort_order.asc,id.asc");
    assert.equal(query.url.searchParams.get("state"), "eq.visible");
    assert.match(new Headers(query.options.headers).get("prefer"), /count=exact/);

    const urls = await getPublicPhotoUrls(ids, "thumb", signal);
    assert.deepEqual(Object.keys(urls), ids);
    assert.deepEqual(requests.slice(1).flatMap(({ options }) => JSON.parse(options.body).photoIds), ids);
    assert.ok(requests.every(({ options }) => options.signal === signal));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
