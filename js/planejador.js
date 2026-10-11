/* ============================================
   DataLife — Planejador
   ============================================
   Referências de apps de contagem regressiva (Countdowns, Days To):
   o número de dias em destaque, lembretes em vários marcos e datas
   anuais (aniversários). Próprio do DataLife: a trilha dos 6 avisos
   (30 · 15 · 7 · 3 · 1 · hoje) em cada data, e os avisos aparecem na
   faixa global de todas as páginas.
   ============================================ */

import { requireAuth } from './auth.js';
import { initPagina, persist, dadosProntos } from './pagina.js';
import { avisarMudanca } from './alertas.js';
import {
  fetchEventos, saveEvento, deleteEvento, proximaOcorrencia, diasAte, quando, marcoDe, MARCOS, TIPOS, LIMITES
} from './planejador-db.js';
import { enhanceSelect } from './selectpicker.js';
import { enhanceDateInput } from './datepicker.js';
import { icon, escapeHtml, showToast, uid, dayKey, fromDayKey, monthKey, shiftMonth, MESES } from './utils.js';

const $ = id => document.getElementById(id);
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MARCO_NOME = { 30: '1 mês', 15: '15 dias', 7: '1 semana', 3: '3 dias', 1: '1 dia', 0: 'hoje' };

const user = await requireAuth();

const state = {
  hoje: dayKey(new Date()),
  mes: monthKey(new Date()),
  eventos: [],
  editando: null,
  tipo: 'compromisso'
};

const dataCurta = k => { const d = fromDayKey(k); return `${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}${d.getFullYear() !== new Date().getFullYear() ? ` de ${d.getFullYear()}` : ''}`; };

/* ---------- Calendário ---------- */

/** Eventos que caem num dia (os anuais caem todo ano na mesma data). */
function doDia(k) {
  const md = k.slice(5);
  return state.eventos
    .filter(e => (e.anual ? e.data.slice(5) === md || (md === '02-28' && e.data.slice(5) === '02-29' && !isBissexto(Number(k.slice(0, 4)))) : e.data === k))
    .sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
}
const isBissexto = y => new Date(y, 1, 29).getDate() === 29;

function renderCal() {
  const [y, m] = state.mes.split('-').map(Number);
  $('cal-title').innerHTML = `${MESES[m - 1]} <span>${y}</span>`;
  const first = new Date(y, m - 1, 1);
  const cells = Array.from({ length: 42 }, (_, i) => dayKey(new Date(y, m - 1, 1 - first.getDay() + i)));
  $('cal-grid').innerHTML = cells.map(k => {
    const d = fromDayKey(k);
    const evs = doDia(k);
    const cls = [d.getMonth() !== m - 1 && 'is-outside', k === state.hoje && 'is-hoje', k < state.hoje && 'is-past'].filter(Boolean).join(' ');
    return `
      <div class="cal-cell ${cls}" data-dia="${k}">
        <button type="button" class="cal-num num" data-novo-dia="${k}" aria-label="Nova data em ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}">${d.getDate()}</button>
        <ul class="cal-evs">
          ${evs.slice(0, 3).map(e => `<li><button type="button" class="cal-ev tipo-${e.tipo}" data-id="${escapeHtml(e.id)}" title="${escapeHtml(e.titulo)}">${e.hora ? `<span class="num">${e.hora}</span>` : ''}<span class="cal-ev-t">${escapeHtml(e.titulo)}</span></button></li>`).join('')}
          ${evs.length > 3 ? `<li class="cal-mais">+${evs.length - 3}</li>` : ''}
        </ul>
      </div>`;
  }).join('');
}

/* ---------- Próximas (contagem regressiva) ---------- */

function cartao(e, passada = false) {
  const ocorre = passada ? e.data : proximaOcorrencia(e, state.hoje);
  const dias = diasAte(state.hoje, ocorre);
  const marco = marcoDe(dias);
  const numero = dias === 0 ? '<strong class="cd-num cd-txt">Hoje</strong>'
    : dias === 1 ? '<strong class="cd-num cd-txt">Amanhã</strong>'
    : passada ? `<strong class="cd-num cd-txt">${quando(dias)}</strong>`
    : `<strong class="cd-num">${dias}</strong><span class="cd-un">dias</span>`;
  const trilha = passada ? '' : `
    <ol class="trilha" aria-label="Avisos: ${MARCOS.map(mm => MARCO_NOME[mm]).join(', ')}">
      ${MARCOS.map(mm => `<li class="${dias <= mm ? 'is-on' : ''} ${marco === mm ? 'is-atual' : ''}" title="${MARCO_NOME[mm]}"><i></i><span>${mm === 0 ? 'hoje' : mm}</span></li>`).join('')}
    </ol>`;
  return `
    <li>
      <button type="button" class="cd ${dias <= 1 && !passada ? 'is-perto' : ''} ${passada ? 'is-passada' : ''}" data-id="${escapeHtml(e.id)}">
        <span class="cd-left">${numero}</span>
        <span class="cd-info">
          <span class="cd-titulo">${icon(TIPOS[e.tipo].icon, 14)}<strong>${escapeHtml(e.titulo)}</strong></span>
          <span class="cd-data">${dataCurta(ocorre)}${e.hora ? ` · ${e.hora}` : ''}${e.anual ? ' · todo ano' : ''}</span>
          ${trilha}
        </span>
      </button>
    </li>`;
}

function renderProx() {
  const futuras = state.eventos
    .filter(e => e.anual || e.data >= state.hoje)
    .map(e => ({ e, k: proximaOcorrencia(e, state.hoje) + (e.hora || '99') }))
    .sort((a, b) => a.k.localeCompare(b.k))
    .map(x => x.e);
  const passadas = state.eventos.filter(e => !e.anual && e.data < state.hoje).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);
  $('prox-count').textContent = futuras.length ? `${futuras.length} ${futuras.length === 1 ? 'data' : 'datas'}` : '';
  $('prox-list').innerHTML = futuras.length
    ? futuras.map(e => cartao(e)).join('')
    : `<li class="prox-vazio">
        <p>Nenhuma data por vir.</p>
        <p class="text-muted">Clique num dia do calendário ou em <strong>Nova data</strong>: consulta, aniversário, prazo de imposto, viagem.</p>
      </li>`;
  $('passadas').hidden = !passadas.length;
  $('passadas-count').textContent = passadas.length;
  $('passadas-list').innerHTML = passadas.map(e => cartao(e, true)).join('');
}

function render() {
  renderCal();
  renderProx();
}

/* ---------- Dialog ---------- */

/** "Dia inteiro": sem o campo de minutos, a hora ocupa a largura toda. */
function diaInteiro() {
  const f = $('ev-form');
  f.querySelector('.hora-pick').classList.toggle('is-dia', !f.h.value);
}

function abrir(ev, dia) {
  state.editando = ev;
  const f = $('ev-form');
  f.reset();
  $('ev-title').textContent = ev ? 'Editar data' : 'Nova data';
  $('ev-excluir').hidden = !ev;
  f.titulo.value = ev?.titulo || '';
  f.data.value = ev?.data || dia || state.hoje;
  const [h, m] = (ev?.hora || '').split(':');
  f.h.value = h ?? '';
  f.m.value = m ?? '00';
  f.m.disabled = !h;
  diaInteiro();
  f.anual.checked = ev?.anual || false;
  f.nota.value = ev?.nota || '';
  state.tipo = ev?.tipo || 'compromisso';
  renderTipos();
  $('ev-dialog').showModal();
  if (!ev) f.titulo.focus();
}

function renderTipos() {
  $('tipo-pick').innerHTML = Object.entries(TIPOS).map(([k, t]) => `
    <button type="button" role="radio" class="tipo-chip" data-tipo="${k}" aria-checked="${state.tipo === k}">${icon(t.icon, 14)}${t.nome}</button>`).join('');
}

function salvar(ev, prev) {
  const i = state.eventos.findIndex(e => e.id === ev.id);
  state.eventos = i >= 0 ? state.eventos.map(e => (e.id === ev.id ? ev : e)) : [...state.eventos, ev];
  render();
  avisarMudanca();
  return persist(saveEvento(user.uid, ev), () => {
    state.eventos = prev ? state.eventos.map(e => (e.id === ev.id ? prev : e)) : state.eventos.filter(e => e.id !== ev.id);
    render();
  });
}

function bind() {
  $('btn-nova').innerHTML = `${icon('plus', 16)} Nova data`;
  $('cal-prev').innerHTML = icon('chevronLeft', 16);
  $('cal-next').innerHTML = icon('chevronRight', 16);
  const f = $('ev-form');
  f.h.innerHTML = '<option value="">Dia inteiro</option>' + Array.from({ length: 24 }, (_, i) => `<option value="${String(i).padStart(2, '0')}">${String(i).padStart(2, '0')}h</option>`).join('');
  f.m.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${String(i * 5).padStart(2, '0')}">:${String(i * 5).padStart(2, '0')}</option>`).join('');
  enhanceSelect(f.h);
  enhanceSelect(f.m);
  enhanceDateInput(f.data);
  f.h.addEventListener('change', () => { f.m.disabled = !f.h.value; diaInteiro(); });

  const dlg = $('ev-dialog');
  dlg.querySelector('.dialog-head [data-close]').innerHTML = icon('x', 18);
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));

  $('btn-nova').addEventListener('click', () => abrir(null));
  $('cal-prev').addEventListener('click', () => { state.mes = shiftMonth(state.mes, -1); renderCal(); });
  $('cal-next').addEventListener('click', () => { state.mes = shiftMonth(state.mes, 1); renderCal(); });
  $('cal-hoje').addEventListener('click', () => { state.mes = monthKey(new Date()); renderCal(); });
  $('tipo-pick').addEventListener('click', e => {
    const b = e.target.closest('[data-tipo]');
    if (!b) return;
    state.tipo = b.dataset.tipo;
    renderTipos();
    $('tipo-pick').querySelector(`[data-tipo="${state.tipo}"]`).focus();
  });

  document.querySelector('.plan-grid').addEventListener('click', e => {
    const ev = e.target.closest('[data-id]');
    if (ev) return abrir(state.eventos.find(x => x.id === ev.dataset.id));
    const dia = e.target.closest('[data-novo-dia]');
    if (dia) return abrir(null, dia.dataset.novoDia);
  });

  f.addEventListener('submit', e => {
    e.preventDefault();
    const titulo = f.titulo.value.trim();
    if (!titulo) return f.titulo.reportValidity();
    const prev = state.editando;
    const ev = {
      id: prev?.id || uid(),
      titulo: titulo.slice(0, LIMITES.titulo),
      data: f.data.value,
      hora: f.h.value ? `${f.h.value}:${f.m.value}` : '',
      tipo: state.tipo,
      anual: f.anual.checked,
      nota: f.nota.value.trim(),
      criado: prev?.criado || Date.now()
    };
    dlg.close();
    const dias = diasAte(state.hoje, proximaOcorrencia(ev, state.hoje));
    salvar(ev, prev).then(ok => ok && showToast(dias >= 0 && dias <= 30
      ? `${ev.titulo}: ${quando(dias, ev.hora)}. O aviso já aparece no topo.`
      : `${ev.titulo} salvo. Avisos a partir de 1 mês antes.`));
  });

  $('ev-excluir').addEventListener('click', () => {
    const ev = state.editando;
    dlg.close();
    state.eventos = state.eventos.filter(e => e.id !== ev.id);
    render();
    avisarMudanca();
    persist(deleteEvento(user.uid, ev.id), () => { state.eventos.push(ev); render(); });
    showToast(`${ev.titulo} excluído.`, 'success', 8000, { label: 'Desfazer', onClick: () => salvar(ev, null) });
  });

  // Virou o dia com a página aberta
  setInterval(() => {
    const t = dayKey(new Date());
    if (t !== state.hoje) { state.hoje = t; render(); }
  }, 60_000);
}

/* ---------- Init ---------- */

initPagina();
bind();
try {
  state.eventos = await fetchEventos(user.uid);
} catch (e) {
  console.error(e);
  showToast('Não foi possível carregar as datas. Verifique a conexão.', 'error', 6000);
}
render();
dadosProntos(); // um documento por item: sem risco de sobrescrever

// Letreiros dependem da largura das células
