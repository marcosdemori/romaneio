-- ════════════════════════════════════════════════════════════════════
-- MEGAONLINE / ROMANEIO - MIGRAÇÃO PARA SUPABASE AUTH REAL
-- Data: 2026-09-01
--
-- OBJETIVOS
--   1) remover senha própria/HASH_H1 e RPCs administrativas públicas;
--   2) preservar public.usuarios_sistema apenas como perfil/cadastro;
--   3) bloquear completamente dados operacionais para role anon;
--   4) permitir acesso operacional somente a JWT role=authenticated;
--   5) deixar administração de auth.users exclusivamente para Edge Function
--      com service_role no servidor.
--
-- IMPORTANTE
--   Após esta migration, usuários legados NÃO autenticam mais pela senha antiga.
--   Execute o bootstrap-admin incluído no projeto para criar/vincular o primeiro
--   usuário do Supabase Auth. Depois, novos usuários são criados pela tela atual.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────
-- 1. PERFIL DE USUÁRIO: SEM SENHA
-- ─────────────────────────────────────────────────────

alter table public.usuarios_sistema
  add column if not exists auth_user_id uuid;

-- Remove primeiro as funções legadas que dependem da coluna senha.
drop function if exists public.login_check(text, text, text);
drop function if exists public.usuarios_listar();
drop function if exists public.usuario_criar(text, text);
drop function if exists public.usuario_remover(uuid);
drop function if exists public.usuario_trocar_senha(uuid, text, text, text);

-- Remove definitivamente senha/hash do perfil.
alter table public.usuarios_sistema
  drop column if exists senha;

-- O rate-limit do login passa a ser responsabilidade do Supabase Auth.
drop table if exists public.tentativas_login;

-- Vínculo opcional durante bootstrap; depois cada usuário ativo deve ter auth_user_id.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'usuarios_sistema_auth_user_id_fkey'
       and conrelid = 'public.usuarios_sistema'::regclass
  ) then
    alter table public.usuarios_sistema
      add constraint usuarios_sistema_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists uq_usuarios_sistema_auth_user_id
  on public.usuarios_sistema (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists uq_usuarios_sistema_usuario_lower
  on public.usuarios_sistema (lower(usuario));

-- ─────────────────────────────────────────────────────
-- 2. RLS: REMOVE TODAS AS POLICIES ANTIGAS/PROVISÓRIAS
-- ─────────────────────────────────────────────────────
-- Deliberadamente removemos TODAS as policies destas tabelas antes de recriar.
-- Assim também desaparecem anon_all, anon_read_temp ou qualquer SELECT temporário.

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in (
         'clientes',
         'materiais',
         'industrializacoes',
         'config_empresa',
         'usuarios_sistema',
         'romaneios',
         'romaneio_itens'
       )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

alter table public.clientes enable row level security;
alter table public.materiais enable row level security;
alter table public.industrializacoes enable row level security;
alter table public.config_empresa enable row level security;
alter table public.usuarios_sistema enable row level security;
alter table public.romaneios enable row level security;
alter table public.romaneio_itens enable row level security;

-- ─────────────────────────────────────────────────────
-- 3. GRANTS: ANON NÃO TOCA EM DADOS DO SISTEMA
-- ─────────────────────────────────────────────────────

revoke all privileges on table public.clientes from anon;
revoke all privileges on table public.materiais from anon;
revoke all privileges on table public.industrializacoes from anon;
revoke all privileges on table public.config_empresa from anon;
revoke all privileges on table public.usuarios_sistema from anon;
revoke all privileges on table public.romaneios from anon;
revoke all privileges on table public.romaneio_itens from anon;

-- Evita herança acidental por PUBLIC em projetos antigos.
revoke all privileges on table public.clientes from public;
revoke all privileges on table public.materiais from public;
revoke all privileges on table public.industrializacoes from public;
revoke all privileges on table public.config_empresa from public;
revoke all privileges on table public.usuarios_sistema from public;
revoke all privileges on table public.romaneios from public;
revoke all privileges on table public.romaneio_itens from public;

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.clientes to authenticated;
grant select, insert, update, delete on table public.materiais to authenticated;
grant select, insert, update, delete on table public.industrializacoes to authenticated;
grant select, update on table public.config_empresa to authenticated;
grant select on table public.usuarios_sistema to authenticated;
grant select, insert, update, delete on table public.romaneios to authenticated;
grant select, insert, update, delete on table public.romaneio_itens to authenticated;

-- ─────────────────────────────────────────────────────
-- 4. POLICIES authenticated - tabelas operacionais
-- Defesa em profundidade: role authenticated so acessa dados se auth.uid()
-- estiver vinculado a public.usuarios_sistema.
-- ─────────────────────────────────────────────────────

-- clientes
create policy clientes_select_authenticated on public.clientes
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy clientes_insert_authenticated on public.clientes
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy clientes_update_authenticated on public.clientes
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid())) with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy clientes_delete_authenticated on public.clientes
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

-- materiais
create policy materiais_select_authenticated on public.materiais
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy materiais_insert_authenticated on public.materiais
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy materiais_update_authenticated on public.materiais
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid())) with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy materiais_delete_authenticated on public.materiais
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

-- industrializacoes
create policy industrializacoes_select_authenticated on public.industrializacoes
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy industrializacoes_insert_authenticated on public.industrializacoes
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy industrializacoes_update_authenticated on public.industrializacoes
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid())) with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy industrializacoes_delete_authenticated on public.industrializacoes
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

-- config_empresa: leitura/edição autenticada; sem delete/insert pelo navegador.
create policy config_empresa_select_authenticated on public.config_empresa
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy config_empresa_update_authenticated on public.config_empresa
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid())) with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

-- romaneios
create policy romaneios_select_authenticated on public.romaneios
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneios_insert_authenticated on public.romaneios
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneios_update_authenticated on public.romaneios
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid())) with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneios_delete_authenticated on public.romaneios
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

-- romaneio_itens
create policy romaneio_itens_select_authenticated on public.romaneio_itens
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneio_itens_insert_authenticated on public.romaneio_itens
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneio_itens_update_authenticated on public.romaneio_itens
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid())) with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneio_itens_delete_authenticated on public.romaneio_itens
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

-- usuarios_sistema: usuário comum enxerga SOMENTE o próprio perfil.
-- Listagem/criação/exclusão administrativa é feita pela Edge Function com service_role.
create policy usuarios_sistema_self_select on public.usuarios_sistema
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────
-- 5. GARANTIAS EXPLÍCITAS CONTRA O FLUXO ANTIGO
-- ─────────────────────────────────────────────────────
-- Não há GRANT de EXECUTE para anon porque as funções antigas foram removidas.
-- Nenhuma policy desta migration contém role anon.
-- A publishable key continua no frontend por design; service_role NÃO deve estar lá.

commit;
