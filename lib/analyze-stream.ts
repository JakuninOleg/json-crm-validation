import { analysisEventSchema, analyzeResponseSchema } from "@/lib/schemas";
import type { AnalysisStage, AnalyzeResponse } from "@/lib/schemas";

export class AnalysisRequestError extends Error {}

export async function readAnalysis(
  response: Response,
  onProgress: (stage: AnalysisStage) => void,
): Promise<Extract<AnalyzeResponse, { status: "verified" }>> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = analyzeResponseSchema.safeParse(body);
    if (error.success && error.data.status === "error") throw new AnalysisRequestError(error.data.message);
    if (response.status === 413) throw new AnalysisRequestError("JSON лида слишком большой для сервера.");
    if (response.status >= 500) throw new AnalysisRequestError("Сервер проверки сейчас недоступен. Повторите попытку позже.");
    throw new AnalysisRequestError(`Сервер отклонил запрос (HTTP ${response.status}). Проверьте данные лида.`);
  }
  if (!response.body) throw new AnalysisRequestError("Сервер не вернул результат проверки. Повторите попытку.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Extract<AnalyzeResponse, { status: "verified" }> | undefined;

  function consume(line: string) {
    if (!line.trim()) return;
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      throw new AnalysisRequestError("Сервер вернул повреждённый ответ. Проверка не завершена.");
    }
    const parsed = analysisEventSchema.safeParse(data);
    if (!parsed.success || result) {
      throw new AnalysisRequestError("Сервер вернул некорректный результат проверки.");
    }
    const event = parsed.data;
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
  } catch (error) {
    if (error instanceof AnalysisRequestError) throw error;
    throw new AnalysisRequestError("Соединение с сервером прервалось во время проверки. Повторите попытку.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
