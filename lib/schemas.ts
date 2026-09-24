import { z } from "zod";

const optionalText = z.string().optional();

export const leadSchema = z.object({
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

export type ValidationResult =
  | { status: "empty"; message: null }
  | { status: "invalid"; message: string }
  | { status: "valid"; message: null; lead: Lead };

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
    const issue = result.error.issues[0];
    const field = issue.path.length ? issue.path.join(".") : "корневой объект";
    let message = issue.message;

    if (issue.code === "invalid_type") {
      message = issue.expected === "object"
        ? "нужен JSON-объект с данными лида"
        : issue.expected === "number"
          ? "укажите число"
          : "укажите текстовое значение";
    } else if (issue.code === "too_small") {
      message = field === "lead_id" ? "значение должно быть больше нуля" : "поле не может быть пустым";
    } else if (issue.code === "invalid_format") {
      message = "неверный формат значения";
    }

    return {
      status: "invalid",
      message: `Поле «${field}»: ${message}`,
    };
  }

  return { status: "valid", message: null, lead: result.data };
}
