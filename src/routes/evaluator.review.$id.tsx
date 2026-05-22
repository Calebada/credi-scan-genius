import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { runOcrOnTor } from "@/lib/ocr.functions";
import { runMatching } from "@/lib/matching.functions";
import { runPrediction } from "@/lib/prediction.functions";
import { Loader2, Sparkles, FileText } from "lucide-react";

export const Route = createFileRoute("/evaluator/review/$id")({
  head: () => ({ meta: [{ title: "Review application — ACREDIA" }] }),
  component: Review,
});

function Review() {
  const { id } = Route.useParams();
  const { user, loading, primaryRole } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [curriculum, setCurriculum] = useState<any[]>([]);
  const [torUrl, setTorUrl] = useState<string | null>(null);
  const [torDocId, setTorDocId] = useState<string | null>(null);
  const [supportingDocs, setSupportingDocs] = useState<{ id: string; doc_type: string; original_name: string | null; url: string }[]>([]);
  const [remarks, setRemarks] = useState("");
  const [running, setRunning] = useState<null | "ocr" | "matching" | "predicting">(null);
  const ocrFn = useServerFn(runOcrOnTor);
  const matchFn = useServerFn(runMatching);
  const predictFn = useServerFn(runPrediction);

  useEffect(() => {
    if (loading) return;
    if (!user || (primaryRole !== "evaluator" && primaryRole !== "admin")) { navigate({ to: "/dashboard" }); }
  }, [loading, user, primaryRole, navigate]);

  const load = useCallback(async () => {
    const { data: appData } = await supabase.from("applications").select("*, programs(code, name)").eq("id", id).maybeSingle();
    setApp(appData);
    setRemarks(appData?.evaluator_remarks ?? "");
    const { data: m } = await supabase
      .from("subject_matches")
      .select("*, tor_subject:tor_subjects(*), curriculum_subject:curriculum_subjects(*)")
      .eq("application_id", id);
    setMatches(m ?? []);
    if (appData?.program_id) {
      const { data: c } = await supabase.from("curriculum_subjects").select("id, code, title, units").eq("program_id", appData.program_id).order("code");
      setCurriculum(c ?? []);
    }
    const { data: doc } = await supabase.from("tor_documents").select("id, file_path").eq("application_id", id).maybeSingle();
    if (doc) {
      setTorDocId(doc.id);
      const { data: signed } = await supabase.storage.from("tor-documents").createSignedUrl(doc.file_path, 600);
      setTorUrl(signed?.signedUrl ?? null);
    } else {
      setTorDocId(null);
      setTorUrl(null);
    }

    const { data: sup } = await supabase
      .from("supporting_documents")
      .select("id, doc_type, original_name, file_path")
      .eq("application_id", id);
    if (sup) {
      const enriched = await Promise.all(
        sup.map(async (s) => {
          const { data: signed } = await supabase.storage.from("supporting-documents").createSignedUrl(s.file_path, 600);
          return { id: s.id, doc_type: s.doc_type, original_name: s.original_name, url: signed?.signedUrl ?? "" };
        }),
      );
      setSupportingDocs(enriched);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(matchId: string, status: string, curriculumId?: string | null, note?: string) {
    const patch: any = { status };
    if (curriculumId !== undefined) patch.curriculum_subject_id = curriculumId;
    if (note !== undefined) patch.evaluator_note = note;
    const { error } = await supabase.from("subject_matches").update(patch).eq("id", matchId);
    if (error) toast.error(error.message); else { toast.success("Updated"); load(); }
  }

  async function finalize() {
    const { error } = await supabase
      .from("applications")
      .update({ status: "finalized", finalized_at: new Date().toISOString(), evaluator_id: user!.id, evaluator_remarks: remarks })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    await predictFn({ data: { applicationId: id } });
    toast.success("Application finalized");
    navigate({ to: "/evaluator/queue" });
  }

  async function runEvaluation() {
    if (!torDocId) { toast.error("No TOR document uploaded"); return; }
    try {
      setRunning("ocr");
      await ocrFn({ data: { applicationId: id, torDocumentId: torDocId } });
      setRunning("matching");
      await matchFn({ data: { applicationId: id, workText: app?.prior_program ?? undefined } });
      setRunning("predicting");
      await predictFn({ data: { applicationId: id } });
      toast.success("AI evaluation complete");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI evaluation failed");
    } finally {
      setRunning(null);
    }
  }

  if (!app) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-primary-deep">{app.full_name}</h1>
            <p className="text-sm text-muted-foreground">{app.programs?.code} — {app.programs?.name} · status {app.status}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={runEvaluation}
              disabled={running !== null || !torDocId}
              variant="outline"
              className="border-primary text-primary hover:bg-primary/5"
            >
              {running ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {running === "ocr" ? "Reading TOR…" : running === "matching" ? "Matching curriculum…" : "Forecasting…"}</>
              ) : (
                <><Sparkles className="mr-1 h-4 w-4" /> {matches.length ? "Re-run AI evaluation" : "Run AI evaluation"}</>
              )}
            </Button>
            <Button onClick={finalize} className="bg-primary text-primary-foreground hover:bg-primary-deep">Finalize application</Button>
          </div>
        </div>

        {supportingDocs.length > 0 && (
          <Card className="mb-6 p-5">
            <p className="mb-3 font-display text-lg text-primary-deep">Supporting documents</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {supportingDocs.map((d) => (
                <li key={d.id}>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border bg-accent/20 px-3 py-2 text-sm hover:border-primary"
                  >
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{d.original_name ?? d.doc_type}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">{d.doc_type.replace("_", " ")}</Badge>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {matches.length === 0 && (
          <Card className="mb-6 border-dashed p-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 font-display text-lg text-primary-deep">AI evaluation not yet run</p>
            <p className="text-sm text-muted-foreground">
              Click <span className="font-medium">Run AI evaluation</span> above to perform TOR OCR, curriculum matching, and work-experience accreditation.
            </p>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-accent/30 px-4 py-2 font-display text-lg text-primary-deep">TOR document</div>
            {torUrl ? (
              torUrl.match(/\.pdf/i) ? (
                <iframe src={torUrl} className="h-[700px] w-full" />
              ) : (
                <img src={torUrl} alt="TOR" className="max-h-[700px] w-full object-contain" />
              )
            ) : (
              <p className="p-6 text-sm text-muted-foreground">TOR not available.</p>
            )}
          </Card>

          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card px-4 py-3 font-display text-lg text-primary-deep">Subject matches</div>
            {matches.map((m) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm">
                    {m.source === "work_experience" ? (
                      <>
                        <p className="font-medium italic text-muted-foreground">Credit from work experience</p>
                        <p className="text-xs text-muted-foreground">No TOR subject — based on applicant's work history</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">{m.tor_subject?.code} · {m.tor_subject?.title}</p>
                        <p className="text-xs text-muted-foreground">Grade {m.tor_subject?.grade ?? "—"} · {m.tor_subject?.units ?? "?"}u</p>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge>{Number(m.confidence).toFixed(0)}%</Badge>
                    {m.source === "work_experience" ? (
                      <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200">Work exp</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 border border-green-300 hover:bg-green-200">TOR</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">→ {m.curriculum_subject ? `${m.curriculum_subject.code} ${m.curriculum_subject.title}` : "— no match —"}</div>
                {m.flagged_by_applicant && <p className="mt-1 text-xs text-warning-foreground">Applicant flag: {m.applicant_flag_note}</p>}
                {m.reason && <p className="mt-1 text-xs italic text-muted-foreground">AI: {m.reason}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setStatus(m.id, "evaluator_approved")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(m.id, "rejected", null)}>Reject</Button>
                  <select
                    onChange={(e) => e.target.value && setStatus(m.id, "evaluator_overridden", e.target.value)}
                    defaultValue=""
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    <option value="">Override to…</option>
                    {curriculum.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
                  </select>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <Card className="mt-6 p-5">
          <p className="mb-2 font-display text-lg text-primary-deep">Department Chair remarks</p>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Notes that will appear on the final report…" />
        </Card>
      </main>
    </div>
  );
}
