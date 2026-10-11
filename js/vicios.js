/* ============================================
   DataLife — Diário: aba Vícios
   ============================================
   Referências de apps de abandono de hábitos:
   - Quitzilla / I Am Sober: contador de dias livres, dinheiro e tempo
     economizados, conquistas por marco, e o "porquê" sempre à vista.
   - QuitNow: linha do tempo de benefícios à saúde (cigarro).
   - "Urge surfing" (Marlatt): registrar a vontade e deixar passar; a
     vontade costuma atingir o pico e ceder em 15 a 30 minutos.
   - Planos se-então (Gollwitzer): "se X acontecer, eu faço Y".
   Tom calmo, sem vermelho: recaída recomeça a sequência, não apaga o
   total de dias livres nem a maior sequência.

   Carregado só quando a aba é aberta (nenhuma leitura extra no Diário).
   ============================================ */

import { persist } from './pagina.js';
import {
  fetchVicios, saveVicio, deleteVicio, resumo, duracaoDias, nomeMarco, formatMinutos,
  TIPOS, MARCOS, BENEFICIOS_FUMO, LIMITES
} from './vicios-db.js';
import { enhanceDateInput } from './datepicker.js';
import {
  icon, escapeHtml, showToast, uid, dayKey, shiftDay, formatBRL, formatBRLRaw, parseBRL, bindCurrencyInput
} from './utils.js';

const $ = id => document.getElementById(id);
const fmtData = k => k.split('-').reverse().join('/');
const tipoDe = id => TIPOS.find(t => t.id === id) || TIPOS.at(-1);

let user = null;
const state = { vicios: [], hoje: dayKey(new Date()), editando: null, aberto: null, recaindo: null, tipo: 'outro', carregado: false };

/* ---------- Lista ---------- */

function anel(r) {
  const R = 52, C = 2 * Math.PI * R;
  return `
    <svg class="vic-anel" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="${R}" class="vic-anel-trilho"/>
      <circle cx="60" cy="60" r="${R}" class="vic-anel-feito" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - r.progresso)).toFixed(1)}" transform="rotate(-90 60 60)"/>
    </svg>`;
}

function contador(r) {
  if (r.atual < 1) return '<strong class="vic-num">0</strong><span class="vic-un">dias · começa hoje</span>';
  return `<strong class="vic-num">${r.atual}</strong><span class="vic-un">${r.atual === 1 ? 'dia livre' : 'dias livres'}</span>`;
}

function cartao(v) {
  const r = resumo(v, state.hoje);
  const t = tipoDe(v.tipo);
  const hojeVontades = v.vontades[state.hoje] || 0;
  return `
    <article class="vic-card" data-id="${escapeHtml(v.id)}">
      <header class="vic-head">
        <span class="vic-icon">${icon(t.icone, 18)}</span>
        <h2 class="vic-nome diario-priv">${escapeHtml(v.nome)}</h2>
        <button class="icon-btn" type="button" data-abrir aria-label="Detalhes de ${escapeHtml(v.nome)}">${icon('chevronRight', 18)}</button>
      </header>
      <div class="vic-centro">
        <div class="vic-ring" role="img" aria-label="${r.atual} dias livres${r.proximo ? `, próxima conquista em ${nomeMarco(r.proximo)}` : ''}">
          ${anel(r)}
          <div class="vic-ring-txt">${contador(r)}</div>
        </div>
        <p class="vic-prox">${r.proximo
          ? `Próxima conquista: <strong>${nomeMarco(r.proximo)}</strong> <span>(${r.proximo - r.atual === 1 ? 'falta 1 dia' : `faltam ${r.proximo - r.atual} dias`})</span>`
          : '<strong>Todas as conquistas</strong>'}</p>
      </div>
      <dl class="vic-stats">
        <div><dt>Economizado</dt><dd class="num">${v.custoDia ? formatBRL(r.economia) : '—'}</dd></div>
        <div><dt>Tempo de volta</dt><dd class="num">${v.minutosDia ? formatMinutos(r.minutos) : '—'}</dd></div>
        <div><dt>Maior sequência</dt><dd class="num">${duracaoDias(r.melhor)}</dd></div>
      </dl>
      ${v.motivos.length ? `<p class="vic-motivo diario-priv">${icon('heart', 14)}<span>${escapeHtml(v.motivos[(new Date().getDate()) % v.motivos.length])}</span></p>` : ''}
      <footer class="vic-acoes">
        <button class="btn btn-ghost btn-sm" type="button" data-vontade>${icon('waves', 16)} Senti vontade${hojeVontades ? ` <span class="vic-badge num">${hojeVontades}</span>` : ''}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-recaida>${icon('reset', 16)} Recomeçar</button>
      </footer>
    </article>`;
}

function render() {
  const body = $('vic-body');
  const ativos = state.vicios.filter(v => !v.arquivado);
  const arquivados = state.vicios.filter(v => v.arquivado);
  $('vic-novo').hidden = !state.vicios.length;
  if (!state.vicios.length) {
    body.innerHTML = `
      <div class="vazio">
        <span class="vazio-icon">${icon('sprout', 22)}</span>
        <h2>Um dia de cada vez</h2>
        <p>Anote o que você quer deixar para trás, por que, e o que fazer quando a vontade aparecer. O DataLife conta os dias livres, o dinheiro e o tempo que voltam para você.</p>
        <button class="btn btn-primary" type="button" data-novo>${icon('plus', 16)} Começar</button>
      </div>`;
    return;
  }
  body.innerHTML = `
    <div class="vic-grid">${ativos.map(cartao).join('')}</div>
    ${arquivados.length ? `
      <details class="vic-arquivo">
        <summary>Arquivados <span class="summary-count">${arquivados.length}</span></summary>
        <ul>${arquivados.map(v => `<li><button class="link-btn diario-priv" type="button" data-id="${escapeHtml(v.id)}" data-abrir>${escapeHtml(v.nome)}</button> <span class="text-muted">· ${duracaoDias(resumo(v, state.hoje).melhor)} de maior sequência</span></li>`).join('')}</ul>
      </details>` : ''}`;
}

/* ---------- Detalhe ---------- */

function vontadesRecentes(v) {
  const dias = Array.from({ length: 28 }, (_, i) => shiftDay(state.hoje, i - 27));
  const max = Math.max(1, ...dias.map(d => v.vontades[d] || 0));
  const total = dias.reduce((s, d) => s + (v.vontades[d] || 0), 0);
  return `
    <section class="vdet-sec">
      <h3>Vontades nas últimas 4 semanas <span class="text-muted num">${total}</span></h3>
      <div class="vont-barras" role="img" aria-label="${total} vontades registradas nas últimas 4 semanas">
        ${dias.map(d => { const n = v.vontades[d] || 0; return `<i style="--h:${n ? Math.max(0.12, n / max) : 0}" title="${fmtData(d)}: ${n}"></i>`; }).join('')}
      </div>
      <p class="vdet-dica">Cada vontade que passou sem recaída é uma vitória. Quando ela vier, respire, mude de lugar ou siga o seu plano: costuma ceder em 15 a 30 minutos.</p>
    </section>`;
}

/** 12 conquistas (grade 6×2 / 4×3 / 3×4), acompanhando quem já passou das primeiras. */
function janelaMarcos(r) {
  const i = MARCOS.indexOf(r.proximo ?? MARCOS.at(-1));
  const ini = Math.max(0, Math.min(MARCOS.length - 12, i - 8));
  return MARCOS.slice(ini, ini + 12);
}

function renderDetalhe() {
  const v = state.vicios.find(x => x.id === state.aberto);
  if (!v) return;
  const r = resumo(v, state.hoje);
  $('vdet-title').textContent = v.nome;
  $('vdet-sub').textContent = `${tipoDe(v.tipo).nome} · acompanhando desde ${fmtData(v.inicio)}`;
  $('vdet-arquivar').textContent = v.arquivado ? 'Reativar' : 'Arquivar';
  const benef = v.tipo === 'fumar' ? `
    <section class="vdet-sec">
      <h3>O que muda no corpo</h3>
      <ol class="benef">${BENEFICIOS_FUMO.map(b => `<li class="${r.atual >= b.dias ? 'is-feito' : ''}"><span class="num">${nomeMarco(b.dias)}</span><p>${b.texto}</p></li>`).join('')}</ol>
      <p class="vdet-dica">Fonte: INCA e OMS. Apoio gratuito para parar de fumar: Programa Nacional de Controle do Tabagismo, nas unidades do SUS.</p>
    </section>` : '';
  $('vdet-body').innerHTML = `
    <dl class="vdet-kpis">
      <div><dt>Agora</dt><dd>${duracaoDias(r.atual)}</dd></div>
      <div><dt>Dias livres no total</dt><dd class="num">${r.livres}${r.total ? ` <span>de ${r.total}</span>` : ''}</dd></div>
      <div><dt>Maior sequência</dt><dd>${duracaoDias(r.melhor)}</dd></div>
      <div><dt>Vontades vencidas</dt><dd class="num">${r.vontades} <span>nesta sequência</span></dd></div>
    </dl>

    <section class="vdet-sec">
      <h3>Por que parar</h3>
      ${v.motivos.length ? `<ul class="motivos diario-priv">${v.motivos.map(m => `<li>${icon('heart', 14)}<span>${escapeHtml(m)}</span></li>`).join('')}</ul>`
        : '<p class="text-muted">Nenhum motivo anotado. Em "Editar", escreva o que você ganha parando: lembrar disso na hora da vontade ajuda.</p>'}
    </section>

    <section class="vdet-sec">
      <h3>Plano se… então</h3>
      ${v.planos.length ? `<ul class="planos-lista diario-priv">${v.planos.map(p => `<li><span><em>Se</em> ${escapeHtml(p.se)}</span><span><em>então</em> ${escapeHtml(p.entao)}</span></li>`).join('')}</ul>`
        : '<p class="text-muted">Sem plano ainda. Ex.: "Se eu sentir vontade depois do almoço, então escovo os dentes e dou uma volta de 5 minutos."</p>'}
    </section>

    <section class="vdet-sec">
      <h3>Conquistas</h3>
      <ul class="marcos">${janelaMarcos(r).map(m => `<li class="${r.conquistas.includes(m) ? 'is-feito' : m === r.proximo ? 'is-prox' : ''}">${icon('award', 16)}<span>${nomeMarco(m)}</span></li>`).join('')}</ul>
    </section>

    ${benef}
    ${vontadesRecentes(v)}

    <section class="vdet-sec">
      <h3>Recomeços</h3>
      ${v.recaidas.length ? `<ul class="recaidas">${[...v.recaidas].reverse().map(x => `
        <li data-rec="${escapeHtml(x.id)}">
          <span class="num">${fmtData(x.data)}</span>
          <p class="diario-priv">${x.nota ? escapeHtml(x.nota) : '<span class="text-muted">Sem anotação</span>'}</p>
          <button class="icon-btn" type="button" data-del-rec aria-label="Apagar recomeço de ${fmtData(x.data)}">${icon('trash', 14)}</button>
        </li>`).join('')}</ul>`
        : '<p class="text-muted">Nenhum até agora.</p>'}
    </section>`;
}

/* ---------- Formulário ---------- */

function planoRow(p = { se: '', entao: '' }) {
  return `
    <div class="plano-row">
      <label><span>Se</span><input class="input diario-priv" name="se" maxlength="${LIMITES.plano}" value="${escapeHtml(p.se)}" placeholder="Ex.: sentir vontade depois do café"></label>
      <label><span>então</span><input class="input diario-priv" name="entao" maxlength="${LIMITES.plano}" value="${escapeHtml(p.entao)}" placeholder="Ex.: bebo água e saio para andar"></label>
      <button class="icon-btn" type="button" data-del-plano aria-label="Remover plano">${icon('x', 14)}</button>
    </div>`;
}

function renderTipos() {
  $('vic-tipos').innerHTML = TIPOS.map(t => `
    <button type="button" role="radio" class="tipo-chip" data-tipo="${t.id}" aria-checked="${state.tipo === t.id}">${icon(t.icone, 14)}${t.nome}</button>`).join('');
}

function abrirForm(v) {
  const f = $('vic-form');
  state.editando = v;
  f.reset();
  state.tipo = v?.tipo || 'outro';
  renderTipos();
  $('vic-title').textContent = v ? 'Editar' : 'Novo hábito';
  f.nome.value = v?.nome || '';
  f.inicio.value = v?.inicio || state.hoje;
  f.inicio.max = state.hoje;
  f.inicio.dispatchEvent(new Event('change'));
  f.custo.value = v?.custoDia ? formatBRLRaw(v.custoDia) : '';
  f.minutos.value = v?.minutosDia || '';
  f.motivos.value = (v?.motivos || []).join('\n');
  $('vic-planos').innerHTML = (v?.planos.length ? v.planos : [undefined]).map(planoRow).join('');
  $('vic-plano-add').hidden = (v?.planos.length || 1) >= LIMITES.planos;
  $('vic-dialog').showModal();
}

/* ---------- Gravação ---------- */

function salvar(v, prev) {
  state.vicios = prev ? state.vicios.map(x => (x.id === v.id ? v : x)) : [...state.vicios, v];
  render();
  if (state.aberto === v.id) renderDetalhe();
  return persist(saveVicio(user.uid, v), () => {
    state.vicios = prev ? state.vicios.map(x => (x.id === v.id ? prev : x)) : state.vicios.filter(x => x.id !== v.id);
    render();
    if (state.aberto === v.id) renderDetalhe();
  });
}

const atual = id => state.vicios.find(x => x.id === id);

function bind() {
  $('vic-novo').innerHTML = `${icon('plus', 16)} Novo hábito`;
  $('vic-plano-add').innerHTML = `${icon('plus', 14)} Outro plano`;
  $('vic-apoio').innerHTML = `${icon('info', 14)}<span>Se estiver difícil, você não precisa passar por isso sozinho. CAPS AD (SUS) atende álcool e outras drogas sem encaminhamento, e o CVV escuta 24 horas pelo <strong>188</strong>, de graça.</span>`;
  for (const id of ['vic-dialog', 'rec-dialog', 'vdet-dialog']) {
    $(id).querySelector('.dialog-head [data-close]').innerHTML = icon('x', 18);
    $(id).querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(id).close()));
  }
  $('vdet-dialog').addEventListener('close', () => { state.aberto = null; });

  const f = $('vic-form');
  bindCurrencyInput(f.custo);
  enhanceDateInput(f.inicio);
  const rf = $('rec-form');
  enhanceDateInput(rf.data);

  $('vic-novo').addEventListener('click', () => abrirForm(null));
  $('vic-tipos').addEventListener('click', e => {
    const b = e.target.closest('[data-tipo]');
    if (!b) return;
    state.tipo = b.dataset.tipo;
    renderTipos();
    if (!f.nome.value.trim() && state.tipo !== 'outro') f.nome.value = tipoDe(state.tipo).nome;
  });
  $('vic-plano-add').addEventListener('click', () => {
    $('vic-planos').insertAdjacentHTML('beforeend', planoRow());
    $('vic-plano-add').hidden = $('vic-planos').children.length >= LIMITES.planos;
    $('vic-planos').lastElementChild.querySelector('input').focus();
  });
  $('vic-planos').addEventListener('click', e => {
    const b = e.target.closest('[data-del-plano]');
    if (!b) return;
    const rows = $('vic-planos').children;
    if (rows.length === 1) rows[0].querySelectorAll('input').forEach(i => { i.value = ''; });
    else b.closest('.plano-row').remove();
    $('vic-plano-add').hidden = false;
  });

  f.addEventListener('submit', e => {
    e.preventDefault();
    const nome = f.nome.value.trim();
    if (!nome) return f.nome.reportValidity();
    if (!f.inicio.value || f.inicio.value > state.hoje) {
      f.inicio.setCustomValidity('Escolha uma data até hoje.');
      f.inicio.reportValidity();
      f.inicio.addEventListener('input', () => f.inicio.setCustomValidity(''), { once: true });
      return;
    }
    const prev = state.editando;
    const v = {
      ...(prev || { id: uid(), criado: Date.now(), recaidas: [], vontades: {}, arquivado: false }),
      nome: nome.slice(0, LIMITES.nome),
      tipo: state.tipo,
      inicio: f.inicio.value,
      custoDia: parseBRL(f.custo.value),
      minutosDia: Math.min(LIMITES.minutos, Math.max(0, Math.round(Number(f.minutos.value) || 0))),
      motivos: f.motivos.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, LIMITES.motivos),
      planos: [...$('vic-planos').children].map(row => ({ se: row.querySelector('[name="se"]').value.trim(), entao: row.querySelector('[name="entao"]').value.trim() }))
        .filter(p => p.se && p.entao)
    };
    $('vic-dialog').close();
    salvar(v, prev).then(ok => ok && showToast(prev ? 'Salvo.' : 'Contagem iniciada. Um dia de cada vez.'));
  });

  $('vic-body').addEventListener('click', e => {
    if (e.target.closest('[data-novo]')) return abrirForm(null);
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const v = atual(card.dataset.id);
    if (e.target.closest('[data-vontade]')) {
      const n = (v.vontades[state.hoje] || 0) + 1;
      salvar({ ...v, vontades: { ...v.vontades, [state.hoje]: n } }, v).then(ok => ok && showToast(
        n === 1 ? 'Anotado. A vontade passa: respire e siga o seu plano.' : `Anotado: ${n} vontades hoje, e você continua.`,
        'success', 6000,
        { label: 'Desfazer', onClick: () => { const cur = atual(v.id); if (!cur) return; const vs = { ...cur.vontades }; if (vs[state.hoje] > 1) vs[state.hoje]--; else delete vs[state.hoje]; salvar({ ...cur, vontades: vs }, cur); } }
      ));
      return;
    }
    if (e.target.closest('[data-recaida]')) {
      state.recaindo = v.id;
      rf.reset();
      rf.data.value = state.hoje;
      rf.data.min = v.inicio;
      rf.data.max = state.hoje;
      rf.data.dispatchEvent(new Event('change'));
      $('rec-dialog').showModal();
      return;
    }
    if (e.target.closest('[data-abrir]') || !e.target.closest('button, a')) {
      state.aberto = v.id;
      renderDetalhe();
      $('vdet-dialog').showModal();
    }
  });

  rf.addEventListener('submit', e => {
    e.preventDefault();
    const v = atual(state.recaindo);
    const data = rf.data.value;
    if (!v || !data || data > state.hoje || data < v.inicio) {
      rf.data.setCustomValidity(`Escolha uma data entre ${fmtData(v?.inicio || state.hoje)} e hoje.`);
      rf.data.reportValidity();
      rf.data.addEventListener('input', () => rf.data.setCustomValidity(''), { once: true });
      return;
    }
    const rec = { id: uid(), data, nota: rf.nota.value.trim().slice(0, LIMITES.nota) };
    const next = { ...v, recaidas: [...v.recaidas, rec].sort((a, b) => a.data.localeCompare(b.data)) };
    const { livres } = resumo(next, state.hoje);
    $('rec-dialog').close();
    salvar(next, v).then(ok => ok && showToast(
      livres > 0 ? `Recomeço anotado. ${livres === 1 ? 'O dia livre continua seu' : `Os ${livres} dias livres continuam seus`}.` : 'Recomeço anotado. Amanhã é o dia 1.',
      'success', 8000,
      { label: 'Desfazer', onClick: () => { const cur = atual(v.id); if (cur) salvar({ ...cur, recaidas: cur.recaidas.filter(x => x.id !== rec.id) }, cur); } }
    ));
  });

  $('vdet-body').addEventListener('click', e => {
    const b = e.target.closest('[data-del-rec]');
    if (!b) return;
    const v = atual(state.aberto);
    const id = b.closest('[data-rec]').dataset.rec;
    const rec = v.recaidas.find(x => x.id === id);
    salvar({ ...v, recaidas: v.recaidas.filter(x => x.id !== id) }, v);
    showToast(`Recomeço de ${fmtData(rec.data)} apagado.`, 'success', 6000, {
      label: 'Desfazer', onClick: () => { const cur = atual(v.id); if (cur) salvar({ ...cur, recaidas: [...cur.recaidas, rec].sort((a, c) => a.data.localeCompare(c.data)) }, cur); }
    });
  });
  $('vdet-editar').addEventListener('click', () => {
    const v = atual(state.aberto);
    $('vdet-dialog').close();
    abrirForm(v);
  });
  $('vdet-arquivar').addEventListener('click', () => {
    const v = atual(state.aberto);
    $('vdet-dialog').close();
    salvar({ ...v, arquivado: !v.arquivado }, v).then(ok => ok && showToast(v.arquivado ? `${v.nome} de volta.` : `${v.nome} arquivado.`));
  });
  $('vdet-excluir').addEventListener('click', () => {
    const v = atual(state.aberto);
    $('vdet-dialog').close();
    state.vicios = state.vicios.filter(x => x.id !== v.id);
    render();
    persist(deleteVicio(user.uid, v.id), () => { state.vicios.push(v); render(); });
    showToast(`${v.nome} excluído.`, 'success', 8000, { label: 'Desfazer', onClick: () => salvar(v, null) });
  });

  window.addEventListener('datalife:privacy', () => { render(); if (state.aberto) renderDetalhe(); });
  // Virada do dia com a página aberta
  setInterval(() => {
    const t = dayKey(new Date());
    if (t !== state.hoje) { state.hoje = t; render(); }
  }, 60000);
}

/** Primeira abertura da aba: liga os eventos e lê os dados. */
export async function initVicios(u) {
  if (state.carregado) return;
  state.carregado = true;
  user = u;
  bind();
  $('vic-body').innerHTML = '<div class="vic-carregando" aria-busy="true"></div>';
  try {
    state.vicios = await fetchVicios(user.uid);
  } catch (e) {
    console.error(e);
    showToast('Não foi possível carregar os hábitos. Verifique a conexão.', 'error', 6000);
  }
  render();
}

