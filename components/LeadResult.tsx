import type { AnalysisResult } from "@/lib/schemas";
import { getConfidenceBreakdown } from "@/lib/scoring";

type LeadResultProps = { result: AnalysisResult };

const qualificationStyles = {
  HOT: "bg-emerald-100 text-emerald-800",
  WARM: "bg-amber-100 text-amber-800",
  COLD: "bg-red-100 text-red-800",
};

const statusLabels = {
  confirmed: "Подтверждено официальным источником",
  source_claim: "Указано в источнике, независимость не установлена",
  partial_support: "Подтверждена только часть заявления",
  historical: "Найдено только историческое упоминание",
  contradicted: "Найдено противоречие",
  conflict: "Источники противоречат друг другу",
  no_public_confirmation: "Публичного подтверждения не найдено",
  not_provided: "Не заявлено",
} satisfies Record<AnalysisResult["checks"][number]["status"], string>;

const statusStyles = {
  confirmed: "text-emerald-700",
  source_claim: "text-blue-700",
  partial_support: "text-amber-700",
  historical: "text-amber-700",
  contradicted: "text-red-700",
  conflict: "text-red-700",
  no_public_confirmation: "text-[#7f8997]",
  not_provided: "text-[#7f8997]",
} satisfies Record<AnalysisResult["checks"][number]["status"], string>;

const sourceStatusLabels = {
  used: "Использована в выводах",
  read_no_evidence: "Прочитана, но пригодной цитаты, связывающей страницу с лидом, нет",
  read_not_analyzed: "Прочитана, но не вошла в шесть страниц для анализа",
  fetch_failed: "Сервер не смог прочитать страницу",
  not_read: "Не прочитана в этом запуске из-за лимита",
} satisfies Record<AnalysisResult["source_candidates"][number]["status"], string>;

export function LeadResult({ result }: LeadResultProps) {
  const checkedAt = new Date(result.checked_at).toLocaleString("ru-RU");
  const insufficient = result.status === "insufficient_evidence";
  const assessment = result.assessment;
  const qualification = assessment.qualification;
  const confidenceBreakdown = getConfidenceBreakdown(result);

  return (
    <section className="min-w-0 rounded-xl border border-[#dfe3e9] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(20,26,40,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm font-semibold text-[#2b3342]">RESULT</h2>
          <p className="mt-2 text-sm text-[#667283]">Проверено {checkedAt}. Найденные подтверждения привязаны к доступной странице и цитате.</p>
        </div>
        <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${qualificationStyles[qualification]}`}>
          {qualification}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[#e4e8ee] bg-[#fafbfc] p-4">
          <p className="text-xs text-[#748091]">Lead score</p>
          <p className="mt-1 text-2xl font-semibold text-[#303846]">{assessment.score}<span className="ml-1 text-sm font-normal text-[#8791a0]">/ 100</span></p>
          <p className="mt-1 text-xs text-[#667283]">Ценность по найденным признакам</p>
        </div>
        <div className="rounded-lg border border-[#e4e8ee] bg-[#fafbfc] p-4">
          <p className="text-xs text-[#748091]">Verification confidence</p>
          <p className="mt-1 text-2xl font-semibold text-[#303846]">{assessment.verification_confidence}<span className="ml-1 text-sm font-normal text-[#8791a0]">/ 100</span></p>
          <p className="mt-1 text-xs text-[#667283]">Покрытие проверки, не вероятность правдивости</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#566274]">{assessment.qualification_reason}</p>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-[#303846]">Как рассчитан Lead score</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {assessment.breakdown.map((item) => (
            <li key={item.name} className="rounded-lg border border-[#e4e8ee] p-3 text-sm">
              <p className="font-medium text-[#303846]">{item.label}: {item.points}/{item.max}</p>
              <p className="mt-1 text-xs leading-5 text-[#667283]">{item.reason}</p>
              {item.source_url && <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-xs text-[#2855b8] underline">Источник</a>}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-[#303846]">Как рассчитан Verification confidence</h3>
        <p className="mt-1 text-xs leading-5 text-[#667283]">
          Оцениваем покрытие пяти ключевых сведений. Официальный источник даёт полный вес, другое публичное заявление — половину, частичное совпадение — четверть. Сумма округляется до целого балла.
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {confidenceBreakdown.map((item) => (
            <li key={item.label} className="rounded-lg border border-[#e4e8ee] p-3 text-sm">
              <p className="font-medium text-[#303846]">{item.label}: {item.points}/{item.max}</p>
              <p className="mt-1 text-xs leading-5 text-[#667283]">{item.reason}</p>
            </li>
          ))}
        </ul>
      </div>

      {assessment.risk_signals.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-[#303846]">Что нужно уточнить</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#667283]">
            {assessment.risk_signals.map((signal) => <li key={signal}>{signal}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-5 rounded-lg border border-[#dbe3ee] bg-[#f8faff] p-4">
        <h3 className="text-sm font-semibold text-[#303846]">Итог для менеджера</h3>
        <p className="mt-2 text-sm leading-6 text-[#566274]">{assessment.crm_comment}</p>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-[#566274]">
        {insufficient
          ? "Публичных подтверждений мало. Низкий score отражает только найденные сведения и не доказывает, что остальные данные заявки ложные. Результат требует проверки менеджером."
          : "Ниже показано, какие утверждения поддержаны источниками, какие требуют уточнения и для каких публичного подтверждения нет."}
      </p>

      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        {result.checks.map((check) => (
          <li key={check.claim_id} className="rounded-lg border border-[#e4e8ee] bg-[#fafbfc] p-4">
            <p className="text-sm font-semibold text-[#303846]">{check.claim}</p>
            <p className="mt-1 text-xs leading-5 text-[#748091]">В заявке: {check.submitted_value || "не указано"}</p>
            <p className={`mt-2 text-sm font-medium ${statusStyles[check.status]}`}>{statusLabels[check.status]}</p>
            <p className="mt-1 text-xs leading-5 text-[#667283]">{check.detail}</p>
            {check.quote && <blockquote className="mt-2 border-l-2 border-[#cbd5e1] pl-2 text-xs leading-5 text-[#566274]">«{check.quote}»</blockquote>}
            {check.source_url && (
              <a href={check.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-xs text-[#2855b8] underline">
                {check.source_url}
              </a>
            )}
          </li>
        ))}
      </ul>

      {result.source_candidates.length > 0 && (
        <div className="mt-5 border-t border-[#e7e9ee] pt-4">
          <h3 className="text-sm font-semibold text-[#303846]">Как обработаны найденные ссылки</h3>
          <p className="mt-1 text-xs leading-5 text-[#667283]">
            Состав поисковой выдачи может меняться. Сервер читает до 10 страниц, из них до шести передаёт на анализ. Ссылка сама по себе не подтверждает сведения из заявки.
          </p>
          <ul className="mt-2 space-y-2">
            {result.source_candidates.map((candidate) => (
              <li key={candidate.url} className="text-xs">
                <a href={candidate.url} target="_blank" rel="noopener noreferrer" className="break-all text-[#2855b8] underline">{candidate.url}</a>
                <p className="mt-0.5 text-[#667283]">
                  {sourceStatusLabels[candidate.status]}
                  {candidate.origin === "previous" && " · ссылка из прошлого отчёта"}
                  {candidate.status === "fetch_failed" && `: ${result.source_failures.find((item) => item.url === candidate.url)?.reason ?? "причина не сохранена"}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.source_candidates.length === 0 && result.sources.length > 0 && (
        <div className="mt-5 border-t border-[#e7e9ee] pt-4">
          <h3 className="text-sm font-semibold text-[#303846]">Использованные источники</h3>
          <ul className="mt-2 space-y-1">
            {result.sources.map((url) => (
              <li key={url} className="text-xs"><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-[#2855b8] underline">{url}</a></li>
            ))}
          </ul>
        </div>
      )}

      {result.source_candidates.length === 0 && result.unavailable_sources.length > 0 && (
        <div className="mt-5 border-t border-[#e7e9ee] pt-4">
          <h3 className="text-sm font-semibold text-[#303846]">Страницы, которые сервер не смог прочитать</h3>
          <p className="mt-1 text-xs leading-5 text-[#667283]">Сайт может открываться в браузере. Непрочитанная страница не использовалась как доказательство.</p>
          <ul className="mt-2 space-y-2">
            {result.unavailable_sources.map((url) => (
              <li key={url} className="text-xs">
                <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-[#2855b8] underline">{url}</a>
                <p className="mt-0.5 text-[#667283]">
                  {result.source_failures.find((item) => item.url === url)?.reason ?? "Причина не сохранена в этом отчёте."}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
