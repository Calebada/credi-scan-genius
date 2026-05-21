import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Flag, FileDown, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { buildReportPDF } from "@/lib/pdf";

export const Route = createFileRoute("/applicant/evaluation/$id")({
  head: () => ({ meta: [{ title: "My evaluation — ACREDIA" }] }),
  component: EvalPage,
});

interface MatchRow {
  id: string;
  confidence: number;
  status: string;
  reason: string | null;
  evaluator_note: string | null;
  flagged_by_applicant: boolean;
  applicant_flag_note: string | null;
  source: string | null;
  tor_subject: { code: string | null; title: string | null; grade: string | null; units: number | null } | null;
  curriculum_subject: { code: string; title: string; units: number } | null;
}

function statusInfo(s: string, conf: number) {
  if (s === "auto_credited" || s === "evaluator_approved" || s === "evaluator_added" || s === "evaluator_overridden")
    return { label: "Credited", color: "bg-success/15 text-success border-success/30", icon: CheckCircle2 };
  if (s === "tentative" || conf >= 60) return { label: "Needs review", color: "bg-warning/20 text-warning-foreground border-warning/40", icon: AlertTriangle };
  return { label: "Not credited", color: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle };
}

function EvalPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [prediction, setPrediction] = useState<any>(null);
  const [program, setProgram] = useState<{ code: string; name: string } | null>(null);
  const [flagOpen, setFlagOpen] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");

  useEffect(() => { if (!authLoading && !user) navigate({ to: "/auth" }); }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    const { data: appData } = await supabase.from("applications").select("*, programs(code,name)").eq("id", id).maybeSingle();
    if (!appData) return;
    setApp(appData);
    setProgram((appData as any).programs);
    const { data: m } = await supabase
      .from("subject_matches")
      .select("id, confidence, status, reason, evaluator_note, flagged_by_applicant, applicant_flag_note, source, tor_subject:tor_subjects(code,title,grade,units), curriculum_subject:curriculum_subjects(code,title,units)")
      .eq("application_id", id);
    setMatches((m as any) ?? []);
    const { data: p } = await supabase.from("predictions").select("*").eq("application_id", id).maybeSingle();
    setPrediction(p);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function flag(matchId: string) {
    const { error } = await supabase
      .from("subject_matches")
      .update({ flagged_by_applicant: true, applicant_flag_note: flagNote })
      .eq("id", matchId);
    if (error) toast.error(error.message);
    else { toast.success("Flagged for evaluator review"); setFlagOpen(null); setFlagNote(""); load(); }
  }

  function downloadPdf() {
    if (!app || !program) return;
    const credited = matches.filter((m) => ["auto_credited", "evaluator_approved", "evaluator_added", "evaluator_overridden"].includes(m.status));
    const notCredited = matches.filter((m) => !["auto_credited", "evaluator_approved", "evaluator_added", "evaluator_overridden"].includes(m.status));
    const creditedIds = new Set(credited.map((m) => m.curriculum_subject?.code).filter(Boolean));
    const blob = buildReportPDF({
      applicantName: app.full_name,
      programCode: program.code,
      programName: program.name,
      generatedAt: new Date().toLocaleString(),
      credited: credited.map((m) => ({
        code: m.curriculum_subject?.code ?? "—",
        title: m.curriculum_subject?.title ?? "—",
        units: m.curriculum_subject?.units ?? 0,
        matchedFrom: `${m.tor_subject?.code ?? ""} ${m.tor_subject?.title ?? ""}`.trim(),
        confidence: Number(m.confidence),
      })),
      notCredited: notCredited.map((m) => ({
        code: m.tor_subject?.code ?? "—",
        title: m.tor_subject?.title ?? "—",
        reason: m.reason ?? "No close curriculum match",
      })),
      remaining: (prediction?.plan ?? []).flatMap((s: any) => s.subjects),
      forecast: { semestersMin: prediction?.semesters_min ?? 0, semestersMax: prediction?.semesters_max ?? 0 },
      evaluatorRemarks: app.evaluator_remarks,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ACREDIA-${app.full_name.replace(/\s+/g, "_")}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!app) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  const totalCredited = matches.filter((m) => ["auto_credited", "evaluator_approved", "evaluator_added", "evaluator_overridden"].includes(m.status))
    .reduce((s, m) => s + (m.curriculum_subject?.units ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl text-primary-deep">Your evaluation</h1>
            <p className="mt-2 text-muted-foreground">{app.full_name} · {program?.code} · status: <span className="font-semibold text-primary">{app.status}</span></p>
          </div>
          <Button onClick={downloadPdf} className="bg-primary text-primary-foreground hover:bg-primary-deep">
            <FileDown className="h-4 w-4" /> Download report
          </Button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Credited units</p>
            <p className="font-display text-4xl text-primary-deep">{totalCredited}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Subjects matched</p>
            <p className="font-display text-4xl text-primary-deep">{matches.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Estimated completion</p>
            <p className="font-display text-4xl text-primary-deep">
              {prediction?.semesters_min ?? "—"}{prediction?.semesters_max && prediction.semesters_max !== prediction.semesters_min ? `–${prediction.semesters_max}` : ""} <span className="text-base text-muted-foreground">sem</span>
            </p>
          </Card>
        </div>

        <Card className="mt-8 overflow-hidden">
          <div className="border-b border-border bg-accent/30 px-5 py-3">
            <h2 className="font-display text-xl text-primary-deep">Subject matches</h2>
          </div>
          <div className="divide-y divide-border">
            {matches.map((m) => {
              const info = statusInfo(m.status, Number(m.confidence));
              const Icon = info.icon;
              return (
                <div key={m.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={info.color + " border"}><Icon className="mr-1 h-3 w-3" />{info.label}</Badge>
                        {m.source === "work_experience" ? (
                          <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary">From work experience</Badge>
                        ) : (
                          <Badge variant="outline" className="border-accent text-foreground">From scanned TOR</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{Number(m.confidence).toFixed(0)}% confidence</span>
                        {m.flagged_by_applicant && <Badge variant="outline" className="border-warning text-warning-foreground">Flagged</Badge>}
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">
                            {m.source === "work_experience" ? "Source" : "From your TOR"}
                          </p>
                          {m.source === "work_experience" ? (
                            <p className="text-sm italic text-muted-foreground">Credited from your work experience / description</p>
                          ) : (
                            <>
                              <p className="font-medium">{m.tor_subject?.code} · {m.tor_subject?.title}</p>
                              <p className="text-xs text-muted-foreground">Grade {m.tor_subject?.grade ?? "—"} · {m.tor_subject?.units ?? "?"} units</p>
                            </>
                          )}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">CIT-U equivalent</p>
                          {m.curriculum_subject ? (
                            <>
                              <p className="font-medium">{m.curriculum_subject.code} · {m.curriculum_subject.title}</p>
                              <p className="text-xs text-muted-foreground">{m.curriculum_subject.units} units</p>
                            </>
                          ) : <p className="text-sm italic text-muted-foreground">No close match</p>}
                        </div>
                      </div>
                      {m.reason && <p className="mt-2 text-xs text-muted-foreground">AI: {m.reason}</p>}
                      {m.evaluator_note && <p className="mt-1 text-xs text-primary"><strong>Evaluator:</strong> {m.evaluator_note}</p>}
                      {m.applicant_flag_note && <p className="mt-1 text-xs text-warning-foreground"><strong>Your note:</strong> {m.applicant_flag_note}</p>}
                    </div>
                    {!m.flagged_by_applicant && (
                      <Button variant="outline" size="sm" onClick={() => setFlagOpen(m.id)}>
                        <Flag className="h-3 w-3" /> Flag
                      </Button>
                    )}
                  </div>
                  {flagOpen === m.id && (
                    <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3">
                      <Textarea value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="Explain why this match should be reviewed…" />
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => flag(m.id)}>Submit flag</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setFlagOpen(null); setFlagNote(""); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {prediction && (
          <Card className="mt-8 p-6">
            <h2 className="font-display text-2xl text-primary-deep">Recommended completion plan</h2>
            <p className="text-sm text-muted-foreground">21 units max per semester · prereqs respected</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(prediction.plan ?? []).map((sem: any) => (
                <div key={sem.semester} className="rounded-lg border border-border bg-card p-4">
                  <p className="font-display text-lg text-primary-deep">Semester {sem.semester} <span className="text-sm text-muted-foreground">· {sem.units} units</span></p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {sem.subjects.map((s: any) => (
                      <li key={s.code}><span className="font-mono text-xs text-primary">{s.code}</span> {s.title} <span className="text-muted-foreground">({s.units})</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
