import assert from "node:assert/strict";
import { test } from "node:test";
import OpenAI from "openai";
import { AnalysisError, describeAnalysisError } from "../lib/analysis-errors.ts";

function providerError(status, code) {
  return OpenAI.APIError.generate(status, { error: { code, message: "provider details" } }, undefined, new Headers());
}

test("Отсутствующий и отклонённый ключ имеют разные понятные ошибки", () => {
  assert.equal(describeAnalysisError(new AnalysisError("API_KEY_MISSING")).code, "API_KEY_MISSING");
  const rejected = describeAnalysisError(providerError(401, "invalid_api_key"));
  assert.equal(rejected.code, "API_KEY_INVALID");
  assert.doesNotMatch(rejected.message, /provider details/);
});

test("Баланс, расходы и частота запросов различаются", () => {
  assert.equal(describeAnalysisError(providerError(429, "credit_balance_exhausted")).code, "API_CREDITS_EXHAUSTED");
  assert.equal(describeAnalysisError(providerError(429, "project_spend_limit_exceeded")).code, "API_SPEND_LIMIT");
  assert.equal(describeAnalysisError(providerError(429, "rate_limit_exceeded")).code, "API_RATE_LIMIT");
  assert.equal(describeAnalysisError(providerError(429, "unknown_limit")).code, "API_LIMIT_UNKNOWN");
});

test("Сбой подключения, сбой OpenAI и неизвестная ошибка сервера не смешиваются", () => {
  assert.equal(describeAnalysisError(new OpenAI.APIConnectionError({})).code, "API_CONNECTION_FAILED");
  assert.equal(describeAnalysisError(providerError(503, "server_is_overloaded")).code, "API_UNAVAILABLE");
  const unexpected = describeAnalysisError(new Error("secret"), false, "scoring");
  assert.equal(unexpected.code, "SERVER_ERROR");
  assert.match(unexpected.message, /расчёта оценки/);
  assert.doesNotMatch(unexpected.message, /secret/);
});

test("Общий таймаут проверки имеет отдельное сообщение", () => {
  assert.equal(describeAnalysisError(new Error("abort"), true).code, "CHECK_TIMEOUT");
});
