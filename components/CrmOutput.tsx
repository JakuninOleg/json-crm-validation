"use client";

import { useState } from "react";
import { toCrmOutput } from "@/lib/schemas";
import type { AnalysisResult } from "@/lib/schemas";

type CrmOutputProps = {
  leadId: number;
  result: AnalysisResult;
};

type CopyState = { text: string; status: "copied" | "error" } | null;

export function CrmOutput({ leadId, result }: CrmOutputProps) {
  const [copyState, setCopyState] = useState<CopyState>(null);
  const output = toCrmOutput(leadId, result);
  const json = JSON.stringify(output, null, 2);
  const currentCopyStatus = copyState?.text === json ? copyState.status : null;

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopyState({ text: json, status: "copied" });
    } catch {
      setCopyState({ text: json, status: "error" });
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-[#dfe3e9] bg-white shadow-[0_1px_2px_rgba(20,26,40,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9ee] px-5 py-4">
        <div>
          <h2 className="font-mono text-sm font-semibold tracking-tight text-[#2b3342]">CRM OUTPUT</h2>
          <p className="mt-1 text-sm text-[#747d8c]">Данные для CRM. Отправка не выполняется.</p>
        </div>
        <button
          type="button"
          onClick={copyJson}
          className="rounded-md border border-[#d8dee7] px-3 py-2 text-sm font-medium text-[#384253] hover:bg-[#f4f6f9]"
        >
          {currentCopyStatus === "copied" ? "Скопировано" : "Скопировать JSON"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#1c2430] px-5 py-4 font-mono text-xs leading-6 text-[#dce5f2]"><code>{json}</code></pre>
      {currentCopyStatus === "error" && (
        <p role="status" className="px-5 py-3 text-sm text-red-700">
          Не удалось скопировать JSON. Выделите и скопируйте его вручную.
        </p>
      )}
    </section>
  );
}
