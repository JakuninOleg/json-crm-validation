import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPublicSources, readPdf, sourceChunks } from "../lib/source-fetch.ts";

function samplePdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

test("Отменённая загрузка страниц не превращается в пустой список источников", async () => {
  const signal = AbortSignal.abort(new Error("cancelled"));
  await assert.rejects(fetchPublicSources([], signal), /cancelled/);
});

test("Неподдерживаемый адрес возвращает конкретную причину без запроса в сеть", async () => {
  const [result] = await fetchPublicSources(["http://localhost/"], new AbortController().signal);
  assert.equal(result.unavailable, true);
  assert.match(result.reason, /Неподдерживаемый адрес/);
});

test("Длинный текст передаётся на анализ целиком, с перекрытием на границах частей", () => {
  const text = `${"x".repeat(11_750)}${"evidence".repeat(100)}${"y".repeat(12_000)}`;
  const chunks = sourceChunks([{ id: "s1", url: "https://example.com/about", text }]);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.id === "s1" && chunk.text.length <= 12_000));
  assert.ok(chunks.some((chunk) => chunk.text.includes("evidence".repeat(50))));
  let reconstructed = chunks[0].text;
  for (const chunk of chunks.slice(1)) reconstructed += chunk.text.slice(600);
  assert.equal(reconstructed, text);
});

test("PDF с текстом извлекается для анализа", async () => {
  const text = "On-Line Dynamics Limited confirms Wale O-Michael as CEO";
  const extracted = await readPdf(samplePdf(text));
  assert.match(extracted, /On-Line Dynamics Limited confirms Wale O-Michael as CEO/);
});
