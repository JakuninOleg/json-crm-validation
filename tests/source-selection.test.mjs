import assert from "node:assert/strict";
import { test } from "node:test";
import { selectSourceCandidates } from "../lib/source-selection.ts";

const lead = { company_name: "On-Line Dynamics Limited" };

function searchResponse(urls) {
  return {
    output: [{ type: "web_search_call", action: { type: "search", sources: urls.map((url) => ({ url })) } }],
  };
}

test("Найденный сайт без названия компании в URL не отбрасывается", () => {
  const site = "https://www.stallionslegal.com/";
  const result = selectSourceCandidates(searchResponse([
    "https://ng.linkedin.com/company/online-dynamics", site,
  ]), lead, []);
  assert.ok(result.candidates.some((candidate) => candidate.url === site && candidate.origin === "search"));
  assert.ok(result.toFetch.includes(site));
});

test("Ссылка прошлого отчёта перепроверяется, даже если новая выдача её не содержит", () => {
  const site = "https://www.stallionslegal.com/";
  const freshUrls = Array.from({ length: 12 }, (_, index) => `https://source-${index}.example/online-dynamics`);
  const result = selectSourceCandidates(searchResponse(freshUrls), lead, [site]);
  assert.deepEqual(result.candidates[0], { url: site, origin: "previous" });
  assert.equal(result.toFetch[0], site);
});

test("Лимит чтения не удаляет остальные найденные ссылки из отчёта", () => {
  const urls = Array.from({ length: 12 }, (_, index) => `https://source-${index}.example/about`);
  const result = selectSourceCandidates(searchResponse(urls), lead, []);
  assert.equal(result.candidates.length, 12);
  assert.equal(result.toFetch.length, 10);
});
