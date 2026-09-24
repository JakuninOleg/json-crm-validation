"use client";

import { useMemo, useRef, useState } from "react";
import { JsonInput } from "@/components/JsonInput";
import { LeadResult } from "@/components/LeadResult";
import { ProcessStatus } from "@/components/ProcessStatus";
import type { RequestState } from "@/components/ProcessStatus";
import { exampleLead } from "@/lib/example-lead";
import { analyzeResponseSchema, validateLeadJson } from "@/lib/schemas";
import type { LeadResult as LeadResultData } from "@/lib/schemas";

type AnalysisState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "analyzed"; result: LeadResultData }
  | { status: "error"; message: string };

function getResultContent(requestState: RequestState) {
  switch (requestState) {
    case "sending":
      return { title: "Проверяем данные", description: "Ожидаем ответ сервера." };
    case "analyzed":
      return { title: "Анализ готов", description: "Результат анализа лида получен." };
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
  const validation = useMemo(() => validateLeadJson(input), [input]);
  const resultContent = getResultContent(analysis.status);

  function updateInput(value: string) {
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
    setAnalysis({ status: "sending" });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.lead),
      });
      const data = analyzeResponseSchema.safeParse(await response.json());

      if (version !== requestVersion.current) return;
      if (!data.success) {
        setAnalysis({ status: "error", message: "Сервер вернул некорректный ответ." });
        return;
      }
      if (data.data.status === "error") {
        setAnalysis({ status: "error", message: data.data.message });
        return;
      }
      if (!response.ok) {
        setAnalysis({ status: "error", message: "Сервер не смог проверить лид. Повторите попытку." });
        return;
      }

      setAnalysis({ status: "analyzed", result: data.data.result });
    } catch {
      if (version !== requestVersion.current) return;
      setAnalysis({ status: "error", message: "Не удалось завершить проверку. Повторите попытку." });
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
              Вставьте JSON заявки для проверки и оценки лида.
            </p>
          </div>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)]">
          <div className="space-y-4">
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

          <div className="space-y-4">
            <ProcessStatus isValid={validation.status === "valid"} requestState={analysis.status} />
            {analysis.status === "analyzed" ? (
              <LeadResult result={analysis.result} />
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
      </div>
    </main>
  );
}
