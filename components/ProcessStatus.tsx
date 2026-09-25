import type { AnalysisStage } from "@/lib/schemas";

export type RequestState = "idle" | "checking_cache" | "cached" | "sending" | "verified" | "error";
export type CacheStatus = "idle" | "checking" | "hit" | "miss" | "bypassed" | "unavailable";

type ProcessStatusProps = {
  isValid: boolean;
  requestState: RequestState;
  cacheStatus: CacheStatus;
  cachedAt?: string;
  stage?: AnalysisStage | "sending";
  error?: string;
  notice?: string;
};

const steps = [
  { title: "JSON проверен", description: "Синтаксис и обязательные поля" },
  { title: "Поиск сохранённого отчёта", description: "Проверяем данные в этом браузере" },
  { title: "Данные отправлены", description: "Сервер принимает заявку" },
  { title: "Поиск публичных источников", description: "Сведения о компании и представителе" },
  { title: "Получение страниц", description: "Открываем страницы, для которых модель привела цитаты" },
  { title: "Анализ доказательств", description: "Сверяем предложенные цитаты с доступными страницами" },
  { title: "Сопоставление с заявкой", description: "Проверяем связь цитат с данными лида" },
  { title: "Оценка лида", description: "Считаем баллы только по принятым доказательствам" },
  { title: "Проверка готова", description: "Статусы фактов и ссылки на источники" },
];

const stageIndexes = { sending: 2, accepted: 3, searching: 3, fetching: 4, analyzing: 5, validating: 6, scoring: 7 };

type StepStatus = "waiting" | "done" | "active" | "error" | "skipped" | "warning";

function getStepStatus(
  index: number, isValid: boolean, requestState: RequestState, cacheStatus: CacheStatus, activeIndex: number,
): StepStatus {
  if (index === 0) return isValid ? "done" : "waiting";
  if (index === 1) {
    if (cacheStatus === "checking") return "active";
    if (cacheStatus === "hit" || cacheStatus === "miss") return "done";
    if (cacheStatus === "bypassed") return "skipped";
    if (cacheStatus === "unavailable") return "warning";
    return "waiting";
  }
  if (requestState === "verified") return "done";
  if (requestState === "sending" || requestState === "error") {
    if (index < activeIndex) return "done";
    if (index === activeIndex) return requestState === "error" ? "error" : "active";
  }
  return "waiting";
}

function getCacheDescription(cacheStatus: CacheStatus, cachedAt?: string) {
  if (cacheStatus === "hit" && cachedAt) {
    return `Отчёт найден, проверка от ${new Date(cachedAt).toLocaleString("ru-RU")}. Новые запросы не выполнялись.`;
  }
  if (cacheStatus === "miss") return "Сохранённого отчёта нет. Запускаем новую проверку.";
  if (cacheStatus === "bypassed") return "Новая проверка: прежний результат не используется; старые ссылки перепроверяются, если они есть.";
  if (cacheStatus === "unavailable") return "Хранилище браузера недоступно. Запускаем новую проверку.";
  return "Проверяем данные в этом браузере";
}

export function ProcessStatus({
  isValid, requestState, cacheStatus, cachedAt, stage = "sending", error, notice,
}: ProcessStatusProps) {
  const activeIndex = stageIndexes[stage];
  const visibleSteps = requestState === "cached" ? steps.slice(0, 2) : steps;
  return (
    <section aria-label="Ход проверки" className="min-w-0 rounded-xl border border-[#dfe3e9] bg-white shadow-[0_1px_2px_rgba(20,26,40,0.04)]">
      <div className="border-b border-[#e7e9ee] px-5 py-4">
        <h2 className="font-mono text-sm font-semibold tracking-tight text-[#2b3342]">PROCESS</h2>
        <p className="mt-1 text-sm text-[#747d8c]">Ход проверки лида</p>
      </div>
      <ol aria-live="polite" className="space-y-6 px-5 py-6">
        {visibleSteps.map((step, index) => {
          const status = getStepStatus(index, isValid, requestState, cacheStatus, activeIndex);
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
          } else if (status === "skipped") {
            icon = "–";
            label = "Не выполнялось";
          } else if (status === "warning") {
            icon = "!";
            style = "bg-amber-100 text-amber-800";
            label = "Недоступно";
          }
          let description = step.description;
          if (index === 1) description = getCacheDescription(cacheStatus, cachedAt);
          if (index === 3 && stage === "accepted" && requestState === "sending") {
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
      {notice && <p role="status" className="border-t border-amber-100 px-5 py-4 text-sm text-amber-800">{notice}</p>}
    </section>
  );
}
