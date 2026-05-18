import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { runOcrOnTor } from "@/lib/ocr.functions";
import { runMatching } from "@/lib/matching.functions";
import { runPrediction } from "@/lib/prediction.functions";
import { Upload, Loader2 } from "lucide-react";

export const Route = createFileRoute("/apply")({
  head: () => ({ meta: [{ title: "New application — ACREDIA" }] }),
  component: ApplyPage,
});

function ApplyPage() {
  const { user, loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<{ id: string; code: string; name: string }[]>([]);
  const [programId, setProgramId] = useState("");
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [priorProgram, setPriorProgram] = useState("");
  const [years, setYears] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"form" | "uploading" | "ocr" | "matching" | "predicting">("form");
  const [appId, setAppId] = useState<string | null>(null);

  const ocrFn = useServerFn(runOcrOnTor);
  const matchFn = useServerFn(runMatching);
  const predictFn = useServerFn(runPrediction);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    supabase.from("programs").select("id, code, name").then(({ data }) => {
      if (data) {
        setPrograms(data);
        if (data[0]) setProgramId(data[0].id);
      }
    });
  }, []);

  useEffect(() => { if (profile?.full_name) setFullName(profile.full_name); }, [profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !user) return;
    setStep("uploading");
    try {
      // 1. Insert application
      const { data: app, error } = await supabase
        .from("applications")
        .insert({
          applicant_id: user.id,
          program_id: programId,
          full_name: fullName,
          prior_school: school || null,
          prior_program: priorProgram || null,
          years_experience: years,
          status: "submitted",
        })
        .select("id")
        .single();
      if (error || !app) throw new Error(error?.message ?? "Failed to create application");
      setAppId(app.id);

      // 2. Upload TOR to storage
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `${user.id}/${app.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("tor-documents").upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data: doc, error: docErr } = await supabase
        .from("tor_documents")
        .insert({ application_id: app.id, file_path: path, ocr_status: "pending" })
        .select("id")
        .single();
      if (docErr || !doc) throw new Error(docErr?.message ?? "TOR record failed");

      // 3. OCR
      setStep("ocr");
      toast.info("Extracting subjects from your TOR…");
      await ocrFn({ data: { applicationId: app.id, torDocumentId: doc.id } });

      // 4. Match
      setStep("matching");
      toast.info("Matching against the curriculum…");
      await matchFn({ data: { applicationId: app.id } });

      // 5. Predict
      setStep("predicting");
      await predictFn({ data: { applicationId: app.id } });

      toast.success("Evaluation ready!");
      navigate({ to: "/applicant/evaluation/$id", params: { id: app.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
      setStep("form");
    }
  }

  const busy = step !== "form";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-4xl text-primary-deep">New ETEEAP application</h1>
        <p className="mt-2 text-muted-foreground">Fill in your details and upload your Transcript of Records. The AI will do the rest.</p>

        <Card className="mt-8 p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={busy} />
            </div>
            <div>
              <Label htmlFor="prog">Target CIT-U program</Label>
              <select id="prog" required value={programId} onChange={(e) => setProgramId(e.target.value)} disabled={busy} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="school">Prior school</Label>
                <Input id="school" value={school} onChange={(e) => setSchool(e.target.value)} disabled={busy} />
              </div>
              <div>
                <Label htmlFor="pp">Prior program</Label>
                <Input id="pp" value={priorProgram} onChange={(e) => setPriorProgram(e.target.value)} disabled={busy} />
              </div>
            </div>
            <div>
              <Label htmlFor="years">Years of relevant work experience</Label>
              <Input id="years" type="number" min={0} value={years} onChange={(e) => setYears(parseInt(e.target.value) || 0)} disabled={busy} />
            </div>

            <div className="rounded-lg border-2 border-dashed border-border bg-accent/30 p-6">
              <Label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                <Upload className="h-7 w-7 text-primary" />
                <span className="font-medium text-primary-deep">{file ? file.name : "Upload Transcript of Records"}</span>
                <span className="text-xs text-muted-foreground">PDF, JPG, or PNG</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  required
                  disabled={busy}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Label>
            </div>

            <Button type="submit" size="lg" disabled={busy || !file} className="w-full bg-primary text-primary-foreground hover:bg-primary-deep">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {step === "form" && "Submit & analyze"}
              {step === "uploading" && "Uploading TOR…"}
              {step === "ocr" && "Reading transcript with AI…"}
              {step === "matching" && "Matching subjects…"}
              {step === "predicting" && "Computing forecast…"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
