import { z } from "zod";
import { analysisResultSchema } from "@/lib/schemas";
import type { AnalysisResult, Lead } from "@/lib/schemas";
import { buildManagerSummary } from "@/lib/scoring";

const databaseName = "worrki-lead-check";
const storeName = "reports";
const pipelineVersion = 3;

const cachedReportSchema = z.object({
  key: z.string(),
  lead_id: z.number().int().positive(),
  pipeline_version: z.number().int().optional(),
  result: analysisResultSchema,
});

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}

export function leadCacheKey(lead: Lead) {
  return JSON.stringify(sortJson(lead));
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function findCachedReport(lead: Lead): Promise<{ result: AnalysisResult; isCurrent: boolean } | null> {
  const database = await openCache();
  try {
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(leadCacheKey(lead));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const parsed = cachedReportSchema.safeParse(stored);
    if (!parsed.success || parsed.data.lead_id !== lead.lead_id) return null;
    if (Number.isNaN(Date.parse(parsed.data.result.checked_at))) return null;
    const result = parsed.data.result;
    result.assessment.crm_comment = buildManagerSummary(result, result.assessment.qualification);
    return { result, isCurrent: parsed.data.pipeline_version === pipelineVersion };
  } finally {
    database.close();
  }
}

export async function saveCachedReport(lead: Lead, result: AnalysisResult): Promise<void> {
  const database = await openCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put({ key: leadCacheKey(lead), lead_id: lead.lead_id, pipeline_version: pipelineVersion, result });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
