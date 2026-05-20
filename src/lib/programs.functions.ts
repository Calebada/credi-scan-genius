import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callLovableAIJson } from "./ai.server";

/**
 * Suggests CIT-U programs that fit an applicant's background. Input can be
 * either an uploaded Job Description file (read from `supporting-documents`),
 * a free-text description of their work history / role, or both.
 */
export const suggestProgramsFromJD = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        filePath: z.string().min(1).optional(),
        workText: z.string().min(1).optional(),
      })
      .refine((v) => v.filePath || v.workText, {
        message: "Provide a job description file or work text",
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // 1. Load programs the school offers
    const { data: programs, error: pErr } = await supabaseAdmin
      .from("programs")
      .select("id, code, name");
    if (pErr || !programs?.length) throw new Error("No programs available");

    const programList = programs
      .map((p) => `- ${p.code}: ${p.name}`)
      .join("\n");

    const promptText = `You are an academic advisor for CIT University.
Recommend which of the following CIT-U degree programs best match this
candidate's industry, skills, and work experience.
Return STRICT JSON ONLY:
{
  "industry": "short label e.g. Information Technology",
  "summary": "1 sentence explaining the candidate's profile",
  "suggestions": [
    {"code": "BSIT", "reason": "why it fits", "score": 0.95}
  ]
}
Score 0..1, highest first. Include only programs that genuinely match.

Available programs:
${programList}

${data.workText ? `Candidate work experience & description:\n${data.workText}\n` : ""}${data.filePath ? "A job description file is also attached." : ""}`;

    const userContent: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: promptText }];

    // Attach JD file if provided
    if (data.filePath) {
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
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${b64}` },
      });
    }

    const result = await callLovableAIJson<{
      industry?: string;
      summary?: string;
      suggestions: { code: string; reason: string; score: number }[];
    }>({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: userContent }],
    });

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
