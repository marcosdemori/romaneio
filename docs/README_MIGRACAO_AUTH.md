# MegaOnline / Romaneio - Migração para Supabase Auth real

Este pacote substitui o login próprio do projeto por Supabase Auth com sessão JWT e role `authenticated`, sem reabrir acesso operacional para `anon`.

## O que foi alterado

- O login visual continua usando **usuário + senha**.
- O nome de usuário é convertido, de forma determinística, em um identificador de e-mail interno usado somente pelo Supabase Auth. O usuário não precisa informar e-mail.
- `sessionStorage`/sessão falsa foi removido. A sessão passa a ser gerenciada pelo Supabase Auth (`persistSession` + refresh automático).
- Nenhuma consulta de clientes, materiais, industrializações, configurações, romaneios ou itens é executada antes de existir uma sessão Supabase com `access_token`.
- Toda chamada REST operacional usa a publishable key em `apikey` e o JWT do usuário em `Authorization: Bearer <access_token>`.
- `usuarios_sistema` fica somente como perfil/cadastro (`usuario` + `auth_user_id`), sem senha.
- O fluxo `HASH_H1`, `p_senha_texto`, `p_senha_hash`, `login_check`, `usuarios_listar`, `usuario_criar`, `usuario_remover`, `usuario_trocar_senha` e `tentativas_login` é removido.
- Administração de usuários é feita pela Edge Function `manage-users`. A chave privilegiada nunca fica no navegador.
- Usuários antigos sem vínculo Auth aparecem como **MIGRAR** na mesma lista de usuários. Para ativá-los, informe novamente o mesmo usuário e defina uma nova senha de 6 ou mais caracteres.
- Falhas de rede/5xx não executam logout automaticamente. A sessão só é encerrada quando há evidência explícita de sessão/JWT inválido.

## Estrutura do pacote

- `assets/js/app.js` - frontend corrigido.
- `db.sql` - schema de referência para instalação nova, sem senhas próprias.
- `supabase/migrations/20260901_supabase_auth_real.sql` - migration para banco existente.
- `supabase/functions/manage-users/index.ts` - criação/listagem/remoção de usuários pelo servidor.
- `supabase/functions/bootstrap-admin/index.ts` - cria e vincula somente o primeiro usuário Auth.
- `supabase/functions/_shared/auth-utils.ts` - utilitários server-side.
- `supabase/config.toml` - política de JWT das Edge Functions.

## Ordem recomendada para aplicar em produção

### 1. Faça backup

Faça um backup do banco antes de aplicar a migration. A migration remove definitivamente a coluna de senha legada e `tentativas_login`.

### 2. Configure a CLI do Supabase e vincule o projeto

Use o projeto Supabase já utilizado pela aplicação. Não coloque `service_role`, secret key ou `BOOTSTRAP_SECRET` no HTML/JavaScript.

### 3. Defina um segredo temporário para o bootstrap

Crie um segredo aleatório forte, por exemplo no Dashboard de Edge Functions/Secrets ou pela CLI:

```bash
supabase secrets set BOOTSTRAP_SECRET="COLOQUE_UM_SEGREDO_LONGO_E_ALEATORIO_AQUI"
```

A Edge Function usa a secret key do ambiente Supabase server-side. O helper suporta a chave secreta atual (`SUPABASE_SECRET_KEYS`) e, por compatibilidade, o legado `SUPABASE_SERVICE_ROLE_KEY`. Nenhuma dessas chaves deve ser copiada para o frontend.

### 4. Aplique a migration SQL

Execute integralmente:

`supabase/migrations/20260901_supabase_auth_real.sql`

Ela:

- adiciona `auth_user_id` a `usuarios_sistema`;
- apaga as funções/RPCs antigas de senha;
- remove `senha` e `tentativas_login`;
- remove todas as policies anteriores das tabelas do app, inclusive qualquer `anon_all`/`anon_read_temp`;
- revoga privilégios de `anon` e `public` nas tabelas operacionais;
- concede os privilégios necessários somente a `authenticated`;
- recria policies RLS para `authenticated` **e exige vínculo do `auth.uid()` em `usuarios_sistema`**;
- permite ao frontend ler de `usuarios_sistema` apenas o próprio perfil.

### 5. Faça deploy das Edge Functions

Com a pasta `supabase` deste pacote no projeto:

```bash
supabase functions deploy manage-users
supabase functions deploy bootstrap-admin
```

O `config.toml` mantém JWT obrigatório em `manage-users`. `bootstrap-admin` é a única exceção porque ainda não existe um usuário Auth no primeiro uso; mesmo assim ela exige `x-bootstrap-secret` e se recusa a rodar novamente depois que já existe um perfil Auth vinculado.

### 6. Crie/vincule o primeiro usuário Auth

A senha legada `1234` **não é migrada**. Defina uma nova senha forte, com no mínimo 6 caracteres.

Exemplo, substituindo o segredo e a senha:

```bash
curl -X POST "https://kedpkmpcnpbmeaajfcoq.supabase.co/functions/v1/bootstrap-admin" \
  -H "apikey: sb_publishable_tkcIOM9l-Vq899jSmmFj1g_CtdzawkP" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: COLOQUE_O_MESMO_SEGREDO_AQUI" \
  -d '{"usuario":"admin","password":"NOVA_SENHA_FORTE"}'
```

Se já existir o perfil legado `admin`, ele será vinculado ao novo usuário Auth. Caso contrário, o perfil será criado.

### 7. Desative o bootstrap depois do primeiro uso

Depois de confirmar o primeiro login:

- remova `BOOTSTRAP_SECRET` dos Secrets **ou** remova/despublique `bootstrap-admin`;
- mantenha somente `manage-users` para administração cotidiana.

Isso reduz a superfície de ataque mesmo que a função de bootstrap já se auto-bloqueie após o primeiro vínculo.

### 8. Publique o frontend corrigido

Substitua no projeto original:

`assets/js/app.js`

pelo arquivo deste pacote.

O `index.html` e o CSS não precisam ser alterados para a migração de Auth; o novo `app.js` carrega o SDK oficial `@supabase/supabase-js` v2.112.2 no navegador e preserva os IDs/handlers da tela existente.

### 9. Migre os demais usuários antigos

Depois de entrar como primeiro usuário:

1. abra **Cadastros**;
2. usuários legados ainda sem Auth aparecerão com o marcador **MIGRAR**;
3. no formulário de adicionar usuário, informe exatamente o mesmo nome;
4. defina uma nova senha;
5. o cadastro existente será vinculado ao novo `auth.users`, sem duplicar `usuarios_sistema`.

Não há como recuperar a senha antiga a partir do hash `h1$...`; ela precisa ser redefinida.

## Configurações recomendadas no Supabase Auth

- Desabilite cadastro público de usuários (sign-up) se o sistema deve criar acessos somente pela tela interna. Mesmo se essa configuração for alterada por engano, as policies operacionais ainda exigem vínculo em `usuarios_sistema`.
- Mantenha e-mail/senha habilitado, pois o identificador interno é tratado como um e-mail técnico.
- Não exponha `service_role`, secret key atual ou `BOOTSTRAP_SECRET` no frontend, repositório público ou hospedagem estática.
- A publishable key presente no JavaScript é pública por design; a proteção dos dados vem do JWT autenticado + grants + RLS.

## Testes de segurança após publicar

1. Abra uma janela anônima e, antes de login, confirme no DevTools/Network que não há chamadas para `/rest/v1/clientes`, `/romaneios`, `/materiais`, etc.
2. Tente consultar REST somente com a publishable key e sem JWT de usuário: o acesso às tabelas operacionais deve ser negado.
3. Faça login e confirme CRUD de clientes, materiais, industrializações e romaneios.
4. Confirme edição, exclusão, status de pagamento, impressão/reimpressão, CSV, logo e configurações.
5. Confirme criação de usuário pela tela; depois teste o novo login.
6. Confirme que um usuário não pode remover o próprio acesso nem o último cadastro do sistema.
7. Desconecte a rede com uma sessão já válida e reconecte: uma falha transitória não deve apagar a sessão.
8. Execute logout e confirme que os dados da interface são limpos e a sessão local do Supabase é encerrada.

## Observação sobre os arquivos enviados

O frontend recebido referencia `assets/css/style.css`, mas esse CSS não foi disponibilizado no runtime de edição. Por isso este pacote entrega os **arquivos alterados e novos** para sobrepor à base original; não recria nem substitui seus assets visuais que não precisaram de mudança.

## Hotfix 42501 - permission denied

Se aparecer `42501: permission denied for table romaneio_itens` (ou outra tabela operacional), execute `HOTFIX_42501_AUTHENTICATED.sql` no SQL Editor do Supabase. Esse hotfix não devolve acesso para `anon`: ele apenas garante `USAGE` no schema, os GRANTs explícitos para `authenticated` e recria as policies RLS esperadas. O `db.sql` deste pacote também foi atualizado para ser autossuficiente e já aplicar essa matriz de segurança em instalações novas.

## Correção V3 - frontend antigo/cache

Se o diagnóstico SQL mostrar `can_select=true` para `authenticated`, mas a tela de login ainda exibir o JSON bruto `42501 permission denied`, o navegador está executando o `app.js` legado. O `index.html` original referencia `assets/js/app.js?v=20260722.1`.

Use `APLICAR_FRONTEND_AUTH_V3.bat` apontando para a pasta real do projeto. O patch substitui o `assets/js/app.js`, cria backup do `index.html` e muda a referência para `assets/js/app.js?v=20260901.auth3`.

Após publicar, `window.MEGAONLINE_AUTH_BUILD` no Console deve retornar `20260901-auth-v3`.
