import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GraduationCap, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function AppHeader() {
  const { user, profile, primaryRole } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="border-b border-border/60 bg-card">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-maroon-gradient">
            <GraduationCap className="h-5 w-5 text-gold" />
          </div>
          <span className="font-display text-xl font-semibold text-primary">ACREDIA</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
          {primaryRole === "applicant" && (
            <Link to="/apply"><Button variant="ghost" size="sm">New application</Button></Link>
          )}
          {(primaryRole === "evaluator" || primaryRole === "admin") && (
            <Link to="/evaluator/queue"><Button variant="ghost" size="sm">Queue</Button></Link>
          )}
          {primaryRole === "admin" && (
            <Link to="/admin"><Button variant="ghost" size="sm">Admin</Button></Link>
          )}
          {user ? (
            <>
              <span className="ml-2 text-xs text-muted-foreground">{profile?.full_name ?? user.email}</span>
              <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Link to="/auth"><Button size="sm">Sign in</Button></Link>
          )}
        </nav>
      </div>
    </header>
  );
}
