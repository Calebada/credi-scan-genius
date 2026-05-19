import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, ClipboardCheck, ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user, loading, profile, primaryRole } = useAuth();
  const navigate = useNavigate();
  const [apps, setApps] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("applications")
      .select("id, full_name, status, created_at, programs(code)")
      .eq("applicant_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setApps(data ?? []));
  }, [user]);

  if (loading || !user) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-6 py-12">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-4xl text-primary-deep">Welcome, {profile?.full_name?.split(" ")[0] ?? "friend"}.</h1>
            <p className="mt-2 text-muted-foreground">Your ACREDIA portal.</p>
          </div>
          <Badge variant="outline" className="capitalize">{primaryRole}</Badge>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Link to="/apply">
            <Card className="p-6 transition hover:border-primary hover:shadow-card">
              <Upload className="h-7 w-7 text-primary" />
              <h2 className="mt-3 font-display text-2xl text-primary-deep">New application</h2>
              <p className="mt-1 text-sm text-muted-foreground">Upload your TOR and get AI-matched in seconds.</p>
              <Button variant="link" className="px-0 text-primary">Start <ArrowRight className="h-4 w-4" /></Button>
            </Card>
          </Link>

          {(primaryRole === "evaluator" || primaryRole === "admin") && (
            <Link to="/evaluator/queue">
              <Card className="p-6 transition hover:border-primary hover:shadow-card">
                <ShieldCheck className="h-7 w-7 text-primary" />
                <h2 className="mt-3 font-display text-2xl text-primary-deep">Department Chair queue</h2>
                <p className="mt-1 text-sm text-muted-foreground">Review and finalize applications.</p>
                <Button variant="link" className="px-0 text-primary">Open queue <ArrowRight className="h-4 w-4" /></Button>
              </Card>
            </Link>
          )}

          {primaryRole === "admin" && (
            <Link to="/admin">
              <Card className="p-6 transition hover:border-primary hover:shadow-card">
                <ClipboardCheck className="h-7 w-7 text-primary" />
                <h2 className="mt-3 font-display text-2xl text-primary-deep">Admin</h2>
                <p className="mt-1 text-sm text-muted-foreground">All applications and curriculum.</p>
                <Button variant="link" className="px-0 text-primary">Open admin <ArrowRight className="h-4 w-4" /></Button>
              </Card>
            </Link>
          )}
        </div>

        <h2 className="mt-12 font-display text-2xl text-primary-deep">My applications</h2>
        <div className="mt-4 space-y-2">
          {apps.length === 0 && <p className="text-sm text-muted-foreground">You haven't submitted any application yet.</p>}
          {apps.map((a) => (
            <Link key={a.id} to="/applicant/evaluation/$id" params={{ id: a.id }}>
              <Card className="flex items-center justify-between p-4 transition hover:border-primary">
                <div>
                  <p className="font-medium">{a.full_name} <span className="text-xs text-muted-foreground">· {a.programs?.code}</span></p>
                  <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                </div>
                <Badge variant="outline" className="capitalize">{a.status.replace("_", " ")}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
