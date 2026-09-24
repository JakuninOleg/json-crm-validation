import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPublicSources } from "../lib/source-fetch.ts";

test("Отменённая загрузка страниц не превращается в пустой список источников", async () => {
  const signal = AbortSignal.abort(new Error("cancelled"));
  await assert.rejects(fetchPublicSources([], signal), /cancelled/);
});
