import { analysisEventSchema, analyzeResponseSchema } from "@/lib/schemas";
import type { AnalysisStage, AnalyzeResponse } from "@/lib/schemas";

export class AnalysisRequestError extends Error {}

export async function readAnalysis(
  response: Response,
  onProgress: (stage: AnalysisStage) => void,
): Promise<Extract<AnalyzeResponse, { status: "verified" }>> {
  if (!response.ok) {
    const error = analyzeResponseSchema.safeParse(await response.json());
    if (error.success && error.data.status === "error") throw new AnalysisRequestError(error.data.message);
    throw new AnalysisRequestError("Сервер не смог проверить лид.");
  }
  if (!response.body) throw new Error("Сервер вернул пустой ответ.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Extract<AnalyzeResponse, { status: "verified" }> | undefined;

  function consume(line: string) {
    if (!line.trim()) return;
    const event = analysisEventSchema.parse(JSON.parse(line));
    if (result) throw new Error("Сервер вернул некорректную последовательность событий.");
    if (event.status === "error") throw new AnalysisRequestError(event.message);
    if (event.status === "progress") onProgress(event.stage);
    if (event.status === "verified") result = event;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.indexOf("\n");
      while (boundary !== -1) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 1);
        boundary = buffer.indexOf("\n");
      }
      if (done) break;
    }
    consume(buffer);
    if (!result) throw new AnalysisRequestError("Соединение прервано до получения результата. Повторите попытку.");
    return result;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
