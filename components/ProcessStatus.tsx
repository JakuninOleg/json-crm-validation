export type RequestState = "idle" | "sending" | "analyzed" | "error";

type ProcessStatusProps = {
  isValid: boolean;
  requestState: RequestState;
};

function getServerStatusText(requestState: RequestState) {
  switch (requestState) {
    case "sending":
      return "Ожидаем ответ сервера";
    case "analyzed":
      return "Результат анализа готов";
    case "error":
      return "Проверка не завершена";
    default:
      return "После нажатия «Проверить лид»";
  }
}

export function ProcessStatus({ isValid, requestState }: ProcessStatusProps) {
  const isSending = requestState === "sending";
  const isAnalyzed = requestState === "analyzed";
  const hasError = requestState === "error";
  let serverStatusStyle = "bg-[#edf0f4] text-[#8c96a5]";
  let serverStatusIcon = "2";

  if (isAnalyzed) {
    serverStatusStyle = "bg-emerald-100 text-emerald-800";
    serverStatusIcon = "✓";
  } else if (isSending) {
    serverStatusStyle = "bg-blue-100 text-blue-800";
  } else if (hasError) {
    serverStatusStyle = "bg-red-100 text-red-800";
    serverStatusIcon = "!";
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#dfe3e9] bg-white shadow-[0_1px_2px_rgba(20,26,40,0.04)]">
      <div className="border-b border-[#e7e9ee] px-5 py-4">
        <h2 className="font-mono text-sm font-semibold tracking-tight text-[#2b3342]">PROCESS</h2>
        <p className="mt-1 text-sm text-[#747d8c]">Проверка данных и поиск источников</p>
      </div>
      <div className="px-5 py-5">
        <ol className="space-y-5 text-sm">
          <li className="flex items-start gap-3">
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs ${isValid ? "bg-emerald-100 text-emerald-800" : "bg-[#edf0f4] text-[#8c96a5]"}`}>
              {isValid ? "✓" : "1"}
            </span>
            <div>
              <p className="font-medium text-[#303846]">JSON проверен</p>
              <p className="mt-0.5 text-[#8a93a1]">Синтаксис и обязательные поля</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs ${serverStatusStyle}`}>
              {serverStatusIcon}
            </span>
            <div>
              <p className="font-medium text-[#303846]">Запрос к серверу</p>
              <p className="mt-0.5 text-[#8a93a1]">{getServerStatusText(requestState)}</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
