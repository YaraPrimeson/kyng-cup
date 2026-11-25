import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
const bundle = await build({
  stdin: { contents: `import { useState } from "react";
    import { createRoot } from "react-dom/client";
    import Viewer from "./app/gallery/photo-viewer";
    function App() {
      const [i, set] = useState(1);
      return <Viewer photoId={String(i)} previewUrl={"http://gallery.test/thumb/" + i}
        label={"Photo " + i} position={i} total={3} slug="test" language="en" opener={null}
        moveLoading={false} moveFailed={false} onClose={() => {}} onMove={step => set((i + step + 2) % 3 + 1)} />;
    }
    createRoot(document.getElementById("app")).render(<App />);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, jsx: "automatic", write: false, define: {"process.env.NODE_ENV": '"production"'},
  plugins: [{name:"fixture", setup(b) {
    b.onResolve({filter: /^\.\/public-gallery$/}, () => ({path:"photos", namespace:"mock"}));
    b.onLoad({filter: /.*/, namespace:"mock"}, () => ({
      contents: 'export const getPublicPhotoUrls = async ([id]) => ({[id]:"http://gallery.test/web/" + id});',
    }));
  }}],
});
const browser = await chromium.launch({executablePath: execFileSync("which", ["google-chrome"], {encoding:"utf8"}).trim()});
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({viewport:{width,height:800}, reducedMotion: width === 390 ? "no-preference" : "reduce"});
    const blocked = new Map([1,2].map(id=>[id,Promise.withResolvers()]));
    await page.route("http://gallery.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({contentType:"text/html", body:'<!doctype html><div id="app"></div>'});
      const [, variant, id] = url.pathname.split("/");
      if (variant === "web") await blocked.get(Number(id))?.promise;
      const factor = variant === "web" ? 2 : 1;
      return route.fulfill({contentType:"image/svg+xml", body:`<svg xmlns="http://www.w3.org/2000/svg" width="${160 * factor}" height="${240 * factor}"><rect width="100%" height="100%" fill="green"/></svg>`});
    });
    await page.goto("http://gallery.test/");
    await page.addStyleTag({path:"app/gallery/gallery.css"});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const preview = page.locator(".gallery-viewer-preview[data-loading=false]");
    const image = page.locator(".gallery-viewer-image[data-loading=false]");
    await preview.waitFor();
    const initial = await preview.boundingBox();
    assert.equal(await preview.evaluate(el => getComputedStyle(el).objectFit), "contain");
    blocked.get(1).resolve();
    await image.waitFor();
    assert.deepEqual(await image.boundingBox(), initial);
    const stage = page.locator(".gallery-viewer-stage");
    await stage.evaluate(el => {
      for (const [type, x] of [["pointerdown",140],["pointerup",40]]) {
        el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:"touch",pointerId:1,isPrimary:true,clientX:x,clientY:50}));
      }
    });
    await page.locator('.gallery-viewer-slides[data-ready=true][data-direction="1"]').waitFor();
    assert.equal(await page.locator(".gallery-viewer-counter").textContent(),"2 / 3");
    const animation = await page.locator(".gallery-viewer-frame").evaluate(el=>getComputedStyle(el).animationName);
    assert.equal(animation, width === 390 ? "gallery-photo-enter" : "none");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".gallery-viewer-outgoing")).visibility === "hidden");
    assert.deepEqual(await preview.boundingBox(), initial);
    blocked.get(2).resolve();
    await image.waitFor();
    assert.deepEqual(await image.boundingBox(), initial);
    console.log(width + "px: preview and full image have matching size, and swipe respects motion preferences");
    await page.close();
  }
} finally {
  await browser.close();
}
