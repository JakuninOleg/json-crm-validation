"use client";

import { useMemo, useState } from "react";
import { JsonInput } from "@/components/JsonInput";
import { ProcessStatus } from "@/components/ProcessStatus";
import { exampleLead } from "@/lib/example-lead";
import { validateLeadJson } from "@/lib/schemas";

export default function Home() {
  const [input, setInput] = useState("");
  const [isPrepared, setIsPrepared] = useState(false);
  const validation = useMemo(() => validateLeadJson(input), [input]);

  function updateInput(value: string) {
    setInput(value);
    setIsPrepared(false);
  }

  function formatInput() {
    try {
      updateInput(JSON.stringify(JSON.parse(input), null, 2));
    } catch {
      // The validation message beside the editor explains the syntax error.
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
          <span className="rounded-md border border-[#d9dee6] bg-white px-3 py-1.5 font-mono text-xs text-[#687384]">Демо · этап 1</span>
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
                disabled={validation.status !== "valid"}
                onClick={() => setIsPrepared(true)}
                className="rounded-md bg-[#2855b8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#21499f] disabled:cursor-not-allowed disabled:bg-[#aab5c6]"
              >
                Проверить лид
              </button>
              <p className="text-sm text-[#818b99]">На этом этапе проверяются только данные JSON.</p>
            </div>
          </div>

          <div className="space-y-4">
            <ProcessStatus isValid={validation.status === "valid"} isPrepared={isPrepared} />
            <section className="rounded-xl border border-dashed border-[#d6dce4] bg-[#fbfcfd] px-6 py-8">
              <h2 className="font-mono text-sm font-semibold text-[#6e7887]">RESULT</h2>
              <p className="mt-4 text-sm font-medium text-[#384253]">
                {isPrepared ? "Лид готов к анализу" : "Результат появится после проверки"}
              </p>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-[#8791a0]">
                {isPrepared
                  ? "Поиск публичных источников и AI-скоринг подключим в следующей итерации."
                  : "Сначала загрузите пример или вставьте JSON лида слева."}
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
