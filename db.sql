-- ════════════════════════════════════════════════════════════════════
--  MEGAONLINE - Setup Supabase (versão revisada)
--  Idempotente: pode ser executado várias vezes sem quebrar nada.
--  Execute este arquivo INTEIRO no Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. TABELAS
-- ─────────────────────────────────────────────────────

-- Clientes
create table if not exists clientes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  criado_em   timestamptz default now()
);

-- Materiais
create table if not exists materiais (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  criado_em   timestamptz default now()
);

-- Industrializações
create table if not exists industrializacoes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  criado_em   timestamptz default now()
);

-- Configurações da empresa (sempre 1 linha, id=1)
create table if not exists config_empresa (
  id            int primary key default 1,
  nome_empresa  text default 'MegaOnline',
  subtitulo     text default 'Gestão de Romaneio',
  telefone      text default '',
  rede_tipo     text default 'instagram.com/',
  rede_user     text default '',
  logo_base64   text default ''
);
insert into config_empresa (id) values (1) on conflict (id) do nothing;

-- Usuários do sistema (acesso bloqueado para anon — usar RPCs abaixo)
create table if not exists usuarios_sistema (
  id          uuid primary key default gen_random_uuid(),
  usuario     text not null unique,
  senha       text not null,
  criado_em   timestamptz default now()
);

-- Romaneios (cabeçalho)
create table if not exists romaneios (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null,
  data_emissao      text not null,
  cliente           text not null,
  doc_cliente       text default '',
  vendedor          text default '',
  pagamento         text default 'Boleto',
  parcelas          int default 1,
  ipi               numeric default 0,
  desconto          numeric default 0,
  outras_despesas   numeric default 0,
  area_total        numeric default 0,
  valor_total       numeric default 0,         -- ⚠ era TEXT '0,00' — corrigido
  informacoes       text default '',
  criado_em         timestamptz default now()
);

-- Itens do romaneio
create table if not exists romaneio_itens (
  id                uuid primary key default gen_random_uuid(),
  romaneio_id       uuid references romaneios(id) on delete cascade,
  material          text default '',
  industrializacao  text default '',
  lote              text default '',
  comprimento       numeric default 0,
  altura            numeric default 0,
  largura           numeric default 0.02,
  quantidade        numeric default 1,
  preco             numeric default 0,
  area              numeric default 0,
  total             numeric default 0
);

-- Tentativas de login (usado para rate-limit / bloqueio temporário)
create table if not exists tentativas_login (
  id            bigserial primary key,
  usuario       text not null,
  tentativa_em  timestamptz not null default now(),
  sucesso       boolean not null default false
);

create index if not exists idx_tentativas_usuario_em
  on tentativas_login (usuario, tentativa_em desc);

-- ─────────────────────────────────────────────────────
-- 2. MIGRAÇÃO DE TIPOS (para bancos já existentes)
-- ─────────────────────────────────────────────────────

-- valor_total estava como TEXT (impedia somas/agregações). Converte para numeric.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name='romaneios' and column_name='valor_total' and data_type='text'
  ) then
    -- Remove o default antigo ('0,00' texto) antes de mudar o tipo,
    -- senão o Postgres tenta converter a string default e falha.
    alter table romaneios alter column valor_total drop default;
    alter table romaneios
      alter column valor_total type numeric
      using nullif(replace(valor_total, ',', '.'), '')::numeric;
    alter table romaneios alter column valor_total set default 0;
  end if;
end $$;

-- ─────────────────────────────────────────────────────
-- 3. ÍNDICES (acelera histórico, busca por cliente, joins)
-- ─────────────────────────────────────────────────────

create index if not exists idx_romaneios_criado_em
  on romaneios (criado_em desc);

create index if not exists idx_romaneios_cliente_lower
  on romaneios (lower(cliente));

create index if not exists idx_romaneios_numero
  on romaneios (numero);

create index if not exists idx_itens_romaneio_id
  on romaneio_itens (romaneio_id);

-- ─────────────────────────────────────────────────────
-- 4. SEED DO ADMIN
-- ─────────────────────────────────────────────────────

-- Hash de "1234" para o usuário "admin", calculado com o algoritmo do app
-- (SHA-256 de 'megaonline_v1_admin|1234'). Compatível com hashPassword().
-- ⚠ TROQUE ESTA SENHA NO PRIMEIRO LOGIN! (aba Cadastros → Alterar Senha)
insert into usuarios_sistema (usuario, senha) values
  ('admin', 'h1$68a5b6f7e406264433a5c589c091552e10a720ac367c70270fdcca61757e6114')
on conflict (usuario) do nothing;

-- Industrializações padrão
insert into industrializacoes (nome) values
  ('Bruto'),('Polido'),('Bi-Polido'),('Escovado'),
  ('Flameado'),('Jateado'),('Levigado'),('Apicoado')
on conflict (nome) do nothing;

-- ════════════════════════════════════════════════════════════════════
-- 5. ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════════════
-- Como o app usa a chave PUBLISHABLE (anon) sem Supabase Auth, qualquer
-- pessoa que abrir o "ver fonte" tem essa chave. A proteção real vem
-- daqui: RLS controla o que essa chave pode fazer em cada tabela.
--
-- ESTRATÉGIA:
--   • Tabelas operacionais (clientes, materiais, romaneios, ...) →
--     acesso permissivo via anon (o app usa essas tabelas direto).
--   • usuarios_sistema → BLOQUEADA para anon. Acesso só via funções RPC
--     definidas abaixo, que validam credenciais antes de retornar.
-- ════════════════════════════════════════════════════════════════════

alter table clientes              enable row level security;
alter table materiais             enable row level security;
alter table industrializacoes     enable row level security;
alter table config_empresa        enable row level security;
alter table usuarios_sistema      enable row level security;
alter table romaneios             enable row level security;
alter table romaneio_itens        enable row level security;
alter table tentativas_login      enable row level security;

-- Limpa policies antigas para idempotência
drop policy if exists anon_all on clientes;
drop policy if exists anon_all on materiais;
drop policy if exists anon_all on industrializacoes;
drop policy if exists anon_all on config_empresa;
drop policy if exists anon_all on usuarios_sistema;
drop policy if exists anon_all on romaneios;
drop policy if exists anon_all on romaneio_itens;

-- Policies permissivas para tabelas operacionais
create policy anon_all on clientes              for all using (true) with check (true);
create policy anon_all on materiais             for all using (true) with check (true);
create policy anon_all on industrializacoes     for all using (true) with check (true);
create policy anon_all on config_empresa        for all using (true) with check (true);
create policy anon_all on romaneios             for all using (true) with check (true);
create policy anon_all on romaneio_itens        for all using (true) with check (true);

-- usuarios_sistema → SEM POLICY = totalmente bloqueada para anon.
-- Acesso será feito via RPCs com SECURITY DEFINER abaixo.

-- ════════════════════════════════════════════════════════════════════
-- 6. RPC FUNCTIONS (acesso controlado a usuarios_sistema)
-- ════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- login_check
--   Valida usuário + senha sem expor a tabela.
--   Aceita tanto o hash novo quanto a senha em texto puro (legado),
--   migrando automaticamente para hash quando bate em texto puro.
--
--   PROTEÇÕES contra força bruta:
--     • pg_sleep(0.5) — atrasa toda tentativa em ~500ms;
--     • rate-limit por usuário: bloqueia por 15min após 5 falhas em 15min.
--
--   RETORNA jsonb:
--     { "ok": true,  "user_id": "..." }                           sucesso
--     { "ok": false }                                              senha errada
--     { "ok": false, "blocked": true, "retry_after_seconds": N }   bloqueado
-- ─────────────────────────────────────────────────────
-- drop necessário porque mudamos o tipo de retorno (uuid -> jsonb)
drop function if exists login_check(text, text, text);

create or replace function login_check(
  p_usuario      text,
  p_senha_texto  text,
  p_senha_hash   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  falhas_recentes  int;
  segundos_restantes int;
  autenticado      boolean := false;
  max_falhas constant int      := 5;
  janela     constant interval := interval '15 minutes';
begin
  if p_usuario is null or p_usuario = '' then
    return jsonb_build_object('ok', false);
  end if;

  -- 1. Bloqueio: se já houve >= max_falhas falhas dentro da janela, recusa
  select count(*) into falhas_recentes
  from tentativas_login
  where usuario = p_usuario
    and sucesso = false
    and tentativa_em > now() - janela;

  if falhas_recentes >= max_falhas then
    select extract(epoch from (max(tentativa_em) + janela - now()))::int
      into segundos_restantes
      from tentativas_login
     where usuario = p_usuario
       and sucesso = false
       and tentativa_em > now() - janela;

    return jsonb_build_object(
      'ok', false,
      'blocked', true,
      'retry_after_seconds', greatest(coalesce(segundos_restantes, 60), 1)
    );
  end if;

  -- 2. Atrasa toda tentativa em ~500ms (encarece força bruta linear)
  perform pg_sleep(0.5);

  -- 3. Lookup do usuário
  select id, senha into r
    from usuarios_sistema
   where usuario = p_usuario
   limit 1;

  if not found then
    insert into tentativas_login (usuario, sucesso) values (p_usuario, false);
    return jsonb_build_object('ok', false);
  end if;

  -- 4. Verificação (suporta hash novo e texto puro legado)
  if r.senha like 'h1$%' then
    autenticado := (r.senha = p_senha_hash);
  elsif r.senha = p_senha_texto then
    autenticado := true;
    update usuarios_sistema set senha = p_senha_hash where id = r.id;
  end if;

  -- 5. Registra a tentativa
  insert into tentativas_login (usuario, sucesso) values (p_usuario, autenticado);

  if autenticado then
    -- limpa tentativas falhas recentes desse usuário (já não importa)
    delete from tentativas_login
     where usuario = p_usuario
       and sucesso = false
       and tentativa_em > now() - janela;

    -- garbage collect leve: remove registros > 7 dias
    delete from tentativas_login where tentativa_em < now() - interval '7 days';

    return jsonb_build_object('ok', true, 'user_id', r.id);
  end if;

  return jsonb_build_object('ok', false);
end;
$$;

-- ─────────────────────────────────────────────────────
-- usuarios_listar
--   Lista usuários SEM expor as senhas. Usado pela aba Cadastros.
-- ─────────────────────────────────────────────────────
create or replace function usuarios_listar()
returns table (id uuid, usuario text)
language sql
security definer
set search_path = public
as $$
  select id, usuario from usuarios_sistema order by usuario;
$$;

-- ─────────────────────────────────────────────────────
-- usuario_criar
--   Cria um novo usuário com senha já hasheada pelo app.
--   Retorna o ID criado, ou NULL se o nome já existe.
-- ─────────────────────────────────────────────────────
create or replace function usuario_criar(
  p_usuario     text,
  p_senha_hash  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_id uuid;
begin
  if p_usuario is null or p_usuario = '' then return null; end if;
  if p_senha_hash is null or p_senha_hash = '' then return null; end if;

  insert into usuarios_sistema (usuario, senha)
  values (p_usuario, p_senha_hash)
  on conflict (usuario) do nothing
  returning id into novo_id;

  return novo_id;
end;
$$;

-- ─────────────────────────────────────────────────────
-- usuario_remover
--   Remove um usuário pelo ID. Impede remover o último usuário
--   do sistema (proteção contra lockout).
-- ─────────────────────────────────────────────────────
create or replace function usuario_remover(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
begin
  select count(*) into total from usuarios_sistema;
  if total <= 1 then return false; end if;

  delete from usuarios_sistema where id = p_id;
  return found;
end;
$$;

-- ─────────────────────────────────────────────────────
-- usuario_trocar_senha
--   Troca a senha do usuário, exigindo a senha atual correta.
--   Retorna true se trocou, false se a atual está incorreta.
-- ─────────────────────────────────────────────────────
create or replace function usuario_trocar_senha(
  p_id                uuid,
  p_senha_atual_texto text,
  p_senha_atual_hash  text,
  p_senha_nova_hash   text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  senha_atual text;
  ok boolean := false;
begin
  select senha into senha_atual from usuarios_sistema where id = p_id;
  if not found then return false; end if;

  if senha_atual like 'h1$%' then
    ok := (senha_atual = p_senha_atual_hash);
  else
    ok := (senha_atual = p_senha_atual_texto);
  end if;

  if not ok then return false; end if;

  update usuarios_sistema set senha = p_senha_nova_hash where id = p_id;
  return true;
end;
$$;

-- ─────────────────────────────────────────────────────
-- Permissões: a chave anon pode EXECUTAR as funções acima,
-- mas continua sem acesso direto à tabela usuarios_sistema.
-- ─────────────────────────────────────────────────────
revoke all on function login_check(text, text, text)              from public;
revoke all on function usuarios_listar()                          from public;
revoke all on function usuario_criar(text, text)                  from public;
revoke all on function usuario_remover(uuid)                      from public;
revoke all on function usuario_trocar_senha(uuid, text, text, text) from public;

grant execute on function login_check(text, text, text)              to anon, authenticated;
grant execute on function usuarios_listar()                          to anon, authenticated;
grant execute on function usuario_criar(text, text)                  to anon, authenticated;
grant execute on function usuario_remover(uuid)                      to anon, authenticated;
grant execute on function usuario_trocar_senha(uuid, text, text, text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
--  FIM. Após rodar este script, atualize também o index.html para a
--  versão nova que chama as RPCs (login_check, usuarios_listar, etc).
-- ════════════════════════════════════════════════════════════════════
