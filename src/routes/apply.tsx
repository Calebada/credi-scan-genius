import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { suggestProgramsFromJD } from "@/lib/programs.functions";
import { Upload, Loader2, FileText, GraduationCap, Sparkles, CheckCircle2, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/apply")({
  head: () => ({ meta: [{ title: "New application — ACREDIA" }] }),
  component: ApplyPage,
});

type Step = "info" | "documents" | "suggest" | "processing" | "done";

type Suggestion = { id: string; code: string; name: string; reason: string; score: number };

function Uploader({
  label,
  hint,
  file,
  files,
  multiple,
  required,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  file?: File | null;
  files?: File[];
  multiple?: boolean;
  required?: boolean;
  onChange: (f: FileList | null) => void;
  disabled?: boolean;
}) {
  const hasFile = multiple ? (files?.length ?? 0) > 0 : !!file;
  return (
    <div className="rounded-lg border-2 border-dashed border-border bg-accent/20 p-5 transition hover:border-primary/50">
      <Label className="flex cursor-pointer flex-col items-center gap-1.5 text-center">
        {hasFile ? (
          <CheckCircle2 className="h-6 w-6 text-primary" />
        ) : (
          <Upload className="h-6 w-6 text-primary" />
        )}
        <span className="font-medium text-primary-deep">
          {multiple
            ? (files?.length ?? 0) > 0
              ? `${files!.length} file${files!.length > 1 ? "s" : ""} selected`
              : label
            : file?.name ?? label}
        </span>
        <span className="text-xs text-muted-foreground">
          {hint}
          {required ? " · required" : " · optional"}
        </span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          multiple={multiple}
          required={required}
          disabled={disabled}
          className="hidden"
          onChange={(e) => onChange(e.target.files)}
        />
      </Label>
      {multiple && files && files.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {files.map((f, i) => (
            <li key={i}>• {f.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApplyPage() {
  const { user, loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("info");
  const [programs, setPrograms] = useState<{ id: string; code: string; name: string }[]>([]);
  const [programId, setProgramId] = useState("");
  const [fullName, setFullName] = useState("");
  const [workExp, setWorkExp] = useState<{ role: string; years: number }[]>([
    { role: "", years: 0 },
  ]);
  const [workDescription, setWorkDescription] = useState("");

  // documents
  const [tor, setTor] = useState<File | null>(null);
  const [birthCert, setBirthCert] = useState<File | null>(null);
  const [jobDesc, setJobDesc] = useState<File | null>(null);
  const [employmentCerts, setEmploymentCerts] = useState<File[]>([]);
  const [otherCerts, setOtherCerts] = useState<File[]>([]);

  // ai suggestions
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [industryLabel, setIndustryLabel] = useState<string | null>(null);

  // processing
  const [phase, setPhase] = useState<
    | "uploading"
    | "ocr"
    | "matching"
    | "predicting"
    | null
  >(null);

  const ocrFn = useServerFn(runOcrOnTor);
  const matchFn = useServerFn(runMatching);
  const predictFn = useServerFn(runPrediction);
  const suggestFn = useServerFn(suggestProgramsFromJD);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    supabase
      .from("programs")
      .select("id, code, name")
      .then(({ data }) => {
        if (data) {
          setPrograms(data);
          if (data[0] && !programId) setProgramId(data[0].id);
        }
      });
  }, [programId]);

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile]);

  /* ---------------- Step navigation ---------------- */

  function goToDocuments(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    setStep("documents");
  }

  /** Build a free-text summary of the applicant's background for the AI. */
  function buildWorkText(): string {
    const lines = workExp
      .filter((w) => w.role.trim() || w.years > 0)
      .map((w) => `- ${w.role || "Role"} (${w.years || 0} year${w.years === 1 ? "" : "s"})`);
    const parts: string[] = [];
    if (lines.length) parts.push(`Work history:\n${lines.join("\n")}`);
    if (workDescription.trim()) parts.push(`Description:\n${workDescription.trim()}`);
    return parts.join("\n\n");
  }

  /** Run AI suggestions using JD file (if uploaded) and/or work text. */
  async function runSuggestions() {
    if (!user) return;
    setSuggesting(true);
    setStep("suggest");
    setSuggestions(null);
    try {
      let filePath: string | undefined;
      if (jobDesc) {
        const ext = jobDesc.name.split(".").pop()?.toLowerCase() ?? "pdf";
        filePath = `${user.id}/_jd-preview/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("supporting-documents")
          .upload(filePath, jobDesc, { upsert: true });
        if (upErr) throw new Error(upErr.message);
      }

      const workText = buildWorkText();
      if (!filePath && !workText) {
        setSuggestions([]);
        return;
      }

      const res = await suggestFn({ data: { filePath, workText: workText || undefined } });
      setSuggestions(res.suggestions as Suggestion[]);
      setIndustryLabel(res.industry ?? null);
      if (res.suggestions[0]) setProgramId(res.suggestions[0].id);
      toast.success("AI found program matches for your background");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI suggestion failed");
    } finally {
      setSuggesting(false);
    }
  }

  /* ---------------- Final submission ---------------- */

  async function submitAll() {
    if (!tor || !user) {
      toast.error("Transcript of Records is required");
      return;
    }
    setStep("processing");
    setPhase("uploading");

    try {
      const cleanedExp = workExp.filter((w) => w.role.trim() || w.years > 0);
      const totalYears = cleanedExp.reduce((s, w) => s + (w.years || 0), 0);
      const priorProgramText = cleanedExp
        .map((w) => `${w.role || "Role"} (${w.years || 0}y)`)
        .join("; ");

      const { data: app, error } = await supabase
        .from("applications")
        .insert({
          applicant_id: user.id,
          program_id: programId,
          full_name: fullName,
          prior_school: null,
          prior_program: priorProgramText || null,
          years_experience: totalYears,
          status: "submitted",
        })
        .select("id")
        .single();
      if (error || !app) throw new Error(error?.message ?? "Failed to create application");

      // TOR upload
      const ext = tor.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `${user.id}/${app.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("tor-documents")
        .upload(path, tor, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data: doc, error: docErr } = await supabase
        .from("tor_documents")
        .insert({ application_id: app.id, file_path: path, ocr_status: "pending" })
        .select("id")
        .single();
      if (docErr || !doc) throw new Error(docErr?.message ?? "TOR record failed");

      // supporting docs
      const supporting: { file: File; type: "job_description" | "certificate" | "birth_certificate" | "employment_cert" }[] = [];
      if (jobDesc) supporting.push({ file: jobDesc, type: "job_description" });
      if (birthCert) supporting.push({ file: birthCert, type: "birth_certificate" });
      for (const f of employmentCerts) supporting.push({ file: f, type: "employment_cert" });
      for (const f of otherCerts) supporting.push({ file: f, type: "certificate" });

      for (const item of supporting) {
        const sext = item.file.name.split(".").pop()?.toLowerCase() ?? "pdf";
        const spath = `${user.id}/${app.id}/${item.type}-${crypto.randomUUID()}.${sext}`;
        const { error: sUpErr } = await supabase.storage
          .from("supporting-documents")
          .upload(spath, item.file, { upsert: false });
        if (sUpErr) throw new Error(sUpErr.message);
        await supabase.from("supporting_documents").insert({
          application_id: app.id,
          doc_type: item.type,
          file_path: spath,
          original_name: item.file.name,
        });
      }

      setPhase("ocr");
      await ocrFn({ data: { applicationId: app.id, torDocumentId: doc.id } });

      setPhase("matching");
      await matchFn({ data: { applicationId: app.id, workText: buildWorkText() || undefined } });

      setPhase("predicting");
      await predictFn({ data: { applicationId: app.id } });

      toast.success("Evaluation ready!");
      navigate({ to: "/applicant/evaluation/$id", params: { id: app.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
      setStep("suggest");
      setPhase(null);
    }
  }

  const stepIndex = { info: 0, documents: 1, suggest: 2, processing: 3, done: 3 }[step];
  const progress = ((stepIndex + 1) / 4) * 100;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-4xl text-primary-deep">New ETEEAP application</h1>
        <p className="mt-2 text-muted-foreground">
          Complete the wizard below — our AI will analyze your documents and recommend a program.
        </p>

        <div className="mt-6">
          <Progress value={progress} className="h-2" />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span className={step === "info" ? "font-semibold text-primary" : ""}>1. Personal info</span>
            <span className={step === "documents" ? "font-semibold text-primary" : ""}>2. Upload documents</span>
            <span className={step === "suggest" ? "font-semibold text-primary" : ""}>3. Pick program</span>
            <span className={step === "processing" ? "font-semibold text-primary" : ""}>4. AI evaluation</span>
          </div>
        </div>

        {step === "info" && (
          <Card className="mt-8 p-8">
            <form onSubmit={goToDocuments} className="space-y-5">
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Work experience</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWorkExp([...workExp, { role: "", years: 0 }])}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add
                  </Button>
                </div>
                {workExp.map((w, i) => (
                  <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2">
                    <Input
                      placeholder="Role / company"
                      value={w.role}
                      onChange={(e) => {
                        const next = [...workExp];
                        next[i] = { ...next[i], role: e.target.value };
                        setWorkExp(next);
                      }}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Years"
                      value={w.years}
                      onChange={(e) => {
                        const next = [...workExp];
                        next[i] = { ...next[i], years: parseInt(e.target.value) || 0 };
                        setWorkExp(next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={workExp.length === 1}
                      onClick={() => setWorkExp(workExp.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div>
                <Label htmlFor="workdesc">Briefly describe your work</Label>
                <Textarea
                  id="workdesc"
                  rows={4}
                  placeholder="e.g. I worked 5 years in the IT industry as a C programmer, then 2 years as a Computer Engineering teacher."
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Our AI uses this — together with your work list — to recommend the best CIT-U program for you.
                </p>
              </div>
              <Button type="submit" size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary-deep">
                Continue to documents
              </Button>
            </form>
          </Card>
        )}

        {step === "documents" && (
          <Card className="mt-8 space-y-6 p-8">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl text-primary-deep">Required documents</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                The system will verify legibility. Blurry scans will be rejected with feedback to re-upload.
              </p>
            </div>

            <Uploader
              label="Upload Transcript of Records"
              hint="From your last school attended — PDF/JPG/PNG"
              file={tor}
              required
              onChange={(fl) => setTor(fl?.[0] ?? null)}
            />
            <Uploader
              label="Birth Certificate (PSA-authenticated)"
              hint="Scanned PSA copy"
              file={birthCert}
              onChange={(fl) => setBirthCert(fl?.[0] ?? null)}
            />
            <Uploader
              label="Job Description"
              hint="We'll use this to suggest the best CIT-U program for you"
              file={jobDesc}
              onChange={(fl) => setJobDesc(fl?.[0] ?? null)}
            />
            <Uploader
              label="Certifications of Employment"
              hint="With detailed job description certified by HRD — multiple allowed"
              files={employmentCerts}
              multiple
              onChange={(fl) => setEmploymentCerts(Array.from(fl ?? []))}
            />
            <Uploader
              label="Other certificates (trainings, seminars, awards)"
              hint="Optional supporting credentials"
              files={otherCerts}
              multiple
              onChange={(fl) => setOtherCerts(Array.from(fl ?? []))}
            />

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("info")}>Back</Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary-deep"
                onClick={runSuggestions}
                disabled={!tor}
              >
                <Sparkles className="mr-1 h-4 w-4" />
                Analyze background & suggest programs
              </Button>
            </div>
          </Card>
        )}

        {step === "suggest" && (
          <Card className="mt-8 space-y-5 p-8">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl text-primary-deep">Choose your target CIT-U program</h2>
              </div>
              {industryLabel && (
                <p className="text-sm text-muted-foreground">
                  Detected industry: <Badge variant="secondary">{industryLabel}</Badge>
                </p>
              )}
            </div>

            {suggesting && (
              <div className="flex items-center gap-3 rounded-md border border-border bg-accent/30 p-4 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Reading your job description with Gemini…
              </div>
            )}

            {suggestions && suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-primary-deep">AI recommendations:</p>
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setProgramId(s.id)}
                    className={`w-full rounded-lg border-2 p-4 text-left transition ${
                      programId === s.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-display text-lg text-primary-deep">
                        {s.code} — {s.name}
                      </p>
                      <Badge variant="outline">{Math.round(s.score * 100)}% fit</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                  </button>
                ))}
              </div>
            )}

            <div>
              <Label htmlFor="prog">All programs</Label>
              <select
                id="prog"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("documents")}>Back</Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary-deep"
                onClick={submitAll}
                disabled={!programId || !tor}
              >
                Submit & start AI evaluation
              </Button>
            </div>
          </Card>
        )}

        {step === "processing" && (
          <Card className="mt-8 p-10">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-maroon-gradient">
                  <ScanLine className="h-10 w-10 text-gold" />
                </div>
              </div>
              <h2 className="font-display text-2xl text-primary-deep">AI is analyzing your transcript</h2>
              <p className="mt-2 text-muted-foreground">This usually takes 20–40 seconds.</p>

              <div className="mt-8 w-full max-w-md space-y-3 text-left">
                <PhaseRow active={phase === "uploading"} done={phase !== null && phase !== "uploading"} label="Uploading documents to secure storage" />
                <PhaseRow active={phase === "ocr"} done={phase === "matching" || phase === "predicting"} label="Reading TOR with Gemini Vision (OCR + quality check)" />
                <PhaseRow active={phase === "matching"} done={phase === "predicting"} label="Matching against CIT-U curriculum" />
                <PhaseRow active={phase === "predicting"} done={false} label="Forecasting completion plan" />
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

function PhaseRow({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-accent/20 p-3 text-sm">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-primary" />
      ) : active ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <div className="h-4 w-4 rounded-full border border-muted-foreground/40" />
      )}
      <span className={done || active ? "text-primary-deep" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
