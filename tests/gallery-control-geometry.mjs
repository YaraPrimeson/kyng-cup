import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const result = await build({
  stdin: { contents: `
    import { createRoot } from "react-dom/client";
    import PhotoViewer from "./app/gallery/photo-viewer";
    createRoot(document.getElementById("app")).render(
      <PhotoViewer photoId="test" label="Photo 2" position={2} total={3} slug="test" language="en" opener={null}
       hasNext moveLoading={false} moveFailed={false} onClose={() => {}} onMove={() => {}} />
    );`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, jsx: "automatic", write: false,
  plugins: [{ name: "fixture", setup(builder) {
    builder.onResolve({ filter: /^\.\/public-gallery$/ }, () => ({ path: "photos", namespace: "fixture" }));
    builder.onLoad({ filter: /^photos$/, namespace: "fixture" }, () => ({
      contents: "export const getPublicPhotoUrls = async () => ({test: 'data:image/gif;base64,R0lGODlhAQABAAAAACw='});",
    }));
  } }],
});
const browser = await chromium.launch({ executablePath: execFileSync("which", ["google-chrome"], { encoding: "utf8" }).trim() });
try {
  const page = await browser.newPage();
  await page.setContent('<div id="app"></div>');
  await page.addStyleTag({ path: "app/gallery/gallery.css" });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.locator("dialog[open]").waitFor();
  for (const width of [320, 390, 680, 681, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const state = await page.evaluate(() => {
      const center = element => {
        const box = element.getBoundingClientRect();
        return [box.x + box.width / 2, box.y + box.height / 2, box.width, box.height];
      };
      const controls = [...document.querySelectorAll(".gallery-viewer-icon")].map(button => {
        const svg = button.querySelector("svg");
        const path = svg.querySelector("path").getBBox();
        const style = getComputedStyle(button);
        return {
          button: center(button), icon: center(svg), vector: [path.x + path.width / 2, path.y + path.height / 2],
          border: [style.borderRadius, style.borderTopWidth, style.borderTopColor],
        };
      });
      return { controls, counter: center(document.querySelector(".gallery-viewer-counter")) };
    });
    const [close, download, previous, next] = state.controls;
    assert.equal(state.controls.length, 4);
    for (const control of state.controls) {
      assert.deepEqual(control.button.slice(2), [44, 44]);
      assert.deepEqual(control.icon.slice(2), [24, 24]);
      assert.deepEqual(control.icon.slice(0, 2), control.button.slice(0, 2));
      assert.deepEqual(control.vector, [12, 12]);
      assert.deepEqual(control.border, close.border);
    }
    assert.deepEqual(close.border.slice(0, 2), ["50%", "1px"]);
    assert.equal(previous.button[1], next.button[1]);
    assert.equal(previous.button[0] + next.button[0], width);
    assert.equal(close.button[1], download.button[1]);
    assert.ok(Math.abs(state.counter[0] - width / 2) <= 1 / 64, "counter stays centered within Chromium layout precision");
    console.log(width + "px: four centered controls and aligned navigation");
  }
} finally {
  await browser.close();
}
