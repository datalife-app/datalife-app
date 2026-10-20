/* ============================================
   DataLife — Pagamentos
   ============================================
   Referências de apps de contas (Prism, Bills Organizer): "Paguei" num
   toque, situação de cada conta à primeira vista (vencida / vence em
   breve / mais adiante / paga) e um calendário do mês com os vencimentos.
   Próprio do DataLife: ao pagar, a conta pode virar um gasto no Orçamento,
   e os vencimentos próximos aparecem no aviso global de todas as páginas.
   ============================================ */

import { requireAuth } from './auth.js';
import { initPagina, persist, dadosProntos } from './pagina.js';
import { avisarMudanca } from './alertas.js';
import {
  fetchContas, saveContas, fetchPagas, setPaga, situacao, quando, novoPagamento, AVISOS, LIMITES
} from './pagamentos-db.js';
import { addGasto, removeGasto, updateGasto, fetchMonth } from './db.js';
import { enhanceSelect } from './selectpicker.js';
import { enhanceDateInput } from './datepicker.js';
import {
  icon, escapeHtml, showToast, uid, formatBRL, formatBRLRaw, parseBRL, bindCurrencyInput, bindPrivacyToggle,
  monthKey, monthLabel, shiftMonth, dayKey, CATEGORIAS
} from './utils.js';

const $ = id => document.getElementById(id);
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const user = await requireAuth();

const state = {
  hoje: dayKey(new Date()),
  mes: monthKey(new Date()),
  contas: [],
  pagas: {},
  editando: null,   // conta no dialog
  pagando: null     // conta no dialog de pagamento
};

const ordemStatus = { vencida: 0, proxima: 1, futura: 2, paga: 3 };
const fmtData = iso => iso.split('-').reverse().slice(0, 2).join('/');

/* ---------- Tela ---------- */

function itens() {
  return state.contas
    .map(c => ({ c, s: situacao(c, state.mes, state.pagas, state.hoje) }))
    .sort((a, b) => ordemStatus[a.s.status] - ordemStatus[b.s.status] || a.s.vence.localeCompare(b.s.vence) || a.c.nome.localeCompare(b.c.nome));
}

function renderLinha(lista) {
  const [y, m] = state.mes.split('-').map(Number);
  const dias = new Date(y, m, 0).getDate();
  const porDia = new Map();
  for (const it of lista) {
    const d = Number(it.s.vence.slice(8));
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d).push(it);
  }
  const hojeDia = state.hoje.startsWith(state.mes) ? Number(state.hoje.slice(8)) : 0;
  return `
    <div class="linha-mes" role="img" aria-label="Vencimentos de ${monthLabel(state.mes)}">
      ${Array.from({ length: dias }, (_, i) => {
        const d = i + 1;
        const its = porDia.get(d) || [];
        const st = its.length ? its.map(x => x.s.status).sort((a, b) => ordemStatus[a] - ordemStatus[b])[0] : '';
        return `<span class="lm-dia ${d === hojeDia ? 'is-hoje' : ''} ${st ? `has-conta st-${st}` : ''}" title="${its.map(x => escapeHtml(x.c.nome)).join(', ')}">
          <i></i>${d === 1 || d % 5 === 0 || d === dias || its.length ? `<span class="num">${d}</span>` : ''}
        </span>`;
      }).join('')}
    </div>`;
}

function rowConta({ c, s }) {
  const [, mm, dd] = s.vence.split('-');
  const sub = s.status === 'paga'
    ? `Paga em ${fmtData(s.pagamento.em)}`
    : quando(s.dias).replace(/^./, ch => ch.toUpperCase());
  const valor = s.status === 'paga' ? s.pagamento.valor : c.valor;
  return `
    <li class="conta st-${s.status}" data-id="${escapeHtml(c.id)}">
      <span class="conta-data"><strong class="num">${dd}</strong><span>${MES_CURTO[Number(mm) - 1]}</span></span>
      <button type="button" class="conta-info" data-editar>
        <strong>${escapeHtml(c.nome)}</strong>
        <span class="conta-sub">${sub}${c.lancar ? ' · lança no Orçamento' : ''}</span>
      </button>
      ${s.status === 'paga'
        ? `<button type="button" class="conta-valor num" data-pagamento title="Ajustar valor ou data">${formatBRL(valor)}</button>`
        : `<span class="conta-valor num">${valor ? formatBRL(valor) : '—'}</span>`}
      ${s.status === 'paga'
        ? `<span class="conta-ok" title="Paga">${icon('check', 16)}</span>`
        : `<button type="button" class="btn btn-sm ${s.status === 'futura' ? 'btn-ghost' : 'btn-primary'}" data-pagar>${icon('check', 14)} Paguei</button>`}
    </li>`;
}

function render() {
  $('mes-label').textContent = monthLabel(state.mes);
  const lista = itens();
  if (!state.contas.length) {
    $('pag-body').innerHTML = `
      <section class="vazio">
        <span class="vazio-icon">${icon('receipt', 26)}</span>
        <h2>Cadastre as contas que vencem todo mês</h2>
        <p>Aluguel, energia, internet, cartão, escola. Com o dia do vencimento, o DataLife mostra o que falta pagar e avisa em todas as páginas quando estiver perto.</p>
        <button class="btn btn-primary" type="button" data-nova>${icon('plus', 15)} Nova conta</button>
      </section>`;
    return;
  }
  const total = lista.reduce((a, x) => a + (x.s.status === 'paga' ? x.s.pagamento.valor : x.c.valor), 0);
  const pago = lista.filter(x => x.s.status === 'paga').reduce((a, x) => a + x.s.pagamento.valor, 0);
  const abertas = lista.filter(x => x.s.status !== 'paga');
  const proxima = abertas.filter(x => x.s.dias >= 0).sort((a, b) => a.s.dias - b.s.dias)[0];
  const vencidas = abertas.filter(x => x.s.status === 'vencida').length;
  const tile = (label, value, sub, cls = '') => `<div class="kpi ${cls}"><span class="kpi-label">${label}</span><strong class="kpi-value num">${value}</strong><span class="kpi-sub">${sub}</span></div>`;

  const grupos = [
    ['vencida', 'Vencidas'], ['proxima', 'Vencem em breve'], ['futura', 'Mais adiante'], ['paga', 'Pagas']
  ].map(([st, nome]) => {
    const its = lista.filter(x => x.s.status === st);
    return its.length ? `
      <section class="grupo grupo-${st}" aria-label="${nome}">
        <h2 class="grupo-title">${nome} <span class="num">${its.length}</span></h2>
        <ul class="contas">${its.map(rowConta).join('')}</ul>
      </section>` : '';
  }).join('');

  $('pag-body').innerHTML = `
    <div class="kpis">
      ${tile('Total do mês', formatBRL(total), `${lista.length} ${lista.length === 1 ? 'conta' : 'contas'}`)}
      ${tile('Pago', formatBRL(pago), `${lista.length - abertas.length} de ${lista.length}`, 'is-ok')}
      ${tile('Falta pagar', formatBRL(total - pago), vencidas ? `${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}` : abertas.length ? 'nenhuma vencida' : 'tudo pago')}
      ${tile('Próximo vencimento', proxima ? escapeHtml(proxima.c.nome) : '—', proxima ? `${fmtData(proxima.s.vence)} · ${quando(proxima.s.dias)}` : 'nada em aberto', 'kpi-texto')}
    </div>
    <section class="card linha-card">${renderLinha(lista)}</section>
    ${grupos}`;
}

/* ---------- Pagar / desmarcar ---------- */

/* O pagamento guarda o id do lançamento que criou no Orçamento (`gasto`):
   desfazer ou ajustar o pagamento acha o lançamento por esse id e mexe nele.
   As escritas não esperam o servidor: offline, o Firestore guarda a fila e
   tudo sobe junto quando a rede volta (antes, o lançamento só saía depois
   da confirmação do pagamento e se perdia se a aba fechasse no meio). */

/** Lançamento do Orçamento ligado a um pagamento (lido do cache local se offline). */
async function lancamentoDe(pagamento) {
  if (!pagamento?.gasto) return null;
  const m = await fetchMonth(user.uid, pagamento.em.slice(0, 7));
  return m.gastos.find(g => g.id === pagamento.gasto) || null;
}

function pagar(conta) {
  const mes = state.mes;
  const { pagamento, gasto } = novoPagamento(conta, state.hoje, uid());
  state.pagas = { ...state.pagas, [conta.id]: pagamento };
  render();
  avisarMudanca();
  persist(setPaga(user.uid, mes, conta.id, pagamento), () => {
    const { [conta.id]: _, ...resto } = state.pagas;
    state.pagas = resto;
    render();
  });
  if (gasto) persist(addGasto(user.uid, gasto.data.slice(0, 7), gasto), null, 'Paga, mas não foi possível lançar no Orçamento.');
  showToast(`${conta.nome}: paga${gasto ? ' e lançada no Orçamento' : ''}.`, 'success', 6000, {
    label: 'Desfazer',
    onClick: () => desmarcar(conta, mes, pagamento)
  });
}

/** Tira o pagamento (e o lançamento que ele criou no Orçamento). */
async function desmarcar(conta, mes, pagamento = state.pagas[conta.id]) {
  if (mes === state.mes) {
    const { [conta.id]: _, ...resto } = state.pagas;
    state.pagas = resto;
    render();
  }
  avisarMudanca();
  persist(setPaga(user.uid, mes, conta.id, null), () => {
    if (mes === state.mes) { state.pagas = { ...state.pagas, [conta.id]: pagamento }; render(); }
  });
  const g = await lancamentoDe(pagamento).catch(() => null);
  if (g) persist(removeGasto(user.uid, g.data.slice(0, 7), g), null, 'Não foi possível tirar o lançamento do Orçamento.');
}

/** Pagamento ajustado (data/valor): o lançamento do Orçamento acompanha, inclusive se mudar de mês. */
async function ajustarLancamento(antes, depois) {
  const g = await lancamentoDe(antes).catch(() => null);
  if (!g) return;
  const novo = { ...g, valor: depois.valor, data: depois.em };
  const msg = 'Pagamento ajustado, mas o lançamento do Orçamento não foi atualizado.';
  if (!novo.valor) return persist(removeGasto(user.uid, g.data.slice(0, 7), g), null, msg);
  if (g.data.slice(0, 7) === novo.data.slice(0, 7)) return persist(updateGasto(user.uid, g.data.slice(0, 7), g, novo), null, msg);
  persist(removeGasto(user.uid, g.data.slice(0, 7), g), null, msg);
  persist(addGasto(user.uid, novo.data.slice(0, 7), novo), null, msg);
}

/* ---------- Dialogs ---------- */

function abrirConta(conta) {
  state.editando = conta;
  const f = $('conta-form');
  f.reset();
  $('conta-title').textContent = conta ? 'Editar conta' : 'Nova conta';
  $('conta-excluir').hidden = !conta;
  f.nome.value = conta?.nome || '';
  f.valor.value = conta?.valor ? formatBRLRaw(conta.valor) : '';
  f.dia.value = String(conta?.dia || 10);
  f.aviso.value = String(conta?.aviso || 3);
  f.lancar.checked = conta?.lancar || false;
  f.cat.value = conta?.cat || 'custosFixos';
  $('field-cat').hidden = !f.lancar.checked;
  $('conta-dialog').showModal();
  if (!conta) f.nome.focus();
}

function salvarContas(next, prev, msg) {
  state.contas = next;
  render();
  avisarMudanca();
  persist(saveContas(user.uid, next), () => { state.contas = prev; render(); }).then(ok => ok && msg && showToast(msg));
}

async function abrirPagamento(conta) {
  state.pagando = conta;
  const p = state.pagas[conta.id];
  const f = $('pago-form');
  $('pago-sub').textContent = `${conta.nome} · ${monthLabel(state.mes)}`;
  f.valor.value = formatBRLRaw(p.valor);
  f.em.value = p.em;
  $('pago-dialog').showModal();
}

function bind() {
  $('mes-prev').innerHTML = icon('chevronLeft');
  $('mes-next').innerHTML = icon('chevronRight');
  $('btn-nova').innerHTML = `${icon('plus', 16)} Nova conta`;
  bindPrivacyToggle($('btn-privacy'));
  window.addEventListener('datalife:privacy', render);

  const f = $('conta-form');
  f.dia.innerHTML = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">Dia ${i + 1}</option>`).join('');
  f.aviso.innerHTML = AVISOS.map(n => `<option value="${n}">${n} ${n === 1 ? 'dia' : 'dias'} antes</option>`).join('');
  f.cat.innerHTML = CATEGORIAS.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  [f.dia, f.aviso, f.cat].forEach(enhanceSelect);
  bindCurrencyInput(f.valor);
  bindCurrencyInput($('pago-form').valor);
  enhanceDateInput($('pago-form').em);
  f.lancar.addEventListener('change', () => { $('field-cat').hidden = !f.lancar.checked; });

  for (const d of ['conta-dialog', 'pago-dialog']) {
    $(d).querySelector('.dialog-head [data-close]').innerHTML = icon('x', 18);
    $(d).querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(d).close()));
  }

  $('mes-prev').addEventListener('click', () => mudarMes(-1));
  $('mes-next').addEventListener('click', () => mudarMes(1));
  $('btn-nova').addEventListener('click', () => abrirConta(null));

  $('pag-body').addEventListener('click', e => {
    if (e.target.closest('[data-nova]')) return abrirConta(null);
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const conta = state.contas.find(c => c.id === li.dataset.id);
    if (e.target.closest('[data-pagar]')) return pagar(conta);
    if (e.target.closest('[data-pagamento]')) return abrirPagamento(conta);
    if (e.target.closest('[data-editar]')) return abrirConta(conta);
  });

  f.addEventListener('submit', e => {
    e.preventDefault();
    const prev = state.contas;
    const dados = {
      id: state.editando?.id || uid(),
      nome: f.nome.value.trim(),
      valor: parseBRL(f.valor.value),
      dia: Number(f.dia.value),
      aviso: Number(f.aviso.value),
      lancar: f.lancar.checked,
      cat: f.cat.value
    };
    if (!dados.nome) return f.nome.reportValidity();
    if (!state.editando && prev.length >= LIMITES.contas) return showToast(`Até ${LIMITES.contas} contas.`, 'error');
    $('conta-dialog').close();
    const next = state.editando ? prev.map(c => (c.id === dados.id ? dados : c)) : [...prev, dados];
    salvarContas(next, prev, state.editando ? 'Conta salva.' : `${dados.nome} adicionada.`);
  });

  $('conta-excluir').addEventListener('click', () => {
    const conta = state.editando;
    $('conta-dialog').close();
    const prev = state.contas;
    salvarContas(prev.filter(c => c.id !== conta.id), prev);
    showToast(`${conta.nome} excluída.`, 'success', 8000, {
      label: 'Desfazer',
      onClick: () => salvarContas([...state.contas, conta], state.contas)
    });
  });

  $('pago-form').addEventListener('submit', e => {
    e.preventDefault();
    const pf = e.target;
    const conta = state.pagando;
    const prev = state.pagas[conta.id];
    const pagamento = { em: pf.em.value, valor: parseBRL(pf.valor.value), ...(prev?.gasto ? { gasto: prev.gasto } : {}) };
    $('pago-dialog').close();
    state.pagas = { ...state.pagas, [conta.id]: pagamento };
    render();
    persist(setPaga(user.uid, state.mes, conta.id, pagamento), () => { state.pagas = { ...state.pagas, [conta.id]: prev }; render(); });
    if (prev && (prev.em !== pagamento.em || prev.valor !== pagamento.valor)) ajustarLancamento(prev, pagamento);
    showToast('Pagamento ajustado.');
  });
  $('pago-desfazer').addEventListener('click', () => {
    $('pago-dialog').close();
    desmarcar(state.pagando, state.mes);
  });
}

async function mudarMes(delta) {
  state.mes = shiftMonth(state.mes, delta);
  await carregarMes();
}

let seq = 0;
async function carregarMes() {
  const s = ++seq;
  $('mes-label').textContent = monthLabel(state.mes);
  try {
    const pagas = await fetchPagas(user.uid, state.mes);
    if (s !== seq) return;
    state.pagas = pagas;
  } catch (e) {
    console.error(e);
    showToast('Não foi possível carregar este mês.', 'error');
  }
  render();
}

/* ---------- Init ---------- */

initPagina();
bind();
try {
  state.contas = await fetchContas(user.uid);
  dadosProntos();
} catch (e) {
  console.error(e);
  showToast('Não foi possível carregar as contas. Verifique a conexão.', 'error', 6000);
}
await carregarMes();
