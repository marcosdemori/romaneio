# 🧾 MegaOnline - Sistema de Gestão de Romaneio

Sistema web completo, responsivo e seguro para emissão, controle e reimpressão de romaneios de carregamento. Projetado para atuar com alta performance na gestão de clientes, materiais, industrializações e detalhamento financeiro.

---

## 🌐 Acesse online

🔗 https://marcosdemori.github.io/romaneio/

---

## 🚀 Principais Funcionalidades

### 📦 Operacional e Emissão
* **Emissão Rápida:** Geração de romaneios com numeração sequencial automática e suporte a CNPJ/CPF e identificação de vendedor.
* **Cálculos Dinâmicos em Tempo Real:** Cômputo automático de área total ($m^2$), subtotal, aplicação de IPI (%), acréscimo de outras despesas e abatimento de descontos.
* **Detalhamento de Parcelas:** Geração automática do cronograma e valores de parcelas (1x até múltiplas vezes) com base no valor líquido final.
* **Modo de Reimpressão Seguro:** Resgate de romaneios históricos para visualização e reimpressão em PDF com trava de segurança que impede o sobrescrevimento acidental de dados.

### 🗂️ Gestão e Cadastros
* **Cadastros Independentes:** Gerenciamento de Clientes, Materiais e Industrializações com atualização em tempo real nas listas de seleção.
* **Histórico Completo:** Tabela de movimentação com busca instantânea (filtro por cliente), totalizadores globais (quantidade, área acumulada e faturamento) e visualização de detalhes em modal.
* **Exportação de Dados:** Geração instantânea de relatórios em formato CSV diretamente pelo navegador.
* **Configurações da Empresa:** Personalização de nome, slogan, telefone/WhatsApp e upload de Logo (salva em Base64 direto no banco), refletindo instantaneamente na interface e no cabeçalho de impressão.
* **QR Code Dinâmico:** Geração automática de QR Code no rodapé do documento para facilitar o acesso rápido a links ou redes sociais da empresa.

### 🔐 Segurança e Autenticação (Custom Auth)
* **Proteção RLS Avançada:** Utilização da chave pública do Supabase protegida por políticas estritas de *Row Level Security*.
* **Autenticação via RPC:** Tabela de usuários totalmente bloqueada para o cliente. O acesso é feito exclusivamente via procedimentos armazenados (*Stored Procedures / RPCs*) rodando no servidor com privilégios elevados (`SECURITY DEFINER`).
* **Criptografia Client-Side:** As senhas nunca trafegam em texto puro; é aplicado um hash SHA-256 com *salt* exclusivo por usuário diretamente no navegador.
* **Proteção contra Força Bruta:** Sistema integrado de *rate-limiting* (bloqueio temporário de 15 minutos após 5 tentativas falhas) e atraso intencional de 500ms por requisição de login para inviabilizar ataques automatizados.

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:** HTML5, CSS3, JavaScript (Vanilla JS com requisições REST otimizadas via `fetch`).
* **Otimizações:** Implementação de *Debounce* (evita requisições excessivas ao banco durante a digitação) e design fluido/responsivo para mobile e desktop.
* **Backend / Banco de Dados:** Supabase (PostgreSQL) com RLS, Indexes otimizados e PL/pgSQL.
* **Bibliotecas Auxiliares:** `qrcodejs` (Geração de QR Code nativo).

---

## ⚙️ Estrutura e Configuração do Banco (Supabase)

O script SQL de inicialização (`db.sql`) é **idempotente** e pode ser executado inteiramente no SQL Editor do Supabase sem quebrar estruturas existentes. Ele gerencia:

1. **Tabelas Operacionais:** `clientes`, `materiais`, `industrializacoes`, `romaneios`, `romaneio_itens`, `config_empresa`.
2. **Tabelas de Segurança:** `usuarios_sistema` e `tentativas_login`.
3. **Migração de Dados:** Conversão automática de colunas legadas em texto para tipos numéricos apropriados.
4. **Índices de Performance:** Otimização de buscas por datas, clientes (em minúsculas) e chaves estrangeiras.
5. **Políticas e Permissões:** Revogação de acessos diretos e liberação de execução para as funções RPC (`login_check`, `usuarios_listar`, `usuario_criar`, `usuario_remover`, `usuario_trocar_senha`).

---

## ▶️ Como Executar o Projeto Localmente

1. Clone este repositório:
   ```bash
   git clone [https://github.com/seu-usuario/seu-repositorio.git](https://github.com/seu-usuario/seu-repositorio.git)

---

## ▶️ Como utilizar

1. Abra o arquivo index.html diretamente no seu navegador ou utilize uma extensão como o Live Server no VS Code.
2. Credenciais de Acesso Padrão (Seed Inicial):
3. Usuário: admin / Senha: 1234

⚠️ Atenção: Altere a senha padrão no primeiro acesso através da aba Cadastros > Alterar Senha de Login.

---

## 📌 Observações

* O sistema depende de conexão com o Supabase
* Os dados são persistidos no banco de dados
* Pode ser hospedado facilmente via GitHub Pages

---

## 👨‍💻 Autor

Desenvolvido por **Marcos De Mori Laiola**

---

## 📄 Licença

Uso livre para projetos pessoais.
