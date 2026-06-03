import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { descricaoForca, validarSenha, MIN_LENGTH } from "@/lib/passwordPolicy";

interface Props {
  senha: string;
  className?: string;
}

export function PasswordStrengthMeter({ senha, className }: Props) {
  const v = validarSenha(senha);
  const score = v.score;

  // cor de cada segmento conforme score (0..4) usando tokens semânticos
  const segCor = (idx: number) => {
    if (senha.length === 0) return "bg-muted";
    if (idx >= score) return "bg-muted";
    if (score <= 1) return "bg-destructive";
    if (score === 2) return "bg-warning";
    return "bg-success";
  };

  const textoCor =
    senha.length === 0
      ? "text-muted-foreground"
      : score <= 1
        ? "text-destructive"
        : score === 2
          ? "text-warning"
          : "text-success";

  const items: Array<{ ok: boolean; label: string }> = [
    { ok: v.checks.comprimento, label: `Mínimo de ${MIN_LENGTH} caracteres` },
    { ok: v.checks.minuscula || v.checks.maiuscula, label: "Pelo menos uma letra" },
    { ok: v.checks.numero, label: "Pelo menos um número" },
    { ok: v.checks.especial, label: "Caractere especial (!@#$%&*?_-+=)" },
  ];

  return (
    <div className={cn("space-y-2", className)} aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn("h-1.5 flex-1 rounded-full transition-colors", segCor(i))}
            />
          ))}
        </div>
        <span className={cn("text-xs font-medium tabular-nums w-20 text-right", textoCor)}>
          {senha.length === 0 ? "—" : descricaoForca(score)}
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {items.map((it) => (
          <li
            key={it.label}
            className={cn(
              "flex items-center gap-1.5",
              it.ok ? "text-success" : "text-muted-foreground",
            )}
          >
            {it.ok ? (
              <Check className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0 text-destructive/70" />
            )}
            <span>{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
