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

test("Все найденные ссылки передаются на чтение", () => {
  const urls = Array.from({ length: 12 }, (_, index) => `https://source-${index}.example/about`);
  const result = selectSourceCandidates(searchResponse(urls), lead, []);
  assert.equal(result.candidates.length, 12);
  assert.equal(result.toFetch.length, 12);
});

test("Повторная проверка включает все прежние и новые ссылки", () => {
  const previous = Array.from({ length: 10 }, (_, index) => `https://old-${index}.example/about`);
  const fresh = Array.from({ length: 10 }, (_, index) => `https://fresh-${index}.example/online-dynamics`);
  const result = selectSourceCandidates(searchResponse(fresh), lead, previous);

  assert.equal(result.toFetch.length, 20);
  assert.deepEqual(result.toFetch.slice(0, 10), previous);
  assert.deepEqual(result.toFetch.slice(10), fresh);
  assert.equal(result.candidates.length, 20);
});

test("PDF остаётся в наборе найденных источников", () => {
  const html = "https://company.example/online-dynamics";
  const pdf = "https://company.example/report.pdf";
  const result = selectSourceCandidates(searchResponse([pdf, html]), lead, []);

  assert.ok(result.candidates.some((candidate) => candidate.url === pdf));
  assert.ok(result.toFetch.includes(pdf));
  assert.ok(result.toFetch.includes(html));
});
