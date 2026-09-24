import { analyzeLead, InvalidAnalysisError } from "@/lib/openai";
import { describeLeadIssue, leadSchema } from "@/lib/schemas";
import type { AnalysisEvent } from "@/lib/schemas";

export const maxDuration = 120;

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

  const abortController = new AbortController();
  const signal = AbortSignal.any([request.signal, abortController.signal, AbortSignal.timeout(110_000)]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: AnalysisEvent) {
        if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }

      try {
        send({ status: "progress", stage: "accepted" });
        const result = await analyzeLead(lead.data, (stage) => send({ status: "progress", stage }), signal);
        send({ status: "verified", lead_id: lead.data.lead_id, result });
      } catch (error) {
        // Log only diagnostic fields. Provider messages may contain request data.
        const providerStatus = error instanceof Error && "status" in error && typeof error.status === "number"
          ? error.status
          : undefined;
        if (error instanceof Error) {
          console.error("Lead analysis failed", { type: error.name, providerStatus });
        }
        let code: "AI_INVALID_RESULT" | "OPENAI_ERROR" = "OPENAI_ERROR";
        let message = providerStatus === 429
          ? "Лимит OpenAI API временно исчерпан. Попробуйте позже."
          : "Сервис анализа временно недоступен. Повторите попытку позже.";
        if (error instanceof InvalidAnalysisError) {
          code = "AI_INVALID_RESULT";
          message = "Не удалось получить достоверный результат анализа.";
        }
        send({ status: "error", code, message });
      } finally {
        if (!abortController.signal.aborted) controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
