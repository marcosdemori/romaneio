-- =====================================================
-- MEGAONLINE - Setup Supabase
-- Execute este SQL no Supabase SQL Editor
-- =====================================================

-- Clientes
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz default now()
);

-- Materiais
create table if not exists materiais (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz default now()
);

-- Industrializações
create table if not exists industrializacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz default now()
);

-- Configurações da empresa
create table if not exists config_empresa (
  id int primary key default 1,
  nome_empresa text default 'MegaOnline',
  subtitulo text default 'Gestão de Romaneio',
  telefone text default '',
  rede_tipo text default 'instagram.com/',
  rede_user text default '',
  logo_base64 text default ''
);
insert into config_empresa (id) values (1) on conflict (id) do nothing;

-- Usuários do sistema
create table if not exists usuarios_sistema (
  id uuid primary key default gen_random_uuid(),
  usuario text not null unique,
  senha text not null,
  criado_em timestamptz default now()
);
insert into usuarios_sistema (usuario, senha) values ('admin', '1234') on conflict do nothing;

-- Romaneios (cabeçalho)
create table if not exists romaneios (
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
  valor_total text default '0,00',
  informacoes text default '',
  criado_em timestamptz default now()
);

-- Itens do romaneio
create table if not exists romaneio_itens (
  id uuid primary key default gen_random_uuid(),
  romaneio_id uuid references romaneios(id) on delete cascade,
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

-- Dados padrão de industrializações
insert into industrializacoes (nome) values
  ('Bruto'),('Polido'),('Bi-Polido'),('Escovado'),
  ('Flameado'),('Jateado'),('Levigado'),('Apicoado')
on conflict do nothing;

-- Desabilitar RLS para uso simples (sem autenticação Supabase)
alter table clientes disable row level security;
alter table materiais disable row level security;
alter table industrializacoes disable row level security;
alter table config_empresa disable row level security;
alter table usuarios_sistema disable row level security;
alter table romaneios disable row level security;
alter table romaneio_itens disable row level security;
