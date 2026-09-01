// MegaOnline - Gestão de Romaneio
// Autenticação real via Supabase Auth. A publishable key é pública por design;
// dados operacionais só são acessados com JWT de usuário autenticado.

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
// SUPABASE / AUTH
// ─────────────────────────────────────────────
const SB_URL = 'https://kedpkmpcnpbmeaajfcoq.supabase.co';
const SB_KEY = 'sb_publishable_tkcIOM9l-Vq899jSmmFj1g_CtdzawkP';
const SUPABASE_SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/dist/umd/supabase.min.js';
const AUTH_LOGIN_DOMAIN = 'users.kedpkmpcnpbmeaajfcoq.supabase.co';
const MEGAONLINE_AUTH_BUILD = '20260901-auth-v3';
window.MEGAONLINE_AUTH_BUILD = MEGAONLINE_AUTH_BUILD;
console.info(`[MegaOnline] frontend ${MEGAONLINE_AUTH_BUILD}`);

let supabaseClient = null;
let currentSession = null;
let currentProfile = null;
let appInitialized = false;
let authListenerBound = false;

class AuthRequiredError extends Error {
  constructor(message = 'Sessão não autenticada') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find(s => s.src === src);
    if (existing) {
      if (window.supabase?.createClient) return resolve();
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar o SDK do Supabase.'));
    document.head.appendChild(script);
  });
}

async function ensureSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase?.createClient) await loadExternalScript(SUPABASE_SDK_URL);
  if (!window.supabase?.createClient) throw new Error('SDK do Supabase indisponível.');

  supabaseClient = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  bindAuthListener();
  return supabaseClient;
}

function bindAuthListener() {
  if (!supabaseClient || authListenerBound) return;
  authListenerBound = true;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) currentSession = session;

    if (event === 'SIGNED_OUT') {
      currentSession = null;
      currentProfile = null;
      appInitialized = false;
      resetSensitiveState();
      showLoginScreen();
    }
  });
}

function normalizeUsername(usuario) {
  return String(usuario || '').normalize('NFKC').trim().toLowerCase();
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function authEmailForUsuario(usuario) {
  const normalized = normalizeUsername(usuario);
  if (!normalized) throw new Error('Usuário inválido');
  const hash = await sha256Hex(normalized);
  return `u-${hash}@${AUTH_LOGIN_DOMAIN}`;
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  } catch {
    return null;
  }
}

async function getActiveSession() {
  await ensureSupabaseClient();
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  const session = data?.session || null;
  if (!session?.access_token) throw new AuthRequiredError();

  const jwt = decodeJwtPayload(session.access_token);
  if (jwt?.role !== 'authenticated') {
    const err = new AuthRequiredError(`JWT sem role authenticated (role atual: ${jwt?.role || 'ausente'})`);
    err.status = 401;
    throw err;
  }

  currentSession = session;
  return session;
}

function isAuthInvalidError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const msg = String(error?.message || '').toLowerCase();
  return status === 401 || status === 403 ||
    msg.includes('invalid jwt') ||
    msg.includes('jwt expired') ||
    msg.includes('refresh token not found') ||
    msg.includes('invalid refresh token');
}

function isTransientNetworkError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error instanceof TypeError ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('load failed');
}

async function revalidateSessionNonDestructive() {
  try {
    await ensureSupabaseClient();
    const { data, error } = await supabaseClient.auth.getUser();
    if (!error && data?.user) return true;

    if (error && isAuthInvalidError(error)) {
      await supabaseClient.auth.signOut({ scope: 'local' }).catch(() => {});
      currentSession = null;
      currentProfile = null;
      showLoginScreen();
      return false;
    }

    // Erro transitório/indeterminado: não derruba uma sessão local válida.
    console.warn('Falha transitória ao revalidar sessão; sessão preservada.', error);
    return true;
  } catch (error) {
    if (isTransientNetworkError(error)) {
      console.warn('Rede indisponível ao revalidar sessão; sessão preservada.', error);
      return true;
    }
    console.warn('Falha não destrutiva ao revalidar sessão.', error);
    return true;
  }
}

async function sbFetch(path, method = 'GET', body = null) {
  const session = await getActiveSession();
  const prefer = method === 'POST'
    ? 'return=representation'
    : (method === 'PATCH' || method === 'DELETE' ? 'return=minimal' : '');

  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;

  let response;
  try {
    response = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    error.transient = true;
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || `Supabase HTTP ${response.status}`);
    error.status = response.status;

    // Não faz logout por 5xx/rede. Só 401/403 disparam revalidação.
    if (response.status === 401 || response.status === 403) {
      void revalidateSessionNonDestructive();
    }
    throw error;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function sbFunction(functionName, payload = {}) {
  const session = await getActiveSession();
  let response;
  try {
    response = await fetch(`${SB_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    error.transient = true;
    throw error;
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `Função ${functionName}: HTTP ${response.status}`);
    error.status = response.status;
    if (response.status === 401) void revalidateSessionNonDestructive();
    throw error;
  }
  return data;
}

const sb = {
  select: (table, query = '') => sbFetch(`${table}?select=*${query ? '&' + query : ''}`),
  insert: (table, data) => sbFetch(table, 'POST', data),
  update: (table, query, data) => sbFetch(`${table}?${query}`, 'PATCH', data),
  delete: (table, query) => sbFetch(`${table}?${query}`, 'DELETE')
};

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

let modalRomaneioId = null;
let editingRomaneioId = null;

function resetSensitiveState() {
  state.clientes = [];
  state.materiais = [];
  state.industrializacoes = [];
  state.historico = [];
  state.usuarios = [];
  state.num = 1;
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = '';
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('dbLoading')?.classList.add('hide');
  document.getElementById('loginPass').value = '';
}

function showAppScreen() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
}

function showLoading(message = 'Conectando ao banco de dados...') {
  const el = document.getElementById('dbLoading');
  if (!el) return;
  el.innerHTML = `<div class="spinner"></div><div style="font-size:14px;opacity:.9">${message}</div>`;
  el.classList.remove('hide');
}

function friendlyDataError(error, fallback = 'Não foi possível concluir a operação.') {
  if (isTransientNetworkError(error) || error?.transient) return 'Falha de conexão. Sua sessão foi preservada; tente novamente.';
  if (Number(error?.status || 0) === 401 || Number(error?.status || 0) === 403) return 'Sua sessão não possui permissão válida para esta operação.';
  return fallback;
}

function showDbError(error) {
  const el = document.getElementById('dbLoading');
  if (!el) return;
  console.error('Detalhe técnico do carregamento:', error);
  const safe = friendlyDataError(error, 'Não foi possível carregar os dados. Tente novamente.')
    .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  el.innerHTML = `
    <div class="db-err">
      <strong>❌ Erro ao conectar ao banco</strong><br><br>${safe}<br><br>
      <button onclick="recarregarDadosAutenticados()" style="background:white;color:#dc3545;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold">Tentar novamente</button>
    </div>`;
  el.classList.remove('hide');
}

async function loadCurrentProfile() {
  const session = await getActiveSession();
  const rows = await sb.select('usuarios_sistema', `auth_user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`);
  currentProfile = rows?.[0] || null;

  if (!currentProfile) {
    throw new Error('Seu usuário do Supabase Auth não está vinculado ao cadastro usuarios_sistema. Execute o bootstrap/migração do perfil.');
  }
  return currentProfile;
}

async function loadFromDB() {
  try {
    await getActiveSession();

    const [clis, mats, inds, cfg, roms, todosItens] = await Promise.all([
      sb.select('clientes', 'order=nome'),
      sb.select('materiais', 'order=nome'),
      sb.select('industrializacoes', 'order=nome'),
      sb.select('config_empresa', 'id=eq.1'),
      sb.select('romaneios', 'order=criado_em.desc'),
      sb.select('romaneio_itens', 'order=romaneio_id.asc,id.asc')
    ]);

    state.clientes = (clis || []).map(r => r.nome);
    state.materiais = (mats || []).map(r => r.nome);
    state.industrializacoes = (inds || []).map(r => r.nome);
    state.usuarios = [];

    if (cfg?.[0]) {
      const c = cfg[0];
      state.nomeEmpresa = c.nome_empresa || 'MegaOnline';
      state.subEmpresa = c.subtitulo || 'Gestão de Romaneio';
      state.telefone = c.telefone || '';
      state.redeTipo = c.rede_tipo || 'instagram.com/';
      state.redesInput = c.rede_user || '';
      state.logo = c.logo_base64 || DEFAULT_LOGO;
    }

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

    state.historico = (roms || []).map(r => ({
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

    if (state.historico.length > 0) {
      state.num = Math.max(...state.historico.map(r => parseInt(r.num) || 0)) + 1;
    } else {
      state.num = 1;
    }

    document.getElementById('dbLoading')?.classList.add('hide');
    return true;
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    showDbError(error);
    return false;
  }
}

async function recarregarDadosAutenticados() {
  showLoading('Reconectando...');
  try {
    await getActiveSession();
    await loadCurrentProfile();
    const ok = await loadFromDB();
    if (!ok) return;
    showAppScreen();
    if (!appInitialized) {
      init();
      appInitialized = true;
    } else {
      updateDropdowns();
      renderHist();
    }
  } catch (error) {
    if (error instanceof AuthRequiredError || isAuthInvalidError(error)) {
      showLoginScreen();
      return;
    }
    showDbError(error);
  }
}

// ─────────────────────────────────────────────
// LOGIN / LOGOUT
// ─────────────────────────────────────────────
async function fazerLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginErr');
  const btn = document.querySelector('.login-btn');

  const showErr = msg => {
    errEl.textContent = msg || 'Usuário ou senha incorretos';
    errEl.classList.add('show');
  };

  if (!u || !p) {
    showErr('Preencha usuário e senha');
    return;
  }

  errEl.classList.remove('show');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

  try {
    const client = await ensureSupabaseClient();
    const email = await authEmailForUsuario(u);
    const { data, error } = await client.auth.signInWithPassword({ email, password: p });

    if (error || !data?.session) {
      console.warn('Login recusado:', error);
      showErr('Usuário ou senha incorretos');
      document.getElementById('loginPass').value = '';
      return;
    }

    currentSession = data.session;
    showLoading('Carregando seus dados...');
    await loadCurrentProfile();
    const ok = await loadFromDB();
    if (!ok) return;

    document.getElementById('loginNome').innerText = state.nomeEmpresa;
    if (state.logo) document.querySelector('.login-logo').src = state.logo;

    showAppScreen();
    if (!appInitialized) {
      init();
      appInitialized = true;
    }
    void revalidateSessionNonDestructive();
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    showErr(isTransientNetworkError(error) ? 'Erro de conexão. Tente novamente.' : 'Não foi possível entrar. Verifique a configuração do Supabase Auth.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↪ Entrar'; }
  }
}

async function fazerLogout() {
  try {
    const client = await ensureSupabaseClient();
    await client.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.warn('Falha ao avisar o Supabase durante logout; limpando interface local.', error);
  } finally {
    currentSession = null;
    currentProfile = null;
    appInitialized = false;
    resetSensitiveState();
    showLoginScreen();
  }
}

async function checkLogin() {
  showLoading('Validando sessão...');
  try {
    const client = await ensureSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    if (!data?.session?.access_token) {
      showLoginScreen();
      return;
    }

    currentSession = data.session;
    await loadCurrentProfile();
    const ok = await loadFromDB();
    if (!ok) return;

    document.getElementById('loginNome').innerText = state.nomeEmpresa;
    if (state.logo) document.querySelector('.login-logo').src = state.logo;

    showAppScreen();
    init();
    appInitialized = true;
    void revalidateSessionNonDestructive();
  } catch (error) {
    console.error('Falha no bootstrap autenticado:', error);
    if (error instanceof AuthRequiredError || isAuthInvalidError(error)) {
      showLoginScreen();
      return;
    }
    // Uma falha transitória não força sign-out de uma sessão que ainda existe.
    const { data } = await supabaseClient?.auth.getSession().catch(() => ({ data: { session: null } })) || { data: { session: null } };
    if (data?.session) {
      currentSession = data.session;
      showDbError(error);
      return;
    }
    showLoginScreen();
  }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function init() {
  const inputData = document.getElementById('currentDate');
  const spanPrint = document.getElementById('dispDatePrint');

  if (inputData) {
    if (!inputData.value) inputData.value = new Date().toISOString().split('T')[0];
    const atualizarDataPrint = () => {
      const valor = inputData.value;
      if (!valor) return;
      const [ano, mes, dia] = valor.split('-');
      if (spanPrint) spanPrint.innerText = `${dia}/${mes}/${ano}`;
    };
    if (!inputData.dataset.bound) {
      inputData.addEventListener('change', atualizarDataPrint);
      inputData.dataset.bound = '1';
    }
    atualizarDataPrint();
  }

  const usuarioLogado = currentProfile?.usuario || currentSession?.user?.user_metadata?.usuario || '';
  const inputVendedor = document.getElementById('vendedorInput');
  const dispVendedor = document.getElementById('dispVendedor');
  if (usuarioLogado && inputVendedor) {
    inputVendedor.value = usuarioLogado;
    if (dispVendedor) dispVendedor.innerText = usuarioLogado;
    inputVendedor.dispatchEvent(new Event('input'));
  }

  const numEl = document.getElementById('romaneioNumero');
  if (numEl) numEl.innerText = String(state.num).padStart(3, '0');

  updateDropdowns();
  const tbody = document.querySelector('#mainTable tbody');
  if (tbody && tbody.children.length === 0) addRow();
  mostrarLogo(state.logo || DEFAULT_LOGO);

  const nomeEmpresaEl = document.getElementById('nomeEmpresa');
  const subEmpresaEl = document.getElementById('subEmpresa');

  if (nomeEmpresaEl) {
    nomeEmpresaEl.innerText = state.nomeEmpresa || 'MegaOnline';
    if (!nomeEmpresaEl.dataset.bound) {
      nomeEmpresaEl.addEventListener('blur', async function() {
        const v = this.innerText.trim() || 'MegaOnline';
        this.innerText = v;
        state.nomeEmpresa = v;
        document.title = `${v} - Gestão de Romaneio`;
        try { await sb.update('config_empresa', 'id=eq.1', { nome_empresa: v }); }
        catch (e) { console.error(e); showToast('Erro ao salvar nome', true); }
      });
      nomeEmpresaEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
      nomeEmpresaEl.dataset.bound = '1';
    }
  }

  if (subEmpresaEl) {
    subEmpresaEl.innerText = state.subEmpresa || 'Gestão de Romaneio';
    if (!subEmpresaEl.dataset.bound) {
      subEmpresaEl.addEventListener('blur', async function() {
        const v = this.innerText.trim() || 'Gestão de Romaneio';
        this.innerText = v;
        state.subEmpresa = v;
        try { await sb.update('config_empresa', 'id=eq.1', { subtitulo: v }); }
        catch (e) { console.error(e); showToast('Erro ao salvar subtítulo', true); }
      });
      subEmpresaEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
      subEmpresaEl.dataset.bound = '1';
    }
  }

  document.title = `${state.nomeEmpresa || 'MegaOnline'} - Gestão de Romaneio`;
  atualizarContato();
  atualizarModoEdicaoUI();
}

function syncCliente() {
  const clienteSelect = document.getElementById('clienteSelect');
  const dispCliente = document.getElementById('dispCliente');
  if (dispCliente) dispCliente.innerText = clienteSelect?.value || '---';
  atualizarPdfIdBar();
}

function updateDropdowns() {
  const clienteSelect = document.getElementById('clienteSelect');
  if (clienteSelect) {
    const atual = clienteSelect.value;
    clienteSelect.innerHTML = '<option value="">Selecionar cliente...</option>';
    [...state.clientes].sort((a,b) => a.localeCompare(b,'pt-BR')).forEach(v => clienteSelect.add(new Option(v, v)));
    if (atual && state.clientes.includes(atual)) clienteSelect.value = atual;
  }

  document.querySelectorAll('.mat-drop').forEach(select => {
    const atual = select.value;
    select.innerHTML = '<option value="">Selecionar material...</option>';
    [...state.materiais].sort((a,b) => a.localeCompare(b,'pt-BR')).forEach(v => select.add(new Option(v, v)));
    if (atual && state.materiais.includes(atual)) select.value = atual;
  });

  document.querySelectorAll('.ind-drop').forEach(select => {
    const atual = select.value;
    select.innerHTML = '<option value="">Industrialização...</option>';
    [...state.industrializacoes].sort((a,b) => a.localeCompare(b,'pt-BR')).forEach(v => select.add(new Option(v, v)));
    if (atual && state.industrializacoes.includes(atual)) select.value = atual;
  });
}

function atualizarPdfIdBar() {
  const num = document.getElementById('romaneioNumero')?.innerText.trim() || '---';
  const cli = document.getElementById('clienteSelect')?.value || '—';
  if (document.getElementById('pdfIdNumero')) document.getElementById('pdfIdNumero').textContent = num;
  if (document.getElementById('pdfIdCliente')) document.getElementById('pdfIdCliente').textContent = cli || '—';
}

function addRow() {
  const tbody = document.querySelector('#mainTable tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="number" value="1" min="1" class="q" inputmode="numeric" oninput="calcFinal()" style="width:50px"></td>
    <td><select class="mat-drop" style="width:100%;font-size:12px;border:none;background:transparent;min-height:36px"></select></td>
    <td><select class="ind-drop" style="width:100%;font-size:12px;border:none;background:transparent;min-height:36px" onchange="this.style.outline=''"></select></td>
    <td><input type="text" class="lote-input" placeholder="—"></td>
    <td class="col-dim"><input type="number" step="0.01" min="0" class="c" inputmode="decimal" oninput="calcFinal();validarCampo(this)" placeholder="0.00"></td>
    <td class="col-dim"><input type="number" step="0.01" min="0" class="a" inputmode="decimal" oninput="calcFinal();validarCampo(this)" placeholder="0.00"></td>
    <td class="col-dim"><input type="number" step="0.01" min="0" class="l" inputmode="decimal" oninput="calcFinal();validarCampo(this)" placeholder="0.02" value="0.02"></td>
    <td class="aI" style="font-weight:600;white-space:nowrap">0.00</td>
    <td><input type="number" min="0" class="p" inputmode="decimal" oninput="calcFinal();validarCampo(this)" placeholder="0.00" style="width:85px"></td>
    <td class="tI" style="font-weight:bold;color:var(--primary);white-space:nowrap">0,00</td>
    <td class="no-print"><button class="del-row-btn" onclick="this.closest('tr').remove();calcFinal();reidx()" title="Remover linha">×</button></td>`;
  tbody.appendChild(tr);
  updateDropdowns();
  reidx();
}

function validarCampo(el) {
  if (!el) return;
  el.classList.toggle('erro', !el.value || parseFloat(el.value) <= 0);
}
function reidx() {}

function calcFinal() {
  let areaTotal = 0;
  let subtotal = 0;
  document.querySelectorAll('#mainTable tbody tr').forEach(row => {
    const c = parseFloat(row.querySelector('.c')?.value) || 0;
    const a = parseFloat(row.querySelector('.a')?.value) || 0;
    const q = parseFloat(row.querySelector('.q')?.value) || 0;
    const p = parseFloat(row.querySelector('.p')?.value) || 0;
    const area = c * a * q;
    const total = area * p;
    const areaEl = row.querySelector('.aI');
    const totalEl = row.querySelector('.tI');
    if (areaEl) areaEl.innerText = area.toFixed(2);
    if (totalEl) totalEl.innerText = total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    areaTotal += area;
    subtotal += total;
  });

  const ipi = parseFloat(document.getElementById('ipiPerc')?.value) || 0;
  const outras = parseFloat(document.getElementById('outrasExp')?.value) || 0;
  const desconto = parseFloat(document.getElementById('descontoF')?.value) || 0;
  const totalLiquido = (subtotal * (1 + ipi / 100)) + outras - desconto;

  if (document.getElementById('totalM2')) document.getElementById('totalM2').innerText = areaTotal.toFixed(2);
  if (document.getElementById('subtotalFin')) document.getElementById('subtotalFin').innerText = subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (document.getElementById('valorLiquido')) document.getElementById('valorLiquido').innerText = totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const body = document.getElementById('parcelasBody');
  if (!body) return;
  body.innerHTML = '';
  const qtd = parseInt(document.getElementById('qtdParc')?.value) || 1;
  const parcela = totalLiquido / qtd;
  for (let i = 1; i <= qtd; i++) {
    const data = new Date();
    data.setDate(data.getDate() + i * 30);
    body.innerHTML += `<tr style="text-align:center;border-bottom:1px solid #eee"><td style="padding:8px 6px">${i}ª Parcela</td><td style="padding:8px 6px">${data.toLocaleDateString('pt-BR')}</td><td style="padding:8px 6px;font-weight:bold;color:var(--primary)">R$ ${parcela.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`;
  }
}

function formTemDados() {
  const rows = document.querySelectorAll('#mainTable tbody tr');
  const temLinha = Array.from(rows).some(row => {
    const vals = [row.querySelector('.mat-drop')?.value, row.querySelector('.ind-drop')?.value, row.querySelector('.lote-input')?.value];
    const nums = ['c','a','l','p'].map(cls => parseFloat(row.querySelector('.'+cls)?.value) || 0);
    const q = parseInt(row.querySelector('.q')?.value) || 1;
    return vals.some(Boolean) || nums.some(n => n > 0) || q > 1;
  });
  return !!document.getElementById('clienteSelect')?.value || !!document.getElementById('docCliente')?.value || !!document.getElementById('vendedorInput')?.value || !!document.getElementById('infoLogInput')?.value || temLinha;
}

function handleNovoRomaneio() {
  if (formTemDados()) confirmar('Os dados atuais serão perdidos. Deseja realmente limpar o formulário?', () => { limparFormulario(); ativarAbaNovo(); });
  else { limparFormulario(); ativarAbaNovo(); }
}

function verificarNumDuplicado(ignoreId = null) {
  const num = document.getElementById('romaneioNumero')?.innerText.trim() || '';
  const existe = state.historico.some(r => String(r.num) === num && String(r.id) !== String(ignoreId || ''));
  document.getElementById('alertaNum')?.classList.toggle('show', existe);
  return existe;
}

function ativarAbaNovo() {
  const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => (b.textContent || '').includes('Novo Romaneio'));
  openTab('novo', btn || document.querySelector('.tab-btn'));
}

function atualizarModoEdicaoUI() {
  const banner = document.getElementById('editModeBanner');
  const numero = document.getElementById('editModeNumero');
  const btn = document.getElementById('btnFinalizar');
  const r = editingRomaneioId ? state.historico.find(x => String(x.id) === String(editingRomaneioId)) : null;
  banner?.classList.toggle('show', !!editingRomaneioId);
  if (numero) numero.textContent = r?.num || document.getElementById('romaneioNumero')?.innerText || '---';
  if (!btn) return;
  if (editingRomaneioId) {
    btn.innerText = '💾 SALVAR ALTERAÇÕES DO ROMANEIO';
    btn.style.background = 'var(--warn)';
    btn.onclick = salvarEdicaoRomaneio;
  } else {
    btn.innerText = '✔ FINALIZAR E GERAR PDF';
    btn.style.background = 'var(--primary)';
    btn.onclick = finalizar;
    btn.disabled = false;
  }
}

function coletarDadosRomaneioFormulario(ignoreDuplicateId = null) {
  const cli = document.getElementById('clienteSelect')?.value;
  if (!cli) { alert('⚠️ Selecione o cliente antes de salvar!'); return null; }
  const rows = document.querySelectorAll('#mainTable tbody tr');
  if (!rows.length) { alert('⚠️ Adicione ao menos um item antes de salvar!'); return null; }
  const inputDataValue = document.getElementById('currentDate')?.value;
  if (!inputDataValue) { alert('⚠️ Por favor, selecione uma data válida!'); return null; }
  const [ano, mes, dia] = inputDataValue.split('-');
  const dataParaSalvar = `${dia}/${mes}/${ano}`;

  let invalido = false;
  rows.forEach(row => {
    ['c','a','l','p'].forEach(cls => {
      const inp = row.querySelector('.'+cls);
      if (!inp || !inp.value || parseFloat(inp.value) <= 0) { inp?.classList.add('erro'); invalido = true; }
    });
    const ind = row.querySelector('.ind-drop');
    if (!ind?.value) { if (ind) { ind.style.outline = '2px solid var(--danger)'; ind.style.borderRadius = '4px'; } invalido = true; }
  });
  if (invalido) { alert('⚠️ Preencha todos os campos obrigatórios!'); return null; }
  if (verificarNumDuplicado(ignoreDuplicateId) && !confirm('Número de romaneio já existe em outro registro. Continuar mesmo assim?')) return null;

  const itens = Array.from(rows).map(row => {
    const c = parseFloat(row.querySelector('.c')?.value) || 0;
    const a = parseFloat(row.querySelector('.a')?.value) || 0;
    const l = parseFloat(row.querySelector('.l')?.value) || 0.02;
    const q = parseFloat(row.querySelector('.q')?.value) || 0;
    const p = parseFloat(row.querySelector('.p')?.value) || 0;
    return { material: row.querySelector('.mat-drop')?.value || '', industrializacao: row.querySelector('.ind-drop')?.value || '', lote: row.querySelector('.lote-input')?.value || '', comprimento:c, altura:a, largura:l, quantidade:q, preco:p, area:parseFloat((c*a*q).toFixed(4)), total:parseFloat((c*a*q*p).toFixed(4)) };
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
    valor_total: parseFloat((document.getElementById('valorLiquido')?.innerText || '0').replace(/\./g,'').replace(',','.')) || 0,
    informacoes: document.getElementById('infoLogInput')?.value || ''
  };
  return { cli, numRomaneio, romaneio, itens };
}

function normalizarStatusPagamento(status) { return String(status || '').toLowerCase() === 'pago' ? 'pago' : 'pendente'; }
function statusPagamentoLabel(status) { return normalizarStatusPagamento(status) === 'pago' ? 'Pago' : 'Pendente'; }
function statusPagamentoIcone(status) { return normalizarStatusPagamento(status) === 'pago' ? '✓' : '!'; }

function toHistoricoRomaneio(id, romaneio, itens, statusAtual = null) {
  return { id, num:romaneio.numero, data:romaneio.data_emissao, cliente:romaneio.cliente, doc:romaneio.doc_cliente, vendedor:romaneio.vendedor, pagamento:romaneio.pagamento, parcelas:romaneio.parcelas, ipi:romaneio.ipi, desconto:romaneio.desconto, outros:romaneio.outras_despesas, area:romaneio.area_total, valor:romaneio.valor_total, status:normalizarStatusPagamento(statusAtual || romaneio.status_pagamento), info:romaneio.informacoes, itens:itens.map(it => ({ mat:it.material, ind:it.industrializacao, lote:it.lote, c:it.comprimento, a:it.altura, l:it.largura, q:it.quantidade, p:it.preco, area:it.area, total:it.total })) };
}

function preencherFormularioRomaneio(r) {
  if (!r) return;
  updateDropdowns();
  document.getElementById('romaneioNumero').innerText = r.num;
  const partes = String(r.data || '').split('/');
  if (partes.length === 3) document.getElementById('currentDate').value = `${partes[2]}-${partes[1]}-${partes[0]}`;
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
    addRow(); const row = tbody.lastElementChild;
    row.querySelector('.mat-drop').value = it.mat || '';
    row.querySelector('.ind-drop').value = it.ind || '';
    row.querySelector('.lote-input').value = it.lote || '';
    row.querySelector('.c').value = it.c || '';
    row.querySelector('.a').value = it.a || '';
    row.querySelector('.l').value = it.l || 0.02;
    row.querySelector('.q').value = it.q || 1;
    row.querySelector('.p').value = it.p || '';
  });
  if (!tbody.children.length) addRow();
  calcFinal(); atualizarPdfIdBar();
}

function carregarRomaneioParaEdicao(id) {
  const r = state.historico.find(x => String(x.id) === String(id));
  if (!r) return;
  editingRomaneioId = id;
  preencherFormularioRomaneio(r);
  atualizarModoEdicaoUI(); fecharModal(); ativarAbaNovo(); showToast(`Editando romaneio Nº ${r.num}`);
}

function cancelarEdicaoRomaneio() { editingRomaneioId = null; limparFormulario(); atualizarModoEdicaoUI(); showToast('Edição cancelada'); }

async function salvarEdicaoRomaneio() {
  if (!editingRomaneioId) return;
  const dados = coletarDadosRomaneioFormulario(editingRomaneioId);
  if (!dados) return;
  const btn = document.getElementById('btnFinalizar');
  const original = btn.innerText;
  btn.disabled = true; btn.innerText = '⏳ Salvando alterações...';
  try {
    await sb.update('romaneios', 'id=eq.' + editingRomaneioId, dados.romaneio);
    await sb.delete('romaneio_itens', 'romaneio_id=eq.' + editingRomaneioId);
    const itens = dados.itens.map(it => ({...it, romaneio_id: editingRomaneioId}));
    if (itens.length) await sb.insert('romaneio_itens', itens);
    const anterior = state.historico.find(r => String(r.id) === String(editingRomaneioId));
    const atualizado = toHistoricoRomaneio(editingRomaneioId, dados.romaneio, dados.itens, anterior?.status);
    state.historico = state.historico.map(r => String(r.id) === String(editingRomaneioId) ? atualizado : r);
    editingRomaneioId = null; renderHist(); limparFormulario(); atualizarModoEdicaoUI(); showToast('✅ Romaneio atualizado com sucesso!'); ativarAbaNovo();
  } catch (e) {
    console.error(e); showToast(friendlyDataError(e, '❌ Erro ao atualizar o romaneio.'), true); btn.disabled = false; btn.innerText = original;
  }
}

async function finalizar() {
  const dados = coletarDadosRomaneioFormulario();
  if (!dados) return;
  dados.romaneio.status_pagamento = 'pendente';
  const btn = document.getElementById('btnFinalizar');
  const original = btn.innerText;
  btn.disabled = true; btn.innerText = '⏳ Salvando...';
  showToast('Salvando no banco...');
  try {
    const [saved] = await sb.insert('romaneios', dados.romaneio);
    const itens = dados.itens.map(it => ({...it, romaneio_id: saved.id}));
    if (itens.length) await sb.insert('romaneio_itens', itens);
    state.num++;
    state.historico.unshift(toHistoricoRomaneio(saved.id, dados.romaneio, dados.itens, 'pendente'));
    showToast('✅ Romaneio salvo com sucesso!');
  } catch (e) {
    console.error(e); showToast(friendlyDataError(e, '❌ Erro ao salvar o romaneio.'), true); btn.disabled = false; btn.innerText = original; return;
  }
  const disp = document.getElementById('dispInfoLog');
  if (disp) { disp.innerText = dados.romaneio.informacoes; disp.style.display = dados.romaneio.informacoes ? 'block' : 'none'; }
  atualizarPdfIdBar();
  const nomeEmpresaAtual = state.nomeEmpresa || 'MegaOnline';
  const cliPdf = dados.cli.replace(/[/\\?%*:|"<>]/g, '-');
  document.title = `Romaneio_${String(dados.numRomaneio).padStart(3,'0')}_${cliPdf}`;
  window.print();
  setTimeout(() => { btn.disabled = false; btn.innerText = original; document.title = `${nomeEmpresaAtual} - Gestão de Romaneio`; location.reload(); }, 800);
}

function renderHist() {
  const body = document.getElementById('histBody');
  if (!body) return;
  const busca = document.getElementById('buscaHist')?.value.toLowerCase() || '';
  const filtrados = state.historico.filter(r => (r.cliente || '').toLowerCase().includes(busca));
  let areaAcum = 0, valorAcum = 0;
  body.innerHTML = filtrados.map(r => {
    const area = parseFloat(r.area) || 0, valor = parseFloat(r.valor) || 0, status = normalizarStatusPagamento(r.status);
    areaAcum += area; valorAcum += valor;
    return `<tr onclick="abrirModal('${r.id}')" title="Clique para detalhes"><td><strong>#${r.num}</strong></td><td>${r.data}</td><td style="text-align:left">${r.cliente}</td><td>${area.toFixed(2)} m²</td><td style="font-weight:bold;color:var(--primary)">R$ ${valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td onclick="event.stopPropagation()"><button type="button" class="status-pagamento-btn ${status}" data-status-id="${r.id}" onclick="alterarStatusPagamento('${r.id}', this)" title="Clique para alterar o status"><span aria-hidden="true">${statusPagamentoIcone(status)}</span><span class="status-pagamento-texto">${statusPagamentoLabel(status)}</span></button></td><td class="no-print" onclick="event.stopPropagation()"><button class="btn-sm" style="background:var(--danger);color:white" onclick="delHist('${r.id}')">×</button></td></tr>`;
  }).join('');
  document.getElementById('statQtd').innerText = filtrados.length;
  document.getElementById('statArea').innerText = areaAcum.toFixed(2);
  document.getElementById('statValor').innerText = valorAcum.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function atualizarBotoesStatusPagamento(id, status, desabilitado = false) {
  const s = normalizarStatusPagamento(status);
  document.querySelectorAll('.status-pagamento-btn').forEach(botao => {
    if (String(botao.dataset.statusId) !== String(id)) return;
    botao.classList.toggle('pago', s === 'pago'); botao.classList.toggle('pendente', s === 'pendente'); botao.disabled = desabilitado;
    const icone = botao.querySelector('[aria-hidden="true"]'); const texto = botao.querySelector('.status-pagamento-texto');
    if (icone) icone.textContent = statusPagamentoIcone(s); if (texto) texto.textContent = statusPagamentoLabel(s);
  });
}

async function alterarStatusPagamento(id, botao = null) {
  const r = state.historico.find(x => String(x.id) === String(id));
  if (!r || botao?.disabled) return;
  const anterior = normalizarStatusPagamento(r.status); const novo = anterior === 'pago' ? 'pendente' : 'pago';
  r.status = novo; atualizarBotoesStatusPagamento(id, novo, true);
  try { await sb.update('romaneios', 'id=eq.' + id, { status_pagamento: novo }); atualizarBotoesStatusPagamento(id, novo, false); showToast(novo === 'pago' ? '✅ Romaneio marcado como pago' : '⚠️ Romaneio marcado como pendente'); }
  catch (e) { console.error(e); r.status = anterior; atualizarBotoesStatusPagamento(id, anterior, false); showToast(friendlyDataError(e, '❌ Erro ao alterar o status.'), true); }
}

function abrirModal(id) {
  const r = state.historico.find(x => x.id === id); if (!r) return;
  modalRomaneioId = id;
  const itensHtml = r.itens?.length ? `<div class="modal-table-wrap" style="width:100%;overflow-x:auto;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;min-width:520px"><thead><tr style="background:#f0f0f0"><th style="padding:6px;text-align:left">Material</th><th style="padding:6px">Industrializ.</th><th style="padding:6px">Lote</th><th style="padding:6px">m²</th><th style="padding:6px">Total</th></tr></thead><tbody>${r.itens.map(it => `<tr style="border-bottom:1px solid #eee"><td style="padding:6px;text-align:left">${it.mat || '—'}</td><td style="padding:6px;text-align:center">${it.ind || '—'}</td><td style="padding:6px;text-align:center">${it.lote || '—'}</td><td style="padding:6px;text-align:center">${it.area}</td><td style="padding:6px;text-align:center;font-weight:bold">R$ ${(parseFloat(it.total)||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`).join('')}</tbody></table></div>` : '<p style="font-size:12px;color:#aaa">Sem itens</p>';
  document.getElementById('btnEditarHist').onclick = () => carregarRomaneioParaEdicao(id);
  document.getElementById('btnImprimirHist').onclick = () => reimprimirDoHistorico(id);
  document.getElementById('modalContent').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:13px;background:#f9f9f9;padding:12px;border-radius:8px;margin-bottom:10px"><div><strong>Cliente:</strong> ${r.cliente}</div><div><strong>Data:</strong> ${r.data}</div><div><strong>CNPJ/CPF:</strong> ${r.doc || '—'}</div><div><strong>Vendedor:</strong> ${r.vendedor || '—'}</div><div><strong>Pagamento:</strong> ${r.pagamento || '—'}</div><div><strong>Parcelas:</strong> ${r.parcelas || 1}x</div><div class="modal-status-row"><strong>Status:</strong> <button type="button" class="status-pagamento-btn ${normalizarStatusPagamento(r.status)}" data-status-id="${r.id}" onclick="alterarStatusPagamento('${r.id}', this)"><span aria-hidden="true">${statusPagamentoIcone(r.status)}</span><span class="status-pagamento-texto">${statusPagamentoLabel(r.status)}</span></button></div><div><strong>Área Total:</strong> ${r.area} m²</div><div><strong>Valor Final:</strong> <span style="color:var(--primary);font-weight:bold">R$ ${(parseFloat(r.valor)||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>${r.info ? `<p style="font-size:12px;color:#555;background:#fffde7;padding:8px;border-radius:6px;margin-bottom:8px">📝 ${r.info}</p>` : ''}<p style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--primary);margin-bottom:4px">Itens carregados</p>${itensHtml}`;
  document.getElementById('btnDelModal').onclick = () => { fecharModal(); delHist(id); };
  document.getElementById('modalEdit').classList.add('open');
}

function fecharModal() { document.getElementById('modalEdit')?.classList.remove('open'); modalRomaneioId = null; }
document.getElementById('modalEdit')?.addEventListener('click', function(e) { if (e.target === this) fecharModal(); });

async function delHist(id) {
  confirmar('Deseja realmente excluir este romaneio? Esta ação não pode ser desfeita.', async () => {
    try { await sb.delete('romaneios', 'id=eq.' + id); state.historico = state.historico.filter(r => r.id !== id); renderHist(); showToast('Romaneio excluído'); }
    catch (e) { console.error(e); showToast('Erro ao excluir', true); }
  });
}

async function limparHistorico() {
  confirmar('⚠️ ATENÇÃO: Deseja apagar TODO o histórico de romaneios? Esta ação é irreversível.', async () => {
    try { await sb.delete('romaneios', 'id=not.is.null'); state.historico = []; renderHist(); showToast('Histórico limpo com sucesso'); }
    catch (e) { console.error(e); showToast('Erro ao limpar histórico', true); }
  });
}

function exportarCSV() {
  let csv = 'Numero;Data;Cliente;CNPJ_CPF;Vendedor;Pagamento;Parcelas;Area_m2;Valor_Final;Status;Itens\n';
  state.historico.forEach(r => {
    const itensStr = r.itens ? r.itens.map(it => `${it.mat}(${it.area}m²)`).join('|') : '';
    csv += `${r.num};${r.data};${r.cliente};${r.doc||''};${r.vendedor||''};${r.pagamento||''};${r.parcelas||1};${r.area};${r.valor};${statusPagamentoLabel(r.status)};"${itensStr}"\n`;
  });
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'romaneios.csv'; a.click(); URL.revokeObjectURL(a.href);
}

function openTab(id, btn) {
  document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(id)?.classList.add('active'); btn?.classList.add('active');
  if (id === 'historico') renderHist();
  if (id === 'cadastros') void renderCadastros();
}

function reimprimirDoHistorico(id) {
  const r = state.historico.find(x => x.id === id); if (!r) return;
  preencherFormularioRomaneio(r); fecharModal(); openTab('novo');
  const btn = document.getElementById('btnFinalizar');
  btn.disabled = true; btn.innerText = 'SISTEMA EM MODO DE REIMPRESSÃO'; btn.style.background = '#636e72';
  setTimeout(() => { window.print(); btn.disabled = false; btn.innerText = '✔ FINALIZAR E GERAR PDF'; btn.style.background = 'var(--primary)'; limparFormulario(); showToast('Formulário resetado para novo romaneio'); }, 500);
}

function limparFormulario() {
  editingRomaneioId = null;
  state.num = state.historico.length ? Math.max(...state.historico.map(r => parseInt(r.num)||0)) + 1 : 1;
  document.getElementById('romaneioNumero').innerText = String(state.num).padStart(3,'0');
  document.getElementById('clienteSelect').value = '';
  document.getElementById('docCliente').value = '';
  document.getElementById('dispDoc').innerText = '';
  document.getElementById('pagSelect').value = 'Boleto';
  document.getElementById('qtdParc').value = '1';
  document.getElementById('ipiPerc').value = '0';
  document.getElementById('outrasExp').value = '0';
  document.getElementById('descontoF').value = '0';
  document.getElementById('infoLogInput').value = '';
  document.getElementById('currentDate').value = new Date().toISOString().split('T')[0];
  const username = currentProfile?.usuario || currentSession?.user?.user_metadata?.usuario || '';
  const vendedor = document.getElementById('vendedorInput'); if (vendedor) vendedor.value = username;
  syncCliente(); document.getElementById('dispVendedor').innerText = username || '---'; document.getElementById('dispPagamento').innerText = 'Boleto'; document.getElementById('dispInfoLog').style.display = 'none';
  const tbody = document.querySelector('#mainTable tbody'); tbody.innerHTML = ''; addRow(); calcFinal(); atualizarModoEdicaoUI();
}

// ─────────────────────────────────────────────
// CADASTROS / ADMINISTRAÇÃO DE USUÁRIOS
// ─────────────────────────────────────────────
async function renderCadastros() {
  renderCadList('clientes','clientes','cliList','cliCount');
  renderCadList('materiais','materiais','matList','matCount');
  renderCadList('industrializacoes','industrializacoes','indList','indCount');

  const canManageUsers = !!currentProfile?.auth_user_id;
  const userInput = document.getElementById('userInput');
  const passInput = document.getElementById('passInput');
  const addBtn = document.querySelector('button[onclick="cadAddUser()"]');
  if (userInput) userInput.disabled = !canManageUsers;
  if (passInput) passInput.disabled = !canManageUsers;
  if (addBtn) { addBtn.disabled = !canManageUsers; addBtn.title = canManageUsers ? '' : 'Sessão sem perfil vinculado'; }

  if (canManageUsers) {
    try {
      const data = await sbFunction('manage-users', { action: 'list' });
      state.usuarios = (data?.users || []).map(r => ({ id:r.id, profileId:r.profile_id, user:r.usuario, needsAuth:!!r.needs_auth }));
    } catch (e) {
      console.error('Erro ao carregar usuários:', e);
      state.usuarios = [];
      showToast('Não foi possível carregar usuários: ' + e.message, true);
    }
  } else {
    state.usuarios = currentProfile ? [{ id: currentProfile.auth_user_id, user: currentProfile.usuario, readonly:true }] : [];
  }
  renderUserList();

  document.getElementById('cfgNome').value = state.nomeEmpresa || '';
  document.getElementById('cfgSub').value = state.subEmpresa || '';
  document.getElementById('cfgTel').value = state.telefone || '';
  document.getElementById('cfgRedeTipo').value = state.redeTipo || '';
  document.getElementById('cfgRedeUser').value = state.redesInput || '';
}

function renderCadList(stateKey, table, listId, countId) {
  const ul = document.getElementById(listId), count = document.getElementById(countId), arr = state[stateKey] || [];
  if (!ul || !count) return;
  count.innerText = `${arr.length} cadastrado${arr.length !== 1 ? 's' : ''}`;
  if (!arr.length) { ul.innerHTML = '<li class="cad-empty">Nenhum cadastro ainda</li>'; return; }
  ul.innerHTML = '';
  [...arr].sort((a,b) => a.localeCompare(b,'pt-BR')).forEach(item => {
    const li = document.createElement('li'); const span = document.createElement('span'); span.textContent = item;
    const btn = document.createElement('button'); btn.className='btn-cad-del'; btn.title='Remover'; btn.textContent='×'; btn.onclick = () => cadDelByName(stateKey,table,listId,countId,item);
    li.append(span,btn); ul.appendChild(li);
  });
}

function renderUserList() {
  const ul = document.getElementById('userList'), count = document.getElementById('userCount'), arr = state.usuarios || [];
  if (!ul || !count) return;
  count.innerText = `${arr.length} usuário${arr.length !== 1 ? 's' : ''}`;
  ul.innerHTML = '';
  if (!arr.length) { ul.innerHTML = '<li class="cad-empty">Nenhum usuário disponível</li>'; return; }
  arr.forEach((u,i) => {
    const li = document.createElement('li'); const span = document.createElement('span');
    const badge = u.needsAuth ? 'MIGRAR' : '●●●●';
    span.innerHTML = `${escapeHtml(u.user)} <span class="user-badge">${badge}</span>`; li.appendChild(span);
    if (currentProfile && arr.length > 1 && String(u.id || '') !== String(currentSession?.user?.id)) {
      const btn = document.createElement('button'); btn.className='btn-cad-del'; btn.textContent='×'; btn.onclick = () => cadDelUser(i); li.appendChild(btn);
    }
    ul.appendChild(li);
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function cadAdd(stateKey, table, inputId, listId, countId) {
  const input = document.getElementById(inputId); const val = input?.value.trim(); if (!val) return;
  if (state[stateKey].includes(val)) { showToast('Já cadastrado!', true); return; }
  try { await sb.insert(table,{nome:val}); state[stateKey].push(val); input.value=''; renderCadList(stateKey,table,listId,countId); updateDropdowns(); showToast(`"${val}" adicionado!`); }
  catch (e) { console.error(e); showToast(friendlyDataError(e, 'Erro ao salvar cadastro.'), true); }
}

async function cadDelByName(stateKey, table, listId, countId, name) {
  confirmar(`Deseja remover "${name}" da lista de ${stateKey}?`, async () => {
    try { await sb.delete(table,'nome=eq.'+encodeURIComponent(name)); state[stateKey] = state[stateKey].filter(x => x !== name); renderCadList(stateKey,table,listId,countId); updateDropdowns(); showToast(`"${name}" removido`); }
    catch (e) { console.error(e); showToast('Erro ao remover item', true); }
  });
}

async function cadAddUser() {
  if (!currentProfile?.auth_user_id) { showToast('Sessão sem perfil vinculado.', true); return; }
  const u = document.getElementById('userInput').value.trim(); const p = document.getElementById('passInput').value;
  if (!u || !p) { showToast('Preencha usuário e senha!', true); return; }
  if (p.length < 6) { showToast('A senha deve ter pelo menos 6 caracteres.', true); return; }
  const existing = state.usuarios.find(x => normalizeUsername(x.user) === normalizeUsername(u));
  const wasLegacy = !!existing?.needsAuth;
  if (existing && !existing.needsAuth) { showToast('Usuário já existe!', true); return; }
  try {
    const data = await sbFunction('manage-users', { action:'create', usuario:u, password:p });
    if (existing?.needsAuth) {
      existing.id = data.user.id; existing.profileId = data.user.profile_id; existing.user = data.user.usuario; existing.needsAuth = false;
    } else {
      state.usuarios.push({ id:data.user.id, profileId:data.user.profile_id, user:data.user.usuario, needsAuth:false });
    }
    document.getElementById('userInput').value=''; document.getElementById('passInput').value=''; renderUserList(); showToast(wasLegacy ? 'Usuário migrado para Supabase Auth!' : 'Usuário criado!');
  } catch (e) { console.error(e); showToast('Erro: ' + e.message, true); }
}

async function cadDelUser(idx) {
  if (!currentProfile?.auth_user_id) { showToast('Sessão sem perfil vinculado.', true); return; }
  const u = state.usuarios[idx]; if (!u) return;
  if (String(u.id) === String(currentSession?.user?.id)) { showToast('Você não pode remover seu próprio acesso.', true); return; }
  confirmar(`Deseja remover o acesso do usuário "${u.user}"?`, async () => {
    try { await sbFunction('manage-users', { action:'delete', user_id:u.id || null, profile_id:u.profileId || null }); state.usuarios.splice(idx,1); renderUserList(); showToast(`Usuário "${u.user}" removido`); }
    catch (e) { console.error(e); showToast('Erro ao remover usuário: ' + e.message, true); }
  });
}

async function salvarConfigEmpresa() {
  const nome = document.getElementById('cfgNome').value.trim() || 'MegaOnline'; const sub = document.getElementById('cfgSub').value.trim() || 'Gestão de Romaneio';
  try { await sb.update('config_empresa','id=eq.1',{nome_empresa:nome,subtitulo:sub}); state.nomeEmpresa=nome; state.subEmpresa=sub; document.getElementById('nomeEmpresa').innerText=nome; document.getElementById('subEmpresa').innerText=sub; document.getElementById('loginNome').innerText=nome; document.title=`${nome} - Gestão de Romaneio`; showToast('Configurações salvas!'); }
  catch (e) { console.error(e); showToast('Erro ao salvar configurações', true); }
}

async function salvarConfigContato() {
  const tel=document.getElementById('cfgTel').value.trim(), tipo=document.getElementById('cfgRedeTipo').value, user=document.getElementById('cfgRedeUser').value.trim();
  try { await sb.update('config_empresa','id=eq.1',{telefone:tel,rede_tipo:tipo,rede_user:user}); state.telefone=tel; state.redeTipo=tipo; state.redesInput=user; atualizarContato(); showToast('Contato salvo!'); }
  catch (e) { console.error(e); showToast('Erro ao salvar contato', true); }
}

const salvarConfigEmpresaDebounced = debounce(salvarConfigEmpresa,700);
const salvarConfigContatoDebounced = debounce(salvarConfigContato,700);

async function alterarSenhaAdmin() {
  const atual = document.getElementById('cfgSenhaAtual').value; const nova = document.getElementById('cfgSenhaNova').value;
  if (!atual || !nova) { showToast('Preencha os campos de senha!', true); return; }
  if (nova.length < 6) { showToast('A nova senha deve ter pelo menos 6 caracteres', true); return; }
  try {
    const client = await ensureSupabaseClient(); const session = await getActiveSession(); const email = session.user?.email;
    if (!email) throw new Error('Conta autenticada sem e-mail interno.');
    const { error: reauthError } = await client.auth.signInWithPassword({ email, password: atual });
    if (reauthError) { showToast('Senha atual incorreta!', true); return; }
    const { data, error } = await client.auth.updateUser({ password: nova });
    if (error) throw error;
    if (data?.user) currentSession = (await client.auth.getSession()).data?.session || currentSession;
    document.getElementById('cfgSenhaAtual').value=''; document.getElementById('cfgSenhaNova').value=''; showToast('✅ Senha alterada com sucesso!');
  } catch (e) { console.error('Erro Supabase:',e); showToast('Erro técnico ao salvar senha: ' + e.message, true); }
}

function mostrarLogo(src) {
  const logoSrc = src || DEFAULT_LOGO; const img=document.getElementById('logoImg'), fav=document.getElementById('favicon'), loginLogo=document.querySelector('.login-logo');
  if (img) { img.src=logoSrc; img.style.display='block'; } if (loginLogo) loginLogo.src=logoSrc; if (fav) fav.href=logoSrc;
}

async function carregarLogo(input) {
  const file=input?.files?.[0]; if (!file) return;
  const reader=new FileReader();
  reader.onload=async e => {
    try { const logoBase64=e.target?.result || DEFAULT_LOGO; await sb.update('config_empresa','id=eq.1',{logo_base64:logoBase64}); state.logo=logoBase64; mostrarLogo(logoBase64); showToast('Logo salva!'); }
    catch (err) { console.error(err); showToast('Erro ao salvar logo', true); }
  };
  reader.readAsDataURL(file);
}

async function resetarLogo() {
  confirmar('Deseja remover a logo atual e voltar para a logo padrão?', async () => {
    try { await sb.update('config_empresa','id=eq.1',{logo_base64:''}); state.logo=DEFAULT_LOGO; mostrarLogo(DEFAULT_LOGO); showToast('Logo restaurada!'); }
    catch (e) { console.error(e); showToast('Erro ao restaurar logo', true); }
  });
}

function atualizarContato() {
  const tel=state.telefone||'', tipo=state.redeTipo||'', user=state.redesInput||'';
  const dispTel=document.getElementById('dispTelefone'); if (dispTel) dispTel.innerText=tel ? '📞 '+tel : '';
  const dispRede=document.getElementById('dispRede'); if (dispRede) dispRede.innerText='';
  let url=''; if (user) url = tipo === '' ? (user.startsWith('http') ? user : 'https://'+user) : 'https://'+tipo+user;
  const qrEl=document.getElementById('qrcode'); if (qrEl) { qrEl.innerHTML=''; try { new QRCode(qrEl,{text:url||tel||window.location.href,width:70,height:70}); } catch(e) { console.error(e); } }
}

const romaneioNumeroEl=document.getElementById('romaneioNumero'); if (romaneioNumeroEl) romaneioNumeroEl.addEventListener('input',verificarNumDuplicado);

function showToast(msg,isError=false) {
  const t=document.getElementById('toastMsg'); if (!t) return; t.textContent=msg; t.className='toast'+(isError?' error':''); setTimeout(()=>t.classList.add('show'),10); setTimeout(()=>t.classList.remove('show'),2500);
}

function addOpt(e,id,key) {
  if (e.key==='Enter' && e.target.value.trim()) {
    const map={clientes:['clientes','clientes','cliList','cliCount'],materiais:['materiais','materiais','matList','matCount'],industrializacoes:['industrializacoes','industrializacoes','indList','indCount']};
    const [stateKey,table,listId,countId]=map[key] || ['materiais','materiais','matList','matCount']; cadAdd(stateKey,table,id,listId,countId);
  }
}

checkLogin();
