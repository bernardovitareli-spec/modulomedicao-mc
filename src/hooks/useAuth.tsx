import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "gestor_contrato" | "operacional" | "faturamento" | "visualizacao";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  const fetchRoles = async (uid: string) => {
    try {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (error) {
        console.error("[useAuth] fetchRoles error:", error);
        setRoles([]);
      } else {
        setRoles((data?.map((r) => r.role) ?? []) as AppRole[]);
      }
    } catch (e) {
      console.error("[useAuth] fetchRoles exception:", e);
      setRoles([]);
    } finally {
      setRolesLoaded(true);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setRolesLoaded(false);
        setTimeout(() => fetchRoles(s.user.id), 0);
      } else {
        setRoles([]);
        setRolesLoaded(true);
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchRoles(s.user.id);
      } else {
        setRolesLoaded(true);
      }
      setSessionLoaded(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Enquanto a sessão não carregou, ou existe usuário mas roles ainda não foram buscados,
  // mantemos loading=true para evitar redirecionamento prematuro a /aguardando-aprovacao.
  const loading = !sessionLoaded || (!!user && !rolesLoaded);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <AuthContext.Provider value={{ user, session, roles, loading, hasRole, hasAnyRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
