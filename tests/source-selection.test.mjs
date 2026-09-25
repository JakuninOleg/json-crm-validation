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
  ]), lead, [], [site]);
  assert.ok(result.candidates.some((candidate) => candidate.url === site && candidate.origin === "search"));
  assert.ok(result.toFetch.includes(site));
});

test("Ссылка прошлого отчёта перепроверяется, даже если новая выдача её не содержит", () => {
  const site = "https://www.stallionslegal.com/";
  const freshUrls = Array.from({ length: 12 }, (_, index) => `https://source-${index}.example/online-dynamics`);
  const result = selectSourceCandidates(searchResponse(freshUrls), lead, [site], [site]);
  assert.deepEqual(result.candidates[0], { url: site, origin: "previous" });
  assert.equal(result.toFetch[0], site);
});

test("Все найденные ссылки видны в отчёте, но читаются только страницы с цитатами", () => {
  const urls = Array.from({ length: 12 }, (_, index) => `https://source-${index}.example/about`);
  const result = selectSourceCandidates(searchResponse(urls), lead, [], [urls[2], urls[9]]);
  assert.equal(result.candidates.length, 12);
  assert.deepEqual(result.toFetch, [urls[2], urls[9]]);
});

test("Страница с предложенной цитатой проверяется и без записи в поисковой выдаче", () => {
  const url = "https://company.example/team";
  const result = selectSourceCandidates(searchResponse([]), lead, [], [url]);
  assert.deepEqual(result.toFetch, [url]);
  assert.deepEqual(result.candidates, [{ url, origin: "search" }]);
});

test("Повторная проверка включает прежние и новые страницы с цитатами", () => {
  const previous = Array.from({ length: 10 }, (_, index) => `https://old-${index}.example/about`);
  const fresh = Array.from({ length: 10 }, (_, index) => `https://fresh-${index}.example/online-dynamics`);
  const result = selectSourceCandidates(searchResponse(fresh), lead, previous, [previous[0], fresh[0]]);

  assert.deepEqual(result.toFetch, [previous[0], fresh[0]]);
  assert.equal(result.candidates.length, 20);
});

test("PDF остаётся в наборе найденных источников", () => {
  const html = "https://company.example/online-dynamics";
  const pdf = "https://company.example/report.pdf";
  const result = selectSourceCandidates(searchResponse([pdf, html]), lead, [], [pdf, html]);

  assert.ok(result.candidates.some((candidate) => candidate.url === pdf));
  assert.ok(result.toFetch.includes(pdf));
  assert.ok(result.toFetch.includes(html));
});
