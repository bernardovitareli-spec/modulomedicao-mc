// Centralizador de query keys do react-query.
// Sempre usar estes helpers para garantir invalidação consistente.

export const qk = {
  clientes: {
    all: ["clientes"] as const,
    list: (filters?: unknown) => ["clientes", "list", filters ?? null] as const,
    byId: (id: string) => ["clientes", "byId", id] as const,
    ativos: ["clientes", "ativos"] as const,
  },
  contratos: {
    all: ["contratos"] as const,
    list: (filters?: unknown) => ["contratos", "list", filters ?? null] as const,
    byId: (id: string) => ["contratos", "byId", id] as const,
    equipamentos: (contratoId: string) => ["contratos", "equipamentos", contratoId] as const,
    regras: (contratoId: string) => ["contratos", "regras", contratoId] as const,
    medicoes: (contratoId: string) => ["contratos", "medicoes", contratoId] as const,
    alteracoes: (contratoId: string) => ["contratos", "alteracoes", contratoId] as const,
  },
  equipamentos: {
    all: ["equipamentos"] as const,
    list: () => ["equipamentos", "list"] as const,
  },
  medicoes: {
    all: ["medicoes"] as const,
    list: (filters?: unknown) => ["medicoes", "list", filters ?? null] as const,
    byId: (id: string) => ["medicoes", "byId", id] as const,
    itens: (id: string) => ["medicoes", "itens", id] as const,
    versoes: (originalId: string) => ["medicoes", "versoes", originalId] as const,
    anexos: (id: string) => ["medicoes", "anexos", id] as const,
    historico: (id: string) => ["medicoes", "historico", id] as const,
    versionCounts: ["medicoes", "versionCounts"] as const,
  },
  faturas: {
    all: ["faturas"] as const,
    list: (filters?: unknown) => ["faturas", "list", filters ?? null] as const,
    byId: (id: string) => ["faturas", "byId", id] as const,
    historico: (id: string) => ["faturas", "historico", id] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    snapshot: (filters?: unknown) => ["dashboard", "snapshot", filters ?? null] as const,
  },
  usuarios: {
    ativos: ["usuarios", "ativos"] as const,
    pendentes: ["usuarios", "pendentes"] as const,
    vinculos: (userId: string) => ["usuarios", "vinculos", userId] as const,
  },
  audit: {
    list: (filters?: unknown) => ["audit", "list", filters ?? null] as const,
  },
};
