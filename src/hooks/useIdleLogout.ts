import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";

// 8 horas
const IDLE_MS = 8 * 60 * 60 * 1000;

/**
 * Faz logout automático após período de inatividade.
 * Eventos de mouse, teclado, touch e scroll resetam o contador.
 */
export function useIdleLogout(enabled: boolean) {
  const navigate = useNavigate();
  const timerRef = useRef<number | null>(null);
  const lastResetRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled) return;

    const doLogout = async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        notify.message("Sessão expirada por inatividade.", { duration: 6000 });
        navigate("/auth", { replace: true });
      }
    };

    const reset = () => {
      const now = Date.now();
      // debounce: só reagenda se passou > 5s desde o último reset
      if (now - lastResetRef.current < 5000) return;
      lastResetRef.current = now;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(doLogout, IDLE_MS);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [enabled, navigate]);
}
