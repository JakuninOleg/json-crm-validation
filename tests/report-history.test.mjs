import assert from "node:assert/strict";
import { test } from "node:test";
import { compareReports, previousEvidenceFromResult, shouldKeepPreviousReport } from "../lib/report-history.ts";

const previous = {
  assessment: { score: 18 },
  checks: [{
    claim_id: "company", status: "source_claim", source_url: "https://company.example/about",
    quote: "On-Line Dynamics Limited operates in Ibadan.",
  }],
};

test("При исчезновении источника прежний балл остаётся историческим", () => {
  const current = { assessment: { score: 0 }, checks: [{ claim_id: "company", status: "no_public_confirmation" }] };
  assert.equal(shouldKeepPreviousReport(previous, current), true);
  assert.deepEqual(previousEvidenceFromResult(previous), [{
    claim_id: "company", verdict: "supports_current", url: "https://company.example/about",
    quote: "On-Line Dynamics Limited operates in Ibadan.",
  }]);
});

test("Прямое противоречие позволяет пересчитать оценку", () => {
  const current = { assessment: { score: 0 }, checks: [{ claim_id: "company", status: "contradicted" }] };
  assert.equal(shouldKeepPreviousReport(previous, current), false);
});

test("Снижение балла без потери подтверждённого факта не маскируется прошлым отчётом", () => {
  const current = { assessment: { score: 10 }, checks: [{ claim_id: "company", status: "source_claim" }] };
  assert.equal(shouldKeepPreviousReport(previous, current), false);
});

test("Неоднозначная принадлежность источника не подменяет прежнюю оценку", () => {
  const current = { assessment: { score: 15 }, checks: [{ claim_id: "company", status: "identity_ambiguous" }] };
  assert.equal(shouldKeepPreviousReport(previous, current), true);
});

test("Повторная проверка объясняет разницу баллов и статусов", () => {
  const before = {
    assessment: { breakdown: [{ name: "identity", label: "Компания и местонахождение", points: 8 }] },
    checks: [{ claim_id: "city", claim: "Город компании", status: "no_public_confirmation", source_url: null }],
  };
  const after = {
    assessment: { breakdown: [{ name: "identity", label: "Компания и местонахождение", points: 11 }] },
    checks: [{ claim_id: "city", claim: "Город компании", status: "source_claim", source_url: "https://example.com" }],
  };
  assert.deepEqual(compareReports(before, after), {
    scoreChanges: [{ label: "Компания и местонахождение", difference: 3 }],
    evidenceChanges: [{
      label: "Город компании", before: "no_public_confirmation", after: "source_claim",
      source_url: "https://example.com",
    }],
  });
});
