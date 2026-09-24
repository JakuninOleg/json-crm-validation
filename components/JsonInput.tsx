"use client";

type JsonInputProps = {
  value: string;
  onChange: (value: string) => void;
  onFormat: () => void;
  onLoadExample: () => void;
  status: "empty" | "invalid" | "valid";
  error: string | null;
};

const statusLabels = {
  empty: "NO INPUT",
  invalid: "INVALID",
  valid: "VALID",
} satisfies Record<JsonInputProps["status"], string>;

const statusStyles = {
  empty: "bg-[#f2f4f7] text-[#7a8492]",
  invalid: "bg-red-50 text-red-700",
  valid: "bg-emerald-50 text-emerald-700",
} satisfies Record<JsonInputProps["status"], string>;

function getValidationMessage(status: JsonInputProps["status"], error: string | null) {
  if (error) return <p id="json-error" className="text-red-700">{error}</p>;
  if (status === "valid") return <p className="text-emerald-700">JSON и обязательные поля лида проверены.</p>;

  return <p className="text-[#818a98]">Обязательные поля: lead_id, name, company_name.</p>;
}

function canFormatJson(value: string) {
  if (!value.trim()) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function JsonInput({
  value,
  onChange,
  onFormat,
  onLoadExample,
  status,
  error,
}: JsonInputProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-[#dfe3e9] bg-white shadow-[0_1px_2px_rgba(20,26,40,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9ee] px-5 py-4">
        <div>
          <h2 className="font-mono text-sm font-semibold tracking-tight text-[#2b3342]">INPUT.JSON</h2>
          <p className="mt-1 text-sm text-[#747d8c]">Вставьте данные лида из квиза</p>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 font-mono text-xs font-semibold ${statusStyles[status]}`}
          aria-live="polite"
        >
          {statusLabels[status]}
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="overflow-hidden rounded-lg border border-[#252d3b] bg-[#161d28]">
          <div className="flex items-center gap-2 border-b border-[#2a3444] px-4 py-2.5 font-mono text-xs text-[#8e9aae]">
            <span className="size-2 rounded-full bg-[#7f8da1]" />
            lead.json
          </div>
          <label htmlFor="lead-json" className="sr-only">JSON лида</label>
          <textarea
            id="lead-json"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={status === "invalid"}
            aria-describedby={error ? "json-error" : undefined}
            placeholder={'{\n  "lead_id": 48291,\n  "name": "...",\n  "company_name": "..."\n}'}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="block min-h-[430px] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-[#dce5f1] placeholder:text-[#64748b] focus:outline-none sm:min-h-[500px]"
          />
        </div>

        <div className="mt-3 min-h-5 text-sm" aria-live="polite">
          {getValidationMessage(status, error)}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onFormat}
            disabled={!canFormatJson(value)}
            className="rounded-md border border-[#dce1e8] bg-white px-3 py-2 text-sm font-medium text-[#343c49] hover:bg-[#f5f7fa] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Форматировать
          </button>
          <button
            type="button"
            onClick={onLoadExample}
            className="rounded-md border border-[#dce1e8] bg-white px-3 py-2 text-sm font-medium text-[#343c49] hover:bg-[#f5f7fa]"
          >
            Загрузить пример
          </button>
        </div>
      </div>
    </section>
  );
}
