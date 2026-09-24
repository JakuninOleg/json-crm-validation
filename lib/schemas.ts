import { z } from "zod";
import { assessmentSchema } from "@/lib/scoring";
import { verificationReportSchema } from "@/lib/verification";

const optionalText = z.string().optional();

// Quiz submissions may contain additional fields useful for later analysis.
export const leadSchema = z.looseObject({
  lead_id: z.number().int().positive(),
  name: z.string().trim().min(1),
  company_name: z.string().trim().min(1),
  job_title: optionalText,
  company_address: optionalText,
  country: optionalText,
  city: optionalText,
  phone: optionalText,
  email: optionalText,
  website: optionalText,
  experience: optionalText,
  candidate_base: optionalText,
  interested_in: optionalText,
});

export type Lead = z.infer<typeof leadSchema>;

export const analysisResultSchema = verificationReportSchema.extend({ assessment: assessmentSchema });
export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export function toCrmOutput(leadId: number, result: AnalysisResult) {
  const assessment = result.assessment;
  return {
    lead_id: leadId,
    qualification: assessment.qualification,
    qualification_color: { HOT: "green", WARM: "yellow", COLD: "red" }[assessment.qualification],
    score: assessment.score,
    verification_confidence: assessment.verification_confidence,
    ai_comment: assessment.crm_comment,
    review_required: assessment.review_required,
    sources: result.sources,
  };
}

export const analyzeResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("verified"),
    lead_id: z.number().int().positive(),
    result: analysisResultSchema,
  }),
  z.object({
    status: z.literal("error"),
    code: z.enum([
      "INVALID_JSON", "INVALID_INPUT", "API_KEY_MISSING", "API_KEY_INVALID", "API_ACCESS_DENIED",
      "API_CREDITS_EXHAUSTED", "API_SPEND_LIMIT", "API_USAGE_LIMIT", "API_RATE_LIMIT", "API_LIMIT_UNKNOWN", "API_CONNECTION_FAILED",
      "API_TIMEOUT", "CHECK_TIMEOUT", "API_UNAVAILABLE", "API_REQUEST_INVALID", "SEARCH_FAILED", "EVIDENCE_FAILED",
      "RESULT_INVALID", "API_ERROR", "SERVER_ERROR",
    ]),
    message: z.string(),
  }),
]);

export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

export const analysisStageSchema = z.enum(["accepted", "searching", "fetching", "analyzing", "validating", "scoring"]);
export type AnalysisStage = z.infer<typeof analysisStageSchema>;
export const analysisEventSchema = z.union([
  z.object({ status: z.literal("progress"), stage: analysisStageSchema }),
  analyzeResponseSchema,
]);
export type AnalysisEvent = z.infer<typeof analysisEventSchema>;

export type ValidationResult =
  | { status: "empty"; message: null }
  | { status: "invalid"; message: string }
  | { status: "valid"; message: null; lead: Lead };

export function describeLeadIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Проверьте данные лида.";

  const field = issue.path.length ? issue.path.join(".") : "корневой объект";
  let message = issue.message;

  if (issue.code === "invalid_type") {
    if (issue.expected === "object") {
      message = "нужен JSON-объект с данными лида";
    } else if (issue.expected === "int") {
      message = "укажите целое число";
    } else if (issue.expected === "number") {
      message = "укажите число";
    } else {
      message = "укажите текстовое значение";
    }
  } else if (issue.code === "too_small") {
    message = field === "lead_id" ? "значение должно быть больше нуля" : "поле не может быть пустым";
  } else if (issue.code === "invalid_format") {
    message = "неверный формат значения";
  }

  return `Поле «${field}»: ${message}`;
}

export function validateLeadJson(input: string): ValidationResult {
  if (!input.trim()) return { status: "empty", message: null };

  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (error) {
    const detail = error instanceof SyntaxError ? error.message : "неверный формат";
    return { status: "invalid", message: `Ошибка JSON: ${detail}` };
  }

  const result = leadSchema.safeParse(data);
  if (!result.success) {
    return {
      status: "invalid",
      message: describeLeadIssue(result.error),
    };
  }

  return { status: "valid", message: null, lead: result.data };
}
