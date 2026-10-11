/* ============================================
   DataLife — Exercícios, Meu treino e Histórico
   ============================================
   Referências: MuscleWiki (mapa do corpo clicável para escolher o
   músculo), Hevy e Strong (registro de carga por exercício, ajuste do
   aparelho que fica salvo, sugestão de progressão).
   Cada exercício da biblioteca já vem com uma animação; um link seu
   (GIF/imagem aparece direto; YouTube só carrega no clique, pelo
   youtube-nocookie) substitui a animação.
   Meu treino: quatro perguntas (experiência, gênero, peso, divisão)
   geram um plano pronto (treino-data.js). Histórico: carga, repetições
   e ajustes do aparelho por exercício, com a próxima carga sugerida.
   ============================================ */

import { requireAuth } from './auth.js';
import { initPagina, persist, dadosProntos } from './pagina.js';
import { GRUPOS, EQUIPAMENTOS, EXERCICIOS, animacaoDe, paradoDe, videosDe } from './exercicios-data.js';
import { fetchDados, saveDados, midiaDe, LIMITES } from './exercicios-db.js';
import { NIVEIS, GENEROS, DIVISOES, gerarPlano, divisaoIndicada, prescricao, proximaCarga, faixa, fmtKg } from './treino-data.js';
import { fetchTreino, savePlano, addReg, removeReg, sanitizeReg, LIMITES as LIM_TREINO } from './treino-db.js';
import { enhanceSelect } from './selectpicker.js';
import { enhanceDateInput } from './datepicker.js';
import { icon, escapeHtml, showToast, uid, debounce, dayKey, fromDayKey, MESES } from './utils.js';

const $ = id => document.getElementById(id);
const user = await requireAuth();

const state = {
  dados: { extras: {}, proprios: [] },
  treino: { plano: null, hist: {} },
  grupo: '', eq: '', busca: '', favs: false,
  aberto: null, aba: 'como', editando: null,
  dia: null,              // dia do plano na tela (A, B, ...)
  refazendo: false,       // formulário do perfil aberto sobre um plano existente
  perfil: { nivel: '', genero: '', peso: '', divisao: '' }
};
const NOME_GRUPO = Object.fromEntries(GRUPOS.map(g => [g.id, g.nome]));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hoje = () => dayKey(new Date());
const fmtData = k => { const d = fromDayKey(k); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3).toLowerCase()}`; };
const fmtNum = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Animação em loop, ou o quadro parado com "reduzir movimento" ligado (WCAG 2.2.2). */
const animHtml = (id, attrs) =>
  `<picture><source media="(prefers-reduced-motion: reduce)" srcset="${paradoDe(id)}"><img src="${animacaoDe(id)}" ${attrs}></picture>`;

/* ---------- Mapa do corpo (SVG, frente e costas) ----------
   Desenhado só o lado esquerdo; o direito é o espelho (x -> 120 - x).
   Cada forma vira um músculo clicável (no teclado, os botões de grupo
   abaixo do mapa fazem o mesmo). */

const ESPELHO = 'matrix(-1 0 0 1 120 0)';
const SILHUETA = 'M60 31c-2.6 0-4.4-1-5.4-2.6l-.6 4.8c-.3 3-2.4 5.4-5.6 6.5L38 43.5c-6.2 2-10.6 6.6-11.8 12.6l-2.6 14c-1 6-2.2 13-3.6 21L16.6 112c-.9 5-1.8 11-2.3 17l-1.1 9.6c-.4 3.2-.8 6.4-.7 8.2.2 2.4 2 3.4 3.8 2.6 1.4-.6 2.2-2.4 2.6-4.6l1.4-8.4c.6-4 2-9.4 3.6-14.2l6-19.4c1.4-4.8 2.6-10.6 3.4-15.4l2-9.6 1.4 14.6c.6 7.4.4 14.2-.6 20.4l-1.8 12c-1.2 8-1.6 16.2-1 24.6l1.6 21.2c.6 7.2 1.2 13.2 2.6 18.6l1.2 6c-1.6 6.6-2 14-1.4 21.4l1.6 18.6c.2 2.4-.6 4.6-2.2 6.6-1.2 1.6-.4 3.4 1.6 3.6l8.4.4c1.8 0 2.8-1.2 2.4-3l-1-4.6c-.4-2.4-.2-5 .4-7.6l2.4-14.8c.8-6.2.6-12.2-.6-18.4l.6-4c1.6-7.4 2.4-15.6 2.6-24.4l.4-17.4c.2-2.6 1.4-4.2 3.4-4.4z';
const CABECA = '<ellipse cx="60" cy="17" rx="10.5" ry="13" class="corpo"/>';

const FRENTE = [
  ['ombros', 'M38.6 44.4c-6.6 1.8-11.2 6.4-12.2 12.8-.6 4-.2 8 1.2 11.6 2.8-5.4 6.4-10 10.6-13.6 1.8-1.6 2.6-4 2.2-6.4z'],
  ['peito', 'M58.6 46.4c-6.4-.8-12.6 0-17.6 2.6-2.4 1.4-3.2 4.2-2.4 7l1.6 5.6c1.6 5 5.6 8.6 10.4 9.4 2.8.4 5.4.2 8-.6z'],
  ['biceps', 'M27.6 72.4c-2.2 5.8-3.4 12.4-3.4 19 0 2.4 1.8 4.2 4 4 2.6-.2 4.2-2.4 4.8-5l2.2-11.4c.6-3.6-.4-6.8-2.8-8.6-1.8-1.2-4-.6-4.8 2z'],
  ['antebraco', 'M22.4 99.6c-2.6 7.4-4.4 15.4-5 23.4-.2 2.6 1.6 4.4 3.8 4.2 2-.2 3.2-1.8 3.8-3.8l4.8-17c.8-3-.2-5.8-2.6-7.4-1.8-1.2-4-.6-4.8.6z'],
  ['abdomen', 'M51.6 74.6h6.6c.6 0 1 .4 1 1v7.4c0 .6-.4 1-1 1h-6.4c-1 0-1.8-.8-1.8-1.8v-5.8c0-1 .8-1.8 1.6-1.8zM51 86.6h7.2c.6 0 1 .4 1 1v8c0 .6-.4 1-1 1H51c-.8 0-1.4-.6-1.4-1.4v-7.2c0-.8.6-1.4 1.4-1.4zM51 99.2h7.2c.6 0 1 .4 1 1v8.6c0 .6-.4 1-1 1H51.6c-1 0-1.8-.8-1.8-1.8v-7.4c0-.8.6-1.4 1.2-1.4zM50.4 112.2h7.8c.6 0 1 .4 1 1V128c0 1-1 1.6-1.8 1.2-3.8-2-6.2-6-7.2-10.2l-.6-5c0-1 .2-1.8.8-1.8z'],
  ['abdomen', 'M44.2 74.4c-1.6 5.4-2 11.2-1.2 17l1.6 11.2c.6 4.2 1.6 8.4 3.2 12.2.6 1.2 1.6.8 1.6-.4l.2-27.6c0-4.4-1.6-8.6-4.4-12.2-.4-.6-.8-.6-1 0z'],
  ['quadriceps', 'M44.6 134.6c-3.2 8-4.6 17-4 26l1.4 15.2c.4 4.8 2.4 9 6 11.8 2.6 2 6 1.6 7.6-1 1.6-2.6 2.4-5.8 2.4-9l-.2-22.6c-.2-6.6-2.8-12.6-7.4-17.4-1.8-1.8-4.8-1.4-5.8 1z'],
  ['panturrilhas', 'M44.6 199.6c-1.6 7-1.6 14.2.2 21.2l1.6 6.4c.6 2.4 2.4 3.6 4.4 3.2 2-.4 3.2-2.2 3.4-4.4l.8-12.6c.4-5-.8-9.6-3.4-13.4-1.8-2.6-6-2.6-7 .4z']
];
const COSTAS = [
  ['costas', 'M60 33.6c-1.8 3.6-5.2 6.4-9.6 8l-8.4 3.2c5.4 2.2 10 6 13.2 11l4.8 8z'],
  ['ombros', 'M38.6 44.4c-6.6 1.8-11.2 6.4-12.2 12.8-.6 4-.2 8 1.2 11.6 2.8-5.4 6.4-10 10.6-13.6 1.8-1.6 2.6-4 2.2-6.4z'],
  ['costas', 'M41.4 54.6c-1.4 7.6-1.2 15.4.8 23l2.4 9c1.6 6 5.2 11.2 10 14.8l5.4 3.8V68.8c-2.6-5.4-6.6-9.8-11.6-12.8-2.2-1.4-4.6-1.8-7-1.4z'],
  ['costas', 'M53.4 104.8c2 2.4 4.2 4.4 6.6 5.8v10c-3.4-.6-6.2-2.6-7.6-5.6-.8-1.8-1-4-.6-6z'],
  ['triceps', 'M27.6 72.4c-2.2 5.8-3.4 12.4-3.4 19 0 2.4 1.8 4.2 4 4 2.6-.2 4.2-2.4 4.8-5l2.2-11.4c.6-3.6-.4-6.8-2.8-8.6-1.8-1.2-4-.6-4.8 2z'],
  ['antebraco', 'M22.4 99.6c-2.6 7.4-4.4 15.4-5 23.4-.2 2.6 1.6 4.4 3.8 4.2 2-.2 3.2-1.8 3.8-3.8l4.8-17c.8-3-.2-5.8-2.6-7.4-1.8-1.2-4-.6-4.8.6z'],
  ['gluteos', 'M59.2 123.2c-6.8-1.4-13.2 1.2-16 6.8-2.2 4.4-1.6 9.8 1.6 13.4 3.4 3.8 9.2 4.8 13.6 2.2l.8-.6z'],
  ['posteriores', 'M44.2 151.4c-2.4 8-3 16.4-1.6 24.6l1.4 7.6c.8 4 3.6 7 7.4 7.4 2.8.2 5.2-1.8 5.6-4.6l.8-9.6c.6-8.2-.8-16.4-4.2-23.8-1.8-3.8-7.8-4.4-9.4-1.6z'],
  ['panturrilhas', 'M44 198.4c-2.4 5.4-2.8 11.6-1.2 17.4l1.6 5.6c.8 2.8 3 4.4 5.6 4.2 2.4-.2 4-2.2 4.2-4.6l.4-9.6c.2-4.8-1.4-9.4-4.4-12.8-1.6-1.8-5-1.8-6.2-.2z']
];

function figura(partes, rotulo) {
  const lado = t => partes.map(([g, d]) => `<path d="${d}" class="mus" data-grupo="${g}"${t ? ` transform="${t}"` : ''}/>`).join('');
  return `
    <figure class="fig">
      <svg viewBox="8 2 104 254" aria-hidden="true">
        ${CABECA}<path d="${SILHUETA}" class="corpo"/><path d="${SILHUETA}" class="corpo" transform="${ESPELHO}"/>
        ${lado('')}${lado(ESPELHO)}
      </svg>
      <figcaption>${rotulo}</figcaption>
    </figure>`;
}

/* Miniatura do card: o recorte do corpo (tronco ou pernas, frente ou costas)
   com o músculo principal aceso e os secundários em meio-tom. */
const SO_COSTAS = new Set(['costas', 'triceps', 'gluteos', 'posteriores']);
const PERNAS = new Set(['quadriceps', 'posteriores', 'gluteos', 'panturrilhas']);

function miniCorpo(e) {
  const partes = SO_COSTAS.has(e.grupo) ? COSTAS : FRENTE;
  const tom = g => g === e.grupo ? ' is-main' : e.secundarios.includes(g) ? ' is-sec' : '';
  const lado = t => partes.map(([g, d]) => `<path d="${d}" class="mini-mus${tom(g)}"${t ? ` transform="${t}"` : ''}/>`).join('');
  return `
    <svg viewBox="${PERNAS.has(e.grupo) ? '26 118 68 116' : '12 32 96 96'}">
      ${CABECA}<path d="${SILHUETA}" class="corpo"/><path d="${SILHUETA}" class="corpo" transform="${ESPELHO}"/>
      ${lado('')}${lado(ESPELHO)}
    </svg>`;
}

function renderMapa() {
  $('mapa').innerHTML = figura(FRENTE, 'Frente') + figura(COSTAS, 'Costas');
  pintarMapa();
}

function pintarMapa() {
  $('mapa').querySelectorAll('.mus').forEach(m => m.classList.toggle('is-sel', m.dataset.grupo === state.grupo));
  const n = {};
  for (const e of todos()) n[e.grupo] = (n[e.grupo] || 0) + 1;
  $('grupos').innerHTML = GRUPOS.map(g => `<button type="button" role="radio" class="grupo-chip" data-grupo="${g.id}" aria-checked="${state.grupo === g.id}">${g.nome}<span class="num">${n[g.id] || 0}</span></button>`).join('');
  $('mapa-todos').hidden = !state.grupo;
}


/* ---------- Lista ---------- */

function todos() {
  const proprios = state.dados.proprios.map(p => ({ ...p, proprio: true, nivel: 'Meu', dicas: [], erros: [], secundarios: [] }));
  return [...EXERCICIOS, ...proprios].map(e => ({ ...e, extra: e.proprio ? e : state.dados.extras[e.id] || {} }));
}
const acharEx = id => todos().find(e => e.id === id);

function renderLista() {
  const q = norm(state.busca.trim());
  const lista = todos().filter(e =>
    (!state.grupo || e.grupo === state.grupo || e.secundarios.includes(state.grupo)) &&
    (!state.eq || e.equipamento === state.eq) &&
    (!state.favs || e.extra.fav) &&
    (!q || norm(e.nome).includes(q)))
    // principal antes de secundário; favoritos primeiro
    .sort((a, b) => Number(b.grupo === state.grupo) - Number(a.grupo === state.grupo) || Number(!!b.extra.fav) - Number(!!a.extra.fav) || a.nome.localeCompare(b.nome, 'pt-BR'));
  $('lista-title').textContent = `${state.grupo ? NOME_GRUPO[state.grupo] : 'Todos os exercícios'} · ${lista.length}`;
  $('ex-lista').innerHTML = lista.map(e => `
    <li>
      <button type="button" class="ex-card" data-id="${escapeHtml(e.id)}">
        <span class="ex-thumb" aria-hidden="true">${miniCorpo(e)}</span>
        <span class="ex-info">
          <strong>${escapeHtml(e.nome)}${e.extra.fav ? ` <span class="ex-fav" title="Favorito">${icon('star', 13)}</span>` : ''}</strong>
          <span class="ex-meta">${NOME_GRUPO[e.grupo]}${state.grupo && e.grupo !== state.grupo ? ' (secundário)' : ''} · ${e.equipamento} · ${e.nivel}</span>
        </span>
        ${state.treino.hist[e.id] ? `<span class="ex-carga num" title="Última carga">${ultimaTxt(state.treino.hist[e.id][0])}</span>` : ''}
      </button>
    </li>`).join('') || '<li class="ex-vazio">Nenhum exercício com esses filtros.</li>';
  const fav = $('so-favs');
  fav.innerHTML = `${icon('star', 14)} Favoritos`;
  fav.setAttribute('aria-pressed', state.favs);
}

/* ---------- Detalhe ---------- */

function midiaHtml(e) {
  const m = midiaDe(e.extra.midia);
  const nome = escapeHtml(e.nome);
  const videos = `<a class="midia-videos" href="${escapeHtml(videosDe(e.nome))}" target="_blank" rel="noopener noreferrer">${icon('externalLink', 14)} Ver vídeos no YouTube</a>`;
  let html;
  if (m?.tipo === 'imagem') html = `<img class="midia-img" src="${escapeHtml(m.url)}" alt="Demonstração: ${nome}" loading="lazy" referrerpolicy="no-referrer">`;
  else if (m?.tipo === 'youtube') html = `<button type="button" class="midia-yt" data-yt="${escapeHtml(m.id)}">${icon('play', 22)}<span><strong>Ver o vídeo</strong><small>Carrega o player do YouTube só agora</small></span></button>`;
  else if (m) html = `<a class="midia-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${icon('externalLink', 16)} Abrir demonstração</a>`;
  else if (animacaoDe(e.id)) html = animHtml(e.id, `class="midia-img midia-anim" alt="Animação: ${nome}, posição inicial e final" width="400" height="270"`);
  else html = `<div class="midia-vazia">${icon('dumbbell', 22)}<p>Sem animação para este exercício. Se quiser, cole abaixo o link de um GIF ou vídeo.</p></div>`;
  return html + videos;
}

/** Em que dia do plano o exercício está (e a prescrição de lá). */
function noPlano(exId) {
  for (const d of state.treino.plano?.dias || []) {
    const item = d.itens.find(i => i.ex === exId);
    if (item) return { dia: d, item };
  }
  return null;
}

function renderDetalhe() {
  const e = acharEx(state.aberto);
  if (!e) return $('ex-dialog').close();
  $('ex-title').textContent = e.nome;
  $('ex-sub').textContent = [NOME_GRUPO[e.grupo], e.equipamento, e.nivel !== 'Meu' ? e.nivel : 'Meu exercício'].join(' · ');
  const fav = $('ex-fav');
  fav.innerHTML = icon('star', 18);
  fav.classList.toggle('is-on', !!e.extra.fav);
  fav.setAttribute('aria-pressed', !!e.extra.fav);
  fav.setAttribute('aria-label', e.extra.fav ? 'Tirar dos favoritos' : 'Favoritar');
  $('ex-editar').hidden = !e.proprio;
  $('ex-excluir').hidden = !e.proprio;
  document.querySelectorAll('.ex-abas [data-aba]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === state.aba)));
  const n = state.treino.hist[e.id]?.length;
  document.querySelector('.ex-abas [data-aba="hist"]').textContent = n ? `Histórico (${n})` : 'Histórico';
  renderAddTreino(e);
  $('ex-body').innerHTML = state.aba === 'hist' ? histHtml(e) : comoHtml(e);
  const f = $('reg-form');
  if (f) enhanceDateInput(f.data);
}

function comoHtml(e) {
  const lista = (titulo, itens, ordenada = false) => itens.length ? `<h3 class="ex-h">${titulo}</h3><${ordenada ? 'ol' : 'ul'} class="ex-ul">${itens.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</${ordenada ? 'ol' : 'ul'}>` : '';
  return `
    <div class="ex-cols">
      <div class="midia" id="midia">${midiaHtml(e)}</div>
      <div class="ex-texto">
        ${lista('Como fazer', e.passos, true)}
        ${lista('Dicas', e.dicas)}
        ${lista('Erros comuns', e.erros)}
        ${e.secundarios.length ? `<p class="ex-sec">Também trabalha: ${e.secundarios.map(g => NOME_GRUPO[g]).join(', ')}.</p>` : ''}
      </div>
    </div>
    <form class="ex-meu" id="ex-meu" autocomplete="off">
      <label class="field"><span class="field-label">Link do GIF, imagem ou vídeo <span class="opcional">(opcional${animacaoDe(e.id) ? ': substitui a animação' : ''})</span></span>
        <input class="input" name="midia" type="url" maxlength="${LIMITES.midia}" value="${escapeHtml(e.extra.midia || '')}" placeholder="https://"></label>
      <label class="field"><span class="field-label">Minhas anotações <span class="opcional">(opcional)</span></span>
        <textarea class="input" name="nota" rows="2" maxlength="${LIMITES.nota}" placeholder="Ex.: sinto mais no ombro se abrir muito os cotovelos">${escapeHtml(e.extra.nota || '')}</textarea></label>
      <div class="ex-meu-foot"><button class="btn btn-primary btn-sm" type="submit">Salvar</button></div>
    </form>`;
}

/* ---------- Histórico de um exercício ---------- */

const ultimaTxt = r => (r.carga ? `${fmtKg(r.carga)} × ${r.reps}` : `${r.reps} ${r.reps === 1 ? 'rep' : 'reps'}`);
const SETA = { subir: 'chevronUp', reduzir: 'chevronDown', manter: 'minus', comecar: 'flag' };
const ROTULO = { subir: 'Subir carga', reduzir: 'Reduzir', manter: 'Manter', comecar: 'Começar' };

/** Linha da carga ao longo do tempo (só com 2+ registros com carga). */
function sparkline(regs, w = 220, h = 44) {
  const pts = regs.filter(r => r.carga).slice().reverse();
  if (pts.length < 2) return '';
  const min = Math.min(...pts.map(r => r.carga)), max = Math.max(...pts.map(r => r.carga));
  const xy = pts.map((r, i) => [4 + i * (w - 8) / (pts.length - 1), h - 6 - (max === min ? 0.5 : (r.carga - min) / (max - min)) * (h - 12)]);
  const [lx, ly] = xy[xy.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Carga de ${fmtKg(pts[0].carga)} a ${fmtKg(pts[pts.length - 1].carga)}">
    <polyline points="${xy.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" fill="currentColor"/></svg>`;
}

function sugestaoHtml(s) {
  if (!s) return '';
  return `<div class="sugestao is-${s.tipo}"><span class="sugestao-tag">${icon(SETA[s.tipo], 14)}${ROTULO[s.tipo]}</span><p>${escapeHtml(s.texto)}</p></div>`;
}

function histHtml(e) {
  const regs = state.treino.hist[e.id] || [];
  const p = noPlano(e.id);
  const item = p?.item || null;
  const sug = proximaCarga(regs, item, e);
  const ult = regs[0];
  const fx = faixa(item?.reps);
  const ajustes = regs.find(r => r.ajustes)?.ajustes || '';
  const cargaPadrao = sug?.carga ?? ult?.carga ?? '';
  return `
    ${p ? `<p class="hist-plano">${icon('listChecks', 14)} No seu treino ${p.dia.id}: <b>${p.item.series} × ${escapeHtml(p.item.reps.replace('-', '–'))}</b>${p.item.descanso ? ` · descanso ${p.item.descanso}s` : ''}</p>` : ''}
    ${sugestaoHtml(sug)}
    <form class="reg-form" id="reg-form" autocomplete="off">
      <div class="reg-grid">
        <label class="field"><span class="field-label">Data</span><input class="input" name="data" type="date" value="${hoje()}" max="${hoje()}" required></label>
        <label class="field"><span class="field-label">Carga (kg)</span><input class="input num" name="carga" type="number" inputmode="decimal" min="0" max="${LIM_TREINO.carga}" step="0.5" value="${cargaPadrao}" placeholder="0 = sem carga"></label>
        <label class="field"><span class="field-label">Séries</span><input class="input num" name="series" type="number" inputmode="numeric" min="1" max="20" step="1" value="${item?.series || ult?.series || 3}" required></label>
        <label class="field"><span class="field-label">${fx?.tempo ? 'Segundos' : 'Repetições'} <span class="opcional">(série mais fraca)</span></span><input class="input num" name="reps" type="number" inputmode="numeric" min="0" max="999" step="1" placeholder="${fx ? `${fx.min}–${fx.max}` : '10'}" required></label>
      </div>
      <label class="field"><span class="field-label">Ajustes do aparelho <span class="opcional">(fica salvo para a próxima)</span></span>
        <input class="input" name="ajustes" maxlength="${LIM_TREINO.ajustes}" value="${escapeHtml(ajustes)}" placeholder="Ex.: banco 4, assento 3, pegada aberta"></label>
      <label class="field"><span class="field-label">Observação <span class="opcional">(opcional)</span></span>
        <input class="input" name="nota" maxlength="${LIM_TREINO.nota}" placeholder="Ex.: última série com ajuda"></label>
      <div class="ex-meu-foot"><button class="btn btn-primary btn-sm" type="submit">${icon('plus', 14)} Registrar</button></div>
    </form>
    ${regs.length ? `
      <div class="hist-resumo">
        <div><span>Última</span><strong class="num">${ultimaTxt(ult)}</strong><small>${fmtData(ult.data)}</small></div>
        ${progressoHtml(regs)}
        <div class="hist-spark">${sparkline(regs)}</div>
      </div>
      <ol class="hist-lista">${regs.map(r => `
        <li>
          <span class="hist-data num">${fmtData(r.data)}</span>
          <span class="hist-val"><strong class="num">${ultimaTxt(r)}</strong> · ${r.series} ${r.series === 1 ? 'série' : 'séries'}
            ${r.ajustes ? `<small>${icon('sliders', 12)} ${escapeHtml(r.ajustes)}</small>` : ''}
            ${r.nota ? `<small>${escapeHtml(r.nota)}</small>` : ''}</span>
          <button class="icon-btn danger" type="button" data-del-reg="${escapeHtml(r.id)}" aria-label="Apagar registro de ${fmtData(r.data)}">${icon('trash', 14)}</button>
        </li>`).join('')}
      </ol>` : '<p class="hist-vazio">Nenhum registro ainda. Depois do treino, anote a carga e quantas repetições saíram: a próxima carga aparece aqui.</p>'}`;
}

/** Evolução da carga do primeiro ao último registro. */
function progressoHtml(regs, tag = 'div') {
  const comCarga = regs.filter(r => r.carga);
  if (comCarga.length < 2) return '';
  const ini = comCarga[comCarga.length - 1].carga, fim = comCarga[0].carga;
  const d = fim - ini;
  return `<${tag} class="${d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''}"><span>Evolução</span><strong class="num">${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtKg(Math.abs(d))}</strong><small>${ini ? `${d >= 0 ? '+' : '−'}${fmtNum(Math.abs(d / ini * 100))}% desde ${fmtData(comCarga[comCarga.length - 1].data)}` : ''}</small></${tag}>`;
}

function registrar(f) {
  const exId = state.aberto;
  const reps = Number(f.reps.value);
  if (f.reps.value === '' || !Number.isInteger(reps) || reps < 0) return f.reps.reportValidity();
  if (!f.data.value || f.data.value > hoje()) return f.data.reportValidity();
  // O mesmo objeto que vai ao banco (arrayRemove compara o objeto inteiro ao apagar)
  const reg = sanitizeReg({
    id: uid(), data: f.data.value, carga: Math.max(0, Math.round((Number(f.carga.value) || 0) * 10) / 10),
    series: Math.min(20, Math.max(1, Math.round(Number(f.series.value) || 1))), reps,
    ajustes: f.ajustes.value.trim(), nota: f.nota.value.trim()
  });
  const regs = state.treino.hist[exId] || [];
  if (regs.length >= LIM_TREINO.regs) return showToast(`Até ${LIM_TREINO.regs} registros por exercício: apague os mais antigos.`, 'error');
  gravarHist(exId, [reg, ...regs].sort((a, b) => b.data.localeCompare(a.data)), addReg(user.uid, exId, reg));
  const s = proximaCarga(state.treino.hist[exId], noPlano(exId)?.item, acharEx(exId));
  showToast(`Registrado: ${ultimaTxt(reg)}.${s?.tipo === 'subir' ? ' Próximo treino: subir a carga.' : ''}`, 'success');
}

/** Mostra `regs` na hora e espera a escrita (`gravacao`); se falhar, volta ao que era. */
function gravarHist(exId, regs, gravacao) {
  const prev = state.treino.hist[exId];
  if (regs.length) state.treino.hist[exId] = regs; else delete state.treino.hist[exId];
  renderTudo();
  return persist(gravacao, () => {
    if (prev) state.treino.hist[exId] = prev; else delete state.treino.hist[exId];
    renderTudo();
  });
}

/* ---------- Adicionar ao treino (no detalhe) ---------- */

function renderAddTreino(e) {
  const el = $('add-treino');
  const plano = state.treino.plano;
  if (!plano) { el.innerHTML = ''; return; }
  const em = plano.dias.filter(d => d.itens.some(i => i.ex === e.id)).map(d => d.id);
  const livres = plano.dias.filter(d => !em.includes(d.id));
  el.innerHTML = `
    ${em.length ? `<span class="add-treino-em">${icon('check', 13)} No treino ${em.join(', ')}</span>` : ''}
    ${livres.length ? `<span class="add-treino-rot">${em.length ? 'Também em' : 'Adicionar ao treino'}</span>${livres.map(d => `<button type="button" class="btn btn-ghost btn-sm add-dia" data-add-dia="${d.id}" title="Adicionar ao treino ${d.id}: ${escapeHtml(d.nome)}">${d.id}</button>`).join('')}` : ''}`;
}

function adicionarAoDia(exId, diaId) {
  const plano = structuredClone(state.treino.plano);
  const dia = plano.dias.find(d => d.id === diaId);
  if (dia.itens.length >= LIM_TREINO.itens) return showToast(`Até ${LIM_TREINO.itens} exercícios por dia.`, 'error');
  const ex = acharEx(exId);
  dia.itens.push({ ex: exId, ...prescricao(exId, plano.perfil.nivel), carga: 0 });
  gravarPlano(plano, `${ex.nome} entrou no treino ${diaId}.`);
}

/* ---------- Meu treino ---------- */

function gravarPlano(plano, msg, desfazer = true) {
  const prev = state.treino.plano;
  state.treino.plano = plano;
  if (plano && !plano.dias.some(d => d.id === state.dia)) state.dia = plano.dias[0].id;
  renderTudo();
  persist(savePlano(user.uid, plano), () => { state.treino.plano = prev; renderTudo(); })
    .then(ok => ok && msg && showToast(msg, 'success', 6000, desfazer && prev ? {
      label: 'Desfazer',
      onClick: () => gravarPlano(prev, null, false)
    } : undefined));
}

const radio = (grupo, valor, atual, html) =>
  `<button type="button" role="radio" class="opcao" data-q="${grupo}" data-v="${valor}" aria-checked="${valor === atual}">${html}</button>`;

function renderPerfil() {
  const p = state.perfil;
  $('q-nivel').innerHTML = NIVEIS.map(n => radio('nivel', n.id, p.nivel, `<strong>${n.nome}</strong><small>${n.desc}</small>`)).join('');
  $('q-genero').innerHTML = GENEROS.map(g => radio('genero', g.id, p.genero, `<strong>${g.nome}</strong>`)).join('');
  const indicada = p.nivel ? divisaoIndicada(p.nivel) : '';
  $('q-divisao').innerHTML = DIVISOES.map(d => radio('divisao', d.id, p.divisao, `
    <strong>${d.nome}${d.para.includes(p.nivel) ? `<span class="badge-indicado">${d.id === indicada ? 'Indicado' : 'Também serve'}</span>` : ''}</strong>
    <small class="opcao-freq">${d.freq}</small><small>${d.desc}</small>`)).join('');
  const f = $('perfil-form');
  if (document.activeElement !== f.peso) f.peso.value = p.peso || '';
  $('perfil-cancelar').hidden = !state.treino.plano;
}

function renderTreino() {
  const plano = state.treino.plano;
  const form = !plano || state.refazendo;
  $('perfil-form').hidden = !form;
  $('plano').hidden = form;
  $('btn-refazer').hidden = form;
  if (form) {
    $('treino-sub').textContent = plano ? 'Refaça as respostas: o plano novo substitui o atual (o histórico de cargas continua).' : 'Responda quatro perguntas e o DataLife monta uma divisão pronta, com séries, repetições e carga para começar.';
    return renderPerfil();
  }
  const { perfil, dias } = plano;
  const div = DIVISOES.find(d => d.id === perfil.divisao);
  $('treino-sub').textContent = `${div.nome} · ${div.freq} · ${NIVEIS.find(n => n.id === perfil.nivel).nome} · ${perfil.peso} kg`;
  if (!dias.some(d => d.id === state.dia)) state.dia = proximoDia(dias);
  $('dias-seg').hidden = dias.length < 2;
  $('dias-seg').innerHTML = dias.map(d => `<button type="button" role="radio" data-dia="${d.id}" aria-checked="${d.id === state.dia}" title="${escapeHtml(d.nome)}">${dias.length > 1 ? `Treino ${d.id}` : 'Treino'}</button>`).join('');
  $('dias-dica').textContent = dias.length > 1 ? `Sequência: ${dias.map(d => d.id).join(' → ')}, e recomeça.` : 'Um dia de descanso entre os treinos.';
  const dia = dias.find(d => d.id === state.dia);
  $('dia-titulo').textContent = dias.length > 1 ? `Treino ${dia.id} · ${dia.nome}` : dia.nome;
  const series = dia.itens.reduce((a, i) => a + i.series, 0);
  $('dia-meta').textContent = `${dia.itens.length} exercícios · ${series} séries`;
  $('plano-lista').innerHTML = dia.itens.map(item => {
    const e = acharEx(item.ex);
    if (!e) return '';
    const regs = state.treino.hist[e.id] || [];
    const s = proximaCarga(regs, item, e);
    const feitoHoje = regs[0]?.data === hoje();
    return `
      <li class="plano-item ${feitoHoje ? 'is-feito' : ''}" data-ex="${escapeHtml(e.id)}">
        <button type="button" class="plano-abrir" data-abrir="${escapeHtml(e.id)}">
          ${animacaoDe(e.id) && !e.extra.midia ? animHtml(e.id, 'class="plano-thumb" alt="" loading="lazy" width="64" height="44"') : `<span class="plano-thumb is-icon" aria-hidden="true">${icon('dumbbell', 18)}</span>`}
          <span class="plano-info">
            <strong>${escapeHtml(e.nome)}</strong>
            <span class="plano-presc num">${item.series} × ${escapeHtml(item.reps.replace('-', '–'))}${item.descanso ? ` · ${item.descanso}s descanso` : ''}</span>
          </span>
          <span class="plano-carga">
            ${regs[0] ? `<strong class="num">${ultimaTxt(regs[0])}</strong><small>${feitoHoje ? 'hoje' : fmtData(regs[0].data)}</small>`
              : item.carga ? `<strong class="num">~${fmtKg(item.carga)}</strong><small>para começar</small>` : '<small>peso do corpo</small>'}
            ${s && s.tipo !== 'comecar' ? `<span class="tag-prog is-${s.tipo}" title="${escapeHtml(s.texto)}">${icon(SETA[s.tipo], 12)}${ROTULO[s.tipo]}${s.carga && s.tipo !== 'manter' ? ` ${fmtKg(s.carga)}` : ''}</span>` : ''}
          </span>
        </button>
        <span class="plano-acoes">
          <button type="button" class="btn btn-ghost btn-sm" data-registrar="${escapeHtml(e.id)}">${feitoHoje ? icon('check', 14) : icon('plus', 14)} Registrar</button>
          <button type="button" class="icon-btn" data-tirar="${escapeHtml(e.id)}" aria-label="Tirar ${escapeHtml(e.nome)} do treino ${dia.id}">${icon('x', 15)}</button>
        </span>
      </li>`;
  }).join('') || '<li class="ex-vazio">Nenhum exercício neste dia. Adicione pela aba Exercícios.</li>';
}

/** Sugere o dia seguinte ao último treinado (pela data do último registro de cada dia). */
function proximoDia(dias) {
  let ultimo = null, data = '';
  for (const d of dias) {
    for (const i of d.itens) {
      const r = state.treino.hist[i.ex]?.[0];
      if (r && r.data > data) { data = r.data; ultimo = d; }
    }
  }
  if (!ultimo) return dias[0].id;
  if (data === hoje()) return ultimo.id; // treino de hoje em andamento
  return dias[(dias.indexOf(ultimo) + 1) % dias.length].id;
}

function montarPlano() {
  const f = $('perfil-form');
  const p = { ...state.perfil, peso: Math.round(Number(f.peso.value)) };
  const falta = !p.nivel ? 'q-nivel' : !p.genero ? 'q-genero' : !(p.peso >= 30 && p.peso <= 300) ? 'peso' : !p.divisao ? 'q-divisao' : '';
  if (falta === 'peso') { f.peso.setCustomValidity('Informe um peso entre 30 e 300 kg.'); f.peso.reportValidity(); f.peso.addEventListener('input', () => f.peso.setCustomValidity(''), { once: true }); return; }
  if (falta) {
    showToast('Responda todas as perguntas.', 'error');
    $(falta).querySelector('[role="radio"]')?.focus();
    return;
  }
  state.perfil = p;
  const dias = gerarPlano(p, acharEx);
  state.refazendo = false;
  state.dia = dias[0].id;
  gravarPlano({ perfil: p, dias }, `Treino ${DIVISOES.find(d => d.id === p.divisao).nome} montado.`);
  window.scrollTo(0, 0);
}

/* ---------- Histórico (aba) ---------- */

function renderHistorico() {
  const itens = Object.entries(state.treino.hist)
    .map(([id, regs]) => ({ e: acharEx(id), regs }))
    .filter(x => x.e)
    .sort((a, b) => b.regs[0].data.localeCompare(a.regs[0].data));
  if (!itens.length) {
    $('historico').innerHTML = `
      <div class="card hist-vazio-card">
        <span class="vazio-icon">${icon('trending', 22)}</span>
        <p><strong>Nenhuma carga registrada ainda.</strong></p>
        <p class="text-muted">Depois de cada exercício, toque em <b>Registrar</b> no <a href="#plan">Meu treino</a> (ou abra o exercício e vá em Histórico). Aqui aparece a evolução de cada um e os ajustes do aparelho.</p>
      </div>`;
    return;
  }
  const total = itens.reduce((a, x) => a + x.regs.length, 0);
  const semanas = new Set(itens.flatMap(x => x.regs.map(r => r.data))).size;
  $('historico').innerHTML = `
    <div class="kpis hist-kpis">
      <div class="kpi"><span class="kpi-label">Exercícios</span><strong class="kpi-value num">${itens.length}</strong></div>
      <div class="kpi"><span class="kpi-label">Registros</span><strong class="kpi-value num">${total}</strong></div>
      <div class="kpi"><span class="kpi-label">Dias de treino</span><strong class="kpi-value num">${semanas}</strong></div>
    </div>
    <ul class="hist-grid">${itens.map(({ e, regs }) => {
      const ajustes = regs.find(r => r.ajustes)?.ajustes;
      const s = proximaCarga(regs, noPlano(e.id)?.item, e);
      return `
        <li>
          <button type="button" class="card hist-card" data-hist="${escapeHtml(e.id)}">
            <span class="hist-card-head">
              <strong>${escapeHtml(e.nome)}</strong>
              <small>${NOME_GRUPO[e.grupo]} · ${regs.length} ${regs.length === 1 ? 'registro' : 'registros'}</small>
            </span>
            <span class="hist-card-nums">
              <span><small>Última · ${fmtData(regs[0].data)}</small><strong class="num">${ultimaTxt(regs[0])}</strong></span>
              ${progressoHtml(regs, 'span')}
            </span>
            <span class="hist-spark">${sparkline(regs, 260, 40)}</span>
            ${ajustes ? `<span class="hist-ajuste">${icon('sliders', 12)} ${escapeHtml(ajustes)}</span>` : ''}
            ${s && s.tipo !== 'comecar' ? `<span class="tag-prog is-${s.tipo}">${icon(SETA[s.tipo], 12)}${ROTULO[s.tipo]}${s.carga && s.tipo !== 'manter' ? ` ${fmtKg(s.carga)}` : ''}</span>` : ''}
          </button>
        </li>`;
    }).join('')}</ul>`;
}

/* ---------- Gravação (biblioteca) ---------- */

function gravar(mudar, msg) {
  const prev = structuredClone(state.dados);
  mudar(state.dados);
  renderLista();
  if (state.aberto) renderDetalhe();
  persist(saveDados(user.uid, state.dados), () => { state.dados = prev; renderLista(); if (state.aberto) renderDetalhe(); })
    .then(ok => ok && msg && showToast(msg));
}

function setExtra(id, patch) {
  gravar(d => {
    const p = d.proprios.find(x => x.id === id);
    const alvo = p || (d.extras[id] ||= {});
    Object.assign(alvo, patch);
    for (const k of Object.keys(patch)) if (!alvo[k]) delete alvo[k];
  });
}

function renderTudo() {
  renderLista();
  renderTreino();
  renderHistorico();
  if (state.aberto && $('ex-dialog').open) renderDetalhe();
}

function abrirExercicio(id, aba = 'como') {
  state.aberto = id;
  state.aba = aba;
  renderDetalhe();
  if (!$('ex-dialog').open) $('ex-dialog').showModal();
  if (aba === 'hist') $('reg-form')?.reps.focus();
}

/* ---------- Abas da página (via hash) ---------- */

const TAB_HASH = { '#library': 'biblioteca', '#plan': 'treino', '#history': 'historico' };
let abaAtual = null;

function showTab(e) {
  const tab = TAB_HASH[location.hash] || 'biblioteca';
  if (e && tab === abaAtual) return;
  abaAtual = tab;
  document.title = `${{ biblioteca: 'Exercícios', treino: 'Meu treino', historico: 'Histórico de cargas' }[tab]} · DataLife`;
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== `view-${tab}`; });
  document.querySelectorAll('.tab').forEach(t => {
    const ativa = t.dataset.tab === tab;
    t.classList.toggle('active', ativa);
    t.setAttribute('aria-selected', ativa);
  });
  moverIndicador();
  if (e) window.scrollTo(0, 0);
}

function moverIndicador() {
  const ativa = document.querySelector('.tab.active');
  if (!ativa) return;
  $('tab-indicator').style.transform = `translateX(${ativa.offsetLeft}px) scaleX(${ativa.offsetWidth})`;
  requestAnimationFrame(() => $('tab-indicator').classList.add('ready'));
}

/* ---------- Eventos ---------- */

function bind() {
  $('btn-proprio').innerHTML = `${icon('plus', 15)} Meu exercício`;
  document.querySelector('.search-icon').innerHTML = icon('search', 15);
  const eq = $('filtro-eq');
  eq.innerHTML = '<option value="">Todos os equipamentos</option>' + EQUIPAMENTOS.map(e => `<option>${e}</option>`).join('');
  enhanceSelect(eq);
  eq.addEventListener('change', () => { state.eq = eq.value; renderLista(); });
  $('busca').addEventListener('input', debounce(e => { state.busca = e.target.value; renderLista(); }, 120));
  $('so-favs').addEventListener('click', () => { state.favs = !state.favs; renderLista(); });

  const escolher = g => { state.grupo = state.grupo === g ? '' : g; pintarMapa(); renderLista(); };
  $('mapa').addEventListener('click', e => { const m = e.target.closest('[data-grupo]'); if (m) escolher(m.dataset.grupo); });
  $('mapa').addEventListener('pointerover', e => {
    const m = e.target.closest('[data-grupo]');
    $('mapa').querySelectorAll('.mus').forEach(x => x.classList.toggle('is-hover', !!m && x.dataset.grupo === m.dataset.grupo));
  });
  $('mapa').addEventListener('pointerleave', () => $('mapa').querySelectorAll('.is-hover').forEach(x => x.classList.remove('is-hover')));
  $('grupos').addEventListener('click', e => { const b = e.target.closest('[data-grupo]'); if (b) escolher(b.dataset.grupo); });
  $('mapa-todos').addEventListener('click', () => escolher(state.grupo));

  for (const id of ['ex-dialog', 'proprio-dialog']) {
    $(id).querySelector('.dialog-head [data-close]').innerHTML = icon('x', 18);
    $(id).querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(id).close()));
  }
  $('ex-dialog').addEventListener('close', () => { state.aberto = null; });
  $('ex-lista').addEventListener('click', e => {
    const c = e.target.closest('[data-id]');
    if (c) abrirExercicio(c.dataset.id);
  });
  $('ex-fav').addEventListener('click', () => {
    const e = acharEx(state.aberto);
    setExtra(e.id, { fav: !e.extra.fav });
  });
  document.querySelector('.ex-abas').addEventListener('click', e => {
    const b = e.target.closest('[data-aba]');
    if (!b || b.dataset.aba === state.aba) return;
    state.aba = b.dataset.aba;
    renderDetalhe();
  });
  $('add-treino').addEventListener('click', e => {
    const b = e.target.closest('[data-add-dia]');
    if (b) adicionarAoDia(state.aberto, b.dataset.addDia);
  });
  $('ex-body').addEventListener('click', e => {
    const yt = e.target.closest('[data-yt]');
    if (yt) {
      yt.outerHTML = `<div class="midia-frame"><iframe title="Vídeo do exercício" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt.dataset.yt)}?autoplay=1&rel=0&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
      return;
    }
    const del = e.target.closest('[data-del-reg]');
    if (del) {
      const exId = state.aberto;
      const regs = state.treino.hist[exId] || [];
      const reg = regs.find(r => r.id === del.dataset.delReg);
      gravarHist(exId, regs.filter(r => r !== reg), removeReg(user.uid, exId, reg));
      showToast(`Registro de ${fmtData(reg.data)} apagado.`, 'success', 6000, {
        label: 'Desfazer',
        onClick: () => gravarHist(exId, [...(state.treino.hist[exId] || []), reg].sort((a, b) => b.data.localeCompare(a.data)), addReg(user.uid, exId, reg))
      });
    }
  });
  $('ex-body').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'reg-form') return registrar(f);
    const url = f.midia.value.trim();
    if (url && !midiaDe(url)) {
      f.midia.setCustomValidity('Use um link que comece com https://');
      f.midia.reportValidity();
      f.midia.addEventListener('input', () => f.midia.setCustomValidity(''), { once: true });
      return;
    }
    setExtra(state.aberto, { midia: midiaDe(url)?.url || '', nota: f.nota.value.trim() });
    showToast('Salvo no exercício.');
  });

  // Meu treino
  $('perfil-form').addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    state.perfil[b.dataset.q] = b.dataset.v;
    // Ao escolher a experiência, já marca a divisão indicada (se nenhuma foi escolhida)
    if (b.dataset.q === 'nivel' && !state.perfil.divisao) state.perfil.divisao = divisaoIndicada(b.dataset.v);
    state.perfil.peso = $('perfil-form').peso.value;
    renderPerfil();
    $('perfil-form').querySelector(`[data-q="${b.dataset.q}"][data-v="${b.dataset.v}"]`)?.focus();
  });
  $('perfil-form').addEventListener('submit', e => { e.preventDefault(); montarPlano(); });
  $('btn-refazer').addEventListener('click', () => {
    state.refazendo = true;
    state.perfil = { ...state.treino.plano.perfil };
    renderTreino();
  });
  $('perfil-cancelar').addEventListener('click', () => { state.refazendo = false; renderTreino(); });
  $('dias-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-dia]');
    if (b) { state.dia = b.dataset.dia; renderTreino(); $('dias-seg').querySelector(`[data-dia="${state.dia}"]`)?.focus(); }
  });
  $('plano-lista').addEventListener('click', e => {
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) return abrirExercicio(abrir.dataset.abrir);
    const reg = e.target.closest('[data-registrar]');
    if (reg) return abrirExercicio(reg.dataset.registrar, 'hist');
    const tirar = e.target.closest('[data-tirar]');
    if (tirar) {
      const plano = structuredClone(state.treino.plano);
      const dia = plano.dias.find(d => d.id === state.dia);
      dia.itens = dia.itens.filter(i => i.ex !== tirar.dataset.tirar);
      gravarPlano(plano, `${acharEx(tirar.dataset.tirar).nome} saiu do treino ${dia.id}.`);
    }
  });
  $('historico').addEventListener('click', e => {
    const c = e.target.closest('[data-hist]');
    if (c) abrirExercicio(c.dataset.hist, 'hist');
  });

  // Exercício próprio
  const pf = $('proprio-form');
  pf.grupo.innerHTML = GRUPOS.map(g => `<option value="${g.id}">${g.nome}</option>`).join('');
  pf.equipamento.innerHTML = EQUIPAMENTOS.map(e => `<option>${e}</option>`).join('');
  enhanceSelect(pf.grupo);
  enhanceSelect(pf.equipamento);
  const abrirProprio = p => {
    state.editando = p;
    pf.reset();
    pf.nome.value = p?.nome || '';
    pf.grupo.value = p?.grupo || state.grupo || 'peito';
    pf.equipamento.value = p?.equipamento || 'Halteres';
    pf.passos.value = (p?.passos || []).join('\n');
    pf.midia.value = p?.midia || '';
    $('proprio-dialog').showModal();
  };
  $('btn-proprio').addEventListener('click', () => abrirProprio(null));
  $('ex-editar').addEventListener('click', () => {
    const p = state.dados.proprios.find(x => x.id === state.aberto);
    $('ex-dialog').close();
    abrirProprio(p);
  });
  pf.addEventListener('submit', e => {
    e.preventDefault();
    if (!pf.nome.value.trim()) return pf.nome.reportValidity();
    if (pf.midia.value.trim() && !midiaDe(pf.midia.value)) {
      pf.midia.setCustomValidity('Use um link que comece com https://');
      pf.midia.reportValidity();
      pf.midia.addEventListener('input', () => pf.midia.setCustomValidity(''), { once: true });
      return;
    }
    if (!state.editando && state.dados.proprios.length >= LIMITES.proprios) return showToast(`Até ${LIMITES.proprios} exercícios próprios.`, 'error');
    const dados = {
      id: state.editando?.id || uid(),
      nome: pf.nome.value.trim().slice(0, LIMITES.nome),
      grupo: pf.grupo.value,
      equipamento: pf.equipamento.value,
      passos: pf.passos.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, LIMITES.passos),
      midia: midiaDe(pf.midia.value)?.url || '',
      nota: state.editando?.nota || '',
      fav: state.editando?.fav || false
    };
    $('proprio-dialog').close();
    gravar(d => {
      const i = d.proprios.findIndex(x => x.id === dados.id);
      if (i >= 0) d.proprios[i] = dados; else d.proprios.push(dados);
    }, state.editando ? 'Exercício salvo.' : `${dados.nome} adicionado.`);
  });
  $('ex-excluir').addEventListener('click', () => {
    const p = state.dados.proprios.find(x => x.id === state.aberto);
    $('ex-dialog').close();
    gravar(d => { d.proprios = d.proprios.filter(x => x.id !== p.id); });
    showToast(`${p.nome} excluído.`, 'success', 8000, { label: 'Desfazer', onClick: () => gravar(d => { d.proprios.push(p); }) });
  });

  window.addEventListener('hashchange', showTab);
  window.addEventListener('resize', moverIndicador);
  document.fonts?.ready.then(moverIndicador);
}

initPagina();
bind();
renderMapa();
showTab();
try {
  [state.dados, state.treino] = await Promise.all([fetchDados(user.uid), fetchTreino(user.uid)]);
  if (state.treino.plano) state.perfil = { ...state.treino.plano.perfil };
  dadosProntos();
} catch (e) {
  console.error(e);
  showToast(e?.code === 'permission-denied'
    ? 'Sem permissão para ler seus treinos: publique as regras do Firestore.'
    : 'Não foi possível carregar seus treinos e anotações. Verifique a conexão e recarregue a página.', 'error', 6000);
}
renderTudo();
