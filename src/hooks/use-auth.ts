import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "applicant" | "evaluator" | "admin";

export interface AcrediaUser {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  profile: { full_name: string | null; email: string | null } | null;
}

export function useAuth(): AcrediaUser & {
  hasRole: (r: AppRole) => boolean;
  primaryRole: AppRole | null;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<AcrediaUser["profile"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadRolesAndProfile(s.user.id), 0);
      } else {
        setRoles([]);
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadRolesAndProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    async function loadRolesAndProfile(uid: string) {
      const [{ data: roleRows }, { data: prof }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("full_name,email").eq("id", uid).maybeSingle(),
      ]);
      setRoles((roleRows ?? []).map((r) => r.role as AppRole));
      setProfile(prof ?? null);
    }

    return () => sub.subscription.unsubscribe();
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const primaryRole: AppRole | null = roles.includes("admin")
    ? "admin"
    : roles.includes("evaluator")
      ? "evaluator"
      : roles.includes("applicant")
        ? "applicant"
        : null;

  return { user, session, loading, roles, profile, hasRole, primaryRole };
}
