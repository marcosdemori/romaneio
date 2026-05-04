# 🧾 Sistema de Gestão de Romaneio

Sistema web completo para emissão, controle, compartilhamento e histórico de romaneios, incluindo gestão de clientes, materiais, industrializações, usuários e configurações da empresa.

---

## 🌐 Acesse online

🔗 [https://marcosdemori.github.io/romaneio/](https://marcosdemori.github.io/romaneio/)

---

## 🚀 Funcionalidades

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

---

## 🛠️ Tecnologias utilizadas

* HTML5
* CSS3
* JavaScript Vanilla
* Supabase
* QRCode.js
* html2pdf.js
* Web Share API

---

## ⚙️ Configuração

### 1. Clone o repositório

```bash
git clone https://github.com/marcosdemori/romaneio.git
cd romaneio
```

### 2. Configure o Supabase

Crie as seguintes tabelas no banco:

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

---

## ▶️ Como utilizar

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
