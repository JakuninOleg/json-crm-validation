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

export const evidenceProposalSchema = z.object({
  evidence: z.array(z.object({
    claim_id: claimIdSchema,
    verdict: z.enum(["supports_current", "historical", "contradicts"]),
    url: z.string(),
    quote: z.string(),
  })),
});
export type EvidenceProposal = z.infer<typeof evidenceProposalSchema>["evidence"][number];

export const verificationReportSchema = z.object({
  checked_at: z.string(),
  status: z.enum(["checked", "insufficient_evidence"]),
  checks: z.array(z.object({
    claim_id: claimIdSchema,
    claim: z.string(),
    submitted_value: z.string(),
    status: z.enum(["confirmed", "source_claim", "partial_support", "historical", "contradicted", "conflict", "identity_ambiguous", "no_public_confirmation", "not_provided"]),
    source_url: z.url().nullable(),
    quote: z.string().nullable(),
    detail: z.string(),
  })),
  sources: z.array(z.url()),
  unavailable_sources: z.array(z.url()),
  source_failures: z.array(z.object({ url: z.url(), reason: z.string() })).default([]),
  source_discrepancies: z.array(z.object({
    claim_id: claimIdSchema, url: z.url(), quote: z.string(), detail: z.string(),
  })).default([]),
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

function quoteIsOnPage(page: string, quote: string) {
  const compact = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return compact(page).includes(compact(quote));
}

function quotedEntityMatches(lead: Lead, claimId: ClaimId, quote: string) {
  const normalizedQuote = normalize(quote);
  const companyWords = normalize(lead.company_name).split(" ").filter((word) => !["limited", "ltd", "inc", "llc"].includes(word));
  const companyName = companyWords.join(" ");
  if (companyWords.length < 2 || !` ${normalizedQuote} `.includes(` ${companyName} `)) return false;
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

function activityHasClaimedSignal(submitted: string, quote: string) {
  const text = normalize(submitted);
  const evidence = normalize(quote);
  const signals = [/visa|виз/, /migrat|миграц/, /educat|образован|student|студент/, /recruit|staffing|кандидат|трудоустрой/];
  const claimed = signals.filter((signal) => signal.test(text));
  return claimed.length === 0 || claimed.some((signal) => signal.test(evidence));
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

function contactDomains(source: PublicSource) {
  const host = new URL(source.url).hostname.replace(/^www\./, "");
  const platforms = ["facebook.com", "instagram.com", "linkedin.com", "youtube.com", "twitter.com", "x.com", "wa.me"];
  const matches = source.text.match(/(?:https?:\/\/|www\.)[a-z\d.-]+\.[a-z]{2,}/gi) ?? [];
  return new Set(matches.map((value) => {
    const address = value.startsWith("www.") ? `https://${value}` : value;
    return new URL(address).hostname.replace(/^www\./, "");
  }).filter((domain) => domain !== host && !platforms.some((platform) => domain === platform || domain.endsWith(`.${platform}`))));
}

function contactPhones(source: PublicSource) {
  const matches = source.text.match(/\+?\d[\d\s().-]{8,}\d/g) ?? [];
  return new Set(matches.map((value) => value.replace(/\D/g, "").slice(-10)).filter((value) => value.length === 10));
}

function sameEntity(source: PublicSource, anchors: PublicSource[]) {
  if (anchors.some((anchor) => anchor.id === source.id)) return true;
  const host = new URL(source.url).hostname;
  const listingHosts = ["linkedin.com", "goafricaonline.com", "worldorgs.com", "lusha.com", "facebook.com"];
  const isListingHost = listingHosts.some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (!isListingHost && anchors.some((anchor) => new URL(anchor.url).hostname === host)) return true;
  const domains = contactDomains(source);
  const phones = contactPhones(source);
  return anchors.some((anchor) =>
    [...contactDomains(anchor)].some((domain) => domains.has(domain)) ||
    [...contactPhones(anchor)].some((phone) => phones.has(phone)));
}

function identityAmbiguity(source: PublicSource, anchors: PublicSource[]) {
  const sourceDomains = contactDomains(source);
  const anchorDomains = new Set(anchors.flatMap((anchor) => [...contactDomains(anchor)]));
  const differentWebsites = sourceDomains.size > 0 && anchorDomains.size > 0 &&
    ![...sourceDomains].some((domain) => anchorDomains.has(domain));
  const profileConflict = /engineering consulting/i.test(source.text) &&
    anchors.some((anchor) => /travel agency|visa processing/i.test(anchor.text));
  const details = ["Не найден общий сайт или телефон с источником, подтверждающим профиль компании."];
  if (differentWebsites) details.push("Страницы указывают разные сайты.");
  if (profileConflict) details.push("Страницы описывают разные направления бизнеса.");
  details.push("Возможно, это другая организация; баллы по этой странице не начислены.");
  return details.join(" ");
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
    if (!quoteIsOnPage(source.text, item.quote)) return [];
    if (!quotedEntityMatches(lead, item.claim_id, item.quote)) return [];
    const verdict = item.verdict === "supports_current" && isArchiveSource(source.url) ? "historical" : item.verdict;
    return [{ ...item, verdict, url: source.url, official: isOfficialSource(source.url) }];
  });
  const anchorIds = new Set(accepted.filter((item) =>
    item.verdict === "supports_current" &&
    ((item.claim_id === "activity" && activityHasClaimedSignal(String(lead.experience ?? ""), item.quote)) ||
      (item.claim_id === "company" && item.official)))
    .map((item) => item.source_id));
  const anchors = sources.filter((source) => anchorIds.has(source.id));
  const belongsToEntity = (item: (typeof accepted)[number]) => {
    const source = sources.find((candidate) => candidate.id === item.source_id);
    if (!source) return false;
    if (item.official) return true;
    if (item.claim_id === "city" || item.claim_id === "address") return sameEntity(source, anchors);
    if (item.claim_id === "activity" && item.verdict === "contradicts") return sameEntity(source, anchors);
    if (item.claim_id === "company" && anchors.length > 0) return sameEntity(source, anchors);
    return true;
  };
  const sourceDiscrepancies = accepted.filter((item) => !belongsToEntity(item) &&
    (item.verdict === "contradicts" || item.claim_id === "company"))
    .map((item) => {
      const source = sources.find((candidate) => candidate.id === item.source_id);
      return {
        claim_id: item.claim_id, url: item.url, quote: item.quote,
        detail: source ? identityAmbiguity(source, anchors) : "Связь страницы с профилем компании не установлена.",
      };
    }).filter((item, index, items) => items.findIndex((candidate) =>
      candidate.claim_id === item.claim_id && candidate.url === item.url && candidate.quote === item.quote) === index);
  const usedSources = new Set<string>();
  const checks: VerificationReport["checks"] = claimDefinitions.map(({ id, label, field }) => {
    const submittedValue = String(lead[field] ?? "").trim();
    const roleNotClaimed = (id === "founder" && !/founder|основател/i.test(submittedValue)) ||
      (id === "ceo" && !/ceo|director|директор/i.test(submittedValue));
    if (!submittedValue || roleNotClaimed) {
      return { claim_id: id, claim: label, submitted_value: submittedValue, status: "not_provided", source_url: null, quote: null, detail: "Утверждение не содержится в заявке." };
    }

    const proposed = accepted.filter((item) => item.claim_id === id ||
      (id === "company" && item.claim_id === "activity" && item.verdict === "supports_current" &&
        activityHasClaimedSignal(String(lead.experience ?? ""), item.quote)));
    const items = proposed.filter(belongsToEntity);
    const currentItems = items.filter((item) => item.verdict === "supports_current" &&
      (id !== "activity" || activityHasClaimedSignal(submittedValue, item.quote)));
    const current = currentItems.sort((a, b) => Number(b.official) - Number(a.official))[0];
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
    if ((id === "city" || id === "address") && proposed.some((item) => item.verdict === "supports_current")) {
      const item = proposed.find((candidate) => candidate.verdict === "supports_current")!;
      const source = sources.find((candidate) => candidate.id === item.source_id);
      return {
        claim_id: id, claim: label, submitted_value: submittedValue, status: "identity_ambiguous",
        source_url: item.url, quote: item.quote,
        detail: source ? identityAmbiguity(source, anchors) : "Связь страницы с профилем компании не установлена.",
      };
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
    source_failures: sourceFailures, source_discrepancies: sourceDiscrepancies, source_candidates: [],
  };
}
