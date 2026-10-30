/* ============================================
   DataLife — Diário: persistência
   ============================================
   users/{uid}/diario/{YYYY-MM-DD}   uma entrada por dia:
     { texto, humor: 1–5 | 0 (sem registro), tags: [..], gratidao: [3 textos],
       atualizado: ms }
   users/{uid}/settings/diario
     { tags: [..] }   // atividades personalizadas (além das sugeridas)

   Leitura por ano (cada documento lido conta na cota do Firestore): a
   página abre com o ano atual e o anterior; outros anos chegam quando
   você navega até eles, e a busca lê tudo só na primeira vez que é usada.
   O "neste dia" de anos não carregados lê só aquela data.

   Com o cadeado ligado (cripto.js) cada entrada vai cifrada: { c, atualizado }.
   ============================================ */

import { fs, LOCAL_MODE, ref, col, commitInBatches, lsRead, lsWrite, lsRemove, lsList, DAY_RE } from './store.js';
import { abrir, selar, cifrado, iniciarCofre, lerConfig, limparConfig, adotarConfig, foraDoCadeado } from './cripto.js';

export const LIMITES = { texto: 20000, tag: 30, tags: 12, gratidao: 200, cadastro: 40 };
export const HUMORES = [
  { n: 1, nome: 'Péssimo' },
  { n: 2, nome: 'Ruim' },
  { n: 3, nome: 'Ok' },
  { n: 4, nome: 'Bom' },
  { n: 5, nome: 'Ótimo' }
];
export const TAGS_PADRAO = ['Trabalho', 'Família', 'Amigos', 'Exercício', 'Leitura', 'Estudo', 'Descanso', 'Natureza', 'Viagem', 'Saúde'];

/* ---------- Validação ---------- */

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const limpaTags = v => (Array.isArray(v)
  ? [...new Set(v.map(t => str(t, LIMITES.tag).trim()).filter(Boolean))].slice(0, LIMITES.tags)
  : []);

export function entradaVazia() {
  return { texto: '', humor: 0, tags: [], gratidao: ['', '', ''], atualizado: 0 };
}

function sanitizeEntrada(raw) {
  const e = entradaVazia();
  if (!raw || typeof raw !== 'object') return e;
  e.texto = str(raw.texto, LIMITES.texto);
  e.humor = Number.isInteger(raw.humor) && raw.humor >= 1 && raw.humor <= 5 ? raw.humor : 0;
  e.tags = limpaTags(raw.tags);
  const g = Array.isArray(raw.gratidao) ? raw.gratidao : [];
  e.gratidao = [0, 1, 2].map(i => str(g[i], LIMITES.gratidao));
  e.atualizado = Number.isSafeInteger(raw.atualizado) && raw.atualizado > 0 ? raw.atualizado : 0;
  return e;
}

/** Entrada sem nada escrito nem marcado não vira documento. */
export const temConteudo = e => !!(e.texto.trim() || e.humor || e.tags.length || e.gratidao.some(g => g.trim()));

function assertDay(key) {
  if (!DAY_RE.test(key)) throw new Error(`Dia inválido: ${key}`);
}

/* ---------- API ---------- */

/** Todas as entradas: Map(dia -> entrada), só as que têm conteúdo. */
export async function fetchEntradas(uid) {
  const entries = LOCAL_MODE
    ? lsList('diario')
    : (await fs.getDocs(col(uid, 'diario'))).docs.map(d => [d.id, d.data()]);
  return limpar(entries);
}

/** Documentos crus (cifrados ou não), para o backup não precisar da senha. */
export async function fetchEntradasCruas(uid) {
  return LOCAL_MODE
    ? lsList('diario').filter(([k]) => DAY_RE.test(k))
    : (await fs.getDocs(col(uid, 'diario'))).docs.map(d => [d.id, d.data()]);
}

/** Decifra (se preciso) e valida. Entrada que não abre fica de fora, com aviso no console. */
async function abrirEntrada(k, raw) {
  try {
    return sanitizeEntrada(await abrir(raw));
  } catch (e) {
    if (e.message === 'trancado') throw e;
    console.warn(`Entrada ${k} não pôde ser decifrada.`);
    return null;
  }
}

async function limpar(entries) {
  const ok = entries.filter(([k]) => DAY_RE.test(k));
  const abertas = await Promise.all(ok.map(([k, raw]) => abrirEntrada(k, raw)));
  return new Map(ok.map(([k], i) => [k, abertas[i]]).filter(([, e]) => e && temConteudo(e)));
}

/** Documento como vai para o banco (cifrado se o cadeado estiver ligado). */
async function paraDoc(uid, e) {
  await iniciarCofre(uid);
  return selar(e, ['atualizado']);
}

/** Entradas entre dois dias (inclusive): Map(dia -> entrada). */
export async function fetchEntradasEntre(uid, de, ate) {
  if (LOCAL_MODE) return limpar(lsList('diario').filter(([k]) => k >= de && k <= ate));
  const q = fs.query(col(uid, 'diario'), fs.where(fs.documentId(), '>=', de), fs.where(fs.documentId(), '<=', ate));
  return limpar((await fs.getDocs(q)).docs.map(d => [d.id, d.data()]));
}

/** Entradas de um ano. */
export const fetchEntradasAno = (uid, ano) => fetchEntradasEntre(uid, `${ano}-01-01`, `${ano}-12-31`);

/** Primeiro dia escrito (uma leitura), ou null. Limita a navegação entre anos. */
export async function fetchPrimeiroDia(uid) {
  if (LOCAL_MODE) return lsList('diario').map(([k]) => k).filter(k => DAY_RE.test(k)).sort()[0] || null;
  const snap = await fs.getDocs(fs.query(col(uid, 'diario'), fs.orderBy(fs.documentId()), fs.limit(1)));
  return snap.empty ? null : snap.docs[0].id;
}

/** Uma entrada só (ou null). */
export async function fetchEntrada(uid, key) {
  assertDay(key);
  const raw = LOCAL_MODE
    ? lsList('diario').find(([k]) => k === key)?.[1]
    : await fs.getDoc(ref(uid, 'diario', key)).then(s => (s.exists() ? s.data() : null));
  const e = raw ? await abrirEntrada(key, raw) : null;
  return e && temConteudo(e) ? e : null;
}

/** Grava a entrada inteira do dia (ou apaga, se ficou vazia). */
export async function saveEntrada(uid, key, entrada) {
  assertDay(key);
  const e = sanitizeEntrada({ ...entrada, atualizado: Date.now() });
  if (!temConteudo(e)) {
    if (LOCAL_MODE) return lsRemove(`diario/${key}`);
    return fs.deleteDoc(ref(uid, 'diario', key));
  }
  const doc = await paraDoc(uid, e);
  if (LOCAL_MODE) return lsWrite(`diario/${key}`, doc);
  await fs.setDoc(ref(uid, 'diario', key), doc);
}

/**
 * Regrava todas as entradas no formato atual do cadeado (cifra ao ligar,
 * decifra ao desligar). `entradas` já abertas, Map(dia -> entrada).
 */
export async function regravarDiario(uid, entradas) {
  const docs = await Promise.all([...entradas].map(async ([k, e]) => [k, await paraDoc(uid, e)]));
  if (LOCAL_MODE) return docs.forEach(([k, d]) => lsWrite(`diario/${k}`, d));
  await commitInBatches(docs.map(([k, d]) => [ref(uid, 'diario', k), d]));
}

/** Regrava só as entradas fora do estado atual do cadeado (ver foraDoCadeado). @returns quantas */
export async function regravarForaDiario(uid) {
  await iniciarCofre(uid);
  const fora = foraDoCadeado(await fetchEntradasCruas(uid));
  const abertas = (await Promise.all(fora.map(async ([k, raw]) => [k, await abrirEntrada(k, raw)])))
    .filter(([, e]) => e && temConteudo(e));
  await regravarDiario(uid, abertas);
  return abertas.length;
}

export async function fetchTags(uid) {
  const raw = LOCAL_MODE
    ? lsRead('settings/diario')
    : await fs.getDoc(ref(uid, 'settings', 'diario')).then(s => (s.exists() ? s.data() : null));
  return Array.isArray(raw?.tags) ? limpaTags(raw.tags).concat().slice(0, LIMITES.cadastro) : [];
}

export async function saveTags(uid, tags) {
  const clean = [...new Set(tags.map(t => str(t, LIMITES.tag).trim()).filter(Boolean))].slice(0, LIMITES.cadastro);
  if (LOCAL_MODE) return lsWrite('settings/diario', { tags: clean });
  await fs.setDoc(ref(uid, 'settings', 'diario'), { tags: clean });
}

/* ---------- Backup ---------- */

export async function exportDiario(uid) {
  const [cruas, tags, cripto] = await Promise.all([fetchEntradasCruas(uid), fetchTags(uid), lerConfig(uid)]);
  // Cifradas saem cifradas: o arquivo de backup não expõe o que o cadeado protege
  const entradas = cruas.sort(([a], [b]) => a.localeCompare(b)).map(([key, raw]) => (cifrado(raw)
    ? { key, c: raw.c, atualizado: Number.isSafeInteger(raw.atualizado) ? raw.atualizado : 0 }
    : { key, ...sanitizeEntrada(raw) }))
    .filter(e => e.c || temConteudo(e));
  // A config do cadeado (sal + chave embrulhada) só serve com a senha: vai junto
  return { tags, entradas, ...(cripto ? { cripto } : {}) };
}

export function parseDiario(json) {
  if (!json || typeof json !== 'object') return null;
  return {
    tags: limpaTags(json.tags),
    cripto: limparConfig(json.cripto),
    entradas: Array.isArray(json.entradas)
      ? json.entradas.filter(e => DAY_RE.test(e?.key)).map(e => (cifrado(e)
        ? { key: e.key, c: String(e.c).slice(0, 120000), atualizado: Number.isSafeInteger(e.atualizado) ? e.atualizado : 0 }
        : { key: e.key, ...sanitizeEntrada(e) })).filter(e => e.c || temConteudo(e))
      : []
  };
}

/**
 * Mescla: dias sem entrada recebem a do backup; dias já escritos ficam como estão.
 * Entradas cifradas vão como estão: entram se o cadeado do arquivo é o
 * deste banco, ou se este banco não tem cadeado (a config do arquivo é
 * restaurada e abre com a senha antiga). Em claro, seguem o cadeado atual.
 */
export async function importDiario(uid, parsed) {
  // Cifradas só entram se o cadeado for o mesmo (ou se este banco ainda não tem um)
  const cadeado = parsed.cripto ? await adotarConfig(uid, parsed.cripto) : 'outro';
  const atuais = new Set((await fetchEntradasCruas(uid)).map(([k]) => k));
  const novas = parsed.entradas.filter(e => !atuais.has(e.key) && (!e.c || cadeado !== 'outro'));
  const docs = await Promise.all(novas.map(async ({ key, ...e }) => [key, e.c ? e : await paraDoc(uid, e)]));
  if (LOCAL_MODE) {
    for (const [key, d] of docs) lsWrite(`diario/${key}`, d);
  } else if (docs.length) {
    await commitInBatches(docs.map(([key, d]) => [ref(uid, 'diario', key), d]));
  }
  const tags = [...new Set([...(await fetchTags(uid)), ...parsed.tags])];
  await saveTags(uid, tags);
  return novas.length;
}
