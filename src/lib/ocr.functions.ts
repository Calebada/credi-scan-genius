import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callLovableAIJson } from "./ai.server";

const OCR_PROMPT = `You are an OCR extractor for a college Transcript of Records (TOR).
First, assess legibility. If the scan is blurry, dark, cropped, or otherwise too poor to read reliably, set "quality" to "low" and explain in "quality_reason" (e.g. "image is blurred", "text not readable", "page is cropped"). Otherwise set "quality" to "ok".
Then extract every subject/course listed. For each return: code (e.g. "IT111"), title, grade (string like "1.5", "A", "85"), units (number). If a value is missing, use null. Ignore headers, totals, GPA rows.
Return STRICT JSON only:
{"quality":"ok|low","quality_reason":"...","subjects":[{"code":"...","title":"...","grade":"...","units":3}]}`;

export const runOcrOnTor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid(), torDocumentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error: docErr } = await supabase
      .from("tor_documents")
      .select("id, file_path, application_id")
      .eq("id", data.torDocumentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("TOR document not found");

    // Download file from storage with admin client
    const { data: file, error: dlErr } = await supabaseAdmin.storage.from("tor-documents").download(doc.file_path);
    if (dlErr || !file) throw new Error("Failed to download TOR: " + dlErr?.message);

    const buf = new Uint8Array(await file.arrayBuffer());
    let b64 = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      b64 += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    b64 = btoa(b64);
    const mime = file.type || (doc.file_path.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    const dataUrl = `data:${mime};base64,${b64}`;

    const result = await callLovableAIJson<{
      quality?: "ok" | "low";
      quality_reason?: string;
      subjects: { code: string | null; title: string | null; grade: string | null; units: number | null }[];
    }>({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    if (result.quality === "low") {
      await supabaseAdmin
        .from("tor_documents")
        .update({ ocr_status: "low_quality", ocr_raw: JSON.stringify(result) })
        .eq("id", doc.id);
      throw new Error(
        `Your transcript scan looks unclear (${result.quality_reason ?? "low quality"}). Please re-upload a sharper, well-lit copy.`,
      );
    }

    const subjects = (result.subjects ?? []).filter((s) => s.code || s.title);
    if (subjects.length === 0) {
      await supabaseAdmin.from("tor_documents").update({ ocr_status: "low_quality", ocr_raw: JSON.stringify(result) }).eq("id", doc.id);
      throw new Error("OCR could not detect any subjects. Please re-upload a clearer scan.");
    }

    // Clear previous OCR subjects + matches
    await supabaseAdmin.from("subject_matches").delete().eq("application_id", data.applicationId);
    await supabaseAdmin.from("tor_subjects").delete().eq("application_id", data.applicationId);

    const rows = subjects.map((s) => ({
      application_id: data.applicationId,
      code: s.code,
      title: s.title,
      grade: s.grade,
      units: s.units,
    }));
    const { error: insErr } = await supabaseAdmin.from("tor_subjects").insert(rows);
    if (insErr) throw new Error(insErr.message);
    await supabaseAdmin.from("tor_documents").update({ ocr_status: "done", ocr_raw: JSON.stringify(result) }).eq("id", doc.id);

    return { count: subjects.length };
  });
