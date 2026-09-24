import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPublicSources } from "../lib/source-fetch.ts";

test("Отменённая загрузка страниц не превращается в пустой список источников", async () => {
  const signal = AbortSignal.abort(new Error("cancelled"));
  await assert.rejects(fetchPublicSources([], signal), /cancelled/);
});

test("Неподдерживаемый адрес возвращает конкретную причину без запроса в сеть", async () => {
  const [result] = await fetchPublicSources(["http://localhost/"], new AbortController().signal);
  assert.equal(result.unavailable, true);
  assert.match(result.reason, /Неподдерживаемый адрес/);
});
