import assert from "node:assert/strict";
import { test } from "node:test";
import { getConfidenceBreakdown, scoreLead } from "../lib/scoring.ts";
import { buildVerificationReport } from "../lib/verification.ts";

const lead = {
  lead_id: 48291,
  name: "Wale O-Michael",
  job_title: "Founder / CEO",
  company_name: "On-Line Dynamics Limited",
  company_address: "7 Adepate Abebi Crescent, Jericho Road, Ibadan, Nigeria",
  city: "Ibadan",
  experience: "We help candidates with visa processing, skilled migration and international education.",
  candidate_base: "500+ candidates",
  interested_in: "Sending candidates to Europe",
};

const quotes = {
  company: "On-Line Dynamics Limited is registered in Nigeria.",
  activity: "On-Line Dynamics Limited recruits workers for overseas jobs and provides visa processing, skilled migration and international education.",
  candidates: "On-Line Dynamics Limited has a base of 500+ candidates.",
  person: "Wale O-Michael is Founder and CEO of On-Line Dynamics Limited.",
  intent: "On-Line Dynamics Limited is sending candidates to Europe.",
  city: "On-Line Dynamics Limited is located in Ibadan, Nigeria.",
};

function reportFrom(sourceUrl, items) {
  const source = { id: "s1", url: sourceUrl, text: Object.values(quotes).join(" ") };
  const evidence = items.map(([claim_id, quote]) => ({ claim_id, verdict: "supports_current", source_id: "s1", quote }));
  return buildVerificationReport(lead, [source], [], evidence);
}

test("Заявка без доступных источников получает COLD 0/100 с ручной проверкой", () => {
  const report = buildVerificationReport(lead, [], ["https://apvcon.org/about-us/"], []);
  const assessment = scoreLead(report);
  assert.equal(assessment.score, 0);
  assert.equal(assessment.qualification, "COLD");
  assert.equal(assessment.verification_confidence, 0);
  assert.match(assessment.crm_comment, /не означает/);
  assert.equal(assessment.review_required, true);
});

test("Только визовые услуги не дают баллы за международный рекрутинг", () => {
  const visaQuote = "On-Line Dynamics Limited provides visa processing services in Ibadan.";
  const source = { id: "s1", url: "https://www.cac.gov.ng/company", text: `${quotes.company} ${visaQuote}` };
  const report = buildVerificationReport(lead, [source], [], [
    { claim_id: "company", verdict: "supports_current", source_id: "s1", quote: quotes.company },
    { claim_id: "activity", verdict: "supports_current", source_id: "s1", quote: visaQuote },
  ]);
  const assessment = scoreLead(report);
  assert.equal(report.checks.find((check) => check.claim_id === "activity").status, "partial_support");
  assert.equal(assessment.score, 25);
  assert.equal(assessment.qualification, "COLD");
});

test("Одного названия компании и города недостаточно для баллов за местоположение", () => {
  const cityQuote = "On-Line Dynamics Limited is located in Ibadan, Nigeria.";
  const source = { id: "s1", url: "https://company.example/about", text: `${quotes.company} ${cityQuote}` };
  const report = buildVerificationReport(lead, [source], [], [
    { claim_id: "company", verdict: "supports_current", source_id: "s1", quote: quotes.company },
    { claim_id: "city", verdict: "supports_current", source_id: "s1", quote: cityQuote },
  ]);
  const assessment = scoreLead(report);
  assert.equal(report.checks.find((check) => check.claim_id === "city").status, "identity_ambiguous");
  assert.equal(assessment.score, 8);
  assert.equal(assessment.verification_confidence, 13);
  const confidence = getConfidenceBreakdown(report);
  assert.deepEqual(confidence.map(({ points }) => points), [12.5, 0, 0, 0, 0]);
  assert.equal(Math.round(confidence.reduce((sum, item) => sum + item.points, 0)), assessment.verification_confidence);
  assert.equal(assessment.qualification, "COLD");
  assert.equal(assessment.review_required, true);
});

test("Полный набор прямых цитат даёт 100 и HOT", () => {
  const items = [
    ["company", quotes.company], ["activity", quotes.activity],
    ["candidate_base", quotes.candidates], ["person_link", quotes.person],
    ["founder", quotes.person], ["ceo", quotes.person], ["intent", quotes.intent],
    ["city", quotes.city],
  ];
  const assessment = scoreLead(reportFrom("https://www.cac.gov.ng/company", items));
  assert.equal(assessment.score, 100);
  assert.equal(assessment.qualification, "HOT");
  assert.equal(assessment.review_required, false);
});

test("Те же сведения на неофициальной странице снижают баллы и не дают HOT", () => {
  const items = [
    ["company", quotes.company], ["activity", quotes.activity],
    ["candidate_base", quotes.candidates], ["person_link", quotes.person],
    ["ceo", quotes.person], ["intent", quotes.intent],
  ];
  const assessment = scoreLead(reportFrom("https://company.example/about", items));
  assert.equal(assessment.score, 48);
  assert.equal(assessment.qualification, "WARM");
  assert.equal(assessment.review_required, true);
  assert.ok(assessment.verification_confidence > 0);
});

test("Прямое противоречие профилю при известной компании даёт COLD", () => {
  const contrary = "On-Line Dynamics Limited only provides engineering consulting services.";
  const source = { id: "s1", url: "https://www.cac.gov.ng/company", text: `${quotes.company} ${contrary}` };
  const report = buildVerificationReport(lead, [source], [], [
    { claim_id: "company", verdict: "supports_current", source_id: "s1", quote: quotes.company },
    { claim_id: "activity", verdict: "contradicts", source_id: "s1", quote: contrary },
  ]);
  const assessment = scoreLead(report);
  assert.equal(assessment.score, 15);
  assert.equal(assessment.qualification, "COLD");
  assert.equal(assessment.review_required, true);
});

test("Итоговый балл всегда равен сумме начислений даже при COLD", () => {
  const contrary = "On-Line Dynamics Limited only provides engineering consulting services.";
  const source = { id: "s1", url: "https://www.cac.gov.ng/company", text: `${quotes.company} ${quotes.person} ${contrary}` };
  const report = buildVerificationReport(lead, [source], [], [
    { claim_id: "company", verdict: "supports_current", source_id: "s1", quote: quotes.company },
    { claim_id: "person_link", verdict: "supports_current", source_id: "s1", quote: quotes.person },
    { claim_id: "ceo", verdict: "supports_current", source_id: "s1", quote: quotes.person },
    { claim_id: "activity", verdict: "contradicts", source_id: "s1", quote: contrary },
  ]);
  const assessment = scoreLead(report);
  assert.equal(assessment.score, 35);
  assert.equal(assessment.qualification, "COLD");
  assert.equal(assessment.breakdown.reduce((sum, item) => sum + item.points, 0), assessment.score);
});
