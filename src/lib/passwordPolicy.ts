// Política de senha do sistema. Reutilizado em /auth, /reset-password e /conta/seguranca.

export const MIN_LENGTH = 10;

export type SenhaScore = 0 | 1 | 2 | 3 | 4;

export interface ValidacaoSenha {
  ok: boolean;
  score: SenhaScore;
  mensagens: string[];
  checks: {
    comprimento: boolean;
    minuscula: boolean;
    maiuscula: boolean;
    numero: boolean;
    especial: boolean;
  };
}

const REGEX_ESPECIAL = /[!@#$%&*?_\-+=]/;

export function validarSenha(senha: string): ValidacaoSenha {
  const checks = {
    comprimento: senha.length >= MIN_LENGTH,
    minuscula: /[a-z]/.test(senha),
    maiuscula: /[A-Z]/.test(senha),
    numero: /[0-9]/.test(senha),
    especial: REGEX_ESPECIAL.test(senha),
  };

  // Score: soma de quantos critérios bate, mapeada para 0..4
  const pontos =
    (checks.comprimento ? 1 : 0) +
    (checks.minuscula ? 1 : 0) +
    (checks.maiuscula ? 1 : 0) +
    (checks.numero ? 1 : 0) +
    (checks.especial ? 1 : 0);

  // 0..5 → 0..4 (5 critérios viram score 4)
  const score = Math.max(0, Math.min(4, pontos - 1)) as SenhaScore;

  const mensagens: string[] = [];
  if (!checks.comprimento) mensagens.push(`Mínimo de ${MIN_LENGTH} caracteres.`);
  if (!checks.minuscula) mensagens.push("Inclua ao menos uma letra minúscula.");
  if (!checks.maiuscula) mensagens.push("Inclua ao menos uma letra maiúscula.");
  if (!checks.numero) mensagens.push("Inclua ao menos um número.");
  if (!checks.especial) mensagens.push("Inclua um caractere especial (!@#$%&*?_-+=).");

  // ok requer comprimento, ao menos uma letra (qualquer caixa), um número e um especial
  const ok =
    checks.comprimento &&
    (checks.minuscula || checks.maiuscula) &&
    checks.numero &&
    checks.especial;

  return { ok, score, mensagens, checks };
}

export function descricaoForca(score: SenhaScore): string {
  switch (score) {
    case 0: return "Muito fraca";
    case 1: return "Fraca";
    case 2: return "Média";
    case 3: return "Forte";
    case 4: return "Muito forte";
  }
}
