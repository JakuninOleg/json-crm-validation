import { describeAnalysisError } from "@/lib/analysis-errors";
import { analyzeLead } from "@/lib/openai";
import { describeLeadIssue, leadSchema } from "@/lib/schemas";
import type { AnalysisEvent, AnalysisStage } from "@/lib/schemas";
import { z } from "zod";

export const maxDuration = 120;

const refreshedRequestSchema = z.object({
  lead: leadSchema,
  previous_sources: z.array(z.url()).max(10),
});

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

  const isRefreshRequest = body !== null && typeof body === "object" && "lead" in body && "previous_sources" in body;
  const refreshedRequest = refreshedRequestSchema.safeParse(body);
  if (isRefreshRequest && !refreshedRequest.success) {
    return Response.json(
      { status: "error", code: "INVALID_INPUT", message: "Некорректные данные для повторной проверки." },
      { status: 422 },
    );
  }
  const lead = leadSchema.safeParse(refreshedRequest.success ? refreshedRequest.data.lead : body);
  if (!lead.success) {
    return Response.json(
      { status: "error", code: "INVALID_INPUT", message: describeLeadIssue(lead.error) },
      { status: 422 },
    );
  }

  const abortController = new AbortController();
  const timeoutSignal = AbortSignal.timeout(110_000);
  const signal = AbortSignal.any([request.signal, abortController.signal, timeoutSignal]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let stage: AnalysisStage = "accepted";
      function send(event: AnalysisEvent) {
        if (!request.signal.aborted && !abortController.signal.aborted) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      }

      try {
        send({ status: "progress", stage: "accepted" });
        const result = await analyzeLead(lead.data, (nextStage) => {
          stage = nextStage;
          send({ status: "progress", stage });
        }, signal, refreshedRequest.success ? refreshedRequest.data.previous_sources : []);
        send({ status: "verified", lead_id: lead.data.lead_id, result });
      } catch (error) {
        // Log only diagnostic fields. Provider messages may contain request data.
        const providerStatus = error instanceof Error && "status" in error && typeof error.status === "number"
          ? error.status
          : undefined;
        if (error instanceof Error) {
          console.error("Lead analysis failed", { stage, type: error.name, providerStatus });
        }
        const failure = describeAnalysisError(error, timeoutSignal.aborted, stage);
        send({ status: "error", ...failure });
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
