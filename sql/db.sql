-- ════════════════════════════════════════════════════════════════════
-- MEGAONLINE - Setup Supabase (Supabase Auth real)
-- Para instalações novas. Em banco existente use primeiro:
-- supabase/migrations/20260901_supabase_auth_real.sql
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz default now()
);

create table if not exists public.materiais (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz default now()
);

create table if not exists public.industrializacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz default now()
);

create table if not exists public.config_empresa (
  id int primary key default 1,
  nome_empresa text default 'MegaOnline',
  subtitulo text default 'Gestão de Romaneio',
  telefone text default '',
  rede_tipo text default 'instagram.com/',
  rede_user text default '',
  logo_base64 text default ''
);
insert into public.config_empresa (id) values (1) on conflict (id) do nothing;

-- Perfil/cadastro apenas. Senhas pertencem exclusivamente ao Supabase Auth.
create table if not exists public.usuarios_sistema (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  usuario text not null unique,
  criado_em timestamptz default now()
);

create table if not exists public.romaneios (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  data_emissao text not null,
  cliente text not null,
  doc_cliente text default '',
  vendedor text default '',
  pagamento text default 'Boleto',
  parcelas int default 1,
  ipi numeric default 0,
  desconto numeric default 0,
  outras_despesas numeric default 0,
  area_total numeric default 0,
  valor_total numeric default 0,
  status_pagamento text not null default 'pendente',
  informacoes text default '',
  criado_em timestamptz default now()
);

create table if not exists public.romaneio_itens (
  id uuid primary key default gen_random_uuid(),
  romaneio_id uuid references public.romaneios(id) on delete cascade,
  material text default '',
  industrializacao text default '',
  lote text default '',
  comprimento numeric default 0,
  altura numeric default 0,
  largura numeric default 0.02,
  quantidade numeric default 1,
  preco numeric default 0,
  area numeric default 0,
  total numeric default 0
);

create index if not exists idx_romaneios_criado_em on public.romaneios (criado_em desc);
create index if not exists idx_romaneios_cliente_lower on public.romaneios (lower(cliente));
create index if not exists idx_romaneios_numero on public.romaneios (numero);
create index if not exists idx_itens_romaneio_id on public.romaneio_itens (romaneio_id);
create unique index if not exists uq_usuarios_sistema_usuario_lower on public.usuarios_sistema (lower(usuario));

insert into public.industrializacoes (nome) values
  ('Bruto'),('Polido'),('Bi-Polido'),('Escovado'),
  ('Flameado'),('Jateado'),('Levigado'),('Apicoado')
on conflict (nome) do nothing;

alter table public.clientes enable row level security;
alter table public.materiais enable row level security;
alter table public.industrializacoes enable row level security;
alter table public.config_empresa enable row level security;
alter table public.usuarios_sistema enable row level security;
alter table public.romaneios enable row level security;
alter table public.romaneio_itens enable row level security;

-- Reutiliza exatamente a mesma matriz de segurança da migration principal.
-- Em instalação nova, execute também o arquivo de migration acima para criar
-- grants/policies idempotentes e manter uma única fonte de verdade de RLS.

-- SECURITY MATRIX SELF-CONTAINED (v2)
-- ============================================================================
-- MEGAONLINE / ROMANEIO - HOTFIX 42501 PERMISSION DENIED
-- Corrige GRANTs + RLS para JWT role=authenticated sem reabrir anon.
-- Seguro para executar mais de uma vez.
-- ============================================================================

begin;

-- RLS permanece obrigatório.
alter table public.clientes enable row level security;
alter table public.materiais enable row level security;
alter table public.industrializacoes enable row level security;
alter table public.config_empresa enable row level security;
alter table public.usuarios_sistema enable row level security;
alter table public.romaneios enable row level security;
alter table public.romaneio_itens enable row level security;

-- Anon e PUBLIC não recebem acesso aos dados internos.
revoke all privileges on table public.clientes from anon, public;
revoke all privileges on table public.materiais from anon, public;
revoke all privileges on table public.industrializacoes from anon, public;
revoke all privileges on table public.config_empresa from anon, public;
revoke all privileges on table public.usuarios_sistema from anon, public;
revoke all privileges on table public.romaneios from anon, public;
revoke all privileges on table public.romaneio_itens from anon, public;

-- PostgREST precisa de USAGE no schema e privilégios de tabela, além das policies RLS.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.clientes to authenticated;
grant select, insert, update, delete on table public.materiais to authenticated;
grant select, insert, update, delete on table public.industrializacoes to authenticated;
grant select, update on table public.config_empresa to authenticated;
grant select on table public.usuarios_sistema to authenticated;
grant select, insert, update, delete on table public.romaneios to authenticated;
grant select, insert, update, delete on table public.romaneio_itens to authenticated;

-- Recria apenas as policies esperadas, de forma idempotente.
drop policy if exists clientes_select_authenticated on public.clientes;
drop policy if exists clientes_insert_authenticated on public.clientes;
drop policy if exists clientes_update_authenticated on public.clientes;
drop policy if exists clientes_delete_authenticated on public.clientes;
create policy clientes_select_authenticated on public.clientes
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy clientes_insert_authenticated on public.clientes
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy clientes_update_authenticated on public.clientes
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy clientes_delete_authenticated on public.clientes
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

drop policy if exists materiais_select_authenticated on public.materiais;
drop policy if exists materiais_insert_authenticated on public.materiais;
drop policy if exists materiais_update_authenticated on public.materiais;
drop policy if exists materiais_delete_authenticated on public.materiais;
create policy materiais_select_authenticated on public.materiais
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy materiais_insert_authenticated on public.materiais
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy materiais_update_authenticated on public.materiais
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy materiais_delete_authenticated on public.materiais
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

drop policy if exists industrializacoes_select_authenticated on public.industrializacoes;
drop policy if exists industrializacoes_insert_authenticated on public.industrializacoes;
drop policy if exists industrializacoes_update_authenticated on public.industrializacoes;
drop policy if exists industrializacoes_delete_authenticated on public.industrializacoes;
create policy industrializacoes_select_authenticated on public.industrializacoes
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy industrializacoes_insert_authenticated on public.industrializacoes
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy industrializacoes_update_authenticated on public.industrializacoes
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy industrializacoes_delete_authenticated on public.industrializacoes
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

drop policy if exists config_empresa_select_authenticated on public.config_empresa;
drop policy if exists config_empresa_update_authenticated on public.config_empresa;
create policy config_empresa_select_authenticated on public.config_empresa
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy config_empresa_update_authenticated on public.config_empresa
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

drop policy if exists romaneios_select_authenticated on public.romaneios;
drop policy if exists romaneios_insert_authenticated on public.romaneios;
drop policy if exists romaneios_update_authenticated on public.romaneios;
drop policy if exists romaneios_delete_authenticated on public.romaneios;
create policy romaneios_select_authenticated on public.romaneios
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneios_insert_authenticated on public.romaneios
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneios_update_authenticated on public.romaneios
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneios_delete_authenticated on public.romaneios
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

drop policy if exists romaneio_itens_select_authenticated on public.romaneio_itens;
drop policy if exists romaneio_itens_insert_authenticated on public.romaneio_itens;
drop policy if exists romaneio_itens_update_authenticated on public.romaneio_itens;
drop policy if exists romaneio_itens_delete_authenticated on public.romaneio_itens;
create policy romaneio_itens_select_authenticated on public.romaneio_itens
  for select to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneio_itens_insert_authenticated on public.romaneio_itens
  for insert to authenticated with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneio_itens_update_authenticated on public.romaneio_itens
  for update to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));
create policy romaneio_itens_delete_authenticated on public.romaneio_itens
  for delete to authenticated using (exists (select 1 from public.usuarios_sistema us where us.auth_user_id = auth.uid()));

drop policy if exists usuarios_sistema_self_select on public.usuarios_sistema;
create policy usuarios_sistema_self_select on public.usuarios_sistema
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

commit;

-- Diagnóstico final: todas as colunas SELECT/INSERT/UPDATE/DELETE esperadas
-- abaixo devem retornar true, exceto INSERT/DELETE de config_empresa e
-- INSERT/UPDATE/DELETE de usuarios_sistema, que ficam false de propósito.
select
  t.table_name,
  has_table_privilege('authenticated', format('public.%I', t.table_name), 'SELECT') as can_select,
  has_table_privilege('authenticated', format('public.%I', t.table_name), 'INSERT') as can_insert,
  has_table_privilege('authenticated', format('public.%I', t.table_name), 'UPDATE') as can_update,
  has_table_privilege('authenticated', format('public.%I', t.table_name), 'DELETE') as can_delete
from (values
  ('clientes'),
  ('materiais'),
  ('industrializacoes'),
  ('config_empresa'),
  ('usuarios_sistema'),
  ('romaneios'),
  ('romaneio_itens')
) as t(table_name)
order by t.table_name;

