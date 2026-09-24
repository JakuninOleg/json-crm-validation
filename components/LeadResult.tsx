import type { LeadResult as LeadResultData } from "@/lib/schemas";

type LeadResultProps = {
  result: LeadResultData;
};

const qualificationStyles = {
  HOT: "bg-emerald-100 text-emerald-800",
  WARM: "bg-amber-100 text-amber-800",
  COLD: "bg-red-100 text-red-800",
} satisfies Record<LeadResultData["qualification"], string>;

const verificationLabels = {
  confirmed: "Подтверждено источником",
  unconfirmed: "Не подтверждено",
  no_public_confirmation: "Публичного подтверждения не найдено",
} satisfies Record<LeadResultData["verifications"][number]["status"], string>;

const verificationStyles = {
  confirmed: "text-emerald-700",
  unconfirmed: "text-amber-700",
  no_public_confirmation: "text-[#7f8997]",
} satisfies Record<LeadResultData["verifications"][number]["status"], string>;

export function LeadResult({ result }: LeadResultProps) {
  return (
    <section className="min-w-0 rounded-xl border border-[#dfe3e9] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(20,26,40,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-sm font-semibold text-[#2b3342]">RESULT</h2>
        <span className={`rounded-md px-2.5 py-1 font-mono text-xs font-semibold ${qualificationStyles[result.qualification]}`}>
          {result.qualification}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[#e4e8ee] bg-[#fafbfc] p-3">
          <p className="text-xs text-[#748091]">Lead score</p>
          <p className="mt-1 text-2xl font-semibold text-[#263142]">
            {result.score}<span className="ml-1 text-sm font-normal text-[#8c96a5]">/ 100</span>
          </p>
        </div>
        <div className="rounded-lg border border-[#e4e8ee] bg-[#fafbfc] p-3">
          <p className="text-xs text-[#748091]">Verification confidence</p>
          <p className="mt-1 text-2xl font-semibold text-[#263142]">
            {result.verification_confidence}<span className="ml-1 text-sm font-normal text-[#8c96a5]">/ 100</span>
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-5 text-sm">
        <div>
          <h3 className="font-semibold text-[#303846]">Положительные сигналы</h3>
          {result.positive_signals.length ? (
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#5d6878]">
              {result.positive_signals.map((signal, index) => (
                <li key={`${signal}-${index}`}>{signal}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[#7f8997]">Не выявлены.</p>
          )}
        </div>
        <div>
          <h3 className="font-semibold text-[#303846]">Риски</h3>
          {result.risk_signals.length ? (
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#5d6878]">
              {result.risk_signals.map((signal, index) => (
                <li key={`${signal}-${index}`}>{signal}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[#7f8997]">Не выявлены.</p>
          )}
        </div>
        <div>
          <h3 className="font-semibold text-[#303846]">Проверка сведений</h3>
          <ul className="mt-2 space-y-3">
            {result.verifications.map((verification, index) => (
              <li key={`${verification.claim}-${index}`} className="rounded-lg border border-[#e4e8ee] p-3">
                <p className="text-[#3a4554]">{verification.claim}</p>
                <p className={`mt-1 font-medium ${verificationStyles[verification.status]}`}>
                  {verificationLabels[verification.status]}
                </p>
                {verification.source_url && (
                  <a
                    href={verification.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all text-[#2855b8] underline"
                  >
                    {verification.source_url}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-[#303846]">Комментарий для менеджера</h3>
          <p className="mt-2 leading-6 text-[#5d6878]">{result.crm_comment}</p>
        </div>
        <div>
          <h3 className="font-semibold text-[#303846]">Источники</h3>
          {result.sources.length ? (
            <ul className="mt-2 space-y-1">
              {result.sources.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-[#2855b8] underline">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[#7f8997]">Публичных источников не найдено.</p>
          )}
        </div>
      </div>
    </section>
  );
}
