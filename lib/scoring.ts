import { z } from "zod";
import type { VerificationReport } from "@/lib/verification";

const criterionSchema = z.object({
  name: z.enum(["identity", "profile", "candidates", "authority", "international"]),
  label: z.string(),
  points: z.number().int().min(0),
  max: z.number().int().positive(),
  reason: z.string(),
  source_url: z.url().nullable(),
});

export const assessmentSchema = z.object({
  qualification: z.enum(["HOT", "WARM", "COLD"]),
  score: z.number().int().min(0).max(100),
  verification_confidence: z.number().int().min(0).max(100),
  review_required: z.boolean(),
  qualification_reason: z.string(),
  breakdown: z.array(criterionSchema).length(5),
  positive_signals: z.array(z.string()),
  risk_signals: z.array(z.string()),
  crm_comment: z.string(),
});
export type Assessment = z.infer<typeof assessmentSchema>;

type Check = VerificationReport["checks"][number];
type Criterion = Assessment["breakdown"][number];
type ConfidenceCriterion = { label: string; points: number; max: number; reason: string };

function findCheck(report: VerificationReport, id: Check["claim_id"]) {
  return report.checks.find((check) => check.claim_id === id);
}

function evidenceWeight(check: Check | undefined) {
  if (check?.status === "confirmed") return 1;
  if (check?.status === "source_claim" || check?.status === "partial_support") return 0.5;
  return 0;
}

function confidenceWeight(check: Check | undefined) {
  if (check?.status === "partial_support") return 0.25;
  return evidenceWeight(check);
}

function confidenceReason(check: Check | undefined) {
  if (check?.status === "confirmed") return "Официальный источник: 100% веса.";
  if (check?.status === "source_claim") return "Сведение есть на странице, независимость не установлена: 50% веса.";
  if (check?.status === "partial_support") return "Подтверждена только часть заявления: 25% веса.";
  return "Пригодного текущего подтверждения нет: 0% веса.";
}

export function getConfidenceBreakdown(report: VerificationReport): ConfidenceCriterion[] {
  const founder = findCheck(report, "founder");
  const ceo = findCheck(report, "ceo");
  const city = findCheck(report, "city");
  const address = findCheck(report, "address");
  const role = confidenceWeight(founder) >= confidenceWeight(ceo) ? founder : ceo;
  const location = confidenceWeight(address) > confidenceWeight(city) ? address : city;
  const criteria = [
    { label: "Компания", max: 25, check: findCheck(report, "company") },
    { label: "Деятельность", max: 25, check: findCheck(report, "activity") },
    { label: "Связь человека с компанией", max: 20, check: findCheck(report, "person_link") },
    { label: "Роль человека", max: 20, check: role },
    { label: "Город или адрес", max: 10, check: location },
  ];
  return criteria.map(({ label, max, check }) => ({
    label, max, points: max * confidenceWeight(check), reason: confidenceReason(check),
  }));
}

function categoryPoints(quote: string, categories: { pattern: RegExp; points: number }[]) {
  return categories.find(({ pattern }) => pattern.test(quote))?.points ?? 0;
}

function makeCriterion(name: Criterion["name"], label: string, max: number, base: number, check?: Check): Criterion {
  const points = Math.round(base * evidenceWeight(check));
  const reason = points > 0
    ? `${label}: ${base} за найденный признак × ${evidenceWeight(check)} за тип источника = ${points}.`
    : `${label}: пригодного подтверждённого признака не найдено; баллы не начислены.`;
  return { name, label, points, max, reason, source_url: points > 0 ? check?.source_url ?? null : null };
}

export function scoreLead(report: VerificationReport): Assessment {
  const company = findCheck(report, "company");
  const activity = findCheck(report, "activity");
  const candidates = findCheck(report, "candidate_base");
  const person = findCheck(report, "person_link");
  const founder = findCheck(report, "founder");
  const ceo = findCheck(report, "ceo");
  const intent = findCheck(report, "intent");
  const city = findCheck(report, "city");
  const address = findCheck(report, "address");

  const companyPoints = Math.round(15 * evidenceWeight(company));
  const location = confidenceWeight(address) > confidenceWeight(city) ? address : city;
  const locationPoints = Math.round(5 * evidenceWeight(location));
  let identitySource: string | null = null;
  if (companyPoints > 0) identitySource = company?.source_url ?? null;
  else if (locationPoints > 0) identitySource = location?.source_url ?? null;
  const identity: Criterion = {
    name: "identity", label: "Компания и местонахождение", points: companyPoints + locationPoints, max: 20,
    reason: `Компания: ${companyPoints}/15; город или адрес: ${locationPoints}/5. Баллы только за найденные совпадения.`,
    source_url: identitySource,
  };

  const activityQuote = activity?.quote ?? "";
  const profileBase = /\b(?:do not|does not|no longer|not)\s+(?:offer|provide|do|work in)\b|\bне\s+(?:оказывает|занимается)/i.test(activityQuote) ? 0 : categoryPoints(activityQuote, [
    { pattern: /recruit|staffing|employment|job placement|overseas work|трудоустрой|подбор персонала/i, points: 30 },
    { pattern: /migrat|visa|миграц|виз/i, points: 20 },
    { pattern: /educat|student|образован|студент/i, points: 8 },
  ]);
  const profile = makeCriterion("profile", "Профиль бизнеса", 30, profileBase, activity);

  const candidateQuote = candidates?.quote ?? "";
  const candidateBase = /\b(?:no|without)\s+(?:candidate|base|pool)|нет\s+(?:базы|кандидатов)/i.test(candidateQuote) ? 0 : categoryPoints(candidateQuote, [
    { pattern: /\d+\+?\s*(?:candidates?|кандидат)|candidate\s*(?:base|pool)|база\s*кандидат/i, points: 20 },
    { pattern: /candidate|кандидат/i, points: 8 },
  ]);
  const candidateCriterion = makeCriterion("candidates", "Доступ к кандидатам", 20, candidateBase, candidates);

  const role = [founder, ceo].sort((a, b) => evidenceWeight(b) - evidenceWeight(a))[0];
  const authority = evidenceWeight(role) > 0
    ? makeCriterion("authority", "Полномочия представителя", 20, 20, role)
    : makeCriterion("authority", "Полномочия представителя", 20, 10, person);

  const intentQuote = intent?.quote ?? "";
  const intentBase = /\b(?:not interested|no interest|do not want|does not want)\b|не\s+заинтересован/i.test(intentQuote) ? 0 : categoryPoints(intentQuote, [
    { pattern: /(?:send|place|recruit|направ|трудоустро).*(?:candidate|worker|кандидат|работник)|(?:candidate|worker|кандидат).*(?:abroad|overseas|europe|за рубеж|европ)/i, points: 10 },
    { pattern: /international|overseas|abroad|международ|зарубеж/i, points: 3 },
  ]);
  const international = makeCriterion("international", "Международное направление", 10, intentBase, intent);

  const breakdown = [identity, profile, candidateCriterion, authority, international];
  const score = breakdown.reduce((sum, item) => sum + item.points, 0);

  const confidenceBreakdown = getConfidenceBreakdown(report);
  const coverage = Math.round(confidenceBreakdown.reduce((sum, item) => sum + item.points, 0));
  const verificationConfidence = coverage;
  const companyKnown = evidenceWeight(company) > 0;
  const currentPerson = evidenceWeight(person) > 0;
  const currentRole = evidenceWeight(role) > 0;
  const coreConflict = [company, activity, person, founder, ceo].some((check) => check?.status === "conflict");

  let qualification: Assessment["qualification"] = "COLD";
  let qualificationReason = "По найденным подтверждениям приоритет лида низкий. Это не означает, что неподтверждённые сведения ложны.";
  if (!coreConflict && score >= 75 &&
      company?.status === "confirmed" && person?.status === "confirmed" &&
      role?.status === "confirmed" && profile.points > 0 && candidateCriterion.points > 0 &&
      international.points > 0 && coverage >= 70) {
    qualification = "HOT";
    qualificationReason = "Высокий балл и официальные подтверждения компании, связи человека с ней и его роли.";
  } else if (companyKnown && activity?.status === "contradicted" &&
      profile.points === 0 && candidateCriterion.points === 0 && international.points === 0) {
    qualificationReason = "Найденное описание деятельности противоречит заявленному профилю; подтверждённых профильных признаков нет.";
  } else if (score >= 35 && !coreConflict) {
    qualification = "WARM";
    qualificationReason = "Найдены признаки потенциального партнёра, но для HOT доказательств недостаточно.";
  }

  const riskSignals = report.checks.filter((check) => ["contradicted", "conflict"].includes(check.status))
    .map((check) => `${check.claim}: ${check.detail}`);
  if (!companyKnown) riskSignals.push("Компания не подтверждена пригодным источником.");
  if (!currentPerson) riskSignals.push("Связь человека с компанией не подтверждена.");
  if (!currentRole) riskSignals.push("Текущие полномочия человека не подтверждены.");
  if (report.unavailable_sources.length) riskSignals.push("Часть найденных страниц недоступна.");

  const reviewRequired = qualification !== "HOT" || coverage < 70 || riskSignals.length > 0;
  const positiveSignals = breakdown.filter((item) => item.points > 0).map((item) => item.reason);
  const crmComment = `${qualification}, ${score}/100; подтверждённость ${coverage}/100. ${qualificationReason} ${positiveSignals.join(" ")} ${riskSignals.join(" ")}`.trim();

  return assessmentSchema.parse({
    qualification, score, verification_confidence: verificationConfidence, review_required: reviewRequired,
    qualification_reason: qualificationReason, breakdown, positive_signals: positiveSignals,
    risk_signals: riskSignals, crm_comment: crmComment,
  });
}
