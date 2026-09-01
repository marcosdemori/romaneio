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
