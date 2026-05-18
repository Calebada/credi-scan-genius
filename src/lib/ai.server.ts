// Server-only helpers for Lovable AI Gateway
export const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function callLovableAI(body: Record<string, unknown>): Promise<Response> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  return fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function callLovableAIJson<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const res = await callLovableAI(body);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = j.choices?.[0]?.message?.content ?? "";
  // try to parse JSON out of content (may include code fences)
  const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // try to find first {...} or [...] block
    const m = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) return JSON.parse(m[1]) as T;
    throw new Error("AI did not return valid JSON: " + cleaned.slice(0, 200));
  }
}
