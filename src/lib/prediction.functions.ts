import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_UNITS = 21;

export const runPrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("program_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found");

    const [{ data: curr }, { data: matches }] = await Promise.all([
      supabaseAdmin.from("curriculum_subjects").select("id, code, title, units, year_level, semester, prereqs").eq("program_id", app.program_id),
      supabaseAdmin.from("subject_matches").select("curriculum_subject_id, status").eq("application_id", data.applicationId),
    ]);
    if (!curr) throw new Error("No curriculum");

    const creditedStatuses = new Set(["auto_credited", "evaluator_approved", "evaluator_added", "evaluator_overridden"]);
    const credited = new Set(
      (matches ?? []).filter((m) => m.curriculum_subject_id && creditedStatuses.has(m.status)).map((m) => m.curriculum_subject_id as string),
    );
    const pending = new Set(
      (matches ?? []).filter((m) => m.curriculum_subject_id && m.status === "tentative").map((m) => m.curriculum_subject_id as string),
    );

    const codeToId = new Map(curr.map((c) => [c.code, c.id]));
    const remaining = curr.filter((c) => !credited.has(c.id));

    // Greedy scheduler respecting prereqs + 21-unit cap.
    const taken = new Set(credited);
    const plan: { semester: number; subjects: { code: string; title: string; units: number }[]; units: number }[] = [];
    let sem = 1;
    const left = new Set(remaining.map((c) => c.id));
    let safety = 20;
    while (left.size && safety-- > 0) {
      const eligible = remaining.filter((c) => left.has(c.id) && c.prereqs.every((p: string) => {
        const pid = codeToId.get(p);
        return !pid || taken.has(pid);
      }));
      if (!eligible.length) break;
      eligible.sort((a, b) => a.year_level - b.year_level || a.semester - b.semester);
      const semSubjects: typeof eligible = [];
      let units = 0;
      for (const e of eligible) {
        if (units + e.units > MAX_UNITS) continue;
        semSubjects.push(e);
        units += e.units;
      }
      semSubjects.forEach((s) => { left.delete(s.id); taken.add(s.id); });
      plan.push({
        semester: sem++,
        units,
        subjects: semSubjects.map((s) => ({ code: s.code, title: s.title, units: s.units })),
      });
    }

    const semestersMin = plan.length;
    const semestersMax = semestersMin + (pending.size > 0 ? 1 : 0);

    await supabaseAdmin.from("predictions").delete().eq("application_id", data.applicationId);
    const { error } = await supabaseAdmin.from("predictions").insert({
      application_id: data.applicationId,
      semesters_min: semestersMin,
      semesters_max: semestersMax,
      plan,
    });
    if (error) throw new Error(error.message);
    return { semestersMin, semestersMax, plan };
  });
