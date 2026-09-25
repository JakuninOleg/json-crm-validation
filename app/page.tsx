"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { JsonInput } from "@/components/JsonInput";
import { LeadResult } from "@/components/LeadResult";
import { CrmOutput } from "@/components/CrmOutput";
import { ProcessStatus } from "@/components/ProcessStatus";
import type { CacheStatus, RequestState } from "@/components/ProcessStatus";
import { AnalysisRequestError, readAnalysis } from "@/lib/analyze-stream";
import { exampleLead } from "@/lib/example-lead";
import { findCachedReport, saveCachedReport } from "@/lib/lead-cache";
import { validateLeadJson } from "@/lib/schemas";
import type { AnalysisStage } from "@/lib/schemas";
import type { AnalysisResult } from "@/lib/schemas";

type CompletedCacheStatus = Extract<CacheStatus, "miss" | "bypassed" | "unavailable">;

type AnalysisState =
  | { status: "idle" }
  | { status: "checking_cache" }
  | { status: "cached"; leadId: number; result: AnalysisResult }
  | { status: "sending"; stage: AnalysisStage | "sending"; cacheStatus: CompletedCacheStatus }
  | { status: "verified"; leadId: number; result: AnalysisResult; cacheStatus: CompletedCacheStatus; cacheWarning?: string }
  | { status: "error"; stage: AnalysisStage | "sending"; cacheStatus: CompletedCacheStatus; message: string; wasRefresh: boolean };

function getCacheStatus(analysis: AnalysisState): CacheStatus {
  if (analysis.status === "idle") return "idle";
  if (analysis.status === "checking_cache") return "checking";
  if (analysis.status === "cached") return "hit";
  return analysis.cacheStatus;
}

function getSubmitLabel(analysis: AnalysisState) {
  if (analysis.status === "checking_cache" || analysis.status === "sending") return "Проверяем...";
  if (analysis.status === "cached" || analysis.status === "verified") return "Выполнить проверку заново";
  if (analysis.status === "error" && analysis.wasRefresh) return "Повторить проверку заново";
  return "Проверить лид";
}

function shouldRefresh(analysis: AnalysisState) {
  if (analysis.status === "cached" || analysis.status === "verified") return true;
  return analysis.status === "error" && analysis.wasRefresh;
}

function getResultContent(requestState: RequestState) {
  switch (requestState) {
    case "checking_cache":
      return { title: "Ищем сохранённый отчёт", description: "Проверяем данные в этом браузере." };
    case "sending":
      return { title: "Проверяем данные", description: "Ожидаем ответ сервера." };
    case "cached":
      return { title: "Найден сохранённый отчёт", description: "Новая проверка не запускалась." };
    case "verified":
      return { title: "Проверка готова", description: "Сведения заявки сопоставлены с публичными источниками." };
    case "error":
      return { title: "Не удалось проверить лид", description: "Повторите попытку." };
    default:
      return {
        title: "Результат появится после проверки",
        description: "Загрузите пример или вставьте JSON лида слева.",
      };
  }
}

export default function Home() {
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => {
    requestVersion.current += 1;
    activeRequest.current?.abort();
  }, []);
  const validation = useMemo(() => validateLeadJson(input), [input]);
  const resultContent = getResultContent(analysis.status);

  function updateInput(value: string) {
    activeRequest.current?.abort();
    requestVersion.current += 1;
    setInput(value);
    setAnalysis({ status: "idle" });
  }

  function formatInput() {
    try {
      updateInput(JSON.stringify(JSON.parse(input), null, 2));
    } catch (error) {
      // Invalid syntax is already shown beside the editor.
      if (!(error instanceof SyntaxError)) throw error;
    }
  }

  async function analyzeLead(forceRefresh = false) {
    if (validation.status !== "valid") return;

    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    activeRequest.current = null;
    const lead = validation.lead;
    let cacheStatus: CompletedCacheStatus = forceRefresh ? "bypassed" : "miss";
    let previousSources: string[] = [];

    setAnalysis({ status: "checking_cache" });
    try {
      const cached = await findCachedReport(lead);
      if (version !== requestVersion.current) return;
      if (cached) {
        if (!forceRefresh) {
          setAnalysis({ status: "cached", leadId: lead.lead_id, result: cached });
          return;
        }
        const previouslyRead = cached.source_candidates.filter((candidate) => candidate.status !== "not_read");
        const notRead = cached.source_candidates.filter((candidate) => candidate.status === "not_read");
        const knownUrls = cached.source_candidates.length
          ? [...previouslyRead, ...notRead].map((candidate) => candidate.url)
          : [...cached.sources, ...cached.unavailable_sources];
        previousSources = [...new Set(knownUrls)].slice(0, 10);
      }
    } catch {
      cacheStatus = "unavailable";
    }

    if (version !== requestVersion.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    let stage: AnalysisStage | "sending" = "sending";
    setAnalysis({ status: "sending", stage, cacheStatus });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forceRefresh ? { lead, previous_sources: previousSources } : lead),
        signal: controller.signal,
      });
      const data = await readAnalysis(response, (nextStage) => {
        stage = nextStage;
        if (version === requestVersion.current) setAnalysis({ status: "sending", stage, cacheStatus });
      });

      if (version !== requestVersion.current) return;
      setAnalysis({ status: "verified", leadId: data.lead_id, result: data.result, cacheStatus });
      try {
        await saveCachedReport(lead, data.result);
      } catch {
        if (version === requestVersion.current) {
          setAnalysis({
            status: "verified", leadId: data.lead_id, result: data.result, cacheStatus,
            cacheWarning: "Не удалось сохранить отчёт в браузере. При следующей проверке потребуется новый запрос.",
          });
        }
      }
    } catch (error) {
      if (version !== requestVersion.current) return;
      let message = "В приложении произошла ошибка при обработке проверки. Повторите попытку.";
      if (error instanceof TypeError && stage === "sending") {
        message = "Не удалось подключиться к серверу проверки. Проверьте соединение или попробуйте позже.";
      }
      if (error instanceof AnalysisRequestError) message = error.message;
      setAnalysis({ status: "error", stage, cacheStatus, message, wasRefresh: forceRefresh });
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-7 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-8 border-b border-[#e0e4ea] pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#202a3a] font-mono text-sm font-bold text-white">W</span>
              <span className="text-sm font-semibold text-[#313947]">Worrki / Lead Check</span>
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-[#202735] sm:text-[30px]">Проверка лида</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#6f7887]">
              Вставьте JSON заявки для проверки сведений по публичным источникам.
            </p>
          </div>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)]">
          <div className="min-w-0 space-y-4">
            <JsonInput
              value={input}
              onChange={updateInput}
              onFormat={formatInput}
              onLoadExample={() => updateInput(JSON.stringify(exampleLead, null, 2))}
              status={validation.status}
              error={validation.message}
            />
            <div>
              <button
                type="button"
                disabled={validation.status !== "valid" || analysis.status === "checking_cache" || analysis.status === "sending"}
                onClick={() => analyzeLead(shouldRefresh(analysis))}
                className="rounded-md bg-[#2855b8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#21499f] disabled:cursor-not-allowed disabled:bg-[#aab5c6]"
              >
                {getSubmitLabel(analysis)}
              </button>
            </div>
          </div>

          <ProcessStatus
            isValid={validation.status === "valid"}
            requestState={analysis.status}
            cacheStatus={getCacheStatus(analysis)}
            cachedAt={analysis.status === "cached" ? analysis.result.checked_at : undefined}
            stage={"stage" in analysis ? analysis.stage : undefined}
            error={analysis.status === "error" ? analysis.message : undefined}
            notice={analysis.status === "verified" ? analysis.cacheWarning : undefined}
          />
        </div>
        <div className="mt-6 min-w-0 space-y-5">
          {analysis.status === "verified" || analysis.status === "cached" ? (
            <>
              <LeadResult result={analysis.result} />
              <CrmOutput leadId={analysis.leadId} result={analysis.result} />
            </>
          ) : (
            <section className="rounded-xl border border-dashed border-[#d6dce4] bg-[#fbfcfd] px-6 py-8">
              <h2 className="font-mono text-sm font-semibold text-[#6e7887]">RESULT</h2>
              <p className="mt-4 text-sm font-medium text-[#384253]">{resultContent.title}</p>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-[#8791a0]">
                {analysis.status === "error" ? analysis.message : resultContent.description}
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
