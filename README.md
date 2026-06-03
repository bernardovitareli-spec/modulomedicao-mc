# Módulo de Medição — MC Terraplenagem

Aplicação Lovable (React + Vite + Supabase) para gestão de medições mensais.

## Configuração local

As variáveis de ambiente de **Supabase** (`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`) são gerenciadas automaticamente pelo Lovable Cloud e gravadas em `.env` — **não edite esse arquivo manualmente**.

Para variáveis adicionais (ex.: captcha), crie um arquivo `.env.local` na raiz do projeto e adicione:

```env
# Site key gratuita gerada em https://www.hcaptcha.com/ (Settings → Sites)
VITE_HCAPTCHA_SITE_KEY="sua_site_key_hcaptcha"
```

> `.env.local` deve estar no `.gitignore` (padrão do Vite). Sem `VITE_HCAPTCHA_SITE_KEY`, o sistema funciona em modo dev sem captcha (com aviso no console).

## Segurança

- Política de senha: mínimo 10 caracteres, com letra, número e caractere especial.
- 2FA (TOTP) opcional em **Segurança da conta**.
- Logout automático após 8h de inatividade.
- Captcha (hCaptcha) em cadastro e recuperação de senha.

### Configurações manuais no painel Lovable Cloud

1. **Auth → Settings → Captcha**: habilitar hCaptcha e colar a *Secret Key* (a *Site Key* fica no `.env.local`).
2. **Auth → Settings → Password requirements**: ajustar tamanho mínimo para **10** e exigir letra + número + especial (espelha a política client-side).
3. **Auth → MFA**: garantir que **TOTP** está habilitado.
4. **Auth → Email Templates**: confirmar que o template de signup está ativo e o redirect aponta para `/aguardando-aprovacao`.
