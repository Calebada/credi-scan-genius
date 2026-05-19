import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callLovableAIJson } from "./ai.server";

/**
 * Reads an uploaded job-description file from the `supporting-documents`
 * bucket, asks Gemini to identify the industry & key skills, then ranks the
 * CIT-U programs by relevance so the applicant can pick the most suitable one.
 */
export const suggestProgramsFromJD = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ filePath: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    // 1. Load programs the school offers
    const { data: programs, error: pErr } = await supabaseAdmin
      .from("programs")
      .select("id, code, name");
    if (pErr || !programs?.length) throw new Error("No programs available");

    // 2. Download the JD file
    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from("supporting-documents")
      .download(data.filePath);
    if (dlErr || !file) throw new Error("Failed to read job description");

    const buf = new Uint8Array(await file.arrayBuffer());
    let b64 = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      b64 += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    b64 = btoa(b64);
    const mime =
      file.type ||
      (data.filePath.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

    const programList = programs
      .map((p) => `- ${p.code}: ${p.name}`)
      .join("\n");

    const prompt = `You are an academic advisor for CIT University.
Read the attached Job Description / role profile and recommend which of the
following CIT-U degree programs best match the candidate's industry and skills.
Return STRICT JSON ONLY in this exact shape:
{
  "industry": "short label e.g. Information Technology",
  "summary": "1 sentence explaining the role",
  "suggestions": [
    {"code": "BSIT", "reason": "why it fits", "score": 0.95}
  ]
}
Score 0..1, highest first, include only programs that genuinely match.

Available programs:
${programList}`;

    const result = await callLovableAIJson<{
      industry?: string;
      summary?: string;
      suggestions: { code: string; reason: string; score: number }[];
    }>({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${b64}` },
            },
          ],
        },
      ],
    });

    // Map suggestions back to program ids
    const byCode = new Map(programs.map((p) => [p.code, p]));
    const enriched = (result.suggestions ?? [])
      .map((s) => {
        const p = byCode.get(s.code);
        if (!p) return null;
        return { id: p.id, code: p.code, name: p.name, reason: s.reason, score: s.score };
      })
      .filter(Boolean);

    return {
      industry: result.industry ?? null,
      summary: result.summary ?? null,
      suggestions: enriched,
    };
  });
