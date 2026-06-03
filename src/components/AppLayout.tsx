import { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function AppLayout() {
  const { user, session, loading, roles } = useAuth();
  const location = useLocation();
  const [aalChecking, setAalChecking] = useState(true);
  const [needsMfa, setNeedsMfa] = useState(false);

  // Logout por inatividade
  useIdleLogout(!!session);

  // Step-up MFA: se há fator verificado mas sessão é aal1, redireciona p/ challenge
  useEffect(() => {
    let active = true;
    if (!session) { setAalChecking(false); return; }
    (async () => {
      try {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!active) return;
        if (data && data.currentLevel && data.nextLevel && data.currentLevel !== data.nextLevel) {
          setNeedsMfa(true);
        } else {
          setNeedsMfa(false);
        }
      } catch {
        if (active) setNeedsMfa(false);
      } finally {
        if (active) setAalChecking(false);
      }
    })();
    return () => { active = false; };
  }, [session]);

  if (loading || aalChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (roles.length === 0) return <Navigate to="/aguardando-aprovacao" replace />;

  // Exige challenge MFA antes de liberar o resto do app
  if (needsMfa && location.pathname !== "/conta/seguranca") {
    return <Navigate to="/conta/seguranca?challenge=1" replace />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline">Módulo de Medição - MC Terraplenagem</span>
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
