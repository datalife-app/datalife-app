/* ============================================
   DataLife — Foco: tarefas do dia
   ============================================
   Clique no texto para editar (Enter salva, Esc cancela). Excluir tem
   Desfazer. Ordem manual: arrastar pela alça (mouse) ou setas (toque).
   ============================================ */

import { LIMITES } from './foco-db.js';
import { icon, escapeHtml, showToast, uid } from './utils.js';

const $ = id => document.getElementById(id);

let ctx = null;        // { tarefas(), save(next, prev), isToday() }
let filtro = 'todas';
let editingId = null;
let menuId = null; // tarefa com o menu "passar para o dia seguinte" aberto
let lastAddedId = null;
let dragId = null;

// Ícone das tarefas criadas sozinhas, pelo prefixo da origem
const AUTO = {
  fixa: { icon: 'repeat', title: 'Tarefa fixa' },
  livro: { icon: 'book', title: 'Do livro em leitura' },
  conta: { icon: 'receipt', title: 'Conta que vence hoje: concluir marca como paga' }
};
const tipoOrigem = t => t.origem.split(':')[0];

const hora = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const VAZIO = {
  todas: () => (ctx.isToday() ? 'Nenhuma tarefa para hoje. Escreva acima a primeira.' : 'Nenhuma tarefa neste dia.'),
  pendentes: () => 'Nada pendente.',
  feitas: () => 'Nada concluído ainda.'
};

function visiveis() {
  const all = ctx.tarefas();
  if (filtro === 'pendentes') return all.filter(t => !t.feita);
  if (filtro === 'feitas') return all.filter(t => t.feita);
  return all;
}

export function render() {
  const all = ctx.tarefas();
  const feitas = all.filter(t => t.feita).length;
  $('tarefas-count').textContent = all.length ? `${feitas} de ${all.length}` : '';
  $('tarefas-count').title = all.length ? `${feitas} de ${all.length} concluídas` : '';

  const list = visiveis();
  const ordenavel = filtro === 'todas' && all.length > 1;
  $('tarefa-list').classList.toggle('is-sortable', ordenavel);
  $('tarefa-list').innerHTML = list.map((t, i) => {
    const id = escapeHtml(t.id);
    if (t.id === editingId) {
      return `
        <li class="tarefa is-editing" data-id="${id}">
          <form class="tarefa-edit" data-edit>
            <input class="input" name="texto" value="${escapeHtml(t.texto)}" maxlength="${LIMITES.texto}" aria-label="Editar tarefa" required>
            <button class="icon-btn ok" type="submit" aria-label="Salvar">${icon('check', 16)}</button>
            <button class="icon-btn" type="button" data-cancel aria-label="Cancelar">${icon('x', 16)}</button>
          </form>
        </li>`;
    }
    return `
      <li class="tarefa ${t.feita ? 'is-done' : ''} ${t.fazendo && !t.feita ? 'is-fazendo' : ''} ${t.id === lastAddedId ? 'is-new' : ''}" data-id="${id}" ${ordenavel ? 'draggable="true"' : ''}>
        ${ordenavel ? `<span class="tarefa-grip" aria-hidden="true">${icon('grip', 14)}</span>` : ''}
        <input type="checkbox" ${t.feita ? 'checked' : ''} data-toggle aria-label="${t.feita ? 'Desmarcar' : 'Concluir'}: ${escapeHtml(t.texto)}">
        <button type="button" class="tarefa-text" data-edit-start title="Clique para editar">${t.origem ? `<span class="tarefa-auto" title="${AUTO[tipoOrigem(t)].title}">${icon(AUTO[tipoOrigem(t)].icon, 13)}</span>` : ''}${escapeHtml(t.texto)}${t.feita && t.concluida ? `<span class="tarefa-quando">feita às ${hora(t.concluida)}</span>` : ''}${t.fazendo ? '<span class="tarefa-fazendo">fazendo</span>' : ''}</button>
        <div class="tarefa-actions">
          ${ordenavel ? `
          <button class="icon-btn tarefa-move" type="button" data-move="-1" aria-label="Mover para cima" ${i === 0 ? 'disabled' : ''}>${icon('chevronUp', 15)}</button>
          <button class="icon-btn tarefa-move" type="button" data-move="1" aria-label="Mover para baixo" ${i === list.length - 1 ? 'disabled' : ''}>${icon('chevronDown', 15)}</button>` : ''}
          ${t.feita ? '' : `<span class="tarefa-passar-wrap"><button class="icon-btn" type="button" data-passar aria-haspopup="menu" aria-expanded="${menuId === t.id}" title="Passar para o dia seguinte" aria-label="Passar para o dia seguinte: ${escapeHtml(t.texto)}">${icon('arrowRight', 15)}</button>${menuId === t.id ? `
            <span class="tarefa-menu" role="menu">
              <button type="button" role="menuitem" data-passar-modo="mover">${icon('arrowRight', 14)} Mover para ${ctx.isToday() ? 'amanhã' : 'o dia seguinte'}</button>
              <button type="button" role="menuitem" data-passar-modo="copiar">${icon('copy', 14)} Copiar para ${ctx.isToday() ? 'amanhã' : 'o dia seguinte'}</button>
            </span>` : ''}</span>`}
          ${t.feita ? '' : `<button class="icon-btn tarefa-fazer ${t.fazendo ? 'is-on' : ''}" type="button" data-fazendo aria-pressed="${!!t.fazendo}"
            title="${t.fazendo ? 'Parar (volta para A fazer)' : 'Estou fazendo'}" aria-label="${t.fazendo ? 'Parar de fazer' : 'Estou fazendo'}: ${escapeHtml(t.texto)}">${icon(t.fazendo ? 'pause' : 'play', 15)}</button>`}
          <button class="icon-btn danger" type="button" data-remove aria-label="Excluir tarefa">${icon('trash', 15)}</button>
        </div>
      </li>`;
  }).join('') || `<li class="tarefa-empty">${VAZIO[filtro]()}</li>`;
  lastAddedId = null;

  const edit = $('tarefa-list').querySelector('[data-edit] input');
  if (edit) {
    edit.focus();
    edit.setSelectionRange(edit.value.length, edit.value.length);
  }
}

/* ---------- Ações ---------- */

function commit(next) {
  const prev = ctx.tarefas();
  ctx.save(next, prev);
}

function add(texto) {
  const all = ctx.tarefas();
  if (all.length >= LIMITES.tarefas) {
    showToast(`Limite de ${LIMITES.tarefas} tarefas por dia.`, 'error');
    return false;
  }
  const t = { id: uid(), texto, feita: false, criada: Date.now() };
  lastAddedId = t.id;
  if (filtro === 'feitas') setFiltro('todas');
  commit([...all, t]);
  return true;
}

function toggle(id) {
  commit(ctx.tarefas().map(t => {
    if (t.id !== id) return t;
    const feita = !t.feita;
    const { concluida, fazendo, ...rest } = t;
    return feita ? { ...rest, feita, concluida: Date.now() } : { ...rest, feita };
  }));
}

/** "Estou fazendo": a mesma marca da coluna Fazendo do Quadro. */
function fazendo(id) {
  commit(ctx.tarefas().map(t => {
    if (t.id !== id || t.feita) return t;
    const { fazendo: on, ...rest } = t;
    return on ? rest : { ...rest, fazendo: true };
  }));
}

function remove(id) {
  const prev = ctx.tarefas();
  const t = prev.find(x => x.id === id);
  if (!t) return;
  commit(prev.filter(x => x.id !== id));
  showToast(`"${t.texto}" excluída.`, 'success', 6000, {
    label: 'Desfazer',
    onClick: () => {
      const cur = ctx.tarefas();
      if (cur.some(x => x.id === t.id)) return;
      const at = Math.min(prev.findIndex(x => x.id === t.id), cur.length);
      commit([...cur.slice(0, at), t, ...cur.slice(at)]);
    }
  });
}

function saveEdit(id, texto) {
  editingId = null;
  const all = ctx.tarefas();
  const t = all.find(x => x.id === id);
  if (!t || t.texto === texto) return render();
  commit(all.map(x => (x.id === id ? { ...x, texto } : x)));
}

function move(id, delta) {
  const all = [...ctx.tarefas()];
  const from = all.findIndex(t => t.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= all.length) return;
  all.splice(to, 0, all.splice(from, 1)[0]);
  commit(all);
  $('tarefa-list').querySelector(`[data-id="${CSS.escape(id)}"] [data-move="${delta}"]:not(:disabled)`)?.focus();
}

function moveTo(id, targetId, after) {
  const all = [...ctx.tarefas()];
  const from = all.findIndex(t => t.id === id);
  if (from < 0 || id === targetId) return;
  const [t] = all.splice(from, 1);
  const at = all.findIndex(x => x.id === targetId);
  all.splice(after ? at + 1 : at, 0, t);
  commit(all);
}

function setFiltro(f) {
  filtro = f;
  editingId = null;
  $('tarefas-filtro').querySelectorAll('[data-filtro]').forEach(b => b.setAttribute('aria-checked', b.dataset.filtro === f));
  render();
}

/** Ao trocar de dia: sai da edição. */
export function reset() {
  editingId = null;
  menuId = null;
}

export function focusInput() {
  $('tarefa-input').focus();
}

/* ---------- Eventos ---------- */

export function initTarefas(options) {
  ctx = options;
  const list = $('tarefa-list');

  $('tarefa-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('tarefa-input');
    const texto = input.value.trim();
    if (!texto) return;
    if (add(texto)) input.value = '';
  });

  $('tarefas-filtro').addEventListener('click', e => {
    const b = e.target.closest('[data-filtro]');
    if (b) setFiltro(b.dataset.filtro);
  });

  list.addEventListener('change', e => {
    if (e.target.matches('[data-toggle]')) toggle(e.target.closest('[data-id]').dataset.id);
  });

  list.addEventListener('click', e => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.closest('[data-edit-start]')) {
      editingId = id;
      render();
    } else if (e.target.closest('[data-passar-modo]')) {
      const modo = e.target.closest('[data-passar-modo]').dataset.passarModo;
      menuId = null;
      render();
      ctx.passar(id, modo);
    } else if (e.target.closest('[data-passar]')) {
      menuId = menuId === id ? null : id;
      render();
      if (menuId) list.querySelector('.tarefa-menu button')?.focus();
    } else if (e.target.closest('[data-fazendo]')) {
      fazendo(id);
    } else if (e.target.closest('[data-remove]')) {
      remove(id);
    } else if (e.target.closest('[data-move]')) {
      move(id, Number(e.target.closest('[data-move]').dataset.move));
    } else if (e.target.closest('[data-cancel]')) {
      editingId = null;
      render();
    }
  });

  list.addEventListener('submit', e => {
    e.preventDefault();
    const texto = e.target.texto.value.trim();
    const id = e.target.closest('[data-id]').dataset.id;
    if (texto) saveEdit(id, texto);
    else remove(id);
  });

  // Fecha o menu ao clicar fora ou com Esc
  document.addEventListener('pointerdown', e => {
    if (menuId && !e.target.closest('.tarefa-passar-wrap')) { menuId = null; render(); }
  });
  list.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menuId) { e.stopPropagation(); menuId = null; render(); return; }
    if (e.key === 'Escape' && editingId) {
      e.stopPropagation();
      editingId = null;
      render();
    }
  });

  // Sair do campo de edição clicando fora salva (como um formulário que se fecha).
  // Clique nos botões do próprio formulário não conta: o Safari não dá foco a botões.
  let pressingEdit = false;
  list.addEventListener('pointerdown', e => { pressingEdit = !!e.target.closest('[data-edit]'); });
  list.addEventListener('focusout', e => {
    if (!e.target.matches('[data-edit] input')) return;
    const form = e.target.form;
    setTimeout(() => {
      if (pressingEdit) return void (pressingEdit = false);
      if (editingId && form.isConnected && !form.contains(document.activeElement)) form.requestSubmit();
    });
  });

  /* Arrastar para reordenar (HTML5 DnD; no toque, as setas fazem o papel) */
  list.addEventListener('dragstart', e => {
    const li = e.target.closest('.tarefa[draggable]');
    if (!li) return;
    dragId = li.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => li.classList.add('is-dragging'));
  });
  list.addEventListener('dragover', e => {
    if (!dragId) return;
    const li = e.target.closest('.tarefa[draggable]');
    if (!li) return;
    e.preventDefault();
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    list.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    if (li.dataset.id !== dragId) li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  list.addEventListener('drop', e => {
    const li = e.target.closest('.tarefa[draggable]');
    if (!dragId || !li) return;
    e.preventDefault();
    moveTo(dragId, li.dataset.id, li.classList.contains('drop-after'));
  });
  list.addEventListener('dragend', () => {
    dragId = null;
    list.querySelectorAll('.is-dragging, .drop-before, .drop-after')
      .forEach(x => x.classList.remove('is-dragging', 'drop-before', 'drop-after'));
  });
}
