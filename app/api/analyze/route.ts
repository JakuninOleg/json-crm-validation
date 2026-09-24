import { analyzeLead, InvalidAnalysisError } from "@/lib/openai";
import { describeLeadIssue, leadSchema } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;

  try {
    const rawBody = await request.text();
    if (rawBody.length > 12_000) {
      return Response.json(
        { status: "error", code: "INVALID_INPUT", message: "JSON лида слишком большой." },
        { status: 413 },
      );
    }
    body = JSON.parse(rawBody);
  } catch {
    return Response.json(
      { status: "error", code: "INVALID_JSON", message: "Отправлен некорректный JSON." },
      { status: 400 },
    );
  }

  const lead = leadSchema.safeParse(body);
  if (!lead.success) {
    return Response.json(
      { status: "error", code: "INVALID_INPUT", message: describeLeadIssue(lead.error) },
      { status: 422 },
    );
  }

  try {
    const result = await analyzeLead(lead.data);
    return Response.json({ status: "analyzed", lead_id: lead.data.lead_id, result });
  } catch (error) {
    if (error instanceof InvalidAnalysisError) {
      return Response.json(
        { status: "error", code: "AI_INVALID_RESULT", message: "Не удалось получить достоверный результат анализа." },
        { status: 502 },
      );
    }

    return Response.json(
      { status: "error", code: "OPENAI_ERROR", message: "Сервис анализа временно недоступен. Повторите попытку позже." },
      { status: 502 },
    );
  }
}
