import assert from "node:assert/strict";
import { test } from "node:test";
import { previousEvidenceFromResult, shouldKeepPreviousReport } from "../lib/report-history.ts";

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
