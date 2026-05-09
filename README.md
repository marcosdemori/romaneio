# 🧾 MegaOnline - Sistema de Gestão de Romaneio

<<<<<<< HEAD
Sistema web completo, responsivo e seguro para emissão, controle e reimpressão de romaneios de carregamento. Projetado para atuar com alta performance na gestão de clientes, materiais, industrializações e detalhamento financeiro.
=======
Sistema web completo para emissão, controle, compartilhamento e histórico de romaneios, incluindo gestão de clientes, materiais, industrializações, usuários e configurações da empresa.
>>>>>>> 5f13fd669d4e59acc983183881c4cbf09d92eee3

---

## 🌐 Acesse online

🔗 [https://marcosdemori.github.io/romaneio/](https://marcosdemori.github.io/romaneio/)

---

## 🚀 Principais Funcionalidades

<<<<<<< HEAD
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
=======
* 📄 Emissão de romaneios com cálculo automático
* 📊 Controle de área total em m² e valores financeiros
* 👤 Cadastro e gestão de clientes
* 🪨 Cadastro e gestão de materiais
* ⚙️ Cadastro de industrializações
* 🔐 Controle de usuários do sistema
* 🧾 Histórico completo de romaneios
* 🔎 Busca e filtro no histórico por cliente
* 📤 Exportação de histórico em CSV
* 🖨️ Reimpressão de romaneios pelo histórico
* 📎 Geração de PDF real para compartilhamento
* 📲 Compartilhamento de PDF pelo celular, incluindo iPhone quando suportado pelo navegador
* 💾 Salvamento automático do romaneio antes de compartilhar
* 🏷️ Nome automático do PDF no padrão `CLIENTE_NUMERO.pdf`, exemplo: `XUXU_014.pdf`
* 📱 Layout responsivo otimizado para desktop, Android e iPhone
* 🔗 QR Code com informações de contato
* 🏢 Configurações de empresa, logo, telefone e rede social
>>>>>>> 5f13fd669d4e59acc983183881c4cbf09d92eee3

---

## 🛠️ Tecnologias Utilizadas

<<<<<<< HEAD
* **Frontend:** HTML5, CSS3, JavaScript (Vanilla JS com requisições REST otimizadas via `fetch`).
* **Otimizações:** Implementação de *Debounce* (evita requisições excessivas ao banco durante a digitação) e design fluido/responsivo para mobile e desktop.
* **Backend / Banco de Dados:** Supabase (PostgreSQL) com RLS, Indexes otimizados e PL/pgSQL.
* **Bibliotecas Auxiliares:** `qrcodejs` (Geração de QR Code nativo).
=======
* HTML5
* CSS3
* JavaScript Vanilla
* Supabase
* QRCode.js
* html2pdf.js
* Web Share API
>>>>>>> 5f13fd669d4e59acc983183881c4cbf09d92eee3

---

## ⚙️ Estrutura e Configuração do Banco (Supabase)

O script SQL de inicialização (`db.sql`) é **idempotente** e pode ser executado inteiramente no SQL Editor do Supabase sem quebrar estruturas existentes. Ele gerencia:

<<<<<<< HEAD
1. **Tabelas Operacionais:** `clientes`, `materiais`, `industrializacoes`, `romaneios`, `romaneio_itens`, `config_empresa`.
2. **Tabelas de Segurança:** `usuarios_sistema` e `tentativas_login`.
3. **Migração de Dados:** Conversão automática de colunas legadas em texto para tipos numéricos apropriados.
4. **Índices de Performance:** Otimização de buscas por datas, clientes (em minúsculas) e chaves estrangeiras.
5. **Políticas e Permissões:** Revogação de acessos diretos e liberação de execução para as funções RPC (`login_check`, `usuarios_listar`, `usuario_criar`, `usuario_remover`, `usuario_trocar_senha`).
=======
```bash
git clone https://github.com/marcosdemori/romaneio.git
cd romaneio
```
>>>>>>> 5f13fd669d4e59acc983183881c4cbf09d92eee3

---

## ▶️ Como Executar o Projeto Localmente

<<<<<<< HEAD
1. Clone este repositório:
   ```bash
   git clone [https://github.com/seu-usuario/seu-repositorio.git](https://github.com/seu-usuario/seu-repositorio.git)
=======
* `romaneios`
* `romaneio_itens`
* `clientes`
* `materiais`
* `industrializacoes`
* `usuarios_sistema`
* `config_empresa`

### 3. Configure a conexão

No arquivo principal do sistema, ajuste as constantes de conexão com o Supabase:

```js
const SB_URL = 'SUA_URL_DO_SUPABASE';
const SB_KEY = 'SUA_CHAVE_PUBLICA_DO_SUPABASE';
```

### 4. Hospedagem

O sistema pode ser publicado diretamente no GitHub Pages, pois funciona como aplicação web estática conectada ao Supabase.
>>>>>>> 5f13fd669d4e59acc983183881c4cbf09d92eee3

---

## ▶️ Como utilizar

<<<<<<< HEAD
1. Abra o arquivo index.html diretamente no seu navegador ou utilize uma extensão como o Live Server no VS Code.
2. Credenciais de Acesso Padrão (Seed Inicial):
3. Usuário: admin / Senha: 1234

⚠️ Atenção: Altere a senha padrão no primeiro acesso através da aba Cadastros > Alterar Senha de Login.
=======
1. Acesse o sistema
2. Realize o login
3. Cadastre clientes, materiais e industrializações
4. Crie um novo romaneio
5. Preencha os itens, valores e informações complementares
6. Clique em **Finalizar e Gerar PDF** para salvar e imprimir
7. Use **Compartilhar PDF** para salvar o pedido e enviar o arquivo PDF pelo celular
8. Acesse o **Histórico** para reimprimir, compartilhar ou excluir romaneios

---

## 📊 Histórico

* Visualização detalhada dos romaneios
* Reimpressão de PDF pelo modal de detalhes
* Compartilhamento de PDF real diretamente pelo histórico
* Exclusão individual de registros
* Exportação em CSV
* Estatísticas de quantidade, área total e faturamento

---

## 📱 Compartilhamento de PDF

O sistema gera um arquivo PDF real antes do compartilhamento. Em dispositivos compatíveis com a Web Share API, o PDF é enviado diretamente para aplicativos como WhatsApp, Gmail, AirDrop e outros.

Quando o navegador não permite compartilhar arquivos diretamente, o sistema baixa o PDF como alternativa para envio manual.

O nome do arquivo segue o padrão:

```text
CLIENTE_NUMERO.pdf
```

Exemplo:

```text
XUXU_014.pdf
```

---

## 🧠 Melhorias recentes

* ✅ Otimização visual e de usabilidade para iPhone/mobile
* ✅ Botão de compartilhamento de PDF no novo romaneio
* ✅ Botão de compartilhamento de PDF no histórico
* ✅ Geração de PDF real para compartilhamento, evitando envio de link `file:///`
* ✅ Validação corrigida para impedir geração de PDF quando faltarem dados obrigatórios
* ✅ Salvamento do pedido antes do compartilhamento
* ✅ Nome automático do PDF com cliente e número do romaneio
* ✅ Reimpressão e compartilhamento a partir do histórico
* ✅ Ajustes de responsividade em tabelas, modal e botões
* ✅ Melhor experiência em telas pequenas e dispositivos touch
>>>>>>> 5f13fd669d4e59acc983183881c4cbf09d92eee3

---

## 📌 Observações

* O sistema depende de conexão com o Supabase
* Os dados são persistidos no banco de dados
* O compartilhamento de arquivos depende do suporte do navegador/dispositivo
* Em iPhones, recomenda-se utilizar Safari atualizado
* Pode ser hospedado facilmente via GitHub Pages

---

## 👨‍💻 Autor

Desenvolvido por **Marcos De Mori Laiola**

---

## 📄 Licença

Uso livre para projetos pessoais.
