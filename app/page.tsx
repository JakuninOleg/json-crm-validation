"use client";

import { useMemo, useRef, useState } from "react";
import { JsonInput } from "@/components/JsonInput";
import { ProcessStatus } from "@/components/ProcessStatus";
import { exampleLead } from "@/lib/example-lead";
import { analyzeResponseSchema, validateLeadJson } from "@/lib/schemas";

export default function Home() {
  const [input, setInput] = useState("");
  const [requestState, setRequestState] = useState<"idle" | "sending" | "validated" | "error">("idle");
  const [requestError, setRequestError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const validation = useMemo(() => validateLeadJson(input), [input]);

  function updateInput(value: string) {
    requestVersion.current += 1;
    setInput(value);
    setRequestState("idle");
    setRequestError(null);
  }

  function formatInput() {
    try {
      updateInput(JSON.stringify(JSON.parse(input), null, 2));
    } catch {
      // The validation message beside the editor explains the syntax error.
    }
  }

  async function analyzeLead() {
    if (validation.status !== "valid") return;

    const version = ++requestVersion.current;
    setRequestState("sending");
    setRequestError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.lead),
      });
      const data = analyzeResponseSchema.safeParse(await response.json());

      if (version !== requestVersion.current) return;
      if (!data.success) throw new Error("Некорректный ответ сервера.");
      if (data.data.status === "error") throw new Error(data.data.message);

      setRequestState("validated");
    } catch (error) {
      if (version !== requestVersion.current) return;
      setRequestState("error");
      setRequestError(error instanceof Error ? error.message : "Не удалось проверить лид. Повторите попытку.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-7 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5 border-b border-[#e0e4ea] pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#202a3a] font-mono text-sm font-bold text-white">W</span>
              <span className="text-sm font-semibold text-[#313947]">Worrki / Lead Check</span>
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-[#202735] sm:text-[30px]">Проверка лида</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#6f7887]">
              Вставьте JSON заявки, чтобы проверить формат данных перед анализом.
            </p>
          </div>
          <span className="rounded-md border border-[#d9dee6] bg-white px-3 py-1.5 font-mono text-xs text-[#687384]">Демо · этап 2</span>
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
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={validation.status !== "valid" || requestState === "sending"}
                onClick={analyzeLead}
                className="rounded-md bg-[#2855b8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#21499f] disabled:cursor-not-allowed disabled:bg-[#aab5c6]"
              >
                {requestState === "sending" ? "Проверяем..." : "Проверить лид"}
              </button>
              <p className="text-sm text-[#818b99]">На этом этапе сервер проверяет данные лида.</p>
            </div>
          </div>

          <div className="space-y-4">
            <ProcessStatus isValid={validation.status === "valid"} requestState={requestState} />
            <section className="rounded-xl border border-dashed border-[#d6dce4] bg-[#fbfcfd] px-6 py-8">
              <h2 className="font-mono text-sm font-semibold text-[#6e7887]">RESULT</h2>
              <p className="mt-4 text-sm font-medium text-[#384253]">
                {requestState === "validated"
                  ? "Лид принят сервером"
                  : requestState === "error"
                    ? "Не удалось проверить лид"
                    : "Результат появится после проверки"}
              </p>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-[#8791a0]">
                {requestError ?? (requestState === "validated"
                  ? "Данные прошли серверную проверку. Поиск источников и AI-скоринг подключим в следующей итерации."
                  : "Сначала загрузите пример или вставьте JSON лида слева.")}
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
