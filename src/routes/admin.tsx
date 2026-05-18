import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — ACREDIA" }] }),
  component: Admin,
});

function Admin() {
  const { user, loading, primaryRole } = useAuth();
  const navigate = useNavigate();
  const [apps, setApps] = useState<any[]>([]);
  const [curriculum, setCurriculum] = useState<any[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user || primaryRole !== "admin") { navigate({ to: "/dashboard" }); return; }
    supabase.from("applications").select("id, full_name, status, created_at, programs(code)").order("created_at", { ascending: false }).then(({ data }) => setApps(data ?? []));
    supabase.from("curriculum_subjects").select("code, title, units, year_level, semester, programs(code)").order("year_level").order("semester").then(({ data }) => setCurriculum(data ?? []));
  }, [loading, user, primaryRole, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-4xl text-primary-deep">Administration</h1>

        <h2 className="mt-8 font-display text-2xl text-primary-deep">All applications ({apps.length})</h2>
        <Card className="mt-3 divide-y divide-border">
          {apps.map((a) => (
            <Link key={a.id} to="/evaluator/review/$id" params={{ id: a.id }} className="flex items-center justify-between p-4 hover:bg-accent/30">
              <div>
                <p className="font-medium">{a.full_name}</p>
                <p className="text-xs text-muted-foreground">{a.programs?.code} · {new Date(a.created_at).toLocaleDateString()}</p>
              </div>
              <Badge variant="outline">{a.status}</Badge>
            </Link>
          ))}
          {apps.length === 0 && <p className="p-4 text-sm text-muted-foreground">No applications yet.</p>}
        </Card>

        <h2 className="mt-10 font-display text-2xl text-primary-deep">Curriculum ({curriculum.length} subjects)</h2>
        <Card className="mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="p-3 text-left">Program</th><th className="p-3 text-left">Code</th><th className="p-3 text-left">Title</th><th className="p-3">Units</th><th className="p-3">Y/S</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {curriculum.map((c, i) => (
                <tr key={i}>
                  <td className="p-3">{c.programs?.code}</td>
                  <td className="p-3 font-mono text-xs">{c.code}</td>
                  <td className="p-3">{c.title}</td>
                  <td className="p-3 text-center">{c.units}</td>
                  <td className="p-3 text-center">{c.year_level}/{c.semester}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}
