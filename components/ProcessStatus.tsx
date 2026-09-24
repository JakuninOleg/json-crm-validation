type ProcessStatusProps = {
  isValid: boolean;
  requestState: "idle" | "sending" | "validated" | "error";
};

export function ProcessStatus({ isValid, requestState }: ProcessStatusProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#dfe3e9] bg-white shadow-[0_1px_2px_rgba(20,26,40,0.04)]">
      <div className="border-b border-[#e7e9ee] px-5 py-4">
        <h2 className="font-mono text-sm font-semibold tracking-tight text-[#2b3342]">PROCESS</h2>
        <p className="mt-1 text-sm text-[#747d8c]">Подготовка данных к анализу</p>
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
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs ${requestState === "validated" ? "bg-emerald-100 text-emerald-800" : requestState === "sending" ? "bg-blue-100 text-blue-800" : "bg-[#edf0f4] text-[#8c96a5]"}`}>
              {requestState === "validated" ? "✓" : "2"}
            </span>
            <div>
              <p className="font-medium text-[#303846]">Данные отправлены</p>
              <p className="mt-0.5 text-[#8a93a1]">
                {requestState === "validated"
                  ? "Сервер проверил формат лида"
                  : requestState === "sending"
                    ? "Ожидаем ответ сервера"
                    : "После нажатия «Проверить лид»"}
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#edf0f4] text-xs text-[#8c96a5]">3</span>
            <div>
              <p className="font-medium text-[#7f8997]">Публичные источники и скоринг</p>
              <p className="mt-0.5 text-[#9aa3af]">Подключим на следующем этапе</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
