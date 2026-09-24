import { z } from "zod";

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

// This is the required AI result from the assignment. The server will use it
// to reject malformed model output before the result reaches the page.
export const leadResultSchema = z.object({
  qualification: z.enum(["HOT", "WARM", "COLD"]),
  score: z.number().int().min(0).max(100),
  verification_confidence: z.number().int().min(0).max(100),
  positive_signals: z.array(z.string().trim().min(1)),
  risk_signals: z.array(z.string().trim().min(1)),
  sources: z.array(z.url().refine((url) => /^https?:\/\//i.test(url))),
  crm_comment: z.string().trim().min(1),
});

export type LeadResult = z.infer<typeof leadResultSchema>;

export function toCrmOutput(leadId: number, result: LeadResult) {
  return {
    lead_id: leadId,
    qualification: result.qualification,
    qualification_color: {
      HOT: "green",
      WARM: "yellow",
      COLD: "red",
    }[result.qualification],
    score: result.score,
    verification_confidence: result.verification_confidence,
    ai_comment: result.crm_comment,
  };
}

export const analyzeResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("validated"), lead_id: z.number().int().positive() }),
  z.object({
    status: z.literal("error"),
    code: z.enum(["INVALID_JSON", "INVALID_INPUT"]),
    message: z.string(),
  }),
]);

export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

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
