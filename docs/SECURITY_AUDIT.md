# Pente-fino de segurança - autenticação Supabase

Data da revisão: 2026-09-01

## Resultado

A correção remove do frontend o mecanismo de senha próprio e troca a barreira de dados para Supabase Auth + JWT + RLS.

### Verificações concluídas

- `app.js` passa em `node --check`.
- Edge Functions passam em verificação sintática TypeScript com declarações de ambiente Deno/Supabase simuladas para o checker.
- Frontend não contém `hashPassword`, `HASH_H1`, `p_senha_*`, `login_check`, RPCs administrativas legadas, `sessionStorage` ou `localStorage` de autenticação.
- Frontend não contém `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEYS`, `sb_secret_` ou outro segredo privilegiado.
- Publishable key é usada somente como `apikey`; chamadas REST/Functions usam o `access_token` da sessão como Bearer.
- `checkLogin()` recupera sessão antes de `loadCurrentProfile()` e `loadFromDB()`.
- `loadFromDB()` também possui guard próprio `getActiveSession()`.
- RLS da migration não cria policy/grant para `anon`.
- A migration revoga explicitamente privilégios de tabela de `anon` e `public`.
- Policies operacionais exigem `authenticated` e vínculo `auth.uid()` -> `usuarios_sistema.auth_user_id`.
- `usuarios_sistema` só expõe diretamente ao frontend o próprio perfil.
- Administração de usuários passa por Edge Function e valida o JWT + perfil do chamador antes de usar a chave server-side.
- Primeiro bootstrap é protegido por segredo server-side e se bloqueia depois do primeiro usuário Auth vinculado.
- Usuários legados podem ser vinculados sem recriar/duplicar o perfil.
- Remoção de usuário impede autoexclusão e exclusão do último perfil.
- 5xx/falha de rede não executa `signOut`; 401/JWT realmente inválido é revalidado antes de derrubar sessão.
- Erros técnicos de PostgREST não são mais exibidos integralmente ao usuário nos fluxos principais; detalhes permanecem no console para diagnóstico.
- Versão do `@supabase/supabase-js` foi fixada em `2.112.2` em vez de usar versão flutuante `@2`.

## Limites da validação local

Os arquivos recebidos formam um frontend estático e não vieram com `package.json`, suíte de testes ou pipeline de build. Além disso, Supabase CLI e Deno não estão instalados no runtime utilizado para esta correção. Por isso não foi possível executar deploy real, banco remoto ou login contra o projeto Supabase.

As validações executadas localmente foram sintáticas e estáticas. O checklist de smoke test pós-deploy está no `README_MIGRACAO_AUTH.md`.

O CSS referenciado pelo `index.html` (`assets/css/style.css`) não foi disponibilizado no runtime de edição. A correção não exige alteração nele.
