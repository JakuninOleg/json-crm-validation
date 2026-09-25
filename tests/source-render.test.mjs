import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { renderPage } from "../lib/source-render.ts";

const localChrome = `${process.env.PROGRAMFILES ?? ""}\\Google\\Chrome\\Application\\chrome.exe`;
const supported = process.platform === "linux" || (process.platform === "win32" && existsSync(localChrome));

test("JavaScript-страница читается только после выполнения скрипта", { skip: !supported }, async () => {
  const html = `<html><body><main></main><script>
    document.querySelector("main").textContent = "Verified rendered content. ".repeat(6);
  </script></body></html>`;
  const page = await renderPage({
    url: "https://example.com/",
    status: 200,
    contentType: "text/html",
    body: Buffer.from(html),
  }, new AbortController().signal);

  assert.equal(page.url, "https://example.com/");
  assert.match(page.text, /Verified rendered content/);
  assert.ok(page.text.length >= 100);
});
