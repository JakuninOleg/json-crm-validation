import { z } from "zod";
import type { Lead } from "@/lib/schemas";
import type { PublicSource } from "@/lib/source-fetch";

export const claimIdSchema = z.enum([
  "company", "activity", "candidate_base", "person_link", "founder", "ceo", "intent", "city", "address",
]);
export type ClaimId = z.infer<typeof claimIdSchema>;

export const modelEvidenceSchema = z.object({
  evidence: z.array(z.object({
    claim_id: claimIdSchema,
    verdict: z.enum(["supports_current", "historical", "contradicts"]),
    source_id: z.string(),
    quote: z.string(),
  })),
});
export type ModelEvidence = z.infer<typeof modelEvidenceSchema>["evidence"][number];

export const verificationReportSchema = z.object({
  checked_at: z.string(),
  status: z.enum(["checked", "insufficient_evidence"]),
  checks: z.array(z.object({
    claim_id: claimIdSchema,
    claim: z.string(),
    submitted_value: z.string(),
    status: z.enum(["confirmed", "source_claim", "partial_support", "historical", "contradicted", "conflict", "no_public_confirmation", "not_provided"]),
    source_url: z.url().nullable(),
    quote: z.string().nullable(),
    detail: z.string(),
  })),
  sources: z.array(z.url()),
  unavailable_sources: z.array(z.url()),
  source_failures: z.array(z.object({ url: z.url(), reason: z.string() })).default([]),
  source_candidates: z.array(z.object({
    url: z.url(),
    origin: z.enum(["search", "previous", "both"]),
    status: z.enum(["used", "read_no_evidence", "read_not_analyzed", "fetch_failed", "not_read"]),
  })).default([]),
});
export type VerificationReport = z.infer<typeof verificationReportSchema>;

const claimDefinitions: { id: ClaimId; label: string; field: keyof Lead }[] = [
  { id: "company", label: "Компания существует и соответствует названию", field: "company_name" },
  { id: "activity", label: "Деятельность компании", field: "experience" },
  { id: "candidate_base", label: "База кандидатов", field: "candidate_base" },
  { id: "person_link", label: "Человек связан с компанией", field: "name" },
  { id: "founder", label: "Человек является основателем", field: "job_title" },
  { id: "ceo", label: "Человек занимает должность CEO/директора", field: "job_title" },
  { id: "intent", label: "Намерение направлять кандидатов за рубеж", field: "interested_in" },
  { id: "city", label: "Город компании", field: "city" },
  { id: "address", label: "Адрес компании", field: "company_address" },
];

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function quotedEntityMatches(lead: Lead, claimId: ClaimId, quote: string) {
  const normalizedQuote = normalize(quote);
  const companyWords = normalize(lead.company_name).split(" ").filter((word) => word.length > 2 && !["limited", "ltd", "inc", "llc"].includes(word));
  if (companyWords.length < 2 || !companyWords.slice(0, 2).every((word) => normalizedQuote.includes(word))) return false;
  if (["person_link", "founder", "ceo"].includes(claimId)) {
    const personName = normalize(lead.name);
    if (personName.split(" ").length < 2 || !` ${normalizedQuote} `.includes(` ${personName} `)) return false;
  }
  if (claimId === "city" && lead.city && !normalizedQuote.includes(normalize(lead.city))) return false;
  if (claimId === "address" && lead.company_address) {
    const addressWords = normalize(lead.company_address).split(" ").filter((word) => word.length > 3);
    if (addressWords.length < 2 || !addressWords.slice(0, 2).every((word) => normalizedQuote.includes(word))) return false;
  }
  if (claimId === "founder" && !/founder|founded|основател/i.test(quote)) return false;
  if (claimId === "ceo" && !/ceo|chief executive|директор|руководител/i.test(quote)) return false;
  return true;
}

function activityIsFullySupported(submitted: string, quote: string) {
  const text = normalize(submitted);
  const evidence = normalize(quote);
  const concepts = [
    { claimed: /visa|виз/, found: /visa|виз/ },
    { claimed: /migrat|миграц/, found: /migrat|миграц/ },
    { claimed: /educat|образован|student|студент/, found: /educat|образован|student|студент/ },
  ];
  return concepts.every(({ claimed, found }) => !claimed.test(text) || found.test(evidence));
}

function isOfficialSource(url: string) {
  return /(^|\.)gov(?:\.[a-z]{2})?$/.test(new URL(url).hostname.toLowerCase());
}

function isArchiveSource(url: string) {
  const hostname = new URL(url).hostname.toLowerCase();
  return ["web.archive.org", "archive.is", "archive.ph", "archive.today"].includes(hostname);
}

function isDiscussionSource(url: string) {
  const hostname = new URL(url).hostname.toLowerCase();
  return ["nairaland.com", "reddit.com", "quora.com"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function buildVerificationReport(
  lead: Lead,
  sources: PublicSource[],
  unavailableSources: string[],
  evidence: ModelEvidence[],
  sourceFailures: { url: string; reason: string }[] = [],
): VerificationReport {
  const accepted = evidence.flatMap((item) => {
    const source = sources.find((candidate) => candidate.id === item.source_id);
    if (!source || isDiscussionSource(source.url) || item.quote.length < 12 || item.quote.length > 600) return [];
    if (!normalize(source.text).includes(normalize(item.quote))) return [];
    if (!quotedEntityMatches(lead, item.claim_id, item.quote)) return [];
    const verdict = item.verdict === "supports_current" && isArchiveSource(source.url) ? "historical" : item.verdict;
    return [{ ...item, verdict, url: source.url, official: isOfficialSource(source.url) }];
  });
  const usedSources = new Set<string>();
  const checks: VerificationReport["checks"] = claimDefinitions.map(({ id, label, field }) => {
    const submittedValue = String(lead[field] ?? "").trim();
    const roleNotClaimed = (id === "founder" && !/founder|основател/i.test(submittedValue)) ||
      (id === "ceo" && !/ceo|director|директор/i.test(submittedValue));
    if (!submittedValue || roleNotClaimed) {
      return { claim_id: id, claim: label, submitted_value: submittedValue, status: "not_provided", source_url: null, quote: null, detail: "Утверждение не содержится в заявке." };
    }

    const items = accepted.filter((item) => item.claim_id === id);
    const current = items.filter((item) => item.verdict === "supports_current").sort((a, b) => Number(b.official) - Number(a.official))[0];
    const contradicted = items.find((item) => item.verdict === "contradicts");
    const historical = items.find((item) => item.verdict === "historical");
    const chosen = contradicted ?? current ?? historical;
    for (const item of items) usedSources.add(item.url);

    if (current && contradicted) {
      return { claim_id: id, claim: label, submitted_value: submittedValue, status: "conflict", source_url: chosen?.url ?? null, quote: chosen?.quote ?? null, detail: "Найдены несовместимые сведения. Требуется проверка человеком." };
    }
    if (contradicted) {
      return { claim_id: id, claim: label, submitted_value: submittedValue, status: "contradicted", source_url: contradicted.url, quote: contradicted.quote, detail: "Источник содержит сведения, противоречащие заявке. Проверьте цитату и актуальность страницы." };
    }
    if (current) {
      if (id === "activity" && !activityIsFullySupported(submittedValue, current.quote)) {
        return { claim_id: id, claim: label, submitted_value: submittedValue, status: "partial_support", source_url: current.url, quote: current.quote, detail: "Источник подтверждает только часть заявленного направления деятельности." };
      }
      const status = current.official ? "confirmed" : "source_claim";
      const detail = current.official
        ? "Сведение содержится в доступном официальном источнике. Проверьте дату публикации и актуальность записи."
        : "Сведение содержится на доступной странице. Независимость и актуальность источника требуют проверки.";
      return { claim_id: id, claim: label, submitted_value: submittedValue, status, source_url: current.url, quote: current.quote, detail };
    }
    if (historical) {
      return { claim_id: id, claim: label, submitted_value: submittedValue, status: "historical", source_url: historical.url, quote: historical.quote, detail: "Найдено историческое упоминание; актуальность заявленного сведения не установлена." };
    }
    return {
      claim_id: id, claim: label, submitted_value: submittedValue, status: "no_public_confirmation", source_url: null, quote: null,
      detail: unavailableSources.length ? "Пригодного подтверждения нет; часть найденных страниц сервер не смог прочитать." : "Пригодного публичного подтверждения не найдено.",
    };
  });
  const hasCurrentEvidence = checks.some((check) => ["confirmed", "source_claim"].includes(check.status));
  return {
    checked_at: new Date().toISOString(), status: hasCurrentEvidence ? "checked" : "insufficient_evidence",
    checks, sources: [...usedSources], unavailable_sources: unavailableSources,
    source_failures: sourceFailures, source_candidates: [],
  };
}
