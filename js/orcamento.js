/* ============================================
   DataLife — Orçamento doméstico + Minhas metas
   ============================================
   Valores monetários sempre em centavos (inteiros).
   ============================================ */

import { requireAuth } from './auth.js';
import { initPagina, persist, dadosProntos } from './pagina.js';
import { fetchMetas, saveMetas, fetchMonth, saveRendas, addGasto, addGastos, removeGasto, updateGasto } from './db.js';
import { initRendasDialog, openRendasDialog } from './rendas-dialog.js';
import { initSearchDialog, openSearchDialog, refreshSearch } from './search-dialog.js';
import {
  initRecorrentes, loadRecorrentes, renderBanner, findTemplate, getTemplates, setTemplates, templateFrom
} from './recorrentes.js';
import { initCopyDialog, openCopyDialog } from './copy-dialog.js';
import { initVisao, showVisao, refreshVisao } from './visao.js';
import { renderDonut } from './donut.js';
import { enhanceDateInput } from './datepicker.js';
import {
  CATEGORIAS, defaultMetas, icon, formatBRL, formatBRLRaw, formatPct, bindCurrencyInput, parseBRL,
  monthKey, monthLabel, shiftMonth, formatDay, debounce, escapeHtml, showToast, uid,
  bindPrivacyToggle, faixaLabel, sugerirCortes
} from './utils.js';

const DANGER = 'var(--danger)';
const $ = id => document.getElementById(id);

const user = await requireAuth();

const state = {
  month: monthKey(new Date()),
  renda: 0,           // fontes + VA
  rendas: [],
  va: 0,              // vale-alimentação do mês (opcional)
  gastos: [],
  metas: defaultMetas(),
  cat: CATEGORIAS[0].id,
  editingId: null,    // lançamento em edição
  focusGastos: null,  // fatia destacada no gráfico de gastos
  focusMetas: null    // fatia destacada no gráfico de metas
};

/* ---------- Persistência ---------- */
// persist() vem de pagina.js: grava, e em erro desfaz a mudança otimista e avisa.

const persistMetas = debounce(metas => persist(saveMetas(user.uid, metas), null, 'Erro ao salvar metas.'), 500);

let lastAddedId = null;
let loadSeq = 0;
let monthLoaded = false;

function setMonthBusy(busy) {
  $('renda').disabled = busy;
  for (const el of $('gasto-form').elements) el.disabled = busy;
}

/** @param {Promise} [pre] leitura do mês já em andamento (abertura da página) */
async function loadMonth(key, pre) {
  const seq = ++loadSeq;
  state.month = key;
  state.renda = 0;
  state.rendas = [];
  state.va = 0;
  state.gastos = [];
  state.editingId = null;
  state.focusGastos = null;
  $('month-label').textContent = monthLabel(key);
  updateTitle();
  setMonthBusy(true);

  let data;
  try {
    data = await (pre || fetchMonth(user.uid, key));
  } catch (e) {
    if (seq !== loadSeq) return;
    console.error(e);
    // Mostra o mês vazio (não os dados do mês anterior) e mantém os campos travados:
    // salvar renda sem ter lido o mês poderia sobrescrever fontes que existem no servidor.
    renderOrcamento();
    showToast('Não foi possível carregar este mês. Verifique a conexão e tente de novo.', 'error', 6000);
    return;
  }
  if (seq !== loadSeq) return; // resposta de um mês que já não está na tela

  state.renda = data.renda;
  state.rendas = data.rendas;
  state.va = data.va;
  state.gastos = data.gastos;
  setDefaultDate();
  setMonthBusy(false);
  renderOrcamento();
  renderMetas();
}

function showLoadError(e) {
  console.error(e);
  const denied = e?.code === 'permission-denied';
  document.querySelector('main').innerHTML = `
    <div class="load-error">
      <h1>Não foi possível carregar seus dados</h1>
      <p>${denied
        ? 'Esta conta não tem permissão de acesso. Confira se o e-mail está em emailsPermitidos() no firestore.rules e se as regras foram publicadas.'
        : 'Verifique sua conexão e recarregue a página.'}</p>
    </div>`;
}

/* ---------- Cálculos ---------- */

function gastoPorCat() {
  const totals = Object.fromEntries(CATEGORIAS.map(c => [c.id, 0]));
  for (const g of state.gastos) totals[g.cat] = (totals[g.cat] || 0) + g.valor;
  return totals;
}

const somaMetas = () => CATEGORIAS.reduce((a, c) => a + (state.metas[c.id] || 0), 0);
/** O VA só paga comida: vai inteiro para Custos fixos; as metas dividem o resto da renda. */
const devoGastar = catId =>
  Math.round((state.renda - state.va) * (state.metas[catId] || 0) / 100) + (catId === 'custosFixos' ? state.va : 0);
const gastoVA = () => state.gastos.reduce((a, g) => a + (g.va ? g.valor : 0), 0);

/* ---------- Orçamento doméstico ---------- */

function renderOrcamento() {
  const porCat = gastoPorCat();
  const totalGasto = Object.values(porCat).reduce((a, b) => a + b, 0);

  // Gastos (rosca)
  const chart = $('gastos-chart');
  if (state.focusGastos && !porCat[state.focusGastos]) state.focusGastos = null;
  const focus = state.focusGastos;
  if (totalGasto === 0) {
    chart.innerHTML = '<p class="empty-text">Você não possui gastos cadastrados</p>';
    delete chart.dataset.sig;
  } else {
    renderDonut(chart, CATEGORIAS.map(c => ({
      key: c.id,
      label: `${c.nome}: ${formatBRL(porCat[c.id])}`,
      value: porCat[c.id],
      color: c.cor,
      center: formatBRL(porCat[c.id]),
      caption: `${c.nome} · ${formatPct(porCat[c.id] / totalGasto * 100, 0)}`
    })), {
      center: formatBRL(totalGasto), caption: 'Total', active: focus, onSelect: focusGastos,
      onHover: key => markGastosFocus(key ?? state.focusGastos)
    });
  }
  $('gastos-legend').innerHTML = CATEGORIAS.map(c => `
    <li><button type="button" data-focus="${c.id}" class="${focus ? (focus === c.id ? 'is-focus' : 'is-dim') : ''}"
      ${porCat[c.id] ? '' : 'disabled'}><span class="dot" style="--c:${c.cor}"></span>${c.nome}</button></li>`).join('');

  // Resumo
  $('resumo-body').innerHTML = CATEGORIAS.map(c => {
    const gasto = porCat[c.id];
    const devo = devoGastar(c.id);
    const usado = devo > 0 ? gasto / devo * 100 : (gasto > 0 ? Infinity : 0);
    const usadoTxt = usado === Infinity ? '—' : formatPct(usado);
    const total = state.renda > 0 ? gasto / state.renda * 100 : 0;
    return `
      <tr data-cat="${c.id}" class="${focus ? (focus === c.id ? 'is-focus' : 'is-dim') : ''}">
        <td><span class="dot" style="--c:${c.cor}"></span>${c.nome}</td>
        <td data-label="Gasto">${formatBRL(gasto)}</td>
        <td data-label="Devo gastar">${formatBRL(devo)}</td>
        <td data-label="Utilizado" class="${usado > 100 ? 'text-danger' : ''}">${usadoTxt}</td>
        <td data-label="Da renda">${formatPct(total)}</td>
      </tr>`;
  }).join('');

  // O VR/VA fica à parte: só paga o que foi lançado com VA; o que estoura dele sai do dinheiro
  const usadoVA = gastoVA();
  const saldoVA = Math.max(0, state.va - usadoVA);
  const restante = (state.renda - state.va) - (totalGasto - usadoVA) - Math.max(0, usadoVA - state.va);
  $('total-gasto').textContent = formatBRL(totalGasto);
  $('total-restante').textContent = formatBRL(Math.abs(restante));
  $('restante-label').textContent = restante < 0 ? 'Ultrapassou' : 'Ainda pode gastar';
  $('restante-box').classList.toggle('is-over', restante < 0);
  $('restante-va').hidden = !state.va;
  $('restante-va').textContent = `+ VR/VA ${formatBRL(saldoVA)}`;
  const utilizado = state.renda > 0 ? totalGasto / state.renda * 100 : 0;
  $('total-utilizado').textContent = formatPct(utilizado, 0);
  $('total-utilizado').parentElement.classList.toggle('is-over', utilizado > 100);

  // Metas (card)
  const soma = somaMetas();
  $('metas-list').innerHTML = CATEGORIAS.map(c =>
    `<li><span>${c.nome}</span><span class="num">${state.metas[c.id]}%</span></li>`).join('') +
    (soma !== 100 ? `<li class="metas-sum-warn ${soma > 100 ? 'text-danger' : 'text-muted'}">Soma das metas: ${soma}%</li>` : '');

  renderRenda();
  renderBanner();
  renderCatPanel(porCat);
}

function renderRenda() {
  // O VR/VA aparece à parte, fora do total exibido (nas metas ele continua indo para Custos fixos)
  $('renda-total').textContent = state.renda ? formatBRL(state.renda - state.va) : 'Definir renda';
  $('renda').classList.toggle('is-empty', !state.renda);
  const n = state.rendas.length;
  $('renda-fontes').textContent = [n > 1 ? `${n} fontes` : '', state.va ? `VR/VA ${formatBRL(state.va)}` : ''].filter(Boolean).join(' · ');
}

function editRendas() {
  openRendasDialog({
    userId: user.uid,
    key: state.month,
    rendas: state.rendas,
    va: state.va,
    onSave: (rendas, va) => {
      const key = state.month;
      const prev = { renda: state.renda, rendas: state.rendas, va: state.va };
      state.rendas = rendas;
      state.va = va;
      state.renda = rendas.reduce((a, r) => a + r.valor, 0) + va;
      renderOrcamento();
      renderMetas();
      persist(saveRendas(user.uid, key, rendas, va), () => {
        if (state.month !== key) return;
        Object.assign(state, prev);
        renderOrcamento();
        renderMetas();
      });
    }
  });
}

/* ---------- Recorrentes ---------- */

/** Liga/desliga "repetir todo mês" a partir de um gasto lançado. */
function toggleRepeat(id) {
  const key = state.month;
  const g = state.gastos.find(x => x.id === id);
  if (!g) return;
  const t = findTemplate(g.rec);
  const falhou = e => {
    console.error(e);
    showToast('Não foi possível salvar o gasto fixo.', 'error');
    renderOrcamento();
  };
  // Otimista: a tela muda na hora (offline o servidor só confirma depois); setTemplates desfaz se falhar
  if (t) {
    setTemplates(getTemplates().filter(x => x.id !== t.id)).catch(falhou);
    showToast(`"${g.desc}" não vai mais repetir nos próximos meses.`);
  } else {
    const novoT = templateFrom(g, key);
    const novoG = { ...g, rec: novoT.id };
    setTemplates([...getTemplates(), novoT]).catch(falhou);
    state.gastos = state.gastos.map(x => (x.id === g.id ? novoG : x));
    persist(updateGasto(user.uid, key, g, novoG), () => {
      if (state.month === key) state.gastos = state.gastos.map(x => (x.id === g.id ? g : x));
      // Sem o vínculo no gasto, o modelo apareceria como "pendente" neste mês: remove também
      setTemplates(getTemplates().filter(x => x.id !== novoT.id)).catch(e => console.error(e));
      renderOrcamento();
    });
    showToast(`"${g.desc}" vai aparecer como gasto fixo nos próximos meses.`);
  }
  renderOrcamento();
}

function launchRecorrentes(gastos) {
  const key = state.month;
  state.gastos.push(...gastos);
  renderOrcamento();
  showToast(`${gastos.length} ${gastos.length === 1 ? 'gasto fixo lançado' : 'gastos fixos lançados'}.`);
  persist(addGastos(user.uid, key, gastos), () => {
    if (state.month !== key) return;
    const ids = new Set(gastos.map(g => g.id));
    state.gastos = state.gastos.filter(g => !ids.has(g.id));
    renderOrcamento();
  });
}

function renderCatNav() {
  $('cat-nav').innerHTML = CATEGORIAS.map(c => `
    <button class="cat-btn ${c.id === state.cat ? 'active' : ''}" data-cat="${c.id}"
      title="${c.nome}" aria-pressed="${c.id === state.cat}">${icon(c.icon)}<span class="cat-btn-label">${c.nome}</span></button>`).join('');
}

function selectCat(catId, scroll = false) {
  state.cat = catId;
  state.editingId = null;
  renderCatNav();
  renderCatPanel(gastoPorCat());
  if (scroll) $('cat-nav').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCatPanel(porCat) {
  const cat = CATEGORIAS.find(c => c.id === state.cat);
  const gasto = porCat[cat.id];
  const devo = devoGastar(cat.id);
  const pct = devo > 0 ? gasto / devo * 100 : (gasto > 0 ? 100 : 0);

  $('cat-title').textContent = cat.nome;
  $('gasto-form').elements.desc.placeholder = `Ex.: ${cat.exemplo}`;
  const restam = devo - gasto;
  $('cat-stats').innerHTML = `
    <div><span>Gasto</span><strong class="num">${formatBRL(gasto)}</strong></div>
    <div><span>Meta</span><strong class="num">${formatBRL(devo)}</strong></div>
    <div class="${restam < 0 ? 'is-over' : ''}"><span>${restam < 0 ? 'Excedeu' : 'Restam'}</span><strong class="num">${formatBRL(Math.abs(restam))}</strong></div>`;
  const comVA = cat.id === 'custosFixos' && state.va > 0;
  if (comVA) {
    const saldo = state.va - gastoVA();
    $('cat-stats').insertAdjacentHTML('beforeend',
      `<div class="${saldo < 0 ? 'is-over' : ''}"><span>${saldo < 0 ? 'VA estourou' : 'Saldo do VA'}</span><strong class="num">${formatBRL(Math.abs(saldo))}</strong></div>`);
  }
  $('chip-va').hidden = !comVA;
  if (!comVA) $('gasto-form').elements.pagoVa.checked = false;

  const bar = $('cat-progress');
  bar.style.setProperty('--c', cat.cor);
  bar.style.transform = `scaleX(${Math.min(pct, 100) / 100})`;
  bar.classList.toggle('over', pct > 100);

  const itens = state.gastos
    .filter(g => g.cat === cat.id)
    .sort((a, b) => b.data.localeCompare(a.data));

  $('gasto-list').innerHTML = itens.length
    ? itens.map(g => g.id === state.editingId ? editRow(g) : viewRow(g)).join('')
    : `<li class="empty">Nenhum gasto em ${cat.nome.toLowerCase()} neste mês.</li>`;

  const editForm = $('gasto-list').querySelector('.edit-form');
  if (editForm) {
    bindCurrencyInput(editForm.elements.valor);
    enhanceDateInput(editForm.elements.data);
  }
}

function viewRow(g) {
  const id = escapeHtml(g.id);
  const desc = escapeHtml(g.desc);
  return `
    <li class="${g.id === lastAddedId ? 'is-new' : ''}">
      <button type="button" class="row-edit" data-edit="${id}" title="Editar">
        <span class="day num">${escapeHtml(formatDay(g.data))}</span>
        <span class="desc">${desc}${g.va ? ' <span class="va-tag" title="Pago com vale-alimentação">VA</span>' : ''}</span>
        <span class="val num">${formatBRL(g.valor)}</span>
      </button>
      <span class="row-actions">
        <button class="icon-btn repeat ${findTemplate(g.rec) ? 'is-on' : ''}" type="button" data-repeat="${id}"
          aria-pressed="${!!findTemplate(g.rec)}" title="${findTemplate(g.rec) ? 'Gasto fixo: repete todo mês' : 'Repetir todo mês'}"
          aria-label="Repetir ${desc} todo mês">${icon('repeat', 15)}</button>
        <button class="icon-btn" type="button" data-edit="${id}" aria-label="Editar ${desc}">${icon('pencil', 15)}</button>
        <button class="icon-btn danger" type="button" data-del="${id}" aria-label="Excluir ${desc}">${icon('trash', 15)}</button>
      </span>
    </li>`;
}

function editRow(g) {
  const { min, max } = monthBounds();
  return `
    <li class="is-editing">
      <form class="edit-form" data-id="${escapeHtml(g.id)}" autocomplete="off">
        <input class="input" name="data" type="date" value="${escapeHtml(g.data)}" min="${min}" max="${max}" required aria-label="Data">
        <input class="input" name="desc" value="${escapeHtml(g.desc)}" maxlength="80" required aria-label="Descrição">
        <input class="input num" name="valor" value="${formatBRLRaw(g.valor)}" inputmode="numeric" maxlength="22" required aria-label="Valor">
        <span class="row-actions">
          <button class="icon-btn ok" type="submit" aria-label="Salvar alterações">${icon('check', 16)}</button>
          <button class="icon-btn" type="button" data-cancel aria-label="Cancelar edição">${icon('x', 16)}</button>
        </span>
      </form>
    </li>`;
}

function monthBounds() {
  const [y, m] = state.month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { min: `${state.month}-01`, max: `${state.month}-${String(last).padStart(2, '0')}` };
}

function startEdit(id) {
  state.editingId = id;
  renderCatPanel(gastoPorCat());
  $('gasto-list').querySelector('.edit-form [name="desc"]')?.focus();
}

function cancelEdit() {
  const id = state.editingId;
  state.editingId = null;
  renderCatPanel(gastoPorCat());
  $('gasto-list').querySelector(`.row-edit[data-edit="${CSS.escape(id)}"]`)?.focus();
}

function saveEdit(form) {
  const key = state.month;
  const old = state.gastos.find(g => g.id === form.dataset.id);
  if (!old) return cancelEdit();
  const desc = form.elements.desc.value.trim();
  const valor = parseBRL(form.elements.valor.value);
  const data = form.elements.data.value;
  if (!desc || !valor || !data) {
    showToast(!desc ? 'Informe uma descrição.' : !valor ? 'Informe um valor.' : 'Informe uma data.', 'error');
    return;
  }
  const novo = { ...old, desc, valor, data };
  state.editingId = null;
  if (novo.desc === old.desc && novo.valor === old.valor && novo.data === old.data) {
    renderCatPanel(gastoPorCat());
    return;
  }
  state.gastos = state.gastos.map(g => (g.id === old.id ? novo : g));
  renderOrcamento();
  // Gasto fixo editado no mês atual (ou futuro): os próximos meses usam os novos valores.
  // Corrigir um mês antigo não mexe no modelo.
  const t = findTemplate(old.rec);
  if (t && key >= monthKey(new Date())) {
    const atualizado = { ...templateFrom(novo, t.desde, t.id) };
    setTemplates(getTemplates().map(x => (x.id === t.id ? atualizado : x))).catch(e => console.error(e));
  }
  persist(updateGasto(user.uid, key, old, novo), () => {
    if (state.month !== key) return;
    state.gastos = state.gastos.map(g => (g.id === old.id ? old : g));
    renderOrcamento();
  });
}

/** Destaca legenda e linhas do Resumo da categoria (sem redesenhar). */
function markGastosFocus(key) {
  const mark = (el, id) => {
    el.classList.toggle('is-focus', !!key && id === key);
    el.classList.toggle('is-dim', !!key && id !== key);
  };
  document.querySelectorAll('#gastos-legend [data-focus]').forEach(b => mark(b, b.dataset.focus));
  document.querySelectorAll('#resumo-body tr[data-cat]').forEach(r => mark(r, r.dataset.cat));
}

function markMetasFocus(key) {
  document.querySelectorAll('.slider-row').forEach(row => {
    row.classList.toggle('is-focus', !!key && row.dataset.cat === key);
    row.classList.toggle('is-dim', !!key && row.dataset.cat !== key);
  });
}

function focusGastos(key) {
  state.focusGastos = key;
  if (key && key !== state.cat) {
    state.cat = key;
    state.editingId = null;
    renderCatNav();
  }
  renderOrcamento();
}

function setDefaultDate() {
  const input = $('gasto-form').elements.data;
  Object.assign(input, monthBounds());
  const today = new Date();
  input.value = monthKey(today) === state.month
    ? `${state.month}-${String(today.getDate()).padStart(2, '0')}`
    : input.min;
}

function bindOrcamento() {
  $('month-prev').innerHTML = icon('chevronLeft', 20);
  $('month-next').innerHTML = icon('chevronRight', 20);
  $('month-prev').addEventListener('click', () => loadMonth(shiftMonth(state.month, -1)));
  $('month-next').addEventListener('click', () => loadMonth(shiftMonth(state.month, 1)));

  $('renda').addEventListener('click', editRendas);
  $('btn-search').addEventListener('click', openSearchDialog);

  $('cat-nav').addEventListener('click', e => {
    const btn = e.target.closest('[data-cat]');
    if (btn) selectCat(btn.dataset.cat);
  });

  $('gastos-legend').addEventListener('click', e => {
    const btn = e.target.closest('[data-focus]');
    if (btn) focusGastos(btn.dataset.focus === state.focusGastos ? null : btn.dataset.focus);
  });

  $('btn-copy').addEventListener('click', () => {
    if (!state.gastos.length) {
      showToast('Nenhum gasto lançado neste mês para copiar.', 'error');
      return;
    }
    openCopyDialog({ userId: user.uid, fromKey: state.month, gastos: state.gastos.map(g => ({ ...g })) });
  });

  $('resumo-body').addEventListener('click', e => {
    const row = e.target.closest('[data-cat]');
    if (row) selectCat(row.dataset.cat, true);
  });

  const form = $('gasto-form');
  bindCurrencyInput(form.elements.valor);
  enhanceDateInput(form.elements.data);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const valor = parseBRL(form.elements.valor.value);
    const desc = form.elements.desc.value.trim();
    if (!desc) {
      showToast('Informe uma descrição.', 'error');
      form.elements.desc.focus();
      return;
    }
    if (!valor) {
      showToast('Informe um valor.', 'error');
      form.elements.valor.focus();
      return;
    }
    const key = state.month;
    const gasto = { id: uid(), cat: state.cat, desc, valor, data: form.elements.data.value };
    if (form.elements.pagoVa.checked && state.cat === 'custosFixos' && state.va > 0) gasto.va = true;
    if (form.elements.repetir.checked) {
      const t = templateFrom(gasto, key);
      gasto.rec = t.id;
      setTemplates([...getTemplates(), t]).catch(err => {
        console.error(err);
        showToast('Gasto salvo, mas não foi possível marcá-lo como fixo.', 'error');
      });
      form.elements.repetir.checked = false;
    }
    lastAddedId = gasto.id;
    state.gastos.push(gasto);
    form.elements.desc.value = '';
    form.elements.valor.value = '';
    form.elements.desc.focus();
    renderOrcamento();
    lastAddedId = null;
    persist(addGasto(user.uid, key, gasto), () => {
      if (state.month !== key) return;
      state.gastos = state.gastos.filter(g => g.id !== gasto.id);
      renderOrcamento();
    });
  });

  const list = $('gasto-list');
  list.addEventListener('submit', e => {
    e.preventDefault();
    saveEdit(e.target);
  });
  list.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.editingId) cancelEdit();
  });
  list.addEventListener('click', e => {
    if (e.target.closest('[data-cancel]')) return cancelEdit();
    const edit = e.target.closest('[data-edit]');
    if (edit) return startEdit(edit.dataset.edit);
    const rep = e.target.closest('[data-repeat]');
    if (rep) return toggleRepeat(rep.dataset.repeat);
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const key = state.month;
    const gasto = state.gastos.find(g => g.id === btn.dataset.del);
    if (!gasto) return;
    state.gastos = state.gastos.filter(g => g !== gasto);
    renderOrcamento();
    const restore = () => {
      if (state.month !== key) return;
      if (!state.gastos.some(g => g.id === gasto.id)) state.gastos.push(gasto);
      renderOrcamento();
    };
    persist(removeGasto(user.uid, key, gasto), restore);
    showToast(`"${gasto.desc}" excluído.`, 'success', 6000, {
      label: 'Desfazer',
      onClick: () => {
        restore();
        persist(addGasto(user.uid, key, gasto), () => {
          if (state.month !== key) return;
          state.gastos = state.gastos.filter(g => g.id !== gasto.id);
          renderOrcamento();
        });
      }
    });
  });
}

/* ---------- Minhas metas ---------- */

function renderSliders() {
  $('sliders').innerHTML = CATEGORIAS.map(c => `
    <div class="slider-row" data-cat="${c.id}" style="--c:${c.cor};--rmin:${c.faixa[0]}%;--rmax:${Math.min(c.faixa[1], 100)}%">
      <div class="slider-head">
        <label class="slider-name" for="range-${c.id}"><span class="dot"></span>${c.nome}</label>
        <span class="slider-value">
          <span class="slider-money" id="money-${c.id}"></span>
          <input class="input num" type="number" min="0" max="100" step="1" data-num="${c.id}" aria-label="${c.nome} (%)">%
        </span>
      </div>
      <input class="range" type="range" min="0" max="100" step="1" id="range-${c.id}" data-range="${c.id}"
        aria-describedby="note-${c.id}">
      <div class="range-scale">
        <span>0%</span>
        ${c.faixa.filter(v => v >= 8 && v <= 92).map(v => `<span class="range-mark" style="left:${v}%">${v}%</span>`).join('')}
        <span>100%</span>
      </div>
      <div class="slider-note" id="note-${c.id}">
        <span class="note-status" id="faixa-${c.id}"></span>
        <p class="note-why">${c.porque}</p>
        <p class="note-inclui"><span>Inclui</span>${c.inclui}</p>
      </div>
    </div>`).join('');
}

function renderMetas() {
  const soma = somaMetas();
  const over = soma > 100;

  for (const c of CATEGORIAS) {
    const v = state.metas[c.id];
    const range = document.querySelector(`[data-range="${c.id}"]`);
    const num = document.querySelector(`[data-num="${c.id}"]`);
    range.value = v;
    range.style.setProperty('--p', `${v}%`);
    if (document.activeElement !== num) num.value = v;
    $(`money-${c.id}`).textContent = state.renda ? formatBRL(devoGastar(c.id)) : '';
    const [min, max] = c.faixa;
    const fora = v > max ? 'acima' : v < min ? 'abaixo' : '';
    const faixa = $(`faixa-${c.id}`);
    faixa.innerHTML = fora
      ? `${icon('x', 12)}${fora === 'acima' ? 'Acima' : 'Abaixo'} do recomendado <b>· ${faixaLabel(c.faixa)}</b>`
      : `${icon('check', 12)}Dentro do recomendado <b>· ${faixaLabel(c.faixa)}</b>`;
    faixa.classList.toggle('is-off', !!fora);
  }

  if (state.focusMetas && !state.metas[state.focusMetas]) state.focusMetas = null;
  const focus = state.focusMetas;
  const slices = CATEGORIAS.map(c => ({
    key: c.id,
    label: `${c.nome}: ${state.metas[c.id]}%`,
    value: state.metas[c.id],
    color: over ? DANGER : c.cor,
    center: `${state.metas[c.id]}%`,
    caption: state.renda ? `${c.nome} · ${formatBRL(devoGastar(c.id))}` : c.nome
  }));
  renderDonut($('metas-chart'), slices, {
    center: `${soma}%`,
    caption: over ? 'acima de 100%' : soma < 100 ? `${100 - soma}% livre` : 'alocado',
    total: Math.max(soma, 100),
    active: focus,
    onSelect: key => {
      state.focusMetas = key;
      renderMetas();
    },
    onHover: key => markMetasFocus(key ?? state.focusMetas)
  });
  markMetasFocus(focus);
  $('metas-chart').classList.toggle('over', over);

  // Soma > 100%: sugere onde reduzir (e marca os sliders correspondentes)
  const cortes = sugerirCortes(state.metas);
  $('metas-cortes').hidden = !cortes.length;
  $('cortes-list').innerHTML = cortes.map(({ cat, de, para }) => {
    const [min, max] = cat.faixa;
    const motivo = de > max ? `acima do recomendado (${faixaLabel(cat.faixa)})`
      : para < min ? 'abaixo do mínimo recomendado: só se não houver outra saída'
      : cat.corte <= 2 ? 'gasto flexível, o mais fácil de ajustar'
      : cat.id === 'custosFixos' ? 'difícil de mudar rápido: revise aluguel, planos e assinaturas'
      : `alocação planejada, ainda ${faixaLabel(cat.faixa)} depois do ajuste`;
    return `
      <li>
        <span class="dot" style="--c:${cat.cor}"></span>
        <span class="cortes-name">${cat.nome}</span>
        <span class="cortes-val num">${de}% → ${para}%</span>
        <span class="cortes-why">${motivo}</span>
      </li>`;
  }).join('');
  const sugeridos = new Map(cortes.map(c => [c.cat.id, c.para]));
  document.querySelectorAll('.slider-row').forEach(row => {
    const alvo = sugeridos.get(row.dataset.cat);
    row.classList.toggle('is-suggested', alvo !== undefined);
    row.querySelector('.slider-suggest')?.remove();
    if (alvo !== undefined) {
      row.querySelector('.slider-name').insertAdjacentHTML('beforeend',
        `<span class="slider-suggest">sugestão: ${alvo}%</span>`);
    }
  });

  const status = $('metas-status');
  status.className = `metas-status ${over ? 'text-danger' : soma === 100 ? 'text-ok' : 'text-muted'}`;
  status.textContent = over
    ? `Você passou ${soma - 100}% do total. Veja abaixo onde reduzir.`
    : soma === 100 ? 'Renda 100% distribuída.' : `Ainda faltam ${100 - soma}% para distribuir.`;
}

function setMeta(catId, value) {
  state.metas[catId] = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  renderMetas();
  renderOrcamento();
  persistMetas({ ...state.metas });
}

function bindMetas() {
  renderSliders();
  $('sliders').addEventListener('input', e => {
    const id = e.target.dataset.range || e.target.dataset.num;
    if (id) setMeta(id, e.target.value);
  });
  $('sliders').addEventListener('focusout', e => {
    if (e.target.dataset.num) e.target.value = state.metas[e.target.dataset.num];
  });
  $('btn-cortes').addEventListener('click', () => {
    const cortes = sugerirCortes(state.metas);
    if (!cortes.length) return;
    const antes = { ...state.metas };
    cortes.forEach(({ cat, para }) => { state.metas[cat.id] = para; });
    renderMetas();
    renderOrcamento();
    persistMetas({ ...state.metas });
    showToast('Metas ajustadas para 100%.', 'success', 6000, {
      label: 'Desfazer',
      onClick: () => {
        state.metas = antes;
        renderMetas();
        renderOrcamento();
        persistMetas({ ...state.metas });
      }
    });
  });

  $('btn-reset-metas').addEventListener('click', () => {
    state.metas = defaultMetas();
    renderMetas();
    renderOrcamento();
    persistMetas({ ...state.metas });
    showToast('Metas restauradas.');
  });
}

/* ---------- Abas (via hash) ----------
   URLs em inglês (#monthly, #targets, #overview); os hashes antigos
   em português continuam abrindo a aba certa (links salvos). */
const TAB_HASH = {
  '#monthly': 'orcamento', '#targets': 'metas', '#overview': 'visao',
  '#orcamento': 'orcamento', '#metas': 'metas', '#visao': 'visao'
};

function showTab(e) {
  const tab = TAB_HASH[location.hash] || 'orcamento';
  // '' -> '#monthly' é a mesma aba: não rola para o topo (ex.: abrir resultado da busca)
  if (e && tab === currentTab) return;
  currentTab = tab;
  updateTitle();
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== `view-${tab}`; });
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.tab === tab;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  moveTabIndicator();
  window.scrollTo(0, 0);
  if (tab === 'visao' && monthLoaded) showVisao();
}

let currentTab = 'orcamento';

/** Título da guia: aba atual (e mês, no orçamento). */
function updateTitle() {
  const nome = { orcamento: `Orçamento · ${monthLabel(state.month)}`, metas: 'Minhas metas', visao: 'Visão geral' }[currentTab];
  document.title = `${nome} · DataLife`;
}

function moveTabIndicator() {
  const active = document.querySelector('.tab.active');
  if (!active) return;
  $('tab-indicator').style.transform = `translateX(${active.offsetLeft}px) scaleX(${active.offsetWidth})`;
  // Só anima a partir da segunda troca (sem deslizar no carregamento)
  requestAnimationFrame(() => $('tab-indicator').classList.add('ready'));
}

/* ---------- Init ---------- */

initPagina();

bindOrcamento();
bindMetas();
initCopyDialog();
initRendasDialog();
initRecorrentes({
  userId: user.uid,
  getMonth: () => state.month,
  getGastos: () => state.gastos,
  onLaunch: launchRecorrentes
});
initSearchDialog({
  userId: user.uid,
  getLive: () => ({ key: state.month, renda: state.renda, va: state.va, gastos: state.gastos }),
  onOpen: async (key, cat) => {
    if (currentTab !== 'orcamento') location.hash = '#monthly';
    if (key !== state.month) await loadMonth(key);
    selectCat(cat, true);
  }
});

// Modo privacidade: mascara valores em R$ em todas as abas
bindPrivacyToggle($('btn-privacy'));
window.addEventListener('datalife:privacy', () => {
  renderOrcamento();
  renderMetas();
  refreshVisao();
  refreshSearch();
});
initVisao({
  userId: user.uid,
  getLive: () => ({ key: state.month, renda: state.renda, va: state.va, gastos: state.gastos }),
  getMetas: () => state.metas,
  onOpenMonth: key => {
    location.hash = '#monthly';
    if (key !== state.month) loadMonth(key);
  }
});
renderCatNav();
window.addEventListener('hashchange', showTab);
window.addEventListener('resize', moveTabIndicator);
document.fonts?.ready.then(moveTabIndicator); // larguras mudam quando as fontes carregam
showTab();

// Não perder a última edição se a aba for fechada durante o debounce
const flushAll = () => persistMetas.flush();
window.addEventListener('pagehide', flushAll);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAll();
});

try {
  // O mês é pedido junto com as metas e os gastos fixos (uma ida ao servidor, não duas)
  const mes = fetchMonth(user.uid, state.month);
  mes.catch(() => {}); // o erro é tratado em loadMonth; aqui só evita "unhandled rejection"
  setMonthBusy(true);
  [state.metas] = await Promise.all([fetchMetas(user.uid), loadRecorrentes(user.uid)]);
  await loadMonth(state.month, mes);
  monthLoaded = true;
  dadosProntos();
  if (TAB_HASH[location.hash] === 'visao') showVisao();
} catch (e) {
  showLoadError(e);
}
