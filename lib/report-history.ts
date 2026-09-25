import type { AnalysisResult } from "@/lib/schemas";
import type { EvidenceProposal } from "@/lib/verification";

const supportedStatuses = new Set(["confirmed", "source_claim", "partial_support"]);

export function previousEvidenceFromResult(result: AnalysisResult): EvidenceProposal[] {
  return result.checks.flatMap((check) => {
    if (!check.source_url || !check.quote) return [];
    let verdict: EvidenceProposal["verdict"];
    if (supportedStatuses.has(check.status)) verdict = "supports_current";
    else if (check.status === "historical") verdict = "historical";
    else if (check.status === "contradicted") verdict = "contradicts";
    else return [];
    return [{ claim_id: check.claim_id, verdict, url: check.source_url, quote: check.quote }];
  });
}

export function shouldKeepPreviousReport(previous: AnalysisResult, current: AnalysisResult) {
  if (current.assessment.score >= previous.assessment.score) return false;
  if (current.checks.some((check) => check.status === "contradicted" || check.status === "conflict")) return false;
  return previous.checks.some((before) => {
    const after = current.checks.find((check) => check.claim_id === before.claim_id);
    return supportedStatuses.has(before.status) && after?.status === "no_public_confirmation";
  });
}
