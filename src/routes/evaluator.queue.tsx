import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/evaluator/queue")({
  head: () => ({ meta: [{ title: "Evaluator queue — ACREDIA" }] }),
  component: Queue,
});

function Queue() {
  const { user, loading, primaryRole } = useAuth();
  const navigate = useNavigate();
  const [apps, setApps] = useState<any[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (primaryRole !== "evaluator" && primaryRole !== "admin") { navigate({ to: "/dashboard" }); return; }
    supabase
      .from("applications")
      .select("id, full_name, status, created_at, programs(code, name)")
      .in("status", ["pending_review", "submitted", "matching", "auto_finalized"])
      .order("created_at", { ascending: false })
      .then(({ data }) => setApps(data ?? []));
  }, [loading, user, primaryRole, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-display text-4xl text-primary-deep">Evaluator queue</h1>
        <p className="mt-1 text-muted-foreground">Applications awaiting review or finalization.</p>

        <div className="mt-8 space-y-3">
          {apps.length === 0 && <p className="text-muted-foreground">Nothing in the queue.</p>}
          {apps.map((a) => (
            <Link key={a.id} to="/evaluator/review/$id" params={{ id: a.id }}>
              <Card className="flex items-center justify-between p-5 transition hover:border-primary hover:shadow-card">
                <div>
                  <p className="font-display text-xl text-primary-deep">{a.full_name}</p>
                  <p className="text-sm text-muted-foreground">{a.programs?.code} · {new Date(a.created_at).toLocaleDateString()}</p>
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
