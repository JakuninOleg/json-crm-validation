import type { AnalysisStage } from "@/lib/schemas";

export type RequestState = "idle" | "sending" | "verified" | "error";

type ProcessStatusProps = {
  isValid: boolean;
  requestState: RequestState;
  stage?: AnalysisStage | "sending";
  error?: string;
};

const steps = [
  { title: "JSON проверен", description: "Синтаксис и обязательные поля" },
  { title: "Данные отправлены", description: "Сервер принимает заявку" },
  { title: "Поиск публичных источников", description: "Сведения о компании и представителе" },
  { title: "Получение страниц", description: "Сервер проверяет доступность и содержание" },
  { title: "Анализ доказательств", description: "Модель выделяет точные цитаты из доступных страниц" },
  { title: "Сопоставление с заявкой", description: "Проверяем цитаты и точное совпадение данных" },
  { title: "Оценка лида", description: "Считаем баллы только по принятым доказательствам" },
  { title: "Проверка готова", description: "Статусы фактов и ссылки на источники" },
];

const stageIndexes = { sending: 1, accepted: 2, searching: 2, fetching: 3, analyzing: 4, validating: 5, scoring: 6 };

export function ProcessStatus({ isValid, requestState, stage = "sending", error }: ProcessStatusProps) {
  const activeIndex = stageIndexes[stage];
  return (
    <section aria-label="Ход проверки" className="min-w-0 rounded-xl border border-[#dfe3e9] bg-white shadow-[0_1px_2px_rgba(20,26,40,0.04)]">
      <div className="border-b border-[#e7e9ee] px-5 py-4">
        <h2 className="font-mono text-sm font-semibold tracking-tight text-[#2b3342]">PROCESS</h2>
        <p className="mt-1 text-sm text-[#747d8c]">Ход проверки лида</p>
      </div>
      <ol aria-live="polite" className="space-y-6 px-5 py-6">
        {steps.map((step, index) => {
          let status = "waiting";
          if (requestState === "verified" || (index === 0 && isValid)) status = "done";
          if (requestState === "sending" || requestState === "error") {
            if (index < activeIndex) status = "done";
            if (index === activeIndex) status = requestState === "error" ? "error" : "active";
          }
          let icon = String(index + 1);
          let style = "bg-[#edf0f4] text-[#7a8492]";
          let label = "Ожидает";
          if (status === "done") {
            icon = "✓";
            style = "bg-emerald-100 text-emerald-800";
            label = "Завершено";
          } else if (status === "active") {
            style = "bg-blue-50 text-blue-700";
            label = "Выполняется";
          } else if (status === "error") {
            icon = "×";
            style = "bg-red-100 text-red-800";
            label = "Ошибка";
          }
          let description = step.description;
          if (index === 2 && stage === "accepted" && requestState === "sending") {
            description = "Запрос принят. Ожидаем начало поиска.";
          }
          return (
            <li key={step.title} aria-current={status === "active" ? "step" : undefined} className="flex items-start gap-3">
              <span aria-label={label} className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm ${style}`}>
                {status === "active" ? (
                  <span aria-hidden="true" className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />
                ) : icon}
              </span>
              <div>
                <p className="text-sm font-medium text-[#303846]">{step.title}</p>
                <p className="mt-1 text-sm leading-5 text-[#747d8c]">{description}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {error && <p role="alert" className="border-t border-red-100 px-5 py-4 text-sm text-red-700">{error}</p>}
    </section>
  );
}
