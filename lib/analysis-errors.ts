import OpenAI from "openai";
import type { AnalysisStage } from "@/lib/schemas";

export type AnalysisFailureCode =
  | "API_KEY_MISSING"
  | "API_KEY_INVALID"
  | "API_ACCESS_DENIED"
  | "API_CREDITS_EXHAUSTED"
  | "API_SPEND_LIMIT"
  | "API_USAGE_LIMIT"
  | "API_RATE_LIMIT"
  | "API_LIMIT_UNKNOWN"
  | "API_CONNECTION_FAILED"
  | "API_TIMEOUT"
  | "CHECK_TIMEOUT"
  | "API_UNAVAILABLE"
  | "API_REQUEST_INVALID"
  | "API_ERROR"
  | "SEARCH_FAILED"
  | "EVIDENCE_FAILED"
  | "RESULT_INVALID"
  | "SERVER_ERROR";

export class AnalysisError extends Error {
  readonly code: AnalysisFailureCode;

  constructor(code: AnalysisFailureCode) {
    super(code);
    this.code = code;
  }
}

const messages: Record<AnalysisFailureCode, string> = {
  API_KEY_MISSING: "На сервере не задан OPENAI_API_KEY. Добавьте ключ в переменные окружения.",
  API_KEY_INVALID: "OpenAI отклонил API-ключ. Проверьте, что ключ действителен и относится к нужному проекту.",
  API_ACCESS_DENIED: "OpenAI запретил доступ. Проверьте разрешения ключа, доступность модели и ограничения проекта.",
  API_CREDITS_EXHAUSTED: "На балансе OpenAI закончились средства. Пополните баланс проекта.",
  API_SPEND_LIMIT: "Достигнут лимит расходов OpenAI для проекта или организации. Проверьте лимиты в настройках.",
  API_USAGE_LIMIT: "Достигнут лимит использования OpenAI для организации. Проверьте лимиты проекта.",
  API_RATE_LIMIT: "OpenAI временно ограничил частоту запросов. Подождите и повторите проверку.",
  API_LIMIT_UNKNOWN: "OpenAI отклонил запрос из-за лимита (429). Проверьте баланс, квоты и частоту запросов.",
  API_CONNECTION_FAILED: "Сервер не смог подключиться к OpenAI. Проверьте соединение и повторите попытку.",
  API_TIMEOUT: "OpenAI не ответил вовремя. Повторите проверку позже.",
  CHECK_TIMEOUT: "Проверка превысила время ожидания сервера. Повторите попытку позже.",
  API_UNAVAILABLE: "Сервис OpenAI временно недоступен. Повторите проверку позже.",
  API_REQUEST_INVALID: "OpenAI отклонил запрос. Проверьте настройки модели и доступ к web search.",
  API_ERROR: "OpenAI вернул ошибку при обработке запроса. Повторите проверку или проверьте настройки проекта.",
  SEARCH_FAILED: "Поиск публичных источников не завершился. Повторите проверку позже.",
  EVIDENCE_FAILED: "Модель не смогла разобрать найденные страницы в ожидаемом формате. Повторите проверку.",
  RESULT_INVALID: "Не удалось проверить итоговые данные анализа. Результат не сохранён.",
  SERVER_ERROR: "На сервере произошла ошибка при проверке лида. Повторите попытку позже.",
};

function failure(code: AnalysisFailureCode, stage?: AnalysisStage) {
  if (code !== "SERVER_ERROR" || !stage) return { code, message: messages[code] };
  const stageLabels: Record<AnalysisStage, string> = {
    accepted: "приёма заявки", searching: "поиска источников", fetching: "загрузки страниц",
    analyzing: "анализа доказательств", validating: "сопоставления сведений", scoring: "расчёта оценки",
  };
  return { code, message: `Ошибка сервера на этапе ${stageLabels[stage]}. Повторите попытку позже.` };
}

export function describeAnalysisError(error: unknown, timedOut = false, stage?: AnalysisStage) {
  if (timedOut) return failure("CHECK_TIMEOUT");
  if (error instanceof AnalysisError) return failure(error.code, stage);
  if (error instanceof OpenAI.APIConnectionTimeoutError) return failure("API_TIMEOUT");
  if (error instanceof OpenAI.APIConnectionError) return failure("API_CONNECTION_FAILED");
  if (error instanceof OpenAI.APIError) {
    if (error.code === "ip_not_authorized") return failure("API_ACCESS_DENIED");
    if (error.status === 401) return failure("API_KEY_INVALID");
    if (error.status === 403 || error.status === 404) return failure("API_ACCESS_DENIED");
    if (error.status === 429) {
      if (error.code === "credit_balance_exhausted") return failure("API_CREDITS_EXHAUSTED");
      if (error.code === "project_spend_limit_exceeded" || error.code === "organization_spend_limit_exceeded") {
        return failure("API_SPEND_LIMIT");
      }
      if (error.code === "organization_usage_limit_exceeded") return failure("API_USAGE_LIMIT");
      if (error.code === "rate_limit_exceeded" || error.code === "slow_down" || error.type === "rate_limit_error") {
        return failure("API_RATE_LIMIT");
      }
      return failure("API_LIMIT_UNKNOWN");
    }
    if (error.status === 400 || error.status === 422) return failure("API_REQUEST_INVALID");
    if (error.status && error.status >= 500) return failure("API_UNAVAILABLE");
    return failure("API_ERROR");
  }
  return failure("SERVER_ERROR", stage);
}
