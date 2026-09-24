"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { JsonInput } from "@/components/JsonInput";
import { LeadResult } from "@/components/LeadResult";
import { CrmOutput } from "@/components/CrmOutput";
import { ProcessStatus } from "@/components/ProcessStatus";
import type { RequestState } from "@/components/ProcessStatus";
import { AnalysisRequestError, readAnalysis } from "@/lib/analyze-stream";
import { exampleLead } from "@/lib/example-lead";
import { validateLeadJson } from "@/lib/schemas";
import type { AnalysisStage } from "@/lib/schemas";
import type { AnalysisResult } from "@/lib/schemas";

type AnalysisState =
  | { status: "idle" }
  | { status: "sending"; stage: AnalysisStage | "sending" }
  | { status: "verified"; leadId: number; result: AnalysisResult }
  | { status: "error"; stage: AnalysisStage | "sending"; message: string };

function getResultContent(requestState: RequestState) {
  switch (requestState) {
    case "sending":
      return { title: "Проверяем данные", description: "Ожидаем ответ сервера." };
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
  useEffect(() => () => activeRequest.current?.abort(), []);
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

  async function analyzeLead() {
    if (validation.status !== "valid") return;

    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    let stage: AnalysisStage | "sending" = "sending";
    setAnalysis({ status: "sending", stage });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.lead),
        signal: controller.signal,
      });
      const data = await readAnalysis(response, (nextStage) => {
        stage = nextStage;
        if (version === requestVersion.current) setAnalysis({ status: "sending", stage });
      });

      if (version !== requestVersion.current) return;
      setAnalysis({ status: "verified", leadId: data.lead_id, result: data.result });
    } catch (error) {
      if (version !== requestVersion.current) return;
      let message = "В приложении произошла ошибка при обработке проверки. Повторите попытку.";
      if (error instanceof TypeError && stage === "sending") {
        message = "Не удалось подключиться к серверу проверки. Проверьте соединение или попробуйте позже.";
      }
      if (error instanceof AnalysisRequestError) message = error.message;
      setAnalysis({ status: "error", stage, message });
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
                disabled={validation.status !== "valid" || analysis.status === "sending"}
                onClick={analyzeLead}
                className="rounded-md bg-[#2855b8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#21499f] disabled:cursor-not-allowed disabled:bg-[#aab5c6]"
              >
                {analysis.status === "sending" ? "Проверяем..." : "Проверить лид"}
              </button>
            </div>
          </div>

          <ProcessStatus
            isValid={validation.status === "valid"}
            requestState={analysis.status}
            stage={"stage" in analysis ? analysis.stage : undefined}
            error={analysis.status === "error" ? analysis.message : undefined}
          />
        </div>
        <div className="mt-6 min-w-0 space-y-5">
          {analysis.status === "verified" ? (
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
