import { describeLeadIssue, leadSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "error", code: "INVALID_JSON", message: "Отправлен некорректный JSON." },
      { status: 400 },
    );
  }

  const lead = leadSchema.safeParse(body);
  if (!lead.success) {
    return Response.json(
      { status: "error", code: "INVALID_INPUT", message: describeLeadIssue(lead.error) },
      { status: 422 },
    );
  }

  // The next iteration will analyze this validated lead with OpenAI.
  return Response.json({ status: "validated", lead_id: lead.data.lead_id });
}
