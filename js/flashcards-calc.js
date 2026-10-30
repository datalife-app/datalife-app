/* ============================================
   DataLife — Flashcards: repetição espaçada (cálculos puros)
   ============================================
   Variante do SM-2 (Wozniak, 1987), a mesma família do Anki:
   - cada carta guarda o intervalo (dias) e a facilidade (ease, em %);
   - acertar multiplica o intervalo pela facilidade; errar volta a zero
     e a carta reaparece na mesma sessão;
   - "Difícil" e "Fácil" ajustam a facilidade para baixo e para cima.
   Um pouco de variação (±5%) espalha as revisões para não acumularem no
   mesmo dia. A variação vem da carta e do dia (não de Math.random): o
   intervalo mostrado no botão é exatamente o que fica gravado.

   O baralho em memória:
     { id, nome, desc, novosDia, criado, n, srs, hist, cartas }
     n: quantas cartas o baralho tem (a lista chega depois, ao abrir)
     srs: { idDaCarta: { rep, int, ease, venc, lapsos, ini, t } }
       só cartas já estudadas; ausente = carta nova
       rep: acertos seguidos · int: intervalo em dias · ease: facilidade × 100
       venc: próxima revisão · lapsos: esqueceu depois de aprender
       ini: primeira revisão · t: momento da última resposta (ms)
     hist: { 'YYYY-MM-DD': [revisões, acertos] }
     cartas: null (ainda não carregadas) ou [{ id, frente, verso, criado }]
   ============================================ */

import { shiftDay } from './utils.js';

export const NOTAS = [
  { id: 1, nome: 'Errei' },
  { id: 2, nome: 'Difícil' },
  { id: 3, nome: 'Bom' },
  { id: 4, nome: 'Fácil' }
];
export const EASE_INI = 250;
const EASE_MIN = 130;
const EASE_MAX = 400;
export const INT_MAX = 3650;
/** A partir de quantos dias de intervalo a carta conta como "madura" (convenção do Anki). */
export const MADURA = 21;

const SRS_NOVO = Object.freeze({ rep: 0, int: 0, ease: EASE_INI, venc: '', lapsos: 0, ini: '', t: 0 });
export const srsDe = (b, id) => b.srs[id] || SRS_NOVO;
export const ehNova = (b, id) => !b.srs[id];

/** Número pseudoaleatório estável em [0, 1) a partir de um texto (FNV-1a). */
function semente(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 2 ** 32;
}

function variar(dias, chave) {
  if (dias < 3) return dias;
  const d = Math.max(1, Math.round(dias * 0.05));
  return dias + Math.round((semente(chave) * 2 - 1) * d);
}

/**
 * Intervalos (em dias) de cada resposta. Errei = 0 (de novo nesta sessão).
 * `chave` (id da carta + dia) fixa a variação: o botão mostra o que será gravado.
 */
export function intervalos(s, chave = '') {
  if (s.rep === 0) return { 1: 0, 2: 1, 3: 1, 4: 4 };
  const base = Math.max(1, s.int);
  const dificil = Math.max(base + 1, Math.round(base * 1.2));
  const bom = Math.max(dificil + 1, s.rep === 1 ? 3 : Math.round(base * s.ease / 100));
  const facil = Math.max(bom + 1, s.rep === 1 ? 6 : Math.round(base * s.ease / 100 * 1.3));
  const v = (n, nota) => (chave ? variar(n, `${chave}:${nota}`) : n);
  // A variação nunca inverte a ordem dos botões
  const i2 = Math.min(INT_MAX, v(dificil, 2));
  const i3 = Math.min(INT_MAX, Math.max(i2 + 1, v(bom, 3)));
  const i4 = Math.min(INT_MAX, Math.max(i3 + 1, v(facil, 4)));
  return { 1: 0, 2: i2, 3: i3, 4: i4 };
}

/** Novo estado da carta depois de uma resposta (1–4). */
export function responder(s, nota, hoje, chave = '', agora = Date.now()) {
  const ease = d => Math.min(EASE_MAX, Math.max(EASE_MIN, s.ease + d));
  const base = { ...s, ini: s.ini || hoje, t: agora };
  if (nota === 1) {
    return { ...base, rep: 0, int: 0, venc: hoje, lapsos: s.lapsos + (s.rep > 0 ? 1 : 0), ease: s.rep > 0 ? ease(-20) : s.ease };
  }
  const int = intervalos(s, chave)[nota];
  return {
    ...base,
    rep: s.rep + 1,
    int,
    venc: shiftDay(hoje, int),
    ease: nota === 2 ? ease(-15) : nota === 4 ? ease(15) : s.ease
  };
}

/** "agora", "1 dia", "12 dias", "3 meses", "1,5 ano". */
export function rotuloIntervalo(dias) {
  if (dias <= 0) return 'agora';
  if (dias < 30) return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const m = Math.round(dias / 30);
  if (m < 12) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
  const a = Math.max(1, Math.round(dias / 36.5) / 10);
  return `${String(a).replace('.', ',')} ${a < 2 ? 'ano' : 'anos'}`;
}

/* ---------- Fila do dia ---------- */

/** Quantas cartas o baralho pede hoje: revisões vencidas e novas dentro do limite. Não precisa das cartas. */
export function contagem(b, hoje) {
  const estudadas = Object.values(b.srs);
  const revisar = estudadas.filter(s => s.venc <= hoje).length;
  const novasTotal = Math.max(0, b.n - estudadas.length);
  const novasHoje = estudadas.filter(s => s.ini === hoje).length;
  const novas = Math.min(novasTotal, Math.max(0, b.novosDia - novasHoje));
  return { revisar, novas, novasTotal, total: b.n };
}

/**
 * Ids da sessão: vencidas (as mais atrasadas primeiro), depois as novas na
 * ordem em que foram criadas. `extra` adianta novas além do limite do dia.
 */
export function filaDoDia(b, hoje, extra = 0) {
  const existe = new Set(b.cartas.map(c => c.id));
  const vencidas = Object.entries(b.srs)
    .filter(([id, s]) => existe.has(id) && s.venc <= hoje)
    .sort(([, x], [, y]) => x.venc.localeCompare(y.venc) || x.int - y.int)
    .map(([id]) => id);
  const { novas } = contagem(b, hoje);
  const novasFila = b.cartas.filter(c => !b.srs[c.id]).sort((x, y) => x.criado - y.criado).slice(0, novas + extra).map(c => c.id);
  return [...vencidas, ...novasFila];
}

/** Cartas por estado: novas, aprendendo, maduras. */
export function estados(b) {
  let aprendendo = 0, maduras = 0;
  for (const s of Object.values(b.srs)) {
    if (s.int >= MADURA) maduras++;
    else aprendendo++;
  }
  return { novas: Math.max(0, b.n - aprendendo - maduras), aprendendo, maduras };
}

/** Revisões previstas nos próximos `n` dias (as atrasadas entram em hoje). */
export function previsao(b, hoje, n = 7) {
  const dias = Array.from({ length: n }, (_, i) => ({ dia: shiftDay(hoje, i), n: 0 }));
  const indice = new Map(dias.map((d, i) => [d.dia, i]));
  for (const s of Object.values(b.srs)) {
    const i = s.venc <= hoje ? 0 : indice.get(s.venc);
    if (i !== undefined) dias[i].n++;
  }
  return dias;
}

/* ---------- Sincronização entre aparelhos ---------- */

/**
 * Junta o progresso daqui com o que veio do banco (outro aparelho):
 * - por carta, vence a resposta mais recente (t);
 * - carta sem progresso lá: fica a daqui só se foi respondida depois da
 *   gravação de lá (senão foi recomeçada ou excluída lá);
 * - histórico do dia: o maior dos dois (as contagens não se somam).
 * `daqui`: algo daqui venceu e precisa ser gravado.
 */
export function juntarProgresso(local, remoto, remotoEm) {
  let daqui = false; // algo daqui é mais novo: precisa ser gravado
  const srs = { ...remoto.srs };
  for (const [id, s] of Object.entries(local.srs)) {
    const r = remoto.srs[id];
    if (r ? s.t > r.t : s.t > remotoEm) { srs[id] = s; daqui = true; }
  }
  const hist = { ...remoto.hist };
  for (const [d, v] of Object.entries(local.hist)) {
    const r = hist[d];
    if (!r || v[0] > r[0]) { hist[d] = v; daqui = true; }
  }
  return { srs, hist, daqui };
}

/** Progresso só das cartas que existem, e n igual ao número de cartas. @returns true se mudou algo */
export function ajustarAoConteudo(b) {
  if (!b.cartas) return false;
  const ids = new Set(b.cartas.map(c => c.id));
  let mudou = b.n !== ids.size;
  b.n = ids.size;
  for (const id of Object.keys(b.srs)) if (!ids.has(id)) { delete b.srs[id]; mudou = true; }
  return mudou;
}

/* ---------- Histórico ---------- */

export function somarHist(baralhos) {
  const tot = {};
  for (const b of baralhos) {
    for (const [d, [n, ok]] of Object.entries(b.hist)) {
      const t = (tot[d] ||= [0, 0]);
      t[0] += n;
      t[1] += ok;
    }
  }
  return tot;
}

/** Dias seguidos com pelo menos uma revisão, terminando hoje (ou ontem, se hoje ainda não estudou). */
export function sequenciaEstudo(hist, hoje) {
  let d = hist[hoje] ? hoje : shiftDay(hoje, -1);
  let n = 0;
  while (hist[d]?.[0] > 0) { n++; d = shiftDay(d, -1); }
  return n;
}

/** Acertos (Difícil, Bom ou Fácil) sobre o total, nos últimos `dias` dias. */
export function taxaAcerto(hist, hoje, dias = 30) {
  const desde = shiftDay(hoje, -(dias - 1));
  let n = 0, ok = 0;
  for (const [d, [a, b]] of Object.entries(hist)) if (d >= desde && d <= hoje) { n += a; ok += b; }
  return n ? ok / n : null;
}

/* ---------- Importação de texto ---------- */

/** Texto de outras ferramentas (HTML do Anki, entidades) para texto simples. */
function limparHtml(s) {
  if (!/[<&]/.test(s)) return s;
  const doc = new DOMParser().parseFromString(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n'), 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n');
}

/**
 * Registros de um CSV/TSV: respeita "aspas", inclusive com quebra de linha
 * e "" dentro. Linhas começando com # (cabeçalho do Anki) são ignoradas.
 */
function registros(texto, sep) {
  const out = [];
  let campo = '', reg = [], aspas = false, inicio = true;
  const fecharReg = () => {
    reg.push(campo);
    if (reg.some(c => c.trim())) out.push(reg);
    reg = []; campo = ''; inicio = true;
  };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') aspas = false; else campo += ch;
      continue;
    }
    if (inicio && ch === '#') { // comentário até o fim da linha
      while (i + 1 < texto.length && texto[i + 1] !== '\n') i++;
      continue;
    }
    inicio = false;
    if (ch === '"' && !campo.trim()) { campo = ''; aspas = true; }
    else if (ch === sep) reg.push(campo), campo = '';
    else if (ch === '\n') fecharReg();
    else campo += ch;
  }
  if (campo || reg.length) fecharReg();
  return out;
}

const CABECALHOS = new Set(['frente', 'verso', 'front', 'back', 'pergunta', 'resposta', 'question', 'answer', 'termo', 'definicao', 'term', 'definition']);

/**
 * Uma carta por registro: "frente<TAB>verso" (exportação do Anki, planilhas)
 * ou "frente;verso". A primeira linha é pulada se for um cabeçalho
 * (Frente;Verso). Registros sem verso são ignorados. "\n" literal vira quebra de linha.
 * @returns {{ cartas: {frente, verso}[], ignoradas: number }}
 */
export function parseTexto(texto, max) {
  const t = String(texto).replace(/\r\n?/g, '\n');
  const sep = t.includes('\t') ? '\t' : ';';
  const regs = registros(t, sep);
  if (regs.length && regs[0].length >= 2 && regs[0].slice(0, 2).every(c => CABECALHOS.has(normalizar(c)))) regs.shift();
  const cartas = [];
  let ignoradas = 0;
  for (const r of regs) {
    const [f = '', v = ''] = r.map(x => limparHtml(x.replace(/\\n/g, '\n')).trim());
    if (!f || !v || f.length > max || v.length > max) { ignoradas++; continue; }
    cartas.push({ frente: f, verso: v });
  }
  return { cartas, ignoradas };
}

/** Normalização para comparar e buscar: sem acento, minúsculas, espaços simples. */
export const normalizar = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Carta repetida: mesma frente e mesmo verso (frentes iguais com respostas diferentes podem conviver). */
export const chaveCarta = c => `${normalizar(c.frente)}\u0000${normalizar(c.verso)}`;
