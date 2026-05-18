import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callLovableAIJson } from "./ai.server";

const PROMPT = `You are an academic credit evaluator. Match each "TOR subject" to the best fitting "Curriculum subject" if any.
Rules:
- Compare title, code pattern, typical content, and units.
- A match is good (>=85) only when topics clearly overlap and units differ by <= 1.
- 60-84 = partial / similar; <60 = no real match — return curriculum_subject_id: null.
- One curriculum subject can only be matched to at most one TOR subject (best confidence wins).
Return STRICT JSON:
{"matches":[{"tor_subject_id":"...","curriculum_subject_id":"..."|null,"confidence":0-100,"reason":"short"}]}`;

export const runMatching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("id, program_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found");

    const [{ data: torSubs }, { data: curSubs }] = await Promise.all([
      supabaseAdmin.from("tor_subjects").select("id, code, title, grade, units").eq("application_id", data.applicationId),
      supabaseAdmin.from("curriculum_subjects").select("id, code, title, description, units, year_level, semester").eq("program_id", app.program_id),
    ]);

    if (!torSubs?.length) throw new Error("No TOR subjects to match. Run OCR first.");
    if (!curSubs?.length) throw new Error("Curriculum has no subjects.");

    const ai = await callLovableAIJson<{ matches: { tor_subject_id: string; curriculum_subject_id: string | null; confidence: number; reason: string }[] }>({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            tor_subjects: torSubs,
            curriculum_subjects: curSubs.map((c) => ({ id: c.id, code: c.code, title: c.title, description: c.description, units: c.units })),
          }),
        },
      ],
    });

    // Deduplicate: each curriculum subject only mapped once (keep highest confidence)
    const seen = new Map<string, { conf: number; tor: string }>();
    for (const m of ai.matches) {
      if (!m.curriculum_subject_id) continue;
      const prev = seen.get(m.curriculum_subject_id);
      if (!prev || m.confidence > prev.conf) seen.set(m.curriculum_subject_id, { conf: m.confidence, tor: m.tor_subject_id });
    }

    const rows = ai.matches.map((m) => {
      const useCurr =
        m.curriculum_subject_id &&
        seen.get(m.curriculum_subject_id)?.tor === m.tor_subject_id;
      const conf = useCurr ? m.confidence : m.curriculum_subject_id ? Math.min(m.confidence, 55) : m.confidence;
      const status: "auto_credited" | "tentative" | "rejected" =
        conf >= 85 ? "auto_credited" : conf >= 60 ? "tentative" : "rejected";
      return {
        application_id: data.applicationId,
        tor_subject_id: m.tor_subject_id,
        curriculum_subject_id: useCurr ? m.curriculum_subject_id : null,
        confidence: conf,
        status,
        reason: m.reason ?? null,
      };
    });

    await supabaseAdmin.from("subject_matches").delete().eq("application_id", data.applicationId);
    const { error } = await supabaseAdmin.from("subject_matches").insert(rows);
    if (error) throw new Error(error.message);

    // Update application status
    const anyReview = rows.some((r) => r.status !== "auto_credited");
    await supabaseAdmin
      .from("applications")
      .update({ status: anyReview ? "pending_review" : "auto_finalized" })
      .eq("id", data.applicationId);

    return { matched: rows.length };
  });
