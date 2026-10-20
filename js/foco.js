/* ============================================
   DataLife — Foco
   ============================================
   Um dia por vez: tarefas, notas, pomodoro, saúde e calendário.
   Cada parte é um módulo (foco-*.js); este arquivo guarda o dia aberto,
   faz as gravações (otimistas, com desfazer em caso de erro) e cuida do
   calendário, dos ajustes, dos atalhos e do Lo-Fi.
   ============================================ */

import { requireAuth } from './auth.js';
import { initPagina, persist, dadosProntos } from './pagina.js';
import { fetchDia, fetchDias, saveCampo, addPomodoro, fetchConfig, saveConfig, diaVazio, limparFixas, LIMITES, POMODORO_PADRAO } from './foco-db.js';
import { fetchLendo } from './livros-db.js';
import { fetchContas, fetchPagas, setPaga, situacao, novoPagamento } from './pagamentos-db.js';
import { addGasto, removeGasto, fetchMonth } from './db.js';
import { avisarMudanca } from './alertas.js';
import { initTarefas, render as renderTarefas, reset as resetTarefas, focusInput } from './foco-tarefas.js';
import { initNotas, render as renderNotas, flush as flushNotas, focus as focusNotas, pendentes as notasPendentes } from './foco-notas.js';
import { initPomodoro, render as renderPomodoro, alternar as alternarPomodoro, seguirTarefa } from './foco-pomodoro.js';
import { initSaude, render as renderSaude, planoAgua, formatMl } from './foco-saude.js';
import { initQuadro, render as renderQuadro } from './foco-quadro.js';
import { initHistorico, render as renderHistorico } from './foco-historico.js';
import { icon, showToast, dayKey, fromDayKey, shiftDay, monthKey, shiftMonth, MESES, escapeHtml, uid } from './utils.js';

const $ = id => document.getElementById(id);
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const user = await requireAuth();

const state = {
  today: dayKey(new Date()),
  day: dayKey(new Date()),
  dia: diaVazio(),
  config: null,
  calMonth: monthKey(new Date()),
  resumo: new Map()   // dia -> dados do dia, para os indicadores do calendário
};

/* ---------- Gravação ---------- */


/** Atualiza um campo do dia aberto na tela e no banco. */
function saveDia(campo, valor, prev) {
  const day = state.day;
  if (campo === 'tarefas') { seguirFazendo(prev, valor); seguirContas(day, prev, valor); }
  setCampo(day, campo, valor);
  persist(saveCampo(user.uid, day, campo, valor), () => setCampo(day, campo, prev));
}

function setCampo(day, campo, valor) {
  writes++;
  const cached = state.resumo.get(day) || (day === state.day ? state.dia : diaVazio());
  const dia = { ...cached, [campo]: valor };
  state.resumo.set(day, dia);
  if (day === state.day) {
    state.dia = dia;
    if (campo === 'tarefas') renderTarefas();
    if (['agua', 'refeicoes', 'exercicio'].includes(campo)) renderSaude();
  }
  if (campo === 'tarefas' || campo === 'notas') renderQuadro();
  renderCal();
  renderHistorico();
}

/** Tarefas de qualquer dia (o Quadro em "Semana" mexe em vários). */
function salvarTarefas(day, next, prev) {
  seguirFazendo(prev, next);
  seguirContas(day, prev, next);
  setCampo(day, 'tarefas', next);
  persist(saveCampo(user.uid, day, 'tarefas', next), () => setCampo(day, 'tarefas', prev));
}

/** "Estou fazendo" liga o pomodoro; parar a tarefa (sem concluir) pausa. */
function seguirFazendo(prev, next) {
  const antes = new Set(prev.filter(t => t.fazendo).map(t => t.id));
  const agora = next.filter(t => t.fazendo);
  if (agora.some(t => !antes.has(t.id))) return seguirTarefa(true);
  const parou = [...antes].some(id => { const t = next.find(x => x.id === id); return t && !t.fazendo && !t.feita; });
  if (parou && !agora.length) seguirTarefa(false);
}

/* ---------- Contas do Pagamentos ---------- */

/* No dia do vencimento, cada conta ainda não paga vira a tarefa "Pagar <conta>"
   (origem 'conta:<id>'). Concluir a tarefa registra o pagamento como o "Paguei"
   do Pagamentos (inclusive o lançamento no Orçamento); desmarcar desfaz. */

/** Contas que vencem em `key` e ainda não foram pagas. */
async function contasDoDia(key) {
  const mes = key.slice(0, 7);
  const [contas, pagas] = await Promise.all([fetchContas(user.uid), fetchPagas(user.uid, mes)]);
  return { contas, pagas, devidas: contas.filter(c => { const s = situacao(c, mes, pagas, key); return s.status !== 'paga' && s.vence === key; }) };
}

const contaDe = t => (t.origem?.startsWith('conta:') ? t.origem.slice(6) : null);

function seguirContas(day, prev, next) {
  const antes = new Map(prev.map(t => [t.id, t.feita]));
  for (const t of next) {
    const id = contaDe(t);
    if (id && antes.has(t.id) && antes.get(t.id) !== t.feita) {
      const mes = day.slice(0, 7), feita = t.feita;
      filaContas = filaContas.then(() => marcarConta(mes, id, feita));
    }
  }
}

// Em fila: marcar e desmarcar rápido não leem o Pagamentos antes da gravação anterior
// (setPaga entra no cache local na hora; esperar o servidor travaria a fila offline)
let filaContas = Promise.resolve();

async function marcarConta(mes, contaId, paga) {
  try {
    const [contas, pagas] = await Promise.all([fetchContas(user.uid), fetchPagas(user.uid, mes)]);
    const conta = contas.find(c => c.id === contaId);
    if (!conta) return;
    if (paga) {
      if (pagas[contaId]) return; // já paga (outro aparelho, ou no Pagamentos)
      const { pagamento, gasto } = novoPagamento(conta, state.today, uid());
      persist(setPaga(user.uid, mes, contaId, pagamento), null, `Não foi possível marcar ${conta.nome} como paga.`);
      if (gasto) persist(addGasto(user.uid, gasto.data.slice(0, 7), gasto), null, 'Paga, mas não foi possível lançar no Orçamento.');
      showToast(`${conta.nome}: paga${gasto ? ' e lançada no Orçamento' : ''}.`, 'success');
    } else {
      const pagamento = pagas[contaId];
      if (!pagamento) return;
      persist(setPaga(user.uid, mes, contaId, null), null, `Não foi possível desfazer o pagamento de ${conta.nome}.`);
      if (pagamento.gasto) {
        const g = (await fetchMonth(user.uid, pagamento.em.slice(0, 7))).gastos.find(x => x.id === pagamento.gasto);
        if (g) persist(removeGasto(user.uid, g.data.slice(0, 7), g), null, 'Não foi possível tirar o lançamento do Orçamento.');
      }
      showToast(`${conta.nome}: pagamento desfeito.`);
    }
    avisarMudanca();
  } catch (e) {
    console.error(e);
    showToast('Não foi possível atualizar o Pagamentos. Verifique a conexão.', 'error');
  }
}

/* ---------- Tarefas automáticas (fixas, livro em leitura e contas) ---------- */

let lendoP = null;
const lendo = () => (lendoP ||= fetchLendo(user.uid).catch(e => { console.error(e); lendoP = null; return []; }));
const PAGINAS_DIA = 15;

/**
 * Cria no dia (hoje ou adiante) as tarefas fixas daquele dia da semana e, hoje,
 * a leitura de cada livro em "Lendo". `geradas` guarda o que já entrou: apagar
 * uma delas não a faz voltar.
 */
async function gerarAutomaticas(key) {
  if (key < state.today) return;
  const semana = fromDayKey(key).getDay();
  const fixas = (state.config?.fixas || []).filter(f => f.dias.includes(semana))
    .map(f => ({ origem: `fixa:${f.id}`, texto: f.texto }));
  const livros = key === state.today
    ? (await lendo()).map(l => ({ origem: `livro:${l.id}`, texto: `Ler, no mínimo, ${PAGINAS_DIA} páginas de "${l.titulo}"` }))
    : [];
  const contas = key === state.today
    ? await contasDoDia(key).catch(e => { console.error(e); return null; })
    : null;
  const pagar = (contas?.devidas || []).map(c => ({ origem: `conta:${c.id}`, texto: `Pagar ${c.nome}` }));
  if (state.day !== key) return;
  if (contas) sincronizarPagas(key, contas.pagas);
  const dia = state.dia;
  const ja = new Set([...dia.geradas, ...dia.tarefas.map(t => t.origem).filter(Boolean)]);
  const novas = [...fixas, ...livros, ...pagar].filter(x => !ja.has(x.origem));
  if (!novas.length) return;
  const agora = Date.now();
  const tarefas = [...dia.tarefas, ...novas.map((x, i) => ({ id: uid(), texto: x.texto.slice(0, LIMITES.texto), feita: false, criada: agora + i, origem: x.origem }))]
    .slice(0, LIMITES.tarefas);
  const geradas = [...dia.geradas, ...novas.map(x => x.origem)];
  const prevT = dia.tarefas, prevG = dia.geradas;
  setCampo(key, 'tarefas', tarefas);
  setCampo(key, 'geradas', geradas);
  persist(Promise.all([saveCampo(user.uid, key, 'tarefas', tarefas), saveCampo(user.uid, key, 'geradas', geradas)]), () => {
    setCampo(key, 'tarefas', prevT);
    setCampo(key, 'geradas', prevG);
  });
}

/** Conta paga por fora (no Pagamentos, em outro aparelho): a tarefa dela aparece concluída. */
function sincronizarPagas(key, pagas) {
  const prev = state.dia.tarefas;
  if (!prev.some(t => !t.feita && pagas[contaDe(t)])) return;
  const next = prev.map(t => {
    if (t.feita || !pagas[contaDe(t)]) return t;
    const { fazendo, ...rest } = t;
    return { ...rest, feita: true, concluida: Date.now() };
  });
  setCampo(key, 'tarefas', next); // sem seguirContas: o pagamento já existe
  persist(saveCampo(user.uid, key, 'tarefas', next), () => setCampo(key, 'tarefas', prev));
}

/* ---------- Passar para o dia seguinte ---------- */

/** Mover ou copiar uma tarefa de um dia para outro (padrão: do dia aberto para o seguinte). */
async function passarTarefa(id, modo, de = state.day, para = shiftDay(de, 1)) {
  const t = ((de === state.day ? state.dia : state.resumo.get(de))?.tarefas ?? []).find(x => x.id === id);
  if (!t) return;
  let alvo = state.resumo.get(para);
  if (!alvo) {
    try {
      alvo = await fetchDia(user.uid, para);
      state.resumo.set(para, alvo);
    } catch (e) {
      console.error(e);
      return showToast('Não foi possível abrir o dia seguinte. Verifique a conexão.', 'error');
    }
  }
  if (alvo.tarefas.length >= LIMITES.tarefas) return showToast(`O dia seguinte já tem ${LIMITES.tarefas} tarefas.`, 'error');
  const copia = { id: uid(), texto: t.texto, feita: false, criada: Date.now() };
  const prevAlvo = alvo.tarefas;
  salvarTarefas(para, [...prevAlvo, copia], prevAlvo);
  const prevDe = state.resumo.get(de)?.tarefas ?? state.dia.tarefas;
  const pos = prevDe.findIndex(x => x.id === id);
  if (modo === 'mover') salvarTarefas(de, prevDe.filter(x => x.id !== id), prevDe);
  const quando = para === state.today ? 'hoje' : de === state.today ? 'amanhã' : 'o dia seguinte';
  showToast(modo === 'mover' ? `"${t.texto}" foi para ${quando}.` : `"${t.texto}" copiada para ${quando}.`, 'success', 6000, {
    label: 'Desfazer',
    onClick: () => {
      const a = (para === state.day ? state.dia : state.resumo.get(para))?.tarefas ?? [];
      salvarTarefas(para, a.filter(x => x.id !== copia.id), a);
      if (modo === 'mover') {
        const d = (de === state.day ? state.dia : state.resumo.get(de))?.tarefas ?? [];
        if (!d.some(x => x.id === t.id)) salvarTarefas(de, [...d.slice(0, pos), t, ...d.slice(pos)], d);
      }
    }
  });
}

/* ---------- Tarefas fixas (diálogo) ---------- */

const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIAS_NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function renderFixas() {
  const fixas = state.config?.fixas || [];
  $('fixas-list').innerHTML = fixas.length ? fixas.map(f => `
    <li class="fixa" data-id="${escapeHtml(f.id)}">
      <span class="fixa-texto">${escapeHtml(f.texto)}</span>
      <div class="fixa-dias" role="group" aria-label="Dias de ${escapeHtml(f.texto)}">
        ${DIAS_CURTOS.map((d, i) => `<button type="button" class="fixa-dia" data-dia="${i}" aria-pressed="${f.dias.includes(i)}" aria-label="${DIAS_NOMES[i]}">${d}</button>`).join('')}
      </div>
      <button class="icon-btn danger" type="button" data-remove aria-label="Apagar tarefa fixa">${icon('trash', 15)}</button>
    </li>`).join('') : '<li class="fixas-vazio">Nenhuma ainda. Ex.: "Tomar o remédio" todos os dias, "Academia" de segunda a sexta.</li>';
}

function salvarFixas(fixas) {
  const prev = state.config;
  state.config = { ...state.config, fixas: limparFixas(fixas) };
  renderFixas();
  persist(saveConfig(user.uid, state.config), () => { state.config = prev; renderFixas(); })
    .then(ok => ok && gerarAutomaticas(state.day));
}

function initFixas() {
  $('btn-fixas').innerHTML = `${icon('repeat', 16)}<span class="sr-only">Tarefas fixas</span>`;
  $('btn-fixas').setAttribute('aria-label', 'Tarefas fixas');
  const dlg = $('fixas-dialog');
  dlg.querySelector('[data-close]').innerHTML = icon('x', 18);
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  $('btn-fixas').addEventListener('click', () => { renderFixas(); dlg.showModal(); });
  $('fixa-form').addEventListener('submit', e => {
    e.preventDefault();
    const texto = e.target.texto.value.trim();
    if (!texto) return;
    if ((state.config?.fixas || []).length >= LIMITES.fixas) return showToast(`Até ${LIMITES.fixas} tarefas fixas.`, 'error');
    salvarFixas([...(state.config?.fixas || []), { id: uid(), texto, dias: [0, 1, 2, 3, 4, 5, 6] }]);
    e.target.reset();
  });
  $('fixas-list').addEventListener('click', e => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const fixas = state.config.fixas;
    const f = fixas.find(x => x.id === li.dataset.id);
    if (e.target.closest('[data-remove]')) {
      salvarFixas(fixas.filter(x => x !== f));
      showToast(`"${f.texto}" deixou de ser fixa.`, 'success', 6000, { label: 'Desfazer', onClick: () => salvarFixas([...state.config.fixas, f]) });
    }
    const b = e.target.closest('[data-dia]');
    if (b) {
      const d = Number(b.dataset.dia);
      const dias = f.dias.includes(d) ? f.dias.filter(x => x !== d) : [...f.dias, d];
      if (!dias.length) return showToast('Escolha pelo menos um dia.', 'error');
      salvarFixas(fixas.map(x => (x === f ? { ...x, dias } : x)));
    }
  });
}

/* ---------- Dia ---------- */

let loadSeq = 0;
let writes = 0; // escritas feitas na tela; uma leitura iniciada antes delas já está velha

async function loadDay(key, { animate = true } = {}) {
  flushNotas(); // grava as notas do dia que está saindo
  const seq = ++loadSeq;
  const w = writes;
  state.day = key;
  resetTarefas();
  renderDayLabel();
  if (monthKey(fromDayKey(key)) !== state.calMonth) setCalMonth(monthKey(fromDayKey(key)));
  else renderCal();

  // Com o dia em cache (o calendário já leu o mês), mostra na hora e confere depois.
  // Sem cache, a tela do dia anterior fica inerte até chegar a leitura:
  // nada do que estiver nela pode ser gravado no dia novo.
  const cached = state.resumo.get(key);
  const grid = $('foco-grid');
  if (cached) {
    state.dia = cached;
    renderDay(animate);
  } else {
    state.dia = diaVazio();
    grid.inert = true;
  }
  $('view-foco').setAttribute('aria-busy', 'true');
  try {
    const dia = await fetchDia(user.uid, key);
    if (seq !== loadSeq) return;
    if (cached && writes !== w) return; // a tela já tem mudanças mais novas que esta leitura
    state.resumo.set(key, dia);
    state.dia = dia;
    if (!cached) renderDay(animate);
    else if (JSON.stringify(dia) !== JSON.stringify(cached)) renderDay(false, { keepNotes: notasPendentes() });
    renderCal();
    gerarAutomaticas(key);
  } catch (e) {
    if (seq !== loadSeq) return;
    console.error(e);
    if (!cached) renderDay(false);
    showToast('Não foi possível carregar este dia. Verifique a conexão.', 'error', 5000);
  } finally {
    if (seq === loadSeq) {
      grid.inert = false;
      $('view-foco').removeAttribute('aria-busy');
    }
  }
}

function renderDay(animate, { keepNotes = false } = {}) {
  renderQuadro();
  renderTarefas();
  if (!keepNotes) renderNotas();
  renderSaude();
  renderPomodoro();
  if (animate) {
    const grid = $('foco-grid');
    grid.classList.remove('is-switching');
    void grid.offsetWidth; // reinicia a animação
    grid.classList.add('is-switching');
  }
}

function renderDayLabel() {
  const d = fromDayKey(state.day);
  const isToday = state.day === state.today;
  const ontem = state.day === shiftDay(state.today, -1);
  const amanha = state.day === shiftDay(state.today, 1);
  $('day-label').textContent = `${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}${d.getFullYear() !== new Date().getFullYear() ? ` de ${d.getFullYear()}` : ''}`;
  $('day-weekday').textContent = isToday ? `Hoje, ${SEMANA[d.getDay()]}` : ontem ? `Ontem, ${SEMANA[d.getDay()]}` : amanha ? `Amanhã, ${SEMANA[d.getDay()]}` : SEMANA[d.getDay()];
  $('btn-hoje').hidden = isToday;
  document.title = `${isToday ? 'Foco' : `Foco · ${$('day-label').textContent}`} · DataLife`;
}

/* ---------- Calendário ---------- */

let calSeq = 0;

const mesesLidos = new Set(); // meses do calendário já lidos nesta visita

/** Lê de uma vez os dias de um mês (grade do calendário) para o cache. */
async function carregarMes(month) {
  if (mesesLidos.has(month)) return;
  const cells = calCells(month);
  const dias = await fetchDias(user.uid, cells[0], cells[cells.length - 1]);
  mesesLidos.add(month);
  // Dias sem documento no intervalo lido estão vazios: abrir um deles não precisa esperar
  for (const k of cells) if (k !== state.day && !state.resumo.has(k)) state.resumo.set(k, dias.get(k) || diaVazio());
  for (const [k, d] of dias) if (k !== state.day) state.resumo.set(k, d);
}

async function setCalMonth(month) {
  state.calMonth = month;
  renderCal();
  if (mesesLidos.has(month)) return;
  const seq = ++calSeq;
  try {
    await carregarMes(month);
    if (seq !== calSeq) return;
    renderCal();
    renderQuadro(); // a "Semana" do Quadro usa este mesmo cache
    renderHistorico();
  } catch (e) {
    console.error(e); // indicadores são extras: sem eles o calendário segue funcionando
  }
}

/** 42 dias (6 semanas) começando no domingo antes do dia 1. */
function calCells(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  return Array.from({ length: 42 }, (_, i) => dayKey(new Date(y, m - 1, 1 - first.getDay() + i)));
}

function marks(dia) {
  if (!dia) return '';
  const out = [];
  if (dia.tarefas.length) out.push(dia.tarefas.some(t => !t.feita) ? 'pend' : 'done');
  if (dia.notas.some(n => n.texto.trim())) out.push('note');
  return out.map(m => `<i class="mark mark-${m}"></i>`).join('');
}

function renderCal() {
  const [y, m] = state.calMonth.split('-').map(Number);
  $('cal-title').innerHTML = `${MESES[m - 1]} <span>${y}</span>`;
  $('cal-grid').innerHTML = calCells(state.calMonth).map(k => {
    const d = fromDayKey(k);
    const dia = k === state.day ? state.dia : state.resumo.get(k);
    const cls = [
      d.getMonth() !== m - 1 && 'is-outside',
      k === state.today && 'is-today',
      k === state.day && 'is-selected'
    ].filter(Boolean).join(' ');
    const pend = dia?.tarefas.filter(t => !t.feita).length || 0;
    const label = `${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}${pend ? `, ${pend} ${pend === 1 ? 'tarefa pendente' : 'tarefas pendentes'}` : ''}`;
    return `<button type="button" class="cal-day ${cls}" data-day="${k}" aria-label="${label}" aria-pressed="${k === state.day}">
      <span class="num">${d.getDate()}</span><span class="cal-marks">${marks(dia)}</span></button>`;
  }).join('');
}

/* ---------- Ajustes ---------- */

function openAjustes(focusField) {
  const f = $('ajustes-form');
  const { pomodoro: p, agua: a } = state.config;
  f.foco.value = p.foco;
  f.curta.value = p.curta;
  f.longa.value = p.longa;
  f.ciclos.value = p.ciclos;
  f.som.checked = p.som;
  f.peso.value = a?.peso ?? '';
  f.exercicio.checked = a?.exercicio ?? false;
  f.calor.checked = a?.calor ?? false;
  renderMetaAgua();
  $('ajustes-dialog').showModal();
  if (focusField) f[focusField].focus();
}

function lerAjustes() {
  const f = $('ajustes-form');
  const int = el => Math.round(Number(el.value));
  const peso = int(f.peso);
  return {
    pomodoro: { foco: int(f.foco), curta: int(f.curta), longa: int(f.longa), ciclos: int(f.ciclos), som: f.som.checked },
    agua: f.peso.value && peso >= 25 && peso <= 250 ? { peso, exercicio: f.exercicio.checked, calor: f.calor.checked } : null,
    fixas: state.config?.fixas || [] // editadas no diálogo próprio; aqui só passam adiante
  };
}

function renderMetaAgua() {
  const { agua } = lerAjustes();
  const p = agua && planoAgua(agua);
  $('ajustes-meta').innerHTML = p
    ? `Meta diária: <strong class="num">${formatMl(p.meta)}</strong>, ou ${p.copos} copos de 250 ml.`
    : 'Peso × 35 ml, mais 500 ml para exercícios e 500 ml para clima quente.';
}

function initAjustes() {
  const dialog = $('ajustes-dialog');
  const form = $('ajustes-form');
  dialog.querySelector('.dialog-head [data-close]').innerHTML = icon('x', 18);
  dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
  form.addEventListener('input', renderMetaAgua);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (form.peso.value && !lerAjustes().agua) {
      form.peso.setCustomValidity('Informe um peso entre 25 e 250 kg.');
      form.peso.reportValidity();
      form.peso.addEventListener('input', () => form.peso.setCustomValidity(''), { once: true });
      return;
    }
    const prev = state.config;
    const next = lerAjustes();
    state.config = next;
    dialog.close();
    renderPomodoro();
    renderSaude();
    if (await persist(saveConfig(user.uid, next), () => { state.config = prev; renderPomodoro(); renderSaude(); })) {
      showToast('Ajustes salvos.');
    }
  });
}

/* ---------- Lo-Fi ----------
   Padrão "fachada": até o clique, é só um botão local, sem nenhuma conexão
   com o YouTube. Ao tocar, entra um iframe do youtube-nocookie; "Parar" o remove. */

const LOFI_VIDEO = 'E2vONfzoyRI'; // a mesma live do no-distraction

function renderLofi(playing = false) {
  const el = $('lofi');
  if (!playing) {
    el.innerHTML = `
      <button type="button" class="lofi-facade" id="lofi-play">
        <span class="lofi-icon">${icon('headphones', 22)}</span>
        <span class="lofi-text"><strong>Tocar rádio lo-fi</strong><span>Carrega o player do YouTube só agora</span></span>
        <span class="lofi-go">${icon('play', 14)}</span>
      </button>`;
    $('lofi-play').addEventListener('click', () => renderLofi(true));
    return;
  }
  const src = `https://www.youtube-nocookie.com/embed/${LOFI_VIDEO}?autoplay=1&rel=0&playsinline=1&origin=${encodeURIComponent(location.origin)}`;
  el.innerHTML = `
    <div class="lofi-frame"><iframe title="Rádio lo-fi" src="${escapeHtml(src)}" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <button type="button" class="btn btn-ghost btn-sm lofi-stop" id="lofi-stop">${icon('pause', 14)} Parar</button>`;
  $('lofi-stop').addEventListener('click', () => renderLofi(false));
}

/* ---------- Atalhos ---------- */

function onKey(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  const editing = t.closest?.('input, textarea, select, [contenteditable="true"]');
  if (e.key === 'Escape' && editing) return t.blur();
  if (editing || document.querySelector('dialog[open]')) return;
  // Espaço/Enter num botão focado mantêm o comportamento nativo
  if (e.key === ' ' && t.closest?.('button, a, [role="tab"]')) return;

  const actions = {
    ' ': () => alternarPomodoro(),
    ArrowLeft: () => loadDay(shiftDay(state.day, -1)),
    ArrowRight: () => loadDay(shiftDay(state.day, 1)),
    h: () => state.day !== state.today && loadDay(state.today),
    t: () => focusInput(),
    n: () => focusNotas(),
    a: () => $('agua').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }),
    '?': () => $('atalhos-dialog').showModal()
  };
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (tabAtual === 'quadro' && !['ArrowLeft', 'ArrowRight', 'h', '?'].includes(k)) return;
  if (tabAtual === 'historico' && k !== '?') return;
  const fn = actions[k];
  if (!fn) return;
  e.preventDefault();
  fn();
}

/* ---------- Init ---------- */

initPagina();
$('btn-ajustes').innerHTML = icon('sliders');
$('btn-atalhos').innerHTML = icon('keyboard');
$('day-prev').innerHTML = icon('chevronLeft');
$('day-next').innerHTML = icon('chevronRight');
$('cal-prev').innerHTML = icon('chevronLeft', 16);
$('cal-next').innerHTML = icon('chevronRight', 16);
$('atalhos-dialog').querySelector('[data-close]').innerHTML = icon('x', 18);
$('atalhos-dialog').querySelector('[data-close]').addEventListener('click', () => $('atalhos-dialog').close());

$('day-prev').addEventListener('click', () => loadDay(shiftDay(state.day, -1)));
$('day-next').addEventListener('click', () => loadDay(shiftDay(state.day, 1)));
$('btn-hoje').addEventListener('click', () => loadDay(state.today));
$('cal-prev').addEventListener('click', () => setCalMonth(shiftMonth(state.calMonth, -1)));
$('cal-next').addEventListener('click', () => setCalMonth(shiftMonth(state.calMonth, 1)));
$('cal-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-day]');
  if (b && b.dataset.day !== state.day) loadDay(b.dataset.day);
});
$('btn-ajustes').addEventListener('click', () => openAjustes());
$('btn-atalhos').addEventListener('click', () => $('atalhos-dialog').showModal());
document.addEventListener('keydown', onKey);
initAjustes();
renderLofi();

const isToday = () => state.day === state.today;

initTarefas({
  tarefas: () => state.dia.tarefas,
  save: (next, prev) => saveDia('tarefas', next, prev),
  passar: passarTarefa,
  isToday
});
initFixas();
initHistorico({
  today: () => state.today,
  config: () => state.config,
  // Dia do cache do calendário (ou o aberto); undefined = ainda não lido
  dia: k => (k === state.day ? state.dia : state.resumo.get(k)),
  carregar: carregarMes,
  trazer: (dia, id) => passarTarefa(id, 'mover', dia, state.today),
  abrirDia: dia => { location.hash = '#day'; loadDay(dia); }
});
initNotas({
  day: () => state.day,
  notas: () => state.dia.notas,
  persist: (day, notas) => {
    const prev = state.resumo.get(day)?.notas ?? [];
    setCampo(day, 'notas', notas);
    return persist(saveCampo(user.uid, day, 'notas', notas), () => setCampo(day, 'notas', prev),
      'Não foi possível salvar a nota. Ela continua na tela; tente de novo.');
  }
});
initQuadro({
  day: () => state.day,
  today: () => state.today,
  tarefasDe: day => (day === state.day ? state.dia : state.resumo.get(day))?.tarefas ?? [],
  notas: () => state.dia.notas,
  salvar: salvarTarefas
});

/* ---------- Abas: Meu dia | Quadro (via hash, como no Orçamento) ---------- */
let tabAtual = 'dia';
const TAB_HASH = { '#day': 'dia', '#board': 'quadro', '#history': 'historico' };

function showTab() {
  tabAtual = TAB_HASH[location.hash] || 'dia';
  $('view-dia').hidden = tabAtual !== 'dia';
  $('view-quadro').hidden = tabAtual !== 'quadro';
  $('view-historico').hidden = tabAtual !== 'historico';
  $('foco-dia-nav').style.visibility = tabAtual === 'historico' ? 'hidden' : ''; // o histórico navega por mês
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === tabAtual;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  moveTabIndicator();
  renderQuadro();
  renderHistorico();
}

function moveTabIndicator() {
  const active = document.querySelector('.tab.active');
  if (!active) return;
  $('tab-indicator').style.transform = `translateX(${active.offsetLeft}px) scaleX(${active.offsetWidth})`;
  requestAnimationFrame(() => $('tab-indicator').classList.add('ready'));
}

window.addEventListener('hashchange', showTab);
window.addEventListener('resize', moveTabIndicator);
document.fonts?.ready.then(moveTabIndicator);
showTab();

initSaude({
  dia: () => state.dia,
  config: () => state.config,
  save: saveDia,
  openAjustes
});

// Vira o dia com a página aberta (passou da meia-noite)
setInterval(() => {
  const t = dayKey(new Date());
  if (t === state.today) return;
  state.today = t;
  renderDayLabel();
  renderCal();
}, 60_000);

// Não perder a última nota se a aba for fechada durante o debounce
window.addEventListener('pagehide', flushNotas);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushNotas();
});

try {
  state.config = await fetchConfig(user.uid);
} catch (e) {
  console.error(e);
  state.config = { pomodoro: POMODORO_PADRAO, agua: null, fixas: [] };
}

initPomodoro({
  config: () => state.config,
  focosDoDia: () => state.dia.pomodoros,
  isToday,
  // O foco conta para o dia de hoje, mesmo que outro dia esteja aberto na tela
  onFoco: () => {
    const day = state.today;
    const atual = (day === state.day ? state.dia : state.resumo.get(day))?.pomodoros ?? 0;
    setCampo(day, 'pomodoros', Math.min(atual + 1, LIMITES.pomodoros));
    persist(addPomodoro(user.uid, day), () => setCampo(day, 'pomodoros', atual));
    renderPomodoro();
  }
});

// ?dia=YYYY-MM-DD abre um dia específico (ex.: link do Diário)
const pedido = new URLSearchParams(location.search).get('dia');
if (pedido && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(pedido)) {
  state.day = pedido;
  state.calMonth = monthKey(fromDayKey(pedido));
}

// Mês visível do calendário (marcas dos dias e "Semana" do Quadro): sem isto,
// só era lido ao trocar de mês
setCalMonth(state.calMonth);
await loadDay(state.day, { animate: false });
dadosProntos();
