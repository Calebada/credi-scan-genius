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

const WORK_PROMPT = `You are an academic credit evaluator for an ETEEAP (work-experience-based credit) program.
Given the applicant's work history/description and a list of curriculum subjects NOT YET CREDITED from their TOR,
identify curriculum subjects that the applicant has clearly demonstrated competency in through actual work experience.
Rules:
- Only credit if the work directly maps to the subject's typical content (e.g. 5 years as Web Designer -> Web Design course).
- confidence >=85 = strong evidence (multiple years in a directly-related role); 60-84 = partial; <60 = do not include.
- Provide a 1-sentence "reason" citing the specific work that justifies the credit.
- Be conservative — only credit when evidence is clear.
Return STRICT JSON:
{"credits":[{"curriculum_subject_id":"...","confidence":0-100,"reason":"short"}]}`;

export const runMatching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      applicationId: z.string().uuid(),
      workText: z.string().max(5000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("id, program_id, prior_program")
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
        source: "tor",
      };
    });

    await supabaseAdmin.from("subject_matches").delete().eq("application_id", data.applicationId);
    const { error } = await supabaseAdmin.from("subject_matches").insert(rows);
    if (error) throw new Error(error.message);

    /* ---------- Work-experience credit pass ---------- */
    const workText = (data.workText ?? app.prior_program ?? "").trim();
    let workCredited = 0;
    if (workText) {
      const alreadyCreditedCurr = new Set(
        rows
          .filter((r) => r.curriculum_subject_id && (r.status === "auto_credited" || r.status === "tentative"))
          .map((r) => r.curriculum_subject_id as string),
      );
      const remaining = curSubs.filter((c) => !alreadyCreditedCurr.has(c.id));
      if (remaining.length) {
        try {
          const workAi = await callLovableAIJson<{
            credits: { curriculum_subject_id: string; confidence: number; reason: string }[];
          }>({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: WORK_PROMPT },
              {
                role: "user",
                content: JSON.stringify({
                  work_experience: workText,
                  curriculum_subjects: remaining.map((c) => ({
                    id: c.id,
                    code: c.code,
                    title: c.title,
                    description: c.description,
                    units: c.units,
                  })),
                }),
              },
            ],
          });
          const workRows = (workAi.credits ?? [])
            .filter((c) => c.confidence >= 60 && remaining.some((r) => r.id === c.curriculum_subject_id))
            .map((c) => ({
              application_id: data.applicationId,
              tor_subject_id: null,
              curriculum_subject_id: c.curriculum_subject_id,
              confidence: c.confidence,
              status: c.confidence >= 85 ? ("auto_credited" as const) : ("tentative" as const),
              reason: c.reason ?? null,
              source: "work_experience",
            }));
          if (workRows.length) {
            const { error: wErr } = await supabaseAdmin.from("subject_matches").insert(workRows);
            if (wErr) throw new Error(wErr.message);
            workCredited = workRows.length;
          }
        } catch (e) {
          // Don't fail the whole matching if work-experience pass fails
          console.error("work-credit pass failed", e);
        }
      }
    }

    // Update application status (consider all rows)
    const anyReview =
      rows.some((r) => r.status !== "auto_credited") || workCredited > 0;
    await supabaseAdmin
      .from("applications")
      .update({ status: anyReview ? "pending_review" : "auto_finalized" })
      .eq("id", data.applicationId);

    return { matched: rows.length, work_credited: workCredited };
  });
