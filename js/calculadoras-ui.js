/* ============================================
   DataLife — Calculadoras: peças comuns
   ============================================
   Formatação, campos do formulário e blocos de resultado (destaque,
   KPIs, composição, cenários, insights, tabela) usados pelos simuladores.
   ============================================ */

import { duracao } from './objetivos-calc.js';
import { icon, escapeHtml, formatBRL, formatBRLRaw, parseBRL } from './utils.js';

export const $ = id => document.getElementById(id);

// Cores por papel (tokens do tema): a mesma coisa tem a mesma cor em todos os simuladores
export const COR = {
  investido: 'var(--serie-gastos)',
  juros: 'var(--serie-ganhos)',
  saldo: 'var(--serie-ganhos)',
  retirado: 'var(--p-300)',
  pessimista: 'var(--text-dim)',
  otimista: 'var(--p-200)'
};
export const MILHAO = 100_000_000; // R$ 1.000.000,00 em centavos
export const INFLACAO = 0.04; // referência para "em dinheiro de hoje"

/* ---------- Formatação ---------- */

export const brl = c => formatBRL(Math.round(c));
export const pct = (n, d = 1) => `${(Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { maximumFractionDigits: d })}%`;
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Mês do calendário daqui a `i` meses: "out/2036". */
export function mesAno(i) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + i);
  return `${MESES_CURTOS[d.getMonth()]}/${d.getFullYear()}`;
}
export const tempo = m => (Number.isFinite(m) ? duracao(m) : 'mais de 100 anos');
/** "8,5" ou "8.5" -> 8.5; com vírgula, o ponto é separador de milhar ("1.200,5"). */
export const num = v => {
  const t = String(v).trim();
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
export const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

/* ---------- Campos ---------- */

export const campoBRL = (name, label, dica = '') => `
  <label class="field"><span class="field-label">${label}</span>
    <input class="input num" name="${name}" data-brl inputmode="numeric" placeholder="R$ 0,00" maxlength="22" autocomplete="off">
    ${dica ? `<span class="calc-dica">${dica}</span>` : ''}</label>`;
export const campoNum = (name, label, { sufixo = '', max = 999, dica = '' } = {}) => `
  <label class="field"><span class="field-label">${label}</span>
    <span class="calc-sufixo"><input class="input num" name="${name}" data-num data-max="${max}" inputmode="decimal" maxlength="7" autocomplete="off">${sufixo ? `<i>${sufixo}</i>` : ''}</span>
    ${dica ? `<span class="calc-dica">${dica}</span>` : ''}</label>`;
/** Número + controle segmentado de unidade (ao ano | ao mês, anos | meses). */
export const campoUnidade = (name, label, seg, opcoes, { max = 999 } = {}) => `
  <div class="field"><label class="field-label" for="f-${name}">${label}</label>
    <div class="calc-combo">
      <input class="input num" id="f-${name}" name="${name}" data-num data-max="${max}" inputmode="decimal" maxlength="7" autocomplete="off">
      <div class="segmented" role="radiogroup" aria-label="${label}: unidade" data-seg="${seg}">
        ${opcoes.map(([v, t]) => `<button type="button" role="radio" aria-checked="false" data-v="${v}">${t}</button>`).join('')}
      </div>
    </div></div>`;
export const UN_TAXA = [['a', 'ao ano'], ['m', 'ao mês']];
export const UN_TEMPO = [['a', 'anos'], ['m', 'meses']];

export function lerForm(f) {
  const v = {};
  f.querySelectorAll('[data-brl]').forEach(i => { v[i.name] = parseBRL(i.value); });
  f.querySelectorAll('[data-num]').forEach(i => { v[i.name] = Math.min(num(i.value), Number(i.dataset.max)); });
  f.querySelectorAll('[data-seg]').forEach(s => { v[s.dataset.seg] = s.querySelector('[aria-checked="true"]')?.dataset.v; });
  return v;
}

/** Marca a opção `val` num controle segmentado (só ela entra no Tab; as setas trocam). */
export function marcarSeg(seg, val) {
  seg.querySelectorAll('[data-v]').forEach(b => {
    const on = b.dataset.v === val;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

/** Preenche o formulário. Nomes desconhecidos (ex.: vindos da rota) são ignorados. */
export function preencher(f, valores) {
  const segs = new Map([...f.querySelectorAll('[data-seg]')].map(x => [x.dataset.seg, x]));
  for (const [k, val] of Object.entries(valores)) {
    if (segs.has(k)) { marcarSeg(segs.get(k), val); continue; }
    const inp = f.elements.namedItem(k);
    if (!(inp instanceof HTMLInputElement)) continue;
    if (inp.hasAttribute('data-brl')) inp.value = val ? formatBRLRaw(val) : '';
    else inp.value = val === '' || val == null ? '' : String(val).replace('.', ',');
  }
}

/* ---------- Blocos de resultado ---------- */

export const kpi = (label, valor, sub = '', cls = '') => `
  <div class="kpi ${cls}"><span class="kpi-label">${label}</span><strong class="kpi-value num">${valor}</strong>${sub ? `<span class="kpi-sub">${sub}</span>` : ''}</div>`;

export function hero(rotulo, valor, frase, extra = '') {
  return `<section class="calc-hero">
    <span class="calc-hero-label">${rotulo}</span>
    <strong class="calc-hero-valor num">${valor}</strong>
    <p class="calc-hero-frase">${frase}</p>${extra}</section>`;
}

/** Barra 100% com a composição do total (ex.: investido × juros), rotulada. */
export function composicao(partes) {
  const total = partes.reduce((a, p) => a + Math.max(0, p.v), 0) || 1;
  return `<div class="calc-comp" role="img" aria-label="${escapeHtml(partes.map(p => `${p.nome}: ${pct((p.v / total) * 100, 0)}`).join(', '))}">
    <div class="calc-comp-bar">${partes.filter(p => p.v > 0).map(p => `<i style="flex-grow:${p.v / total};background:${p.cor}"></i>`).join('')}</div>
    <ul class="calc-comp-leg">${partes.map(p => `<li><i style="background:${p.cor}"></i><span>${p.nome}</span><b class="num">${pct((Math.max(0, p.v) / total) * 100, 0)}</b><em class="num">${brl(p.v)}</em></li>`).join('')}</ul>
  </div>`;
}

export const legenda = itens => `<ul class="calc-legenda">${itens.map(([nome, cor, tracejada]) => `<li><i class="${tracejada ? 'is-dash' : ''}" style="--c:${cor}"></i>${nome}</li>`).join('')}</ul>`;

export function cardGrafico(id, titulo, sub, leg = '', nota = '') {
  return `<section class="card calc-card">
    <div class="calc-card-head"><div><h3 class="calc-card-title">${titulo}</h3>${sub ? `<p class="calc-card-sub">${sub}</p>` : ''}</div>${leg}</div>
    <div class="calc-chart" id="${id}"></div>
    ${nota ? `<p class="calc-nota">${nota}</p>` : ''}</section>`;
}

export const TOM = { ok: 'check', alerta: 'info', dica: 'lightbulb', marco: 'flag' };
export const TOM_ROTULO = { ok: 'Bom sinal', alerta: 'Atenção', dica: 'Dica', marco: 'Marco' };
export function insights(lista, titulo = 'O que esses números dizem') {
  const itens = lista.filter(Boolean);
  if (!itens.length) return '';
  return `<section class="calc-ins-wrap"><h3 class="calc-sec-title">${titulo}</h3><ul class="calc-insights">${itens.map(i => `
    <li class="calc-ins is-${i.tom || 'dica'}"><span class="calc-ins-icon" title="${TOM_ROTULO[i.tom || 'dica']}">${icon(TOM[i.tom || 'dica'], 16)}</span>
      <div><strong>${i.titulo}</strong><p>${i.texto}</p></div></li>`).join('')}</ul></section>`;
}

/** Barras horizontais de comparação ("E se…"); a linha atual fica destacada. */
export function cenarios(titulo, sub, todas) {
  const linhas = todas.filter(l => l && Number.isFinite(l.v)); // "infinito" não vira barra
  const max = Math.max(1, ...linhas.map(l => l.v));
  return `<section class="card calc-card"><div class="calc-card-head"><div><h3 class="calc-card-title">${titulo}</h3>${sub ? `<p class="calc-card-sub">${sub}</p>` : ''}</div></div>
    <ul class="calc-cen">${linhas.map(l => `
      <li class="${l.atual ? 'is-atual' : ''}"><span class="calc-cen-nome">${l.nome}</span>
        <span class="calc-cen-trilho"><i style="transform:scaleX(${Math.max(0.004, l.v / max)})"></i></span>
        <span class="calc-cen-val"><b class="num">${l.valor ?? brl(l.v)}</b>${l.sub ? `<em>${l.sub}</em>` : ''}</span></li>`).join('')}</ul></section>`;
}

export function tabela(titulo, cabecalho, linhas) {
  return `<details class="calc-tabela"><summary>${titulo}</summary>
    <div class="table-wrap"><table>
      <thead><tr>${cabecalho.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map(l => `<tr>${l.map((c, i) => `<td class="${i ? 'num' : ''}" data-label="${cabecalho[i]}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div></details>`;
}

/** Aviso curto acima do resultado (ex.: um campo foi ajustado). */
export const aviso = msg => `<p class="calc-aviso-topo">${icon('info', 15)}<span>${msg}</span></p>`;
/** Resultado grande demais para fazer sentido (e para o float). */
export const grande = () => vazio('Os valores passam de R$ 1 quatrilhão: a conta perde o sentido. Reduza a taxa ou o prazo (confira se a taxa não é ao mês).');

export const vazio = msg => `<p class="calc-vazio">${icon('info', 16)}${msg}</p>`;
export const link = (href, txt) => `<a class="link-btn calc-link" href="${href}">${txt} ${icon('arrowRight', 14)}</a>`;

/** Rótulo do eixo X e título da dica para uma linha do tempo em meses. */
export const rotuloTempo = i => (i === 0 ? 'hoje' : i % 12 === 0 ? `${i / 12}a` : `${i}m`);
export const tituloTempo = i => (i === 0 ? 'Hoje' : `${duracao(i)} · ${mesAno(i)}`);
