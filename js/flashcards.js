/* ============================================
   DataLife — Flashcards
   ============================================
   Referências: Anki e SuperMemo (repetição espaçada, quatro respostas
   com o próximo intervalo à vista), a caixa de Leitner (as cartas que
   você sabe sobem de caixa e aparecem cada vez menos) e o "efeito do
   teste": tentar lembrar antes de ver a resposta fixa mais que reler.

   Agnóstico de assunto: as cartas são suas (escritas aqui ou importadas
   de uma planilha / do Anki). Com o cadeado do Diário ligado, os
   baralhos vão cifrados como o resto do conteúdo pessoal.

   A lista lê só os baralhos e o progresso; as cartas de um baralho são
   lidas ao abri-lo. Os dois são ouvidos ao vivo: o que outro aparelho
   estuda ou edita chega sozinho, e o progresso é juntado carta a carta.

   Rotas: #  (baralhos) · #<id> (um baralho) · #<id>/estudar (sessão)
          #<id>/estudar/mais (adianta novas além do limite do dia)
   ============================================ */

import { requireAuth } from './auth.js';
import { initPagina, persist, dadosProntos } from './pagina.js';
import { exigirCofre, antesDeTrancar } from './cofre-ui.js';
import {
  ouvirBaralhos, ouvirCartas, saveMeta, saveBaralho, deleteBaralho, tamanho, novoIdCarta, LIMITES, NOVOS_DIA, TAMANHO_MAX
} from './flashcards-db.js';
import {
  NOTAS, srsDe, ehNova, intervalos, responder, rotuloIntervalo, contagem, filaDoDia, estados, previsao,
  juntarProgresso, ajustarAoConteudo, somarHist, sequenciaEstudo, taxaAcerto, parseTexto, normalizar, chaveCarta
} from './flashcards-calc.js';
import { icon, escapeHtml, showToast, uid, dayKey, fromDayKey } from './utils.js';

const $ = id => document.getElementById(id);
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const LISTA_MAX = 300; // cartas desenhadas de uma vez na lista (o resto, pela busca)
const MAIS_NOVAS = 10;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const user = await requireAuth();

const state = {
  hoje: dayKey(new Date()),
  baralhos: [],
  aberto: null,      // id do baralho na tela
  busca: '',
  editandoBar: null,
  editandoCarta: null,
  importando: [],    // cartas prontas para importar
  sessao: null,
  carregado: false,
  erro: null         // falha ao carregar os baralhos
};

const baralho = id => state.baralhos.find(b => b.id === id);
const clonar = b => structuredClone(b);
const excluidosAqui = new Set(); // para não avisar "excluído em outro aparelho" do que foi excluído aqui

/* ---------- Gravação ---------- */

function substituir(b) {
  const i = state.baralhos.findIndex(x => x.id === b.id);
  state.baralhos = i >= 0 ? state.baralhos.map(x => (x.id === b.id ? b : x)) : [...state.baralhos, b];
}

/**
 * Gravação otimista; `prev` (ou nada, se era novo) volta em caso de erro.
 * soMeta: só o baralho e o progresso (sem regravar as cartas).
 */
function gravar(b, prev, { soMeta = false } = {}) {
  substituir(b);
  render();
  return persist(soMeta ? saveMeta(user.uid, b) : saveBaralho(user.uid, b), () => {
    if (prev) substituir(prev);
    else state.baralhos = state.baralhos.filter(x => x.id !== b.id);
    render();
  });
}

/** As cartas ainda cabem num documento depois da mudança? Avisa se não. */
function cabe(b) {
  if (b.cartas.length > LIMITES.cartas) {
    showToast(`Um baralho guarda até ${LIMITES.cartas} cartas. Crie outro para o restante.`, 'error', 6000);
    return false;
  }
  if (tamanho(b.cartas) > TAMANHO_MAX) {
    showToast('O baralho chegou ao tamanho máximo. Divida o assunto em dois baralhos.', 'error', 6000);
    return false;
  }
  return true;
}

// Progresso do estudo: grava na hora, no máximo uma vez por segundo por página
// (limite do Firestore para o mesmo documento). Só o documento pequeno do baralho.
const pendentes = new Set();
let timer = 0, ultima = 0, gravando = Promise.resolve();
function agendar(id) {
  pendentes.add(id);
  if (timer) return;
  timer = setTimeout(salvarPendentes, Math.max(0, ultima + 1000 - Date.now()));
}
function salvarPendentes() {
  clearTimeout(timer);
  timer = 0;
  ultima = Date.now();
  const ids = [...pendentes];
  pendentes.clear();
  gravando = Promise.all(ids.map(id => {
    const b = baralho(id);
    return b ? persist(saveMeta(user.uid, b), null, 'Não foi possível salvar o progresso do estudo. Verifique sua conexão.') : null;
  }));
  return gravando;
}
antesDeTrancar.add(async () => { await salvarPendentes(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && pendentes.size) salvarPendentes(); });
window.addEventListener('pagehide', () => { if (pendentes.size) salvarPendentes(); });

/* ---------- Sincronização ---------- */

function aplicarBaralhos(lista) {
  for (const { tipo, id, b: remoto } of lista) {
    const local = baralho(id);
    if (tipo === 'removed') {
      if (!local) continue;
      state.baralhos = state.baralhos.filter(x => x.id !== id);
      pararCartas(id);
      if (state.sessao?.id === id) state.sessao = null;
      if (state.aberto === id && !excluidosAqui.has(id)) showToast(`${local.nome} foi excluído em outro aparelho.`, 'error', 6000);
      continue;
    }
    if (!remoto) continue; // não abriu (cifrado com outro cadeado): fica de fora
    if (!local) { state.baralhos.push(remoto); continue; }
    const { srs, hist, daqui } = juntarProgresso(local, remoto, remoto.em);
    Object.assign(local, { nome: remoto.nome, desc: remoto.desc, novosDia: remoto.novosDia, criado: remoto.criado, srs, hist });
    if (local.cartas && !local.semCartas) ajustarAoConteudo(local);
    else local.n = remoto.n;
    if (daqui) agendar(id); // havia respostas daqui mais novas: regrava a junção
  }
  state.baralhos.sort((a, b) => a.criado - b.criado);
  if (state.carregado) render();
}

const ouvintes = new Map(); // id do baralho -> ouvinte das cartas

/** Começa a ouvir as cartas do baralho (uma vez). Resolve quando chegarem. */
function garantirCartas(id) {
  if (!ouvintes.has(id)) {
    const o = ouvirCartas(user.uid, id, (cartas, ausente) => aplicarCartas(id, cartas, ausente), erroAoOuvir);
    ouvintes.set(id, o);
    o.pronto.catch(e => {
      ouvintes.delete(id);
      erroAoOuvir(e);
    });
  }
  return ouvintes.get(id).pronto;
}
function pararCartas(id) {
  ouvintes.get(id)?.parar();
  ouvintes.delete(id);
}

function aplicarCartas(id, cartas, ausente) {
  const b = baralho(id);
  if (!b) return;
  b.erroCartas = cartas === null; // não abriu: cifrado com outro cadeado
  b.cartas = cartas;
  b.semCartas = ausente;
  // n e progresso de cartas que não existem mais. Documento ausente não conta:
  // gravar o baralho agora recriaria um que outro aparelho acabou de excluir.
  if (!ausente && ajustarAoConteudo(b)) agendar(id);
  const s = state.sessao;
  if (s?.id === id && s.fila) {
    const c = cartaAtual();
    if (!c) mostrarCarta();
    else { $('carta-frente').textContent = c.frente; $('carta-verso').textContent = c.verso; }
  }
  if (state.carregado) render();
}

function erroAoOuvir(e) {
  console.error(e);
  showToast(e?.code === 'permission-denied'
    ? 'Sem permissão para ler os flashcards: publique as regras do Firestore.'
    : 'A conexão com os flashcards caiu. Recarregue a página para continuar sincronizando.', 'error', 7000);
}

/* ---------- Rotas ---------- */

function rota() {
  const [id, sub, mais] = location.hash.slice(1).split('/');
  let b = null;
  try { b = id && baralho(decodeURIComponent(id)); } catch { /* hash malformado (%E0…): volta à lista */ }
  if (id && !b) { history.replaceState(null, '', location.pathname); return { tela: 'lista' }; }
  if (b && sub === 'estudar') return { tela: 'estudo', b, extra: mais === 'mais' ? MAIS_NOVAS : 0 };
  if (b) return { tela: 'baralho', b };
  return { tela: 'lista' };
}

function render() {
  const r = rota();
  $('view-lista').hidden = r.tela !== 'lista';
  $('view-baralho').hidden = r.tela !== 'baralho';
  $('view-estudo').hidden = r.tela !== 'estudo';
  // Outro baralho: a busca do anterior não vale aqui
  if ((r.b?.id || null) !== state.aberto) { state.busca = ''; $('busca').value = ''; }
  state.aberto = r.b?.id || null;
  document.title = r.b ? `${r.b.nome} · Flashcards · DataLife` : 'Flashcards · DataLife';
  if (r.b) garantirCartas(r.b.id);
  if (r.tela === 'lista') renderLista();
  else if (r.tela === 'baralho') renderBaralho(r.b);
  else if (state.sessao?.id !== r.b.id) iniciarEstudo(r.b, r.extra);
}

function navegar() {
  if (!state.carregado) return;
  if (state.sessao && !location.hash.includes('/estudar')) encerrarSessao();
  render();
  window.scrollTo(0, 0);
}

/* ---------- Baralhos ---------- */

function renderLista() {
  $('btn-novo-baralho').hidden = !!state.erro;
  if (state.erro) {
    $('fc-resumo').hidden = true;
    $('fc-baralhos').innerHTML = `
      <li class="fc-vazio">
        <p><strong>Não foi possível carregar os baralhos.</strong></p>
        <p class="text-muted">${state.erro.code === 'permission-denied'
          ? 'O banco recusou a leitura: publique as regras do Firestore (firestore.rules) e recarregue.'
          : 'Verifique a conexão e recarregue a página. Nada foi apagado.'}</p>
        <button class="btn btn-primary" type="button" data-recarregar>Recarregar</button>
      </li>`;
    return;
  }
  const hist = somarHist(state.baralhos);
  const contas = state.baralhos.map(b => contagem(b, state.hoje));
  const paraHoje = contas.reduce((s, c) => s + c.revisar + c.novas, 0);
  const acerto = taxaAcerto(hist, state.hoje);
  const seq = sequenciaEstudo(hist, state.hoje);

  $('fc-resumo').hidden = !state.baralhos.length;
  $('fc-resumo').innerHTML = `
    <div><dt>Para hoje</dt><dd class="num">${paraHoje}</dd>${paraHoje ? '' : '<dd class="fc-sub">tudo em dia</dd>'}</div>
    <div><dt>Revisadas hoje</dt><dd class="num">${hist[state.hoje]?.[0] || 0}</dd></div>
    <div><dt>Sequência</dt><dd class="num">${seq}</dd><dd class="fc-sub">${seq === 1 ? 'dia estudando' : 'dias estudando'}</dd></div>
    <div><dt>Acerto em 30 dias</dt><dd class="num">${acerto == null ? '–' : `${Math.round(acerto * 100)}%`}</dd></div>`;

  $('fc-baralhos').innerHTML = state.baralhos.length
    ? state.baralhos.map((b, i) => {
      const c = contas[i];
      const n = c.revisar + c.novas;
      return `
      <li class="fc-bar">
        <a class="fc-bar-link" href="#${encodeURIComponent(b.id)}">
          <strong class="fc-bar-nome">${escapeHtml(b.nome)}</strong>
          ${b.desc ? `<span class="fc-bar-desc">${escapeHtml(b.desc)}</span>` : ''}
        </a>
        <dl class="fc-bar-nums">
          <div class="${c.revisar ? 'is-on' : ''}"><dt>Revisar</dt><dd class="num">${c.revisar}</dd></div>
          <div class="${c.novas ? 'is-on' : ''}"><dt>Novas</dt><dd class="num">${c.novas}</dd></div>
          <div><dt>Cartas</dt><dd class="num">${c.total}</dd></div>
        </dl>
        ${n
          ? `<a class="btn btn-primary btn-sm fc-bar-go" href="#${encodeURIComponent(b.id)}/estudar">${icon('play', 13)} Estudar</a>`
          : `<span class="fc-bar-ok">${c.total ? `${icon('check', 14)} Em dia` : 'Sem cartas'}</span>`}
      </li>`;
    }).join('')
    : `<li class="fc-vazio">
        <p><strong>Nenhum baralho ainda.</strong></p>
        <p class="text-muted">Crie um por assunto (um idioma, uma matéria, os termos do trabalho) e escreva as cartas, ou cole uma lista de uma planilha.</p>
        <button class="btn btn-primary" type="button" data-novo-baralho>${icon('plus', 16)} Criar o primeiro baralho</button>
      </li>`;
}

/* ---------- Um baralho ---------- */

function statusCarta(b, c) {
  const s = b.srs[c.id];
  if (!s) return '<span class="fc-st is-nova">Nova</span>';
  const d = Math.round((fromDayKey(s.venc) - fromDayKey(state.hoje)) / 86_400_000);
  if (d < 0) return `<span class="fc-st is-hoje">Atrasada ${plural(-d, 'dia', 'dias')}</span>`;
  if (d === 0) return '<span class="fc-st is-hoje">Hoje</span>';
  return `<span class="fc-st">Em ${rotuloIntervalo(d)}</span>`;
}

function renderBaralho(b) {
  const c = contagem(b, state.hoje);
  const n = c.revisar + c.novas;
  $('bar-nome').textContent = b.nome;
  $('bar-desc').textContent = b.desc || `${plural(b.novosDia, 'carta nova', 'cartas novas')} por dia.`;
  // Limite de novas do dia atingido, mas ainda há novas: dá para adiantar
  const adiantar = !n && c.novasTotal > 0;
  const est = $('btn-estudar');
  est.disabled = !n && !adiantar;
  est.dataset.mais = adiantar ? '1' : '';
  est.innerHTML = n ? `${icon('play', 14)} Estudar <span class="num">${n}</span>`
    : adiantar ? `${icon('plus', 15)} Mais novas` : `${icon('check', 15)} Em dia`;
  // Editar cartas precisa delas carregadas
  $('btn-nova-carta').disabled = $('btn-importar').disabled = !b.cartas;

  const prev = previsao(b, state.hoje);
  const max = Math.max(1, ...prev.map(p => p.n));
  $('fc-barras').innerHTML = prev.map((p, i) => `
    <li style="--h:${p.n / max}" class="${p.n ? '' : 'is-zero'}">
      <span class="fc-barra-n num">${p.n}</span>
      <span class="fc-barra" aria-hidden="true"></span>
      <span class="fc-barra-dia">${i === 0 ? 'hoje' : i === 1 ? 'amanhã' : SEMANA[fromDayKey(p.dia).getDay()]}</span>
    </li>`).join('');

  const e = estados(b);
  $('fc-estados').innerHTML = `
    <div><dt>Novas</dt><dd class="num">${e.novas}</dd></div>
    <div><dt>Aprendendo</dt><dd class="num">${e.aprendendo}</dd></div>
    <div><dt>Maduras</dt><dd class="num">${e.maduras}</dd></div>`;

  renderCartas(b);
}

function renderCartas(b) {
  if (!b.cartas) {
    $('cartas-count').textContent = b.n || '';
    $('fc-lista').innerHTML = `<li class="fc-vazio"><p class="text-muted">${b.erroCartas
      ? 'As cartas deste baralho estão cifradas com outro cadeado e não puderam ser abertas.'
      : 'Carregando as cartas…'}</p></li>`;
    return;
  }
  const q = normalizar(state.busca);
  const todas = [...b.cartas].sort((x, y) => y.criado - x.criado);
  const achadas = q ? todas.filter(c => normalizar(`${c.frente} ${c.verso}`).includes(q)) : todas;
  $('cartas-count').textContent = q ? `${achadas.length} de ${b.cartas.length}` : b.cartas.length || '';
  if (!b.cartas.length) {
    $('fc-lista').innerHTML = `
      <li class="fc-vazio">
        <p><strong>Baralho vazio.</strong></p>
        <p class="text-muted">Escreva a primeira carta ou cole várias de uma vez, uma por linha: <code>pergunta;resposta</code>.</p>
        <div class="fc-vazio-acoes">
          <button class="btn btn-primary" type="button" data-nova-carta>${icon('plus', 16)} Nova carta</button>
          <button class="btn btn-ghost" type="button" data-importar>${icon('upload', 15)} Importar</button>
        </div>
      </li>`;
    return;
  }
  if (!achadas.length) {
    $('fc-lista').innerHTML = `<li class="fc-vazio"><p class="text-muted">Nenhuma carta com “${escapeHtml(state.busca)}”.</p></li>`;
    return;
  }
  $('fc-lista').innerHTML = achadas.slice(0, LISTA_MAX).map(c => `
    <li><button type="button" class="fc-item" data-carta="${escapeHtml(c.id)}">
      <span class="fc-item-f">${escapeHtml(c.frente)}</span>
      <span class="fc-item-v">${escapeHtml(c.verso)}</span>
      ${statusCarta(b, c)}
    </button></li>`).join('')
    + (achadas.length > LISTA_MAX ? `<li class="fc-mais">Mostrando ${LISTA_MAX} de ${achadas.length}. Use a busca para achar as outras.</li>` : '');
}

/* ---------- Estudo ---------- */

/** Começa a sessão; sem as cartas ainda, espera por elas (fila = null). */
function iniciarEstudo(b, extra = 0) {
  state.sessao = { id: b.id, fila: null, feitas: 0, acertos: 0, concluidas: 0, virada: false, desfazer: null };
  $('estudo-nome').textContent = b.nome;
  $('estudo-voltar').href = `#${encodeURIComponent(b.id)}`;
  const montar = () => {
    const s = state.sessao, atual = baralho(b.id);
    if (s?.id !== b.id || s.fila || !atual?.cartas) return;
    s.fila = filaDoDia(atual, state.hoje, extra);
    mostrarCarta();
  };
  if (b.cartas) montar();
  else { mostrarCarta(); garantirCartas(b.id).then(montar, () => {}); }
}

function encerrarSessao() {
  salvarPendentes();
  state.sessao = null;
}

function cartaAtual() {
  const s = state.sessao;
  return s?.fila && baralho(s.id)?.cartas?.find(c => c.id === s.fila[0]);
}

function progresso() {
  const s = state.sessao;
  const total = s.concluidas + s.fila.length;
  $('estudo-conta').textContent = s.fila.length ? `${plural(s.fila.length, 'carta', 'cartas')} por ver` : '';
  $('estudo-prog').style.transform = `scaleX(${total ? s.concluidas / total : 1})`;
}

function mostrarCarta() {
  const s = state.sessao;
  if (!s.fila) { // carregando as cartas
    $('estudo-corpo').hidden = false;
    $('estudo-fim').hidden = true;
    $('carta-frente').textContent = 'Carregando as cartas…';
    $('carta-verso').hidden = true;
    $('fc-acoes').hidden = true;
    return;
  }
  $('fc-acoes').hidden = false;
  // Carta excluída no meio da sessão (aqui ou em outro aparelho): some da fila
  while (s.fila.length && !cartaAtual()) s.fila.shift();
  progresso();
  const c = cartaAtual();
  $('estudo-corpo').hidden = !c;
  $('estudo-fim').hidden = !!c;
  if (!c) return renderFim();
  s.virada = false;
  $('carta-frente').textContent = c.frente;
  $('carta-verso').textContent = c.verso;
  $('carta-verso').hidden = true;
  $('fc-carta').classList.toggle('is-nova', ehNova(baralho(s.id), c.id));
  $('btn-mostrar').hidden = false;
  $('fc-notas').hidden = true;
  $('btn-desfazer').hidden = !s.desfazer;
  $('btn-mostrar').focus({ preventScroll: true });
}

function revelar() {
  const s = state.sessao;
  const c = cartaAtual();
  if (!c || s.virada) return;
  s.virada = true;
  $('carta-verso').hidden = false;
  $('btn-mostrar').hidden = true;
  const ints = intervalos(srsDe(baralho(s.id), c.id), `${c.id}:${state.hoje}`);
  $('fc-notas').innerHTML = NOTAS.map(n => `
    <button type="button" class="fc-nota nota-${n.id}" data-nota="${n.id}">
      <strong>${n.nome}</strong><span class="num">${rotuloIntervalo(ints[n.id])}</span><kbd>${n.id}</kbd>
    </button>`).join('');
  $('fc-notas').hidden = false;
  $('fc-notas').querySelector('[data-nota="3"]').focus({ preventScroll: true });
}

function responderNota(nota) {
  const s = state.sessao;
  const b = baralho(s?.id);
  const c = cartaAtual();
  if (!c || !s.virada) return;
  // Na virada da meia-noite, a resposta conta no dia novo (e o intervalo mostrado continua valendo)
  const hoje = dayKey(new Date());
  const chave = `${c.id}:${state.hoje}`;
  state.hoje = hoje;
  s.desfazer = { cartaId: c.id, dia: hoje, srs: b.srs[c.id], hist: b.hist[hoje], fila: [...s.fila], feitas: s.feitas, acertos: s.acertos, concluidas: s.concluidas };
  b.srs[c.id] = responder(srsDe(b, c.id), nota, hoje, chave);
  const [n, ok] = b.hist[hoje] || [0, 0];
  b.hist[hoje] = [n + 1, ok + (nota > 1 ? 1 : 0)];
  s.feitas++;
  if (nota > 1) s.acertos++;
  s.fila.shift();
  // Errou: volta daqui a algumas cartas, ainda nesta sessão
  if (nota === 1) s.fila.splice(Math.min(3, s.fila.length), 0, c.id);
  else s.concluidas++;
  agendar(b.id);
  mostrarCarta();
}

function desfazer() {
  const s = state.sessao;
  const d = s?.desfazer;
  const b = baralho(s?.id);
  if (!d || !b?.cartas?.some(x => x.id === d.cartaId)) return;
  // O estado restaurado é a mudança mais recente: os outros aparelhos ficam com ele
  if (d.srs) b.srs[d.cartaId] = { ...d.srs, t: Date.now() };
  else delete b.srs[d.cartaId];
  if (d.hist) b.hist[d.dia] = d.hist; else delete b.hist[d.dia];
  Object.assign(s, { fila: d.fila, feitas: d.feitas, acertos: d.acertos, concluidas: d.concluidas, desfazer: null });
  agendar(b.id);
  mostrarCarta();
  revelar();
}

function renderFim() {
  const s = state.sessao;
  const b = baralho(s.id);
  const amanha = previsao(b, state.hoje, 2)[1].n;
  const extra = Math.min(MAIS_NOVAS, b.cartas.filter(c => !b.srs[c.id]).length);
  $('estudo-conta').textContent = '';
  $('estudo-fim').innerHTML = `
    <span class="fc-fim-icon" aria-hidden="true">${icon('check', 26)}</span>
    <h1>${s.feitas ? 'Sessão concluída' : 'Nada para revisar agora'}</h1>
    ${s.feitas ? `
      <dl class="fc-fim-nums">
        <div><dt>Respostas</dt><dd class="num">${s.feitas}</dd></div>
        <div><dt>Acerto</dt><dd class="num">${Math.round(s.acertos / s.feitas * 100)}%</dd></div>
        <div><dt>Amanhã</dt><dd class="num">${amanha}</dd></div>
      </dl>` : `<p>${amanha ? `Amanhã ${amanha === 1 ? 'volta 1 carta' : `voltam ${amanha} cartas`}.` : 'As próximas revisões ainda vão demorar alguns dias.'}</p>`}
    <p class="text-muted">Volte amanhã: espaçar as revisões é o que faz a memória durar.</p>
    <div class="fc-fim-acoes">
      <a class="btn btn-primary" href="#${encodeURIComponent(b.id)}">Voltar ao baralho</a>
      ${s.desfazer ? '<button class="btn btn-ghost" type="button" data-desfazer>Desfazer a última resposta</button>' : ''}
      ${extra ? `<button class="btn btn-ghost" type="button" data-extra="${extra}">Estudar mais ${plural(extra, 'nova', 'novas')}</button>` : ''}
    </div>`;
  $('estudo-fim').querySelector('.btn').focus({ preventScroll: true });
}

/* ---------- Diálogo do baralho ---------- */

function abrirBaralhoDialog(b) {
  state.editandoBar = b;
  const f = $('bar-form');
  f.reset();
  $('bar-title').textContent = b ? 'Ajustes do baralho' : 'Novo baralho';
  $('bar-excluir').hidden = !b;
  $('bar-excluir').disabled = !b?.cartas; // o Desfazer precisa das cartas na memória
  f.nome.value = b?.nome || '';
  f.desc.value = b?.desc || '';
  f.novosDia.value = b?.novosDia ?? NOVOS_DIA;
  $('bar-dialog').showModal();
  if (!b) f.nome.focus();
}

/* ---------- Diálogo da carta ---------- */

function abrirCartaDialog(c) {
  const b = baralho(state.aberto);
  if (!b?.cartas) return;
  state.editandoCarta = c;
  const f = $('carta-form');
  f.reset();
  $('carta-title').textContent = c ? 'Editar carta' : 'Nova carta';
  $('carta-sub').textContent = b.nome;
  $('carta-excluir').hidden = !c;
  $('carta-outra').hidden = !!c;
  $('carta-zerar-row').hidden = !c || ehNova(b, c.id);
  f.frente.value = c?.frente || '';
  f.verso.value = c?.verso || '';
  $('carta-dialog').showModal();
  f.frente.focus();
}

function salvarCarta(continuar) {
  const f = $('carta-form');
  const b = baralho(state.aberto);
  if (!b?.cartas) return;
  const frente = f.frente.value.trim();
  const verso = f.verso.value.trim();
  f.frente.setCustomValidity('');
  if (!frente) return f.frente.reportValidity();
  if (!verso) return f.verso.reportValidity();
  const editando = state.editandoCarta;
  const chave = chaveCarta({ frente, verso });
  if (b.cartas.some(c => c.id !== editando?.id && chaveCarta(c) === chave)) {
    f.frente.setCustomValidity('Já existe uma carta igual (mesma frente e mesmo verso) neste baralho.');
    return f.frente.reportValidity();
  }
  const prev = clonar(b);
  const next = clonar(b);
  if (editando) {
    Object.assign(next.cartas.find(x => x.id === editando.id), { frente, verso });
    if (f.zerar.checked) delete next.srs[editando.id];
  } else {
    next.cartas.push({ id: novoIdCarta(new Set(b.cartas.map(c => c.id))), frente, verso, criado: Date.now() });
  }
  ajustarAoConteudo(next);
  if (!cabe(next)) return;
  gravar(next, prev);
  if (state.sessao?.id === b.id && state.sessao.fila) {
    const virada = state.sessao.virada;
    mostrarCarta();
    if (virada) revelar();
  }
  if (continuar) {
    f.reset();
    f.frente.focus();
    showToast(`Carta salva em ${b.nome}.`);
  } else {
    $('carta-dialog').close();
  }
}

function excluirCarta() {
  const b = baralho(state.aberto);
  const c = state.editandoCarta;
  $('carta-dialog').close();
  const prev = clonar(b);
  const next = clonar(b);
  next.cartas = next.cartas.filter(x => x.id !== c.id);
  ajustarAoConteudo(next);
  gravar(next, prev);
  if (state.sessao?.id === b.id && state.sessao.fila) mostrarCarta();
  showToast('Carta excluída.', 'success', 8000, { label: 'Desfazer', onClick: () => gravar(prev, next) });
}

/* ---------- Importar ---------- */

function previaImportacao() {
  const b = baralho(state.aberto);
  const { cartas, ignoradas } = parseTexto($('imp-form').texto.value, LIMITES.texto);
  const vistas = new Set(b.cartas.map(chaveCarta));
  const novas = cartas.filter(c => { const k = chaveCarta(c); return !vistas.has(k) && vistas.add(k); });
  const repetidas = cartas.length - novas.length;
  state.importando = novas;
  const partes = [
    novas.length && `<strong>${plural(novas.length, 'carta nova', 'cartas novas')}</strong>`,
    repetidas && `${plural(repetidas, 'repetida', 'repetidas')} (já no baralho ou duas vezes no texto)`,
    ignoradas && `${plural(ignoradas, 'linha sem frente e verso', 'linhas sem frente e verso')}`
  ].filter(Boolean);
  $('imp-previa').innerHTML = partes.length ? `${partes.join(', ')}.` : '';
  $('imp-ok').disabled = !novas.length;
  $('imp-ok').textContent = novas.length ? `Importar ${novas.length}` : 'Importar';
}

function importar() {
  const b = baralho(state.aberto);
  const agora = Date.now();
  const ids = new Set(b.cartas.map(c => c.id));
  const prev = clonar(b);
  const next = clonar(b);
  // criado crescente: as novas entram no estudo na ordem do arquivo
  next.cartas.push(...state.importando.map((c, i) => ({ id: novoIdCarta(ids), ...c, criado: agora + i })));
  ajustarAoConteudo(next);
  if (!cabe(next)) return;
  $('imp-dialog').close();
  const n = state.importando.length;
  gravar(next, prev).then(ok => ok && showToast(`${plural(n, 'carta importada', 'cartas importadas')} para ${b.nome}.`));
}

/** UTF-8; se não for (CSV salvo pelo Excel no Windows), Windows-1252, para não estragar os acentos. */
async function lerTexto(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/* ---------- Eventos ---------- */

function fecharCom(dlg) {
  dlg.querySelector('.dialog-head [data-close]').innerHTML = icon('x', 18);
  dlg.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', () => dlg.close()));
}

function bind() {
  $('btn-novo-baralho').innerHTML = `${icon('plus', 16)} Novo baralho`;
  $('btn-nova-carta').innerHTML = `${icon('plus', 16)} Nova carta`;
  $('btn-importar').innerHTML = `${icon('upload', 15)} Importar`;
  $('btn-ajustes').innerHTML = `${icon('sliders', 15)} Ajustes`;
  $('imp-arquivo-btn').innerHTML = `${icon('upload', 14)} Escolher arquivo`;
  document.querySelector('.fc-busca-icon').innerHTML = icon('search', 15);
  $('btn-editar-atual').insertAdjacentHTML('afterend', '<button class="link-btn fc-desfazer" type="button" id="btn-desfazer" hidden>Desfazer a última resposta <kbd>Z</kbd></button>');
  ['bar-dialog', 'carta-dialog', 'imp-dialog'].forEach(id => fecharCom($(id)));

  window.addEventListener('hashchange', navegar);

  // Lista de baralhos e baralho aberto
  document.addEventListener('click', e => {
    if (e.target.closest('[data-novo-baralho]')) abrirBaralhoDialog(null);
    else if (e.target.closest('[data-nova-carta]')) abrirCartaDialog(null);
    else if (e.target.closest('[data-importar]')) $('btn-importar').click();
    else if (e.target.closest('[data-recarregar]')) location.reload();
  });
  $('btn-novo-baralho').addEventListener('click', () => abrirBaralhoDialog(null));
  $('btn-ajustes').addEventListener('click', () => abrirBaralhoDialog(baralho(state.aberto)));
  $('btn-nova-carta').addEventListener('click', () => abrirCartaDialog(null));
  $('btn-estudar').addEventListener('click', e => {
    location.hash = `${encodeURIComponent(state.aberto)}/estudar${e.currentTarget.dataset.mais ? '/mais' : ''}`;
  });
  $('fc-lista').addEventListener('click', e => {
    const item = e.target.closest('[data-carta]');
    if (item) abrirCartaDialog(baralho(state.aberto).cartas.find(c => c.id === item.dataset.carta));
  });
  $('busca').addEventListener('input', e => {
    state.busca = e.target.value;
    renderCartas(baralho(state.aberto));
  });

  // Baralho: criar, editar, excluir
  const fb = $('bar-form');
  fb.addEventListener('submit', e => {
    e.preventDefault();
    const nome = fb.nome.value.trim();
    if (!nome) return fb.nome.reportValidity();
    const atual = state.editandoBar ? baralho(state.editandoBar.id) : null;
    const prev = atual ? clonar(atual) : null;
    const b = {
      ...(prev || { id: uid(), criado: Date.now(), n: 0, em: 0, srs: {}, hist: {}, cartas: [] }),
      nome: nome.slice(0, LIMITES.nome),
      desc: fb.desc.value.trim().slice(0, LIMITES.desc),
      novosDia: Math.min(LIMITES.novosDia, Math.max(0, Math.round(Number(fb.novosDia.value) || 0)))
    };
    $('bar-dialog').close();
    // Novo: os dois documentos; ajustes: só o do baralho
    gravar(b, prev, { soMeta: !!prev }).then(ok => {
      if (!ok || prev) return;
      location.hash = encodeURIComponent(b.id);
      showToast(`${b.nome} criado. Agora, as cartas.`);
    });
  });
  $('bar-excluir').addEventListener('click', () => {
    const b = baralho(state.editandoBar.id);
    if (!b?.cartas) return;
    $('bar-dialog').close();
    excluidosAqui.add(b.id);
    state.baralhos = state.baralhos.filter(x => x.id !== b.id);
    pararCartas(b.id);
    history.replaceState(null, '', location.pathname);
    navegar();
    persist(deleteBaralho(user.uid, b.id), () => { substituir(b); render(); });
    showToast(`${b.nome} excluído, com ${plural(b.cartas.length, 'carta', 'cartas')}.`, 'success', 10000, { label: 'Desfazer', onClick: () => gravar(b, null) });
  });

  // Carta
  const fc = $('carta-form');
  fc.addEventListener('submit', e => { e.preventDefault(); salvarCarta(false); });
  $('carta-outra').addEventListener('click', () => salvarCarta(true));
  $('carta-excluir').addEventListener('click', excluirCarta);
  fc.frente.addEventListener('input', () => fc.frente.setCustomValidity(''));
  fc.verso.addEventListener('input', () => fc.frente.setCustomValidity(''));
  // Ctrl/⌘ + Enter salva (Enter sozinho quebra a linha)
  fc.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvarCarta(!state.editandoCarta); }
  });

  // Importar
  const fi = $('imp-form');
  $('btn-importar').addEventListener('click', () => {
    if (!baralho(state.aberto)?.cartas) return;
    fi.reset();
    previaImportacao();
    $('imp-dialog').showModal();
    fi.texto.focus();
  });
  fi.texto.addEventListener('input', previaImportacao);
  $('imp-arquivo-btn').addEventListener('click', () => $('imp-arquivo').click());
  $('imp-arquivo').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showToast('Arquivo grande demais (máximo de 2 MB).', 'error');
    fi.texto.value = await lerTexto(file);
    previaImportacao();
  });
  fi.addEventListener('submit', e => { e.preventDefault(); importar(); });

  // Estudo
  $('btn-mostrar').addEventListener('click', revelar);
  $('fc-notas').addEventListener('click', e => {
    const b = e.target.closest('[data-nota]');
    if (b) responderNota(Number(b.dataset.nota));
  });
  $('btn-editar-atual').addEventListener('click', () => { const c = cartaAtual(); if (c) abrirCartaDialog(c); });
  $('btn-desfazer').addEventListener('click', desfazer);
  $('estudo-fim').addEventListener('click', e => {
    const x = e.target.closest('[data-extra]');
    if (x) iniciarEstudo(baralho(state.sessao.id), Number(x.dataset.extra));
    else if (e.target.closest('[data-desfazer]')) desfazer();
  });
  document.addEventListener('keydown', e => {
    if ($('view-estudo').hidden || document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target.closest('input, textarea, select')) return;
    const s = state.sessao;
    if (!s) return;
    const k = e.key.toLowerCase();
    // Desfazer vale também na tela de fim (a última resposta da sessão)
    if (k === 'z' && s.desfazer) { e.preventDefault(); return desfazer(); }
    if (!cartaAtual()) return;
    if (k === ' ' || k === 'enter') {
      // Com o foco num botão, o próprio botão responde (Mostrar resposta, depois Bom)
      if (e.target.closest('button, a')) return;
      e.preventDefault();
      if (s.virada) responderNota(3); else revelar();
    } else if (s.virada && ['1', '2', '3', '4'].includes(k)) {
      e.preventDefault();
      responderNota(Number(k));
    } else if (k === 'e') {
      e.preventDefault();
      abrirCartaDialog(cartaAtual());
    }
  });

  // Virou o dia com a página aberta
  setInterval(() => {
    const t = dayKey(new Date());
    if (t !== state.hoje) { state.hoje = t; if (!state.sessao) render(); }
  }, 60_000);
}

/* ---------- Init ---------- */

initPagina();
bind();
// Cadeado: com ele ligado, nada é lido antes da senha
await exigirCofre(user);
try {
  await ouvirBaralhos(user.uid, aplicarBaralhos, erroAoOuvir).pronto;
} catch (e) {
  console.error(e);
  state.erro = e;
}
state.carregado = true;
if (state.erro) history.replaceState(null, '', location.pathname);
render();
dadosProntos();
