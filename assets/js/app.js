// ─────────────────────────────────────────────
// MODAL DE CONFIRMAÇÃO
// ─────────────────────────────────────────────
function confirmar(msg, onConfirm) {
  document.getElementById('confirmMsg').textContent = msg;
  const okBtn = document.getElementById('confirmOkBtn');
  okBtn.onclick = () => { fecharConfirm(); onConfirm(); };
  document.getElementById('confirmModal').classList.add('open');
}

function fecharConfirm() {
  document.getElementById('confirmModal').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirmModal')?.addEventListener('click', function(e) {
    if (e.target === this) fecharConfirm();
  });
});

// ─────────────────────────────────────────────
// SUPABASE CONFIG
// ─────────────────────────────────────────────
const SB_URL = 'https://kedpkmpcnpbmeaajfcoq.supabase.co';
const SB_KEY = 'sb_publishable_tkcIOM9l-Vq899jSmmFj1g_CtdzawkP';

async function sbFetch(path, method='GET', body=null) {
  const prefer = method === 'POST'
    ? 'return=representation'
    : (method === 'PATCH' || method === 'DELETE' ? 'return=minimal' : '');

  const opts = {
    method,
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': prefer
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(SB_URL + '/rest/v1/' + path, opts);
  if (!r.ok) { const e = await r.text(); throw new Error(e); }
  return r.status === 204 ? null : r.json();
}

const sb = {
  select: (t, q='') => sbFetch(t + '?select=*' + (q ? '&' + q : '')),
  insert: (t, d) => sbFetch(t, 'POST', d),
  update: (t, q, d) => sbFetch(t + '?' + q, 'PATCH', d),
  delete: (t, q) => sbFetch(t + '?' + q, 'DELETE'),
  rpc:    (fn, args = {}) => sbFetch('rpc/' + fn, 'POST', args),
};

// ─────────────────────────────────────────────
// SEGURANÇA - HASH DE SENHA (SHA-256 com salt por usuário)
// ─────────────────────────────────────────────
// A chave SB_KEY publishable é pública por design do Supabase.
// A segurança REAL vem das RLS policies (ver db.sql):
//   • Tabelas operacionais (clientes, materiais, etc) → policy permissiva
//   • usuarios_sistema → BLOQUEADA. Acesso só via RPC (login_check,
//     usuario_criar, usuario_remover, usuario_trocar_senha, usuarios_listar)
//
// O cliente NUNCA recebe hashes de senha — toda comparação é feita no
// servidor dentro das RPCs com SECURITY DEFINER.
async function hashPassword(senha, usuario) {
  const salt = 'megaonline_v1_' + (usuario || '').toLowerCase().trim();
  const data = new TextEncoder().encode(salt + '|' + senha);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return 'h1$' + hashHex;
}

// Nota: a verificação de senha em si acontece nas RPC functions do Supabase
// (login_check, usuario_trocar_senha). O cliente apenas envia o hash.

// ─────────────────────────────────────────────
// DEBOUNCE - evita salvar a cada tecla digitada
// ─────────────────────────────────────────────
function debounce(fn, delay = 600) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const DEFAULT_LOGO = document.querySelector('.login-logo')?.getAttribute('src') || '';
const state = {
  clientes: [],
  materiais: [],
  industrializacoes: [],
  historico: [],
  num: 1,
  logo: DEFAULT_LOGO,
  nomeEmpresa: 'MegaOnline',
  subEmpresa: 'Gestão de Romaneio',
  telefone: '',
  redeTipo: 'instagram.com/',
  redesInput: '',
  usuarios: []
};

let modalIdx = null;
let modalRomaneioId = null;
let editingRomaneioId = null;

// ─────────────────────────────────────────────
// LOAD INICIAL DO BANCO
// ─────────────────────────────────────────────
async function loadFromDB() {
  try {
    const [clis, mats, inds, cfg, roms, todosItens] = await Promise.all([
      sb.select('clientes', 'order=nome'),
      sb.select('materiais', 'order=nome'),
      sb.select('industrializacoes', 'order=nome'),
      sb.select('config_empresa', 'id=eq.1'),
      sb.select('romaneios', 'order=criado_em.desc'),
      sb.select('romaneio_itens', 'order=romaneio_id.asc,id.asc')
    ]);

    state.clientes = clis.map(r => r.nome);
    state.materiais = mats.map(r => r.nome);
    state.industrializacoes = inds.map(r => r.nome);
    // usuarios são carregados sob demanda via RPC (tabela bloqueada para anon)
    state.usuarios = [];

    if (cfg && cfg[0]) {
      const c = cfg[0];
      state.nomeEmpresa = c.nome_empresa || 'MegaOnline';
      state.subEmpresa = c.subtitulo || 'Gestão de Romaneio';
      state.telefone = c.telefone || '';
      state.redeTipo = c.rede_tipo || 'instagram.com/';
      state.redesInput = c.rede_user || '';
      state.logo = c.logo_base64 || DEFAULT_LOGO;
    }

    // Romaneios com itens: uma única consulta em lote evita uma requisição
    // separada para cada romaneio, melhorando bastante o carregamento.
    const itensPorRomaneio = new Map();
    for (const it of (todosItens || [])) {
      const chave = String(it.romaneio_id);
      if (!itensPorRomaneio.has(chave)) itensPorRomaneio.set(chave, []);
      itensPorRomaneio.get(chave).push({
        mat: it.material, ind: it.industrializacao, lote: it.lote,
        c: it.comprimento, a: it.altura, l: it.largura,
        q: it.quantidade, p: it.preco,
        area: it.area, total: it.total
      });
    }

    state.historico = roms.map(r => ({
      id: r.id,
      num: r.numero,
      data: r.data_emissao,
      cliente: r.cliente,
      doc: r.doc_cliente,
      vendedor: r.vendedor,
      pagamento: r.pagamento,
      parcelas: r.parcelas,
      ipi: r.ipi,
      desconto: r.desconto,
      outros: r.outras_despesas,
      area: r.area_total,
      valor: r.valor_total,
      status: normalizarStatusPagamento(r.status_pagamento),
      info: r.informacoes,
      itens: itensPorRomaneio.get(String(r.id)) || []
    }));

    // Próximo número de romaneio
    if (state.historico.length > 0) {
      const nums = state.historico.map(r => parseInt(r.num) || 0);
      state.num = Math.max(...nums) + 1;
    }

    document.getElementById('dbLoading').classList.add('hide');
    return true;
  } catch(e) {
    document.getElementById('dbLoading').innerHTML = `
      <div class="db-err">
        <strong>❌ Erro ao conectar ao banco</strong><br><br>${e.message}<br><br>
        <button onclick="location.reload()" style="background:white;color:#dc3545;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold">Tentar novamente</button>
      </div>`;
    return false;
  }
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
async function fazerLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginErr');

  const showErr = (msg) => {
    errEl.textContent = msg || 'Usuário ou senha incorretos';
    errEl.classList.add('show');
  };

  if (!u || !p) {
    showErr('Preencha usuário e senha');
    return;
  }

  let result = null;
  try {
    const senhaHash = await hashPassword(p, u);
    result = await sb.rpc('login_check', {
      p_usuario:     u,
      p_senha_texto: p,
      p_senha_hash:  senhaHash
    });
  } catch (e) {
    console.error('Erro ao verificar login:', e);
    showErr('Erro de conexão. Tente novamente.');
    return;
  }

  // Bloqueado por excesso de tentativas
  if (result && result.blocked) {
    const segs = Number(result.retry_after_seconds) || 60;
    const min = Math.ceil(segs / 60);
    showErr(`Muitas tentativas falhas. Tente novamente em ${min} min.`);
    document.getElementById('loginPass').value = '';
    return;
  }

  // Senha incorreta ou usuário não existe
  if (!result || !result.ok || !result.user_id) {
    showErr('Usuário ou senha incorretos');
    document.getElementById('loginPass').value = '';
    return;
  }

  // Sucesso
  errEl.classList.remove('show');
  sessionStorage.setItem('t_logado', '1');
  sessionStorage.setItem('u_nome', u);
  sessionStorage.setItem('u_id', result.user_id);

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  init();
}

function fazerLogout() {
  sessionStorage.removeItem('t_logado');
  location.reload();
}

async function checkLogin() {
  document.getElementById('dbLoading').classList.remove('hide');

  const ok = await loadFromDB();
  if (!ok) return;

  document.getElementById('loginNome').innerText = state.nomeEmpresa;

  const loginLogo = document.querySelector('.login-logo');
  if (state.logo && loginLogo) {
    loginLogo.src = state.logo;
  }

  if (sessionStorage.getItem('t_logado') === '1') {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    init();
  }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function init() {
    // 1. Data
    const inputData = document.getElementById('currentDate');
    const spanPrint = document.getElementById('dispDatePrint');
    
    if (inputData) {
        if (!inputData.value) {
            const hoje = new Date();
            inputData.value = hoje.toISOString().split('T')[0];
        }
        
        const atualizarDataPrint = () => {
            const valor = inputData.value;
            if (!valor) return;
            const [ano, mes, dia] = valor.split('-');
            if (spanPrint) spanPrint.innerText = `${dia}/${mes}/${ano}`;
        };
        
        inputData.addEventListener('change', atualizarDataPrint);
        atualizarDataPrint();
    }

    // 2. Vendedor automático
    const usuarioLogado = sessionStorage.getItem('u_nome');
    const inputVendedor = document.getElementById('vendedorInput');
    const dispVendedor = document.getElementById('dispVendedor');

    if (usuarioLogado && inputVendedor) {
        inputVendedor.value = usuarioLogado;
        if (dispVendedor) dispVendedor.innerText = usuarioLogado;
        // Dispara evento input para manter sincronia com outros listeners
        inputVendedor.dispatchEvent(new Event('input'));
    }

    // 3. Número do romaneio
    const numEl = document.getElementById('romaneioNumero');
    if (numEl) {
        numEl.innerText = String(state.num).padStart(3, '0');
    }

    // 4. Sincronização
    updateDropdowns();

    const tbody = document.querySelector('#mainTable tbody');
    if (tbody && tbody.children.length === 0) {
        addRow();
    }

    mostrarLogo(state.logo || DEFAULT_LOGO);

    // 5. Textos editáveis
    const nomeEmpresaEl = document.getElementById('nomeEmpresa');
    const subEmpresaEl = document.getElementById('subEmpresa');

    if (nomeEmpresaEl) {
        nomeEmpresaEl.innerText = state.nomeEmpresa || 'MegaOnline';
        if (!nomeEmpresaEl.dataset.bound) {
            nomeEmpresaEl.addEventListener('blur', async function () {
                const v = this.innerText.trim() || 'MegaOnline';
                this.innerText = v;
                state.nomeEmpresa = v;
                document.title = v + ' - Gestão de Romaneio';
                try {
                    await sb.update('config_empresa', 'id=eq.1', { nome_empresa: v });
                } catch (e) {
                    console.error(e);
                    showToast('Erro ao salvar nome');
                }
            });
            nomeEmpresaEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
            nomeEmpresaEl.dataset.bound = '1';
        }
    }

    if (subEmpresaEl) {
        subEmpresaEl.innerText = state.subEmpresa || 'Gestão de Romaneio';
        if (!subEmpresaEl.dataset.bound) {
            subEmpresaEl.addEventListener('blur', async function () {
                const v = this.innerText.trim() || 'Gestão de Romaneio';
                this.innerText = v;
                state.subEmpresa = v;
                try {
                    await sb.update('config_empresa', 'id=eq.1', { subtitulo: v });
                } catch (e) {
                    console.error(e);
                    showToast('Erro ao salvar subtítulo');
                }
            });
            subEmpresaEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
            subEmpresaEl.dataset.bound = '1';
        }
    }

    document.title = (state.nomeEmpresa || 'MegaOnline') + ' - Gestão de Romaneio';
    atualizarContato();
    atualizarModoEdicaoUI();
}

// ─────────────────────────────────────────────
// DROPDOWNS
// ─────────────────────────────────────────────
function syncCliente() {
  const clienteSelect = document.getElementById('clienteSelect');
  const dispCliente = document.getElementById('dispCliente');

  if (dispCliente) {
    dispCliente.innerText = clienteSelect?.value || '---';
  }

  // ── Atualiza a faixa de identificação do PDF ──
  atualizarPdfIdBar();
}

function updateDropdowns() {
  const clienteSelect = document.getElementById('clienteSelect');

  if (clienteSelect) {
    const clienteAtual = clienteSelect.value;
    clienteSelect.innerHTML = '<option value="">Selecionar cliente...</option>';

    [...state.clientes]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .forEach(cliente => clienteSelect.add(new Option(cliente, cliente)));

    if (clienteAtual && state.clientes.includes(clienteAtual)) {
      clienteSelect.value = clienteAtual;
    }
  }

  document.querySelectorAll('.mat-drop').forEach(select => {
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Selecionar material...</option>';

    [...state.materiais]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .forEach(material => select.add(new Option(material, material)));

    if (valorAtual && state.materiais.includes(valorAtual)) {
      select.value = valorAtual;
    }
  });

  document.querySelectorAll('.ind-drop').forEach(select => {
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Industrialização...</option>';

    [...state.industrializacoes]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .forEach(item => select.add(new Option(item, item)));

    if (valorAtual && state.industrializacoes.includes(valorAtual)) {
      select.value = valorAtual;
    }
  });
}

// ─────────────────────────────────────────────
// FAIXA DE IDENTIFICAÇÃO DO PDF
// ─────────────────────────────────────────────
function atualizarPdfIdBar() {
  const num    = document.getElementById('romaneioNumero')?.innerText.trim() || '---';
  const cli    = document.getElementById('clienteSelect')?.value || '—';

  const idNumEl = document.getElementById('pdfIdNumero');
  const idCliEl = document.getElementById('pdfIdCliente');

  if (idNumEl) idNumEl.textContent = num;
  if (idCliEl) idCliEl.textContent = cli || '—';
}

// ─────────────────────────────────────────────
// TABELA DE ITENS
// ─────────────────────────────────────────────
function addRow() {
  const tbody = document.querySelector('#mainTable tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <input type="number" value="1" min="1" class="q" inputmode="numeric" oninput="calcFinal()" style="width:50px">
    </td>
    <td>
      <select class="mat-drop" style="width:100%;font-size:12px;border:none;background:transparent;min-height:36px"></select>
    </td>
    <td>
      <select class="ind-drop" style="width:100%;font-size:12px;border:none;background:transparent;min-height:36px" onchange="this.style.outline=''"></select>
    </td>
    <td>
      <input type="text" class="lote-input" placeholder="—">
    </td>
    <td class="col-dim">
      <input type="number" step="0.01" min="0" class="c" inputmode="decimal" oninput="calcFinal();validarCampo(this)" placeholder="0.00">
    </td>
    <td class="col-dim">
      <input type="number" step="0.01" min="0" class="a" inputmode="decimal" oninput="calcFinal();validarCampo(this)" placeholder="0.00">
    </td>
    <td class="col-dim">
      <input type="number" step="0.01" min="0" class="l" inputmode="decimal" oninput="calcFinal();validarCampo(this)" placeholder="0.02" value="0.02">
    </td>
    <td class="aI" style="font-weight:600;white-space:nowrap">0.00</td>
    <td>
      <input type="number" min="0" class="p" inputmode="decimal" oninput="calcFinal();validarCampo(this)" placeholder="0.00" style="width:85px">
    </td>
    <td class="tI" style="font-weight:bold;color:var(--primary);white-space:nowrap">0,00</td>
    <td class="no-print">
      <button class="del-row-btn" onclick="this.closest('tr').remove();calcFinal();reidx()" title="Remover linha">×</button>
    </td>
  `;

  tbody.appendChild(tr);
  updateDropdowns();
  reidx();
}

function validarCampo(el) {
  if (!el) return;
  el.classList.toggle('erro', !el.value || parseFloat(el.value) <= 0);
}

function reidx() {
  // sem índice numérico
}

function calcFinal() {
  let areaTotal = 0;
  let subtotal = 0;

  document.querySelectorAll('#mainTable tbody tr').forEach(row => {
    const comprimento = parseFloat(row.querySelector('.c')?.value) || 0;
    const altura = parseFloat(row.querySelector('.a')?.value) || 0;
    const largura = parseFloat(row.querySelector('.l')?.value) || 0;
    const quantidade = parseFloat(row.querySelector('.q')?.value) || 0;
    const preco = parseFloat(row.querySelector('.p')?.value) || 0;

    const area = comprimento * altura * quantidade;
    const total = area * preco;

    const areaEl = row.querySelector('.aI');
    const totalEl = row.querySelector('.tI');

    if (areaEl) areaEl.innerText = area.toFixed(2);
    if (totalEl) {
      totalEl.innerText = total.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    areaTotal += area;
    subtotal += total;
  });

  const ipi = parseFloat(document.getElementById('ipiPerc')?.value) || 0;
  const outrasDespesas = parseFloat(document.getElementById('outrasExp')?.value) || 0;
  const desconto = parseFloat(document.getElementById('descontoF')?.value) || 0;

  const totalLiquido = (subtotal * (1 + ipi / 100)) + outrasDespesas - desconto;

  const totalM2El = document.getElementById('totalM2');
  const subtotalFinEl = document.getElementById('subtotalFin');
  const valorLiquidoEl = document.getElementById('valorLiquido');

  if (totalM2El) totalM2El.innerText = areaTotal.toFixed(2);
  if (subtotalFinEl) {
    subtotalFinEl.innerText = subtotal.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  if (valorLiquidoEl) {
    valorLiquidoEl.innerText = totalLiquido.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  const body = document.getElementById('parcelasBody');
  if (!body) return;

  body.innerHTML = '';

  const qtdParcelas = parseInt(document.getElementById('qtdParc')?.value) || 1;
  const valorParcela = totalLiquido / qtdParcelas;

  for (let i = 1; i <= qtdParcelas; i++) {
    const data = new Date();
    data.setDate(data.getDate() + (i * 30));

    body.innerHTML += `
      <tr style="text-align:center;border-bottom:1px solid #eee">
        <td style="padding:8px 6px">${i}ª Parcela</td>
        <td style="padding:8px 6px">${data.toLocaleDateString('pt-BR')}</td>
        <td style="padding:8px 6px;font-weight:bold;color:var(--primary)">
          R$ ${valorParcela.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </td>
      </tr>
    `;
  }
}

// ─────────────────────────────────────────────
// VERIFICA SE HÁ DADOS PREENCHIDOS (para aviso ao trocar de aba)
// ─────────────────────────────────────────────
function formTemDados() {
  const cliente = document.getElementById('clienteSelect')?.value;
  const doc = document.getElementById('docCliente')?.value;
  const vendedor = document.getElementById('vendedorInput')?.value;
  const info = document.getElementById('infoLogInput')?.value;
  const rows = document.querySelectorAll('#mainTable tbody tr');
  const temLinhaPreenchida = Array.from(rows).some(row => {
    const mat = row.querySelector('.mat-drop')?.value;
    const ind = row.querySelector('.ind-drop')?.value;
    const lote = row.querySelector('.lote-input')?.value;
    const c = row.querySelector('.c')?.value;
    const a = row.querySelector('.a')?.value;
    const l = row.querySelector('.l')?.value;
    const p = row.querySelector('.p')?.value;
    const q = row.querySelector('.q')?.value;
    return mat || ind || lote || (c && parseFloat(c) > 0) || (a && parseFloat(a) > 0) || (l && parseFloat(l) > 0) || (p && parseFloat(p) > 0) || (q && parseInt(q) > 1);
  });
  return !!cliente || !!doc || !!vendedor || !!info || temLinhaPreenchida;
}

// ─────────────────────────────────────────────
// HANDLER PARA BOTÃO "NOVO ROMANEIO" (com aviso)
// ─────────────────────────────────────────────
function handleNovoRomaneio() {
  if (formTemDados()) {
    confirmar('Os dados atuais serão perdidos. Deseja realmente limpar o formulário?', () => {
      limparFormulario();
      ativarAbaNovo();
    });
  } else {
    limparFormulario();
    ativarAbaNovo();
  }
}

// ─────────────────────────────────────────────
// FINALIZAR — SALVA NO BANCO
// ─────────────────────────────────────────────
function verificarNumDuplicado(ignoreId = null) {
  const romaneioNumeroEl = document.getElementById('romaneioNumero');
  const alertaNumEl = document.getElementById('alertaNum');

  const num = romaneioNumeroEl?.innerText.trim() || '';
  const existe = state.historico.some(r => String(r.num) === num && String(r.id) !== String(ignoreId || ''));

  if (alertaNumEl) {
    alertaNumEl.classList.toggle('show', existe);
  }

  return existe;
}


function ativarAbaNovo() {
  const btnNovo = Array.from(document.querySelectorAll('.tab-btn'))
    .find(btn => (btn.textContent || '').includes('Novo Romaneio'));
  openTab('novo', btnNovo || document.querySelector('.tab-btn'));
}

function atualizarModoEdicaoUI() {
  const banner = document.getElementById('editModeBanner');
  const numero = document.getElementById('editModeNumero');
  const btnFinalizar = document.getElementById('btnFinalizar');
  const r = editingRomaneioId ? state.historico.find(x => String(x.id) === String(editingRomaneioId)) : null;

  if (banner) banner.classList.toggle('show', !!editingRomaneioId);
  if (numero) numero.textContent = r?.num || document.getElementById('romaneioNumero')?.innerText || '---';

  if (btnFinalizar) {
    if (editingRomaneioId) {
      btnFinalizar.innerText = '💾 SALVAR ALTERAÇÕES DO ROMANEIO';
      btnFinalizar.style.background = 'var(--warn)';
      btnFinalizar.onclick = salvarEdicaoRomaneio;
    } else {
      btnFinalizar.innerText = '✔ FINALIZAR E GERAR PDF';
      btnFinalizar.style.background = 'var(--primary)';
      btnFinalizar.onclick = finalizar;
      btnFinalizar.disabled = false;
    }
  }
}

function coletarDadosRomaneioFormulario(ignoreDuplicateId = null) {
    const clienteSelect = document.getElementById('clienteSelect');
    const cli = clienteSelect?.value;

    if (!cli) {
        alert('⚠️ Selecione o cliente antes de salvar!');
        return null;
    }

    const rows = document.querySelectorAll('#mainTable tbody tr');
    if (!rows.length) {
        alert('⚠️ Adicione ao menos um item antes de salvar!');
        return null;
    }

    const inputDataValue = document.getElementById('currentDate').value;
    if (!inputDataValue) {
      alert('⚠️ Por favor, selecione uma data válida!');
      return null;
    }
    const [ano, mes, dia] = inputDataValue.split('-');
    const dataParaSalvar = `${dia}/${mes}/${ano}`;

    let invalido = false;
    rows.forEach(row => {
        ['c', 'a', 'l', 'p'].forEach(cls => {
            const inp = row.querySelector('.' + cls);
            if (!inp || !inp.value || parseFloat(inp.value) <= 0) {
                inp?.classList.add('erro');
                invalido = true;
            }
        });
        const indSel = row.querySelector('.ind-drop');
        if (!indSel || !indSel.value) {
            if (indSel) {
                indSel.style.outline = '2px solid var(--danger)';
                indSel.style.borderRadius = '4px';
            }
            invalido = true;
        }
    });

    if (invalido) {
        alert('⚠️ Preencha todos os campos obrigatórios!');
        return null;
    }

    if (verificarNumDuplicado(ignoreDuplicateId)) {
        const continuar = confirm('Número de romaneio já existe em outro registro. Continuar mesmo assim?');
        if (!continuar) return null;
    }

    const itens = [];
    rows.forEach(row => {
        const c = parseFloat(row.querySelector('.c')?.value) || 0;
        const a = parseFloat(row.querySelector('.a')?.value) || 0;
        const l = parseFloat(row.querySelector('.l')?.value) || 0.02;
        const q = parseFloat(row.querySelector('.q')?.value) || 0;
        const p = parseFloat(row.querySelector('.p')?.value) || 0;

        itens.push({
            material: row.querySelector('.mat-drop')?.value || '',
            industrializacao: row.querySelector('.ind-drop')?.value || '',
            lote: row.querySelector('.lote-input')?.value || '',
            comprimento: c,
            altura: a,
            largura: l,
            quantidade: q,
            preco: p,
            area: parseFloat((c * a * q).toFixed(4)),
            total: parseFloat((c * a * q * p).toFixed(4))
        });
    });

    const numRomaneio = document.getElementById('romaneioNumero')?.innerText.trim() || '';

    const romaneio = {
        numero: numRomaneio,
        data_emissao: dataParaSalvar,
        cliente: cli,
        doc_cliente: document.getElementById('docCliente')?.value || '',
        vendedor: document.getElementById('vendedorInput')?.value || '',
        pagamento: document.getElementById('pagSelect')?.value || '',
        parcelas: parseInt(document.getElementById('qtdParc')?.value) || 1,
        ipi: parseFloat(document.getElementById('ipiPerc')?.value) || 0,
        desconto: parseFloat(document.getElementById('descontoF')?.value) || 0,
        outras_despesas: parseFloat(document.getElementById('outrasExp')?.value) || 0,
        area_total: parseFloat(document.getElementById('totalM2')?.innerText) || 0,
        valor_total: parseFloat(
            (document.getElementById('valorLiquido')?.innerText || '0')
                .replace(/\./g, '')
                .replace(',', '.')
        ) || 0,
        informacoes: document.getElementById('infoLogInput')?.value || ''
    };

    return { cli, numRomaneio, romaneio, itens };
}

function normalizarStatusPagamento(status) {
  return String(status || '').toLowerCase() === 'pago' ? 'pago' : 'pendente';
}

function statusPagamentoLabel(status) {
  return normalizarStatusPagamento(status) === 'pago' ? 'Pago' : 'Pendente';
}

function statusPagamentoIcone(status) {
  return normalizarStatusPagamento(status) === 'pago' ? '✓' : '!';
}

function toHistoricoRomaneio(id, romaneio, itens, statusAtual = null) {
  return {
    id,
    num: romaneio.numero,
    data: romaneio.data_emissao,
    cliente: romaneio.cliente,
    doc: romaneio.doc_cliente,
    vendedor: romaneio.vendedor,
    pagamento: romaneio.pagamento,
    parcelas: romaneio.parcelas,
    ipi: romaneio.ipi,
    desconto: romaneio.desconto,
    outros: romaneio.outras_despesas,
    area: romaneio.area_total,
    valor: romaneio.valor_total,
    status: normalizarStatusPagamento(statusAtual || romaneio.status_pagamento),
    info: romaneio.informacoes,
    itens: itens.map(it => ({
      mat: it.material,
      ind: it.industrializacao,
      lote: it.lote,
      c: it.comprimento,
      a: it.altura,
      l: it.largura,
      q: it.quantidade,
      p: it.preco,
      area: it.area,
      total: it.total
    }))
  };
}

function preencherFormularioRomaneio(r) {
    if (!r) return;

    updateDropdowns();
    document.getElementById('romaneioNumero').innerText = r.num;

    const partesData = String(r.data || '').split('/');
    if (partesData.length === 3) {
        document.getElementById('currentDate').value = `${partesData[2]}-${partesData[1]}-${partesData[0]}`;
    }

    document.getElementById('clienteSelect').value = r.cliente || '';
    document.getElementById('docCliente').value = r.doc || '';
    document.getElementById('vendedorInput').value = r.vendedor || '';
    document.getElementById('pagSelect').value = r.pagamento || 'Boleto';
    document.getElementById('qtdParc').value = r.parcelas || 1;
    document.getElementById('ipiPerc').value = r.ipi || 0;
    document.getElementById('outrasExp').value = r.outros || 0;
    document.getElementById('descontoF').value = r.desconto || 0;
    document.getElementById('infoLogInput').value = r.info || '';

    syncCliente();
    document.getElementById('dispDoc').innerText = r.doc || '';
    document.getElementById('dispVendedor').innerText = r.vendedor || '---';
    document.getElementById('dispPagamento').innerText = r.pagamento || 'Boleto';
    document.getElementById('dispInfoLog').innerText = r.info || '';
    document.getElementById('dispInfoLog').style.display = r.info ? 'block' : 'none';

    const tbody = document.querySelector('#mainTable tbody');
    tbody.innerHTML = '';

    (r.itens || []).forEach(it => {
        addRow();
        const lastRow = tbody.lastElementChild;
        lastRow.querySelector('.mat-drop').value = it.mat || '';
        lastRow.querySelector('.ind-drop').value = it.ind || '';
        lastRow.querySelector('.lote-input').value = it.lote || '';
        lastRow.querySelector('.c').value = it.c || '';
        lastRow.querySelector('.a').value = it.a || '';
        lastRow.querySelector('.l').value = it.l || 0.02;
        lastRow.querySelector('.q').value = it.q || 1;
        lastRow.querySelector('.p').value = it.p || '';
    });

    if (!tbody.children.length) addRow();
    calcFinal();
    atualizarPdfIdBar();
}

function carregarRomaneioParaEdicao(id) {
  const r = state.historico.find(x => String(x.id) === String(id));
  if (!r) return;

  editingRomaneioId = id;
  preencherFormularioRomaneio(r);
  atualizarModoEdicaoUI();
  fecharModal();
  ativarAbaNovo();
  showToast(`Editando romaneio Nº ${r.num}`);
}

function cancelarEdicaoRomaneio() {
  editingRomaneioId = null;
  limparFormulario();
  atualizarModoEdicaoUI();
  showToast('Edição cancelada');
}

async function salvarEdicaoRomaneio() {
    if (!editingRomaneioId) return;

    const dados = coletarDadosRomaneioFormulario(editingRomaneioId);
    if (!dados) return;

    const btnFinalizar = document.getElementById('btnFinalizar');
    const textoOriginal = btnFinalizar.innerText;
    btnFinalizar.disabled = true;
    btnFinalizar.innerText = '⏳ Salvando alterações...';

    try {
        await sb.update('romaneios', 'id=eq.' + editingRomaneioId, dados.romaneio);
        await sb.delete('romaneio_itens', 'romaneio_id=eq.' + editingRomaneioId);
        const itensComId = dados.itens.map(it => ({ ...it, romaneio_id: editingRomaneioId }));
        if (itensComId.length) await sb.insert('romaneio_itens', itensComId);

        const anterior = state.historico.find(r => String(r.id) === String(editingRomaneioId));
        const atualizado = toHistoricoRomaneio(editingRomaneioId, dados.romaneio, dados.itens, anterior?.status);
        state.historico = state.historico.map(r => String(r.id) === String(editingRomaneioId) ? atualizado : r);

        editingRomaneioId = null;
        renderHist();
        limparFormulario();
        atualizarModoEdicaoUI();
        showToast('✅ Romaneio atualizado com sucesso!');
        ativarAbaNovo();
    } catch (e) {
        console.error(e);
        showToast('❌ Erro ao atualizar: ' + e.message, true);
        btnFinalizar.disabled = false;
        btnFinalizar.innerText = textoOriginal;
    }
}

async function finalizar() {
    const clienteSelect = document.getElementById('clienteSelect');
    const cli = clienteSelect?.value;

    if (!cli) {
        alert('⚠️ Selecione o cliente antes de finalizar!');
        return;
    }

    const rows = document.querySelectorAll('#mainTable tbody tr');
    if (!rows.length) {
        alert('⚠️ Adicione ao menos um item antes de finalizar!');
        return;
    }

    const inputDataValue = document.getElementById('currentDate').value;
    if (!inputDataValue) {
      alert('⚠️ Por favor, selecione uma data válida!');
      return;
    }
    const [ano, mes, dia] = inputDataValue.split('-');
    const dataParaSalvar = `${dia}/${mes}/${ano}`;

    let invalido = false;
    rows.forEach(row => {
        ['c', 'a', 'l', 'p'].forEach(cls => {
            const inp = row.querySelector('.' + cls);
            if (!inp || !inp.value || parseFloat(inp.value) <= 0) {
                inp?.classList.add('erro');
                invalido = true;
            }
        });
        const indSel = row.querySelector('.ind-drop');
        if (!indSel || !indSel.value) {
            if (indSel) {
                indSel.style.outline = '2px solid var(--danger)';
                indSel.style.borderRadius = '4px';
            }
            invalido = true;
        }
    });

    if (invalido) {
        alert('⚠️ Preencha todos os campos obrigatórios!');
        return;
    }

    if (verificarNumDuplicado()) {
        const continuar = confirm('Número de romaneio já existe. Continuar?');
        if (!continuar) return;
    }

    const itens = [];
    rows.forEach(row => {
        const c = parseFloat(row.querySelector('.c')?.value) || 0;
        const a = parseFloat(row.querySelector('.a')?.value) || 0;
        const l = parseFloat(row.querySelector('.l')?.value) || 0.02;
        const q = parseFloat(row.querySelector('.q')?.value) || 0;
        const p = parseFloat(row.querySelector('.p')?.value) || 0;

        itens.push({
            material: row.querySelector('.mat-drop')?.value || '',
            industrializacao: row.querySelector('.ind-drop')?.value || '',
            lote: row.querySelector('.lote-input')?.value || '',
            comprimento: c,
            altura: a,
            largura: l,
            quantidade: q,
            preco: p,
            area: parseFloat((c * a * q).toFixed(4)),
            total: parseFloat((c * a * q * p).toFixed(4))
        });
    });

    const numRomaneio = document.getElementById('romaneioNumero')?.innerText.trim() || '';

    const romaneio = {
        numero: numRomaneio,
        data_emissao: dataParaSalvar,
        cliente: cli,
        doc_cliente: document.getElementById('docCliente')?.value || '',
        vendedor: document.getElementById('vendedorInput')?.value || '',
        pagamento: document.getElementById('pagSelect')?.value || '',
        parcelas: parseInt(document.getElementById('qtdParc')?.value) || 1,
        ipi: parseFloat(document.getElementById('ipiPerc')?.value) || 0,
        desconto: parseFloat(document.getElementById('descontoF')?.value) || 0,
        outras_despesas: parseFloat(document.getElementById('outrasExp')?.value) || 0,
        area_total: parseFloat(document.getElementById('totalM2')?.innerText) || 0,
        valor_total: parseFloat(
            (document.getElementById('valorLiquido')?.innerText || '0')
                .replace(/\./g, '')
                .replace(',', '.')
        ) || 0,
        status_pagamento: 'pendente',
        informacoes: document.getElementById('infoLogInput')?.value || ''
    };

    // Indicador de salvamento
    const btnFinalizar = document.getElementById('btnFinalizar');
    const textoOriginal = btnFinalizar.innerText;
    btnFinalizar.disabled = true;
    btnFinalizar.innerText = '⏳ Salvando...';

    showToast('Salvando no banco...', false);

    try {
        const [saved] = await sb.insert('romaneios', romaneio);
        const itensComId = itens.map(it => ({
            ...it,
            romaneio_id: saved.id
        }));

        await sb.insert('romaneio_itens', itensComId);

        state.num++;
        state.historico.unshift({
            id: saved.id,
            num: romaneio.numero,
            data: romaneio.data_emissao,
            cliente: romaneio.cliente,
            doc: romaneio.doc_cliente,
            vendedor: romaneio.vendedor,
            pagamento: romaneio.pagamento,
            parcelas: romaneio.parcelas,
            ipi: romaneio.ipi,
            desconto: romaneio.desconto,
            outros: romaneio.outras_despesas,
            area: romaneio.area_total,
            valor: romaneio.valor_total,
            status: normalizarStatusPagamento(romaneio.status_pagamento),
            info: romaneio.informacoes,
            itens: itens.map(it => ({
                mat: it.material,
                ind: it.industrializacao,
                lote: it.lote,
                c: it.comprimento,
                a: it.altura,
                l: it.largura,
                q: it.quantidade,
                p: it.preco,
                area: it.area,
                total: it.total
            }))
        });

        showToast('✅ Romaneio salvo com sucesso!');
    } catch (e) {
        console.error(e);
        showToast('❌ Erro ao salvar: ' + e.message, true);
        btnFinalizar.disabled = false;
        btnFinalizar.innerText = textoOriginal;
        return;
    }

    const dispInfoLog = document.getElementById('dispInfoLog');
    if (dispInfoLog) {
        dispInfoLog.innerText = romaneio.informacoes;
        dispInfoLog.style.display = romaneio.informacoes ? 'block' : 'none';
    }

    // ── Atualiza a faixa de ID e o título do documento antes de imprimir ──
    atualizarPdfIdBar();

    // Título do documento = nome que aparece no "Salvar PDF" do browser
    const nomeEmpresaAtual = state.nomeEmpresa || 'MegaOnline';
    const cliParaPdf = cli.replace(/[/\\?%*:|"<>]/g, '-'); // sanitiza caracteres inválidos
    document.title = `Romaneio_${String(numRomaneio).padStart(3,'0')}_${cliParaPdf}`;

    window.print();

    // Restaura o título original e o botão após o print
    setTimeout(() => {
        btnFinalizar.disabled = false;
        btnFinalizar.innerText = textoOriginal;
        document.title = nomeEmpresaAtual + ' - Gestão de Romaneio';
        location.reload();
    }, 800);
}

// ─────────────────────────────────────────────
// HISTÓRICO
// ─────────────────────────────────────────────
function renderHist() {
  const body = document.getElementById('histBody');
  const busca = document.getElementById('buscaHist')?.value.toLowerCase() || '';

  if (!body) return;

  const filtrados = state.historico.filter(r =>
    (r.cliente || '').toLowerCase().includes(busca)
  );

  let areaAcum = 0;
  let valorAcum = 0;

  // Monta todo o HTML uma única vez. Evita reparsing e relayout a cada linha.
  body.innerHTML = filtrados.map(r => {
    const area = parseFloat(r.area) || 0;
    const valor = parseFloat(r.valor) || 0;
    const status = normalizarStatusPagamento(r.status);

    areaAcum += area;
    valorAcum += valor;

    return `
      <tr onclick="abrirModal('${r.id}')" title="Clique para detalhes">
        <td><strong>#${r.num}</strong></td>
        <td>${r.data}</td>
        <td style="text-align:left">${r.cliente}</td>
        <td>${area.toFixed(2)} m²</td>
        <td style="font-weight:bold;color:var(--primary)">
          R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </td>
        <td onclick="event.stopPropagation()">
          <button
            type="button"
            class="status-pagamento-btn ${status}"
            data-status-id="${r.id}"
            onclick="alterarStatusPagamento('${r.id}', this)"
            title="Clique para alterar o status"
          >
            <span aria-hidden="true">${statusPagamentoIcone(status)}</span>
            <span class="status-pagamento-texto">${statusPagamentoLabel(status)}</span>
          </button>
        </td>
        <td class="no-print" onclick="event.stopPropagation()">
          <button class="btn-sm" style="background:var(--danger);color:white" onclick="delHist('${r.id}')">×</button>
        </td>
      </tr>`;
  }).join('');

  document.getElementById('statQtd').innerText = filtrados.length;
  document.getElementById('statArea').innerText = areaAcum.toFixed(2);
  document.getElementById('statValor').innerText =
    valorAcum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function atualizarBotoesStatusPagamento(id, status, desabilitado = false) {
  const statusNormalizado = normalizarStatusPagamento(status);

  document.querySelectorAll('.status-pagamento-btn').forEach(botao => {
    if (String(botao.dataset.statusId) !== String(id)) return;

    botao.classList.toggle('pago', statusNormalizado === 'pago');
    botao.classList.toggle('pendente', statusNormalizado === 'pendente');
    botao.disabled = desabilitado;

    const icone = botao.querySelector('[aria-hidden="true"]');
    const texto = botao.querySelector('.status-pagamento-texto');
    if (icone) icone.textContent = statusPagamentoIcone(statusNormalizado);
    if (texto) texto.textContent = statusPagamentoLabel(statusNormalizado);
  });
}

async function alterarStatusPagamento(id, botao = null) {
  const romaneio = state.historico.find(r => String(r.id) === String(id));
  if (!romaneio || botao?.disabled) return;

  const statusAnterior = normalizarStatusPagamento(romaneio.status);
  const novoStatus = statusAnterior === 'pago' ? 'pendente' : 'pago';

  // Atualização otimista: a interface responde imediatamente e apenas os
  // botões do romaneio alterado são atualizados, sem reconstruir a tabela.
  romaneio.status = novoStatus;
  atualizarBotoesStatusPagamento(id, novoStatus, true);

  try {
    await sb.update('romaneios', 'id=eq.' + id, { status_pagamento: novoStatus });
    atualizarBotoesStatusPagamento(id, novoStatus, false);

    showToast(novoStatus === 'pago'
      ? '✅ Romaneio marcado como pago'
      : '⚠️ Romaneio marcado como pendente');
  } catch (e) {
    console.error(e);
    romaneio.status = statusAnterior;
    atualizarBotoesStatusPagamento(id, statusAnterior, false);
    showToast('❌ Erro ao alterar o status: ' + e.message, true);
  }
}

function abrirModal(id) {
  const r = state.historico.find(x => x.id === id);
  if (!r) return;

  modalRomaneioId = id;

  let itensHtml = '';

  if (r.itens?.length) {
    itensHtml = `
      <div class="modal-table-wrap" style="width:100%;overflow-x:auto;border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;min-width:520px">
          <thead>
            <tr style="background:#f0f0f0">
              <th style="padding:6px;text-align:left">Material</th>
              <th style="padding:6px">Industrializ.</th>
              <th style="padding:6px">Lote</th>
              <th style="padding:6px">m²</th>
              <th style="padding:6px">Total</th>
            </tr>
          </thead>
          <tbody>
            ${r.itens.map(it => `
              <tr style="border-bottom:1px solid #eee">
                <td style="padding:6px;text-align:left">${it.mat || '—'}</td>
                <td style="padding:6px;text-align:center">${it.ind || '—'}</td>
                <td style="padding:6px;text-align:center">${it.lote || '—'}</td>
                <td style="padding:6px;text-align:center">${it.area}</td>
                <td style="padding:6px;text-align:center;font-weight:bold">
                  R$ ${(parseFloat(it.total) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }
  
  document.getElementById('btnEditarHist').onclick = () => carregarRomaneioParaEdicao(id);
  document.getElementById('btnImprimirHist').onclick = () => reimprimirDoHistorico(id);

  document.getElementById('modalContent').innerHTML = `
    <div style="
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
      gap:8px;
      font-size:13px;
      background:#f9f9f9;
      padding:12px;
      border-radius:8px;
      margin-bottom:10px
    ">
      <div><strong>Cliente:</strong> ${r.cliente}</div>
      <div><strong>Data:</strong> ${r.data}</div>
      <div><strong>CNPJ/CPF:</strong> ${r.doc || '—'}</div>
      <div><strong>Vendedor:</strong> ${r.vendedor || '—'}</div>
      <div><strong>Pagamento:</strong> ${r.pagamento || '—'}</div>
      <div><strong>Parcelas:</strong> ${r.parcelas || 1}x</div>
      <div class="modal-status-row">
        <strong>Status:</strong>
        <button
          type="button"
          class="status-pagamento-btn ${normalizarStatusPagamento(r.status)}"
          data-status-id="${r.id}"
          onclick="alterarStatusPagamento('${r.id}', this)"
          title="Clique para alterar o status"
        >
          <span aria-hidden="true">${statusPagamentoIcone(r.status)}</span>
          <span class="status-pagamento-texto">${statusPagamentoLabel(r.status)}</span>
        </button>
      </div>
      <div><strong>Área Total:</strong> ${r.area} m²</div>
      <div>
        <strong>Valor Final:</strong>
        <span style="color:var(--primary);font-weight:bold">
          R$ ${(parseFloat(r.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>

    ${r.info ? `
      <p style="font-size:12px;color:#555;background:#fffde7;padding:8px;border-radius:6px;margin-bottom:8px">
        📝 ${r.info}
      </p>` : ''}

    <p style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--primary);margin-bottom:4px">
      Itens carregados
    </p>

    ${itensHtml || '<p style="font-size:12px;color:#aaa">Sem itens</p>'}
  `;

  document.getElementById('btnDelModal').onclick = () => {
    fecharModal();
    delHist(id);
  };

  document.getElementById('modalEdit').classList.add('open');
}

function fecharModal() {
  document.getElementById('modalEdit')?.classList.remove('open');
  modalRomaneioId = null;
}

document.getElementById('modalEdit')?.addEventListener('click', function (e) {
  if (e.target === this) fecharModal();
});

async function delHist(id) {
    confirmar('Deseja realmente excluir este romaneio? Esta ação não pode ser desfeita.', async () => {
        try {
            await sb.delete('romaneios', 'id=eq.' + id);
            state.historico = state.historico.filter(r => r.id !== id);
            renderHist();
            showToast('Romaneio excluído');
        } catch (e) {
            console.error(e);
            showToast('Erro ao excluir', true);
        }
    });
}

async function limparHistorico() {
    confirmar('⚠️ ATENÇÃO: Deseja apagar TODO o histórico de romaneios? Esta ação é irreversível.', async () => {
        try {
            await sb.delete('romaneios', 'id=not.is.null');
            state.historico = [];
            renderHist();
            showToast('Histórico limpo com sucesso');
        } catch (e) {
            console.error(e);
            showToast('Erro ao limpar histórico', true);
        }
    });
}

function exportarCSV() {
  let csv = "Numero;Data;Cliente;CNPJ_CPF;Vendedor;Pagamento;Parcelas;Area_m2;Valor_Final;Status;Itens\n";

  state.historico.forEach(r => {
    const itensStr = r.itens
      ? r.itens.map(it => `${it.mat}(${it.area}m²)`).join('|')
      : '';

    csv += `${r.num};${r.data};${r.cliente};${r.doc || ''};${r.vendedor || ''};${r.pagamento || ''};${r.parcelas || 1};${r.area};${r.valor};${statusPagamentoLabel(r.status)};"${itensStr}"\n`;
  });

  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');

  a.href = URL.createObjectURL(blob);
  a.download = 'romaneios.csv';
  a.click();
}

function openTab(id, btn) {
  document.querySelectorAll('.tab-content, .tab-btn')
    .forEach(el => el.classList.remove('active'));

  document.getElementById(id)?.classList.add('active');
  btn?.classList.add('active');

  if (id === 'historico') renderHist();
  if (id === 'cadastros') renderCadastros();
}

function reimprimirDoHistorico(id) {
    const r = state.historico.find(x => x.id === id);
    if (!r) return;

    // 1. Preenche o cabeçalho
    document.getElementById('romaneioNumero').innerText = r.num;
    // Tratamento robusto da data
    const partesData = r.data.split('/');
    if (partesData.length === 3) {
        document.getElementById('currentDate').value = `${partesData[2]}-${partesData[1]}-${partesData[0]}`;
    }
    document.getElementById('clienteSelect').value = r.cliente;
    document.getElementById('docCliente').value = r.doc;
    document.getElementById('vendedorInput').value = r.vendedor;
    document.getElementById('pagSelect').value = r.pagamento;
    document.getElementById('qtdParc').value = r.parcelas;
    document.getElementById('ipiPerc').value = r.ipi;
    document.getElementById('outrasExp').value = r.outros;
    document.getElementById('descontoF').value = r.desconto;
    document.getElementById('infoLogInput').value = r.info;
    
    // Sincroniza labels visuais
    syncCliente();
    document.getElementById('dispVendedor').innerText = r.vendedor;
    document.getElementById('dispPagamento').innerText = r.pagamento;
    document.getElementById('dispInfoLog').innerText = r.info;
    document.getElementById('dispInfoLog').style.display = r.info ? 'block' : 'none';

    // 2. Limpa a tabela atual e preenche com os itens do histórico
    const tbody = document.querySelector('#mainTable tbody');
    tbody.innerHTML = '';
    
    r.itens.forEach(it => {
        addRow();
        const lastRow = tbody.lastElementChild;
        lastRow.querySelector('.mat-drop').value = it.mat;
        lastRow.querySelector('.ind-drop').value = it.ind;
        lastRow.querySelector('.lote-input').value = it.lote;
        lastRow.querySelector('.c').value = it.c;
        lastRow.querySelector('.a').value = it.a;
        lastRow.querySelector('.l').value = it.l;
        lastRow.querySelector('.q').value = it.q;
        lastRow.querySelector('.p').value = it.p;
    });

    // 3. Recalcula totais e dispara o Print
    calcFinal();
    fecharModal();
    openTab('novo');
    
    // Bloqueia o botão para evitar salvar por cima do histórico
    const btnFinalizar = document.getElementById('btnFinalizar');
    btnFinalizar.disabled = true;
    btnFinalizar.innerText = "SISTEMA EM MODO DE REIMPRESSÃO";
    btnFinalizar.style.background = "#636e72";

    // Dispara o Print
    setTimeout(() => {
        window.print();
        
        // Limpeza automática e restauração do botão após a saída da impressão
        btnFinalizar.disabled = false;
        btnFinalizar.innerText = "✔ FINALIZAR E GERAR PDF";
        btnFinalizar.style.background = "var(--primary)";
        
        limparFormulario();
        showToast("Formulário resetado para novo romaneio");
    }, 500);
}

function limparFormulario() {
    editingRomaneioId = null;

    // 1. Resetar o número para o próximo disponível
    if (state.historico.length > 0) {
        const nums = state.historico.map(r => parseInt(r.num) || 0);
        state.num = Math.max(...nums) + 1;
    } else {
        state.num = 1;
    }
    document.getElementById('romaneioNumero').innerText = String(state.num).padStart(3, '0');

    // 2. Resetar campos de texto e selects
    document.getElementById('clienteSelect').value = '';
    document.getElementById('docCliente').value = '';
    document.getElementById('dispDoc').innerText = '';
    document.getElementById('pagSelect').value = 'Boleto';
    document.getElementById('qtdParc').value = '1';
    document.getElementById('ipiPerc').value = '0';
    document.getElementById('outrasExp').value = '0';
    document.getElementById('descontoF').value = '0';
    document.getElementById('infoLogInput').value = '';

    // 3. Resetar data para hoje
    const inputData = document.getElementById('currentDate');
    const hoje = new Date();
    inputData.value = hoje.toISOString().split('T')[0];
    
    // 4. Sincronizar labels visuais
    syncCliente();
    document.getElementById('dispVendedor').innerText = sessionStorage.getItem('u_nome') || '---';
    document.getElementById('dispPagamento').innerText = 'Boleto';
    document.getElementById('dispInfoLog').style.display = 'none';

    // 5. Limpar a tabela e adicionar uma linha em branco
    const tbody = document.querySelector('#mainTable tbody');
    tbody.innerHTML = '';
    addRow();

    // 6. Recalcular totais (zerar)
    calcFinal();
    atualizarModoEdicaoUI();
}

// ─────────────────────────────────────────────
// CADASTROS
// ─────────────────────────────────────────────
async function renderCadastros() {
  renderCadList('clientes', 'clientes', 'cliList', 'cliCount');
  renderCadList('materiais', 'materiais', 'matList', 'matCount');
  renderCadList('industrializacoes', 'industrializacoes', 'indList', 'indCount');

  // Carrega lista de usuários via RPC (tabela usuarios_sistema é bloqueada para anon)
  try {
    const lista = await sb.rpc('usuarios_listar', {});
    state.usuarios = (lista || []).map(r => ({ id: r.id, user: r.usuario }));
  } catch (e) {
    console.error('Erro ao carregar usuários:', e);
    state.usuarios = [];
  }
  renderUserList();

  document.getElementById('cfgNome').value = state.nomeEmpresa || '';
  document.getElementById('cfgSub').value = state.subEmpresa || '';
  document.getElementById('cfgTel').value = state.telefone || '';
  document.getElementById('cfgRedeTipo').value = state.redeTipo || '';
  document.getElementById('cfgRedeUser').value = state.redesInput || '';
}

function renderCadList(stateKey, table, listId, countId) {
  const ul = document.getElementById(listId);
  const count = document.getElementById(countId);
  const arr = state[stateKey] || [];

  if (!ul || !count) return;

  count.innerText = `${arr.length} cadastrado${arr.length !== 1 ? 's' : ''}`;

  if (!arr.length) {
    ul.innerHTML = '<li class="cad-empty">Nenhum cadastro ainda</li>';
    return;
  }

  ul.innerHTML = '';

  [...arr]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach(item => {
      const li = document.createElement('li');

      const span = document.createElement('span');
      span.textContent = item;

      const btn = document.createElement('button');
      btn.className = 'btn-cad-del';
      btn.title = 'Remover';
      btn.textContent = '×';

      btn.onclick = () =>
        cadDelByName(stateKey, table, listId, countId, item);

      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
}

function renderUserList() {
  const ul = document.getElementById('userList');
  const count = document.getElementById('userCount');
  const arr = state.usuarios || [];

  if (!ul || !count) return;

  count.innerText = `${arr.length} usuário${arr.length !== 1 ? 's' : ''}`;
  ul.innerHTML = '';

  arr.forEach((u, i) => {
    const li = document.createElement('li');

    const span = document.createElement('span');
    span.innerHTML = `${u.user} <span class="user-badge">●●●●</span>`;
    li.appendChild(span);

    if (arr.length > 1) {
      const btn = document.createElement('button');
      btn.className = 'btn-cad-del';
      btn.textContent = '×';

      btn.onclick = () => cadDelUser(i);

      li.appendChild(btn);
    }

    ul.appendChild(li);
  });
}

async function cadAdd(stateKey, table, inputId, listId, countId) {
  const input = document.getElementById(inputId);
  const val = input?.value.trim();

  if (!val) return;

  if (state[stateKey].includes(val)) {
    showToast('Já cadastrado!', true);
    return;
  }

  try {
    await sb.insert(table, { nome: val });

    state[stateKey].push(val);

    input.value = '';

    renderCadList(stateKey, table, listId, countId);
    updateDropdowns();

    showToast(`"${val}" adicionado!`);
  } catch (e) {
    console.error(e);
    showToast('Erro: ' + e.message, true);
  }
}

async function cadDelByName(stateKey, table, listId, countId, name) {
    confirmar(`Deseja remover "${name}" da lista de ${stateKey}?`, async () => {
        try {
            await sb.delete(table, 'nome=eq.' + encodeURIComponent(name));
            state[stateKey] = state[stateKey].filter(x => x !== name);
            renderCadList(stateKey, table, listId, countId);
            updateDropdowns();
            showToast(`"${name}" removido`);
        } catch (e) {
            console.error(e);
            showToast('Erro ao remover item', true);
        }
    });
}

async function cadAddUser() {
  const u = document.getElementById('userInput').value.trim();
  const p = document.getElementById('passInput').value;

  if (!u || !p) {
    showToast('Preencha usuário e senha!', true);
    return;
  }

  if (state.usuarios.some(x => x.user === u)) {
    showToast('Usuário já existe!', true);
    return;
  }

  try {
    const senhaHash = await hashPassword(p, u);

    const novoId = await sb.rpc('usuario_criar', {
      p_usuario:    u,
      p_senha_hash: senhaHash
    });

    if (!novoId) {
      showToast('Não foi possível criar (nome em uso?)', true);
      return;
    }

    state.usuarios.push({ user: u, id: novoId });

    document.getElementById('userInput').value = '';
    document.getElementById('passInput').value = '';

    renderUserList();
    showToast('Usuário criado!');
  } catch (e) {
    console.error(e);
    showToast('Erro: ' + e.message, true);
  }
}

async function cadDelUser(idx) {
    if (state.usuarios.length <= 1) {
        showToast('Deve haver ao menos um usuário no sistema!', true);
        return;
    }

    const u = state.usuarios[idx];
    confirmar(`Deseja remover o acesso do usuário "${u.user}"?`, async () => {
        try {
            const ok = await sb.rpc('usuario_remover', { p_id: u.id });
            if (!ok) {
                showToast('Não foi possível remover (último usuário?)', true);
                return;
            }
            state.usuarios.splice(idx, 1);
            renderUserList();
            showToast(`Usuário "${u.user}" removido`);
        } catch (e) {
            console.error(e);
            showToast('Erro ao remover usuário', true);
        }
    });
}

async function salvarConfigEmpresa() {
  const nome = document.getElementById('cfgNome').value.trim() || 'MegaOnline';
  const sub = document.getElementById('cfgSub').value.trim() || 'Gestão de Romaneio';

  try {
    await sb.update('config_empresa', 'id=eq.1', {
      nome_empresa: nome,
      subtitulo: sub
    });

    state.nomeEmpresa = nome;
    state.subEmpresa = sub;

    document.getElementById('nomeEmpresa').innerText = nome;
    document.getElementById('subEmpresa').innerText = sub;
    document.getElementById('loginNome').innerText = nome;

    document.title = `${nome} - Gestão de Romaneio`;

    showToast('Configurações salvas!');
  } catch (e) {
    console.error(e);
    showToast('Erro ao salvar configurações', true);
  }
}

async function salvarConfigContato() {
  const tel = document.getElementById('cfgTel').value.trim();
  const tipo = document.getElementById('cfgRedeTipo').value;
  const user = document.getElementById('cfgRedeUser').value.trim();

  try {
    await sb.update('config_empresa', 'id=eq.1', {
      telefone: tel,
      rede_tipo: tipo,
      rede_user: user
    });

    state.telefone = tel;
    state.redeTipo = tipo;
    state.redesInput = user;

    atualizarContato();

    showToast('Contato salvo!');
  } catch (e) {
    console.error(e);
    showToast('Erro ao salvar contato', true);
  }
}

// Versões debounced — usadas no oninput dos campos de configuração
// para evitar uma chamada ao Supabase a cada tecla digitada.
const salvarConfigEmpresaDebounced = debounce(salvarConfigEmpresa, 700);
const salvarConfigContatoDebounced = debounce(salvarConfigContato, 700);

async function alterarSenhaAdmin() {
  const atual = document.getElementById('cfgSenhaAtual').value;
  const nova = document.getElementById('cfgSenhaNova').value;
  const userId = sessionStorage.getItem('u_id');
  const userNome = sessionStorage.getItem('u_nome');

  if (!atual || !nova) {
    showToast('Preencha os campos de senha!', true);
    return;
  }

  if (nova.length < 4) {
    showToast('A nova senha deve ter pelo menos 4 caracteres', true);
    return;
  }

  if (!userId || !userNome) {
    showToast('Sessão inválida — faça login de novo', true);
    return;
  }

  try {
    const hashAtual = await hashPassword(atual, userNome);
    const hashNova  = await hashPassword(nova,  userNome);

    const ok = await sb.rpc('usuario_trocar_senha', {
      p_id:                 userId,
      p_senha_atual_texto:  atual,    // p/ caso da senha legada
      p_senha_atual_hash:   hashAtual,
      p_senha_nova_hash:    hashNova
    });

    if (!ok) {
      showToast('Senha atual incorreta!', true);
      return;
    }

    document.getElementById('cfgSenhaAtual').value = '';
    document.getElementById('cfgSenhaNova').value = '';

    showToast('✅ Senha alterada com sucesso!');
  } catch (e) {
    console.error("Erro Supabase:", e);
    showToast('Erro técnico ao salvar senha', true);
  }
}

// ─────────────────────────────────────────────
// LOGO / CONTATO / MISC
// ─────────────────────────────────────────────
function mostrarLogo(src) {
  const img = document.getElementById('logoImg');
  const fav = document.getElementById('favicon');
  const loginLogo = document.querySelector('.login-logo');
  
  const logoSrc = src || DEFAULT_LOGO;

  if (img) {
    img.src = logoSrc;
    img.style.display = 'block';
  }
  
  if (loginLogo) {
    loginLogo.src = logoSrc;
  }
  
  if (fav) {
    fav.href = logoSrc;
  }
}

async function carregarLogo(input) {
  const file = input?.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async function (e) {
    try {
      const logoBase64 = e.target?.result || DEFAULT_LOGO;

      await sb.update('config_empresa', 'id=eq.1', {
        logo_base64: logoBase64
      });

      state.logo = logoBase64;
      mostrarLogo(logoBase64);

      const loginLogo = document.querySelector('.login-logo');
      if (loginLogo) loginLogo.src = logoBase64;

      showToast('Logo salva!');
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar logo', true);
    }
  };

  reader.readAsDataURL(file);
}

async function resetarLogo() {
    confirmar('Deseja remover a logo atual e voltar para a logo padrão?', async () => {
        try {
            await sb.update('config_empresa', 'id=eq.1', {
                logo_base64: ''
            });

            state.logo = DEFAULT_LOGO;
            mostrarLogo(DEFAULT_LOGO);

            const loginLogo = document.querySelector('.login-logo');
            if (loginLogo) loginLogo.src = DEFAULT_LOGO;

            showToast('Logo restaurada!');
        } catch (e) {
            console.error(e);
            showToast('Erro ao restaurar logo', true);
        }
    });
}

function atualizarContato() {
  const tel = state.telefone || '';
  const tipo = state.redeTipo || '';
  const user = state.redesInput || '';

  const dispTel = document.getElementById('dispTelefone');
  if (dispTel) {
    dispTel.innerText = tel ? '📞 ' + tel : '';
  }

  const dispRede = document.getElementById('dispRede');
  if (dispRede) {
    dispRede.innerText = '';
  }

  let url = '';

  if (user) {
    url = tipo === ''
      ? (user.startsWith('http') ? user : 'https://' + user)
      : 'https://' + tipo + user;
  }

  const qrEl = document.getElementById('qrcode');
  if (qrEl) {
    qrEl.innerHTML = '';
    try {
      new QRCode(qrEl, {
        text: url || tel || window.location.href,
        width: 70,
        height: 70
      });
    } catch (e) {
      console.error(e);
    }
  }
}

const romaneioNumeroEl = document.getElementById('romaneioNumero');
if (romaneioNumeroEl) {
  romaneioNumeroEl.addEventListener('input', verificarNumDuplicado);
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toastMsg');
  if (!t) return;

  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');

  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => t.classList.remove('show'), 2500);
}

function addOpt(e, id, key) {
  if (e.key === 'Enter' && e.target.value.trim()) {
    const map = {
      clientes: ['clientes', 'clientes', 'cliList', 'cliCount'],
      materiais: ['materiais', 'materiais', 'matList', 'matCount'],
      industrializacoes: ['industrializacoes', 'industrializacoes', 'indList', 'indCount']
    };

    const [stateKey, table, listId, countId] =
      map[key] || ['materiais', 'materiais', 'matList', 'matCount'];

    cadAdd(stateKey, table, id, listId, countId);
  }
}

checkLogin();
