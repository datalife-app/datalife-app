/* ============================================
   DataLife — Flashcards: persistência
   ============================================
   Dois documentos por baralho, para o estudo gravar pouco:

   users/{uid}/flashcards/{id}          o baralho e o progresso (pequeno)
     { nome, desc, novosDia, criado: ms, n: nº de cartas, em: ms da gravação,
       srs: { idDaCarta: [rep, int, ease, venc, lapsos, ini, t] },
       hist: { 'YYYY-MM-DD': [revisões, acertos] } }
     venc e ini em dias desde 1970-01-01 (5 dígitos em vez de 12 caracteres);
     t em ms. Só cartas já estudadas entram em srs.

   users/{uid}/flashcards-cartas/{id}   o conteúdo (lido só ao abrir o baralho)
     { cartas: [ { id, frente, verso, criado: ms } ] }

   Estudar regrava só o primeiro (~50 bytes por carta estudada); criar,
   editar e excluir cartas gravam os dois juntos (lote atômico). A lista
   de baralhos lê só o primeiro. Com o cadeado do Diário ligado, os dois
   vão cifrados: { c, criado } e { c }.

   Os baralhos e o baralho aberto são ouvidos ao vivo (onSnapshot): o que
   outro aparelho grava chega sozinho, e a leitura inicial custa o mesmo
   que um getDocs. Cada mudança vinda de fora custa uma leitura.
   ============================================ */

import { fs, db, LOCAL_MODE, ref, col, commitInBatches, lsRead, lsWrite, lsRemove, lsList, isId, isText, DAY_RE } from './store.js';
import {
  abrir, selar, cifrado, iniciarCofre, lerConfig, foraDoCadeado, cifradoParaBackup, cifradoDoBackup
} from './cripto.js';
import { EASE_INI, INT_MAX } from './flashcards-calc.js';

export const LIMITES = { nome: 60, desc: 200, texto: 1000, cartas: 2000, novosDia: 200, hist: 400 };
export const NOVOS_DIA = 20;
/** Bytes do JSON das cartas. Cifrado em base64 fica ~4/3 disso: ainda abaixo de 1 MiB por documento. */
export const TAMANHO_MAX = 700_000;
const COL = 'flashcards';
const COL_CARTAS = 'flashcards-cartas';

const int = (v, min, max, def) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : def);

/* ---------- Datas compactas ---------- */

const DIA_MS = 86_400_000;
const diaNum = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DIA_MS); };
const numDia = n => new Date(n * DIA_MS).toISOString().slice(0, 10);
const DIA_MIN = 10_000, DIA_MAX = 60_000; // 1997 a 2134

/* ---------- Validação ---------- */

function sanitizeSrs(raw) {
  if (!Array.isArray(raw) || raw.length < 7) return null;
  const [rep, iv, ease, venc, lapsos, ini, t] = raw;
  if (!Number.isSafeInteger(venc) || venc < DIA_MIN || venc > DIA_MAX || !Number.isSafeInteger(ini) || ini < DIA_MIN || ini > DIA_MAX) return null;
  return {
    rep: int(rep, 0, 10000, 0),
    int: int(iv, 0, INT_MAX, 0),
    ease: int(ease, 100, 1000, EASE_INI),
    venc: numDia(venc),
    lapsos: int(lapsos, 0, 10000, 0),
    ini: numDia(ini),
    t: int(t, 0, Number.MAX_SAFE_INTEGER, 0)
  };
}
const srsParaDoc = s => [s.rep, s.int, s.ease, diaNum(s.venc), s.lapsos, diaNum(s.ini), s.t];

function sanitizeHist(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const ok = Object.entries(raw)
    .filter(([d, v]) => DAY_RE.test(d) && Array.isArray(v) && Number.isSafeInteger(v[0]) && Number.isSafeInteger(v[1]) && v[0] > 0 && v[1] >= 0 && v[1] <= v[0])
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-LIMITES.hist);
  return Object.fromEntries(ok.map(([d, v]) => [d, [v[0], v[1]]]));
}

/** Baralho (sem as cartas): o que a lista precisa. */
function sanitizeMeta(id, raw) {
  if (!isId(id) || !raw || !isText(raw.nome, LIMITES.nome)) return null;
  const srs = {};
  for (const [cid, v] of Object.entries(raw.srs && typeof raw.srs === 'object' ? raw.srs : {}).slice(0, LIMITES.cartas)) {
    const s = isId(cid) && sanitizeSrs(v);
    if (s) srs[cid] = s;
  }
  return {
    id,
    nome: raw.nome.trim(),
    desc: typeof raw.desc === 'string' ? raw.desc.trim().slice(0, LIMITES.desc) : '',
    novosDia: int(raw.novosDia, 0, LIMITES.novosDia, NOVOS_DIA),
    criado: int(raw.criado, 0, Number.MAX_SAFE_INTEGER, 0),
    n: int(raw.n, 0, LIMITES.cartas, Object.keys(srs).length),
    em: int(raw.em, 0, Number.MAX_SAFE_INTEGER, 0),
    srs,
    hist: sanitizeHist(raw.hist),
    cartas: null
  };
}
const metaParaDoc = (b, em) => ({
  nome: b.nome, desc: b.desc, novosDia: b.novosDia, criado: b.criado, n: b.n, em,
  srs: Object.fromEntries(Object.entries(b.srs).map(([id, s]) => [id, srsParaDoc(s)])),
  hist: b.hist
});

function sanitizeCartas(raw) {
  const vistos = new Set();
  return (Array.isArray(raw?.cartas) ? raw.cartas : [])
    .filter(c => c && isId(c.id) && isText(c.frente, LIMITES.texto) && isText(c.verso, LIMITES.texto) && !vistos.has(c.id) && vistos.add(c.id))
    .slice(0, LIMITES.cartas)
    .map(c => ({ id: c.id, frente: c.frente.trim(), verso: c.verso.trim(), criado: int(c.criado, 0, Number.MAX_SAFE_INTEGER, 0) }));
}
const cartasParaDoc = cartas => ({ cartas: cartas.map(({ id, frente, verso, criado }) => ({ id, frente, verso, criado })) });

/** Tamanho das cartas gravadas (bytes do JSON, antes da cifra). */
export const tamanho = cartas => new TextEncoder().encode(JSON.stringify(cartasParaDoc(cartas))).length;

/** Id curto de carta (8 caracteres, ~47 bits), único no baralho: o progresso repete o id de cada carta estudada. */
const ALFABETO = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function novoIdCarta(existentes) {
  for (;;) {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), x => ALFABETO[x % 62]).join('');
    if (!existentes.has(id)) { existentes.add(id); return id; }
  }
}

/* ---------- Cifra ---------- */

async function selarMeta(uid, b, em) {
  await iniciarCofre(uid);
  return selar(metaParaDoc(b, em), ['criado']);
}
async function selarCartas(uid, cartas) {
  await iniciarCofre(uid);
  return selar(cartasParaDoc(cartas));
}

async function abrirMeta(id, raw) {
  try {
    return sanitizeMeta(id, await abrir(raw));
  } catch (e) {
    if (e.message === 'trancado') throw e;
    console.warn(`Baralho ${id} não pôde ser decifrado.`);
    return null;
  }
}
async function abrirCartas(id, raw) {
  try {
    return sanitizeCartas(await abrir(raw));
  } catch (e) {
    if (e.message === 'trancado') throw e;
    console.warn(`Cartas do baralho ${id} não puderam ser decifradas.`);
    return null;
  }
}

/* ---------- Leitura ---------- */

/** Sem as regras do Firestore publicadas, a coleção é recusada: para o backup e o cadeado, é o mesmo que vazia. */
const semRegras = e => e?.code === 'permission-denied';
async function tolerante(p) {
  try { return await p; } catch (e) {
    if (!semRegras(e)) throw e;
    console.warn('Flashcards: publique as regras do Firestore (firestore.rules).');
    return [];
  }
}

const lerCrus = async (uid, c) => (LOCAL_MODE
  ? lsList(c)
  : (await fs.getDocs(col(uid, c))).docs.map(x => [x.id, x.data()]));

/** Processa as mudanças em ordem (decifrar é assíncrono). */
function fila() {
  let p = Promise.resolve();
  // 'trancado': chegou cifrado antes de a página saber do cadeado novo; ela tranca e recarrega sozinha
  return fn => { p = p.then(fn).catch(e => { if (e?.message !== 'trancado') console.error(e); }); };
}

/**
 * Ouve os baralhos (sem as cartas). aoMudar recebe [{ tipo, id, b }]:
 * tipo 'added' | 'modified' | 'removed'; b é o baralho aberto ou null (não abriu).
 * Gravações desta aba não voltam (já estão na tela).
 * @returns {{ pronto: Promise, parar: () => void }}
 */
export function ouvirBaralhos(uid, aoMudar, aoErro) {
  const emOrdem = fila();
  let marcarPronto, falhar;
  const pronto = new Promise((res, rej) => { marcarPronto = res; falhar = rej; });
  const processar = mudancas => emOrdem(async () => {
    const lista = await Promise.all(mudancas.map(async ([tipo, id, raw]) => ({ tipo, id, b: tipo === 'removed' ? null : await abrirMeta(id, raw) })));
    aoMudar(lista);
  });

  if (LOCAL_MODE) {
    processar(lsList(COL).map(([id, raw]) => ['added', id, raw]));
    emOrdem(() => marcarPronto());
    // Outras abas do mesmo navegador
    const ouvir = e => {
      const m = e.key?.match(/^datalife:flashcards\/([\w-]+)$/);
      if (m) processar([[e.newValue ? 'modified' : 'removed', m[1], e.newValue ? JSON.parse(e.newValue) : null]]);
    };
    window.addEventListener('storage', ouvir);
    return { pronto, parar: () => window.removeEventListener('storage', ouvir) };
  }

  let primeiro = true;
  const parar = fs.onSnapshot(col(uid, COL), snap => {
    // Gravações desta aba não voltam; na primeira leitura entra tudo (inclusive o que ficou pendente offline)
    const mudancas = snap.docChanges()
      .filter(ch => primeiro || !ch.doc.metadata.hasPendingWrites)
      .map(ch => [ch.type, ch.doc.id, ch.doc.data()]);
    if (mudancas.length) processar(mudancas);
    if (primeiro) { primeiro = false; emOrdem(() => marcarPronto()); }
  }, e => {
    if (primeiro) { primeiro = false; falhar(e); } else aoErro?.(e);
  });
  return { pronto, parar };
}

/**
 * Ouve as cartas de um baralho. aoMudar(cartas, ausente) com a lista, ou null se
 * não abriu; sem documento vira [] com ausente = true.
 * @returns {{ pronto: Promise, parar: () => void }}
 */
export function ouvirCartas(uid, id, aoMudar, aoErro) {
  const emOrdem = fila();
  let marcarPronto, falhar;
  const pronto = new Promise((res, rej) => { marcarPronto = res; falhar = rej; });
  // Sem documento (baralho sendo excluído, ou lote ainda chegando): lista vazia, marcada como ausente
  const processar = raw => emOrdem(async () => aoMudar(raw ? await abrirCartas(id, raw) : [], !raw));

  if (LOCAL_MODE) {
    processar(lsRead(`${COL_CARTAS}/${id}`));
    emOrdem(() => marcarPronto());
    const ouvir = e => { if (e.key === `datalife:${COL_CARTAS}/${id}`) processar(e.newValue ? JSON.parse(e.newValue) : null); };
    window.addEventListener('storage', ouvir);
    return { pronto, parar: () => window.removeEventListener('storage', ouvir) };
  }

  let primeiro = true;
  const parar = fs.onSnapshot(ref(uid, COL_CARTAS, id), snap => {
    if (primeiro || !snap.metadata.hasPendingWrites) processar(snap.exists() ? snap.data() : null);
    if (primeiro) { primeiro = false; emOrdem(() => marcarPronto()); }
  }, e => {
    if (primeiro) { primeiro = false; falhar(e); } else aoErro?.(e);
  });
  return { pronto, parar };
}

/* ---------- Gravação ---------- */

/**
 * Grava [coleção, id, doc] em lotes que respeitam os limites do Firestore
 * (500 escritas e 10 MiB por lote; um baralho cifrado pode ter ~1 MB).
 */
async function gravarLotes(uid, ops) {
  if (LOCAL_MODE) return ops.forEach(([c, id, d]) => lsWrite(`${c}/${id}`, d));
  let lote = [], bytes = 0;
  for (const [c, id, d] of ops) {
    const n = JSON.stringify(d).length;
    if (lote.length && (lote.length >= 450 || bytes + n > 8_000_000)) { await commitInBatches(lote); lote = []; bytes = 0; }
    lote.push([ref(uid, c, id), d]);
    bytes += n;
  }
  if (lote.length) await commitInBatches(lote);
}

/** Só o baralho e o progresso (o estudo e os ajustes). Devolve o `em` gravado. */
export async function saveMeta(uid, b) {
  const clean = sanitizeMeta(b.id, metaParaDoc(b, 0));
  if (!clean) throw new Error('Baralho inválido');
  const em = Date.now();
  const doc = await selarMeta(uid, clean, em);
  if (LOCAL_MODE) lsWrite(`${COL}/${clean.id}`, doc);
  else await fs.setDoc(ref(uid, COL, clean.id), doc);
  return em;
}

/** Baralho e cartas juntos, num lote (criar, editar ou excluir cartas). Lança Error('cheio') se as cartas passarem do teto. */
export async function saveBaralho(uid, b) {
  const meta = sanitizeMeta(b.id, metaParaDoc(b, 0));
  if (!meta || !Array.isArray(b.cartas)) throw new Error('Baralho inválido');
  const cartas = sanitizeCartas({ cartas: b.cartas });
  if (tamanho(cartas) > TAMANHO_MAX) throw new Error('cheio');
  const em = Date.now();
  const [dMeta, dCartas] = await Promise.all([selarMeta(uid, meta, em), selarCartas(uid, cartas)]);
  if (LOCAL_MODE) {
    lsWrite(`${COL}/${b.id}`, dMeta);
    lsWrite(`${COL_CARTAS}/${b.id}`, dCartas);
    return em;
  }
  const lote = fs.writeBatch(db);
  lote.set(ref(uid, COL, b.id), dMeta);
  lote.set(ref(uid, COL_CARTAS, b.id), dCartas);
  await lote.commit();
  return em;
}

export async function deleteBaralho(uid, id) {
  if (!isId(id)) throw new Error('Baralho inválido');
  if (LOCAL_MODE) { lsRemove(`${COL}/${id}`); lsRemove(`${COL_CARTAS}/${id}`); return; }
  const lote = fs.writeBatch(db);
  lote.delete(ref(uid, COL, id));
  lote.delete(ref(uid, COL_CARTAS, id));
  await lote.commit();
}

/* ---------- Cadeado ---------- */

/** Todos os baralhos com as cartas (para ligar ou desligar o cadeado). */
export async function carregarFlashcards(uid) {
  const [metas, conteudos] = await Promise.all([tolerante(lerCrus(uid, COL)), tolerante(lerCrus(uid, COL_CARTAS))]);
  const cartas = new Map(await Promise.all(conteudos.map(async ([id, raw]) => [id, await abrirCartas(id, raw)])));
  const baralhos = await Promise.all(metas.map(([id, raw]) => abrirMeta(id, raw)));
  // Cartas que não abriram (null): o baralho fica como está. Sem documento de cartas: só o baralho é regravado
  return baralhos.filter(b => b && cartas.get(b.id) !== null).map(b => ({ ...b, cartas: cartas.get(b.id) ?? null }));
}

/** Regrava todos no formato atual do cadeado (cifra ao ligar, decifra ao desligar). */
export async function regravarFlashcards(uid, baralhos) {
  const em = Date.now();
  const ops = (await Promise.all(baralhos.map(async b => [
    [COL, b.id, await selarMeta(uid, b, em)],
    ...(b.cartas ? [[COL_CARTAS, b.id, await selarCartas(uid, b.cartas)]] : [])
  ]))).flat();
  await gravarLotes(uid, ops);
}

/** Regrava só os documentos fora do estado atual do cadeado (ver foraDoCadeado). @returns quantos */
export async function regravarForaFlashcards(uid) {
  await iniciarCofre(uid);
  const [metas, conteudos] = await Promise.all([tolerante(lerCrus(uid, COL)), tolerante(lerCrus(uid, COL_CARTAS))]);
  const em = Date.now();
  const ops = [];
  for (const [id, raw] of foraDoCadeado(metas)) {
    const b = await abrirMeta(id, raw);
    if (b) ops.push([COL, id, await selarMeta(uid, b, b.em || em)]);
  }
  for (const [id, raw] of foraDoCadeado(conteudos)) {
    const cartas = await abrirCartas(id, raw);
    if (cartas) ops.push([COL_CARTAS, id, await selarCartas(uid, cartas)]);
  }
  await gravarLotes(uid, ops);
  return ops.length;
}

/* ---------- Backup ---------- */
// [{ id, baralho, cartas }]: cada parte em claro ou cifrada como está no banco
// (o backup não precisa nem expõe a senha).

export async function exportFlashcards(uid) {
  const [metas, conteudos] = await Promise.all([tolerante(lerCrus(uid, COL)), tolerante(lerCrus(uid, COL_CARTAS))]);
  const cartas = new Map(conteudos);
  return metas.map(([id, raw]) => {
    const rc = cartas.get(id) || { cartas: [] };
    const baralho = cifrado(raw) ? cifradoParaBackup(raw, ['criado']) : sanitizeMeta(id, raw);
    if (!baralho) return null;
    if (!cifrado(raw)) { delete baralho.id; delete baralho.cartas; baralho.srs = metaParaDoc(baralho, 0).srs; }
    return { id, baralho, cartas: cifrado(rc) ? cifradoParaBackup(rc) : sanitizeCartas(rc) };
  }).filter(Boolean);
}

export const parseFlashcards = list => (Array.isArray(list)
  ? list.map(x => {
    if (!x || !isId(x.id)) return null;
    const baralho = cifrado(x.baralho) ? cifradoDoBackup(x.baralho, 400_000, ['criado']) : sanitizeMeta(x.id, x.baralho);
    const cartas = cifrado(x.cartas) ? cifradoDoBackup(x.cartas, 1_000_000) : sanitizeCartas({ cartas: x.cartas });
    return baralho && cartas ? { id: x.id, baralho, cartas } : null;
  }).filter(Boolean)
  : []);

export async function importFlashcards(uid, parsed, criptoDoArquivo = null) {
  const ids = new Set((await tolerante(lerCrus(uid, COL))).map(([id]) => id));
  // Cifrados só servem com o mesmo cadeado (o do Diário, restaurado antes, se preciso)
  const algumCifrado = parsed.some(x => x.baralho.c || x.cartas.c);
  const atual = algumCifrado ? await lerConfig(uid) : null;
  const mesmo = !!(atual && criptoDoArquivo && atual.id === criptoDoArquivo.id);
  const novos = parsed.filter(x => !ids.has(x.id) && ((!x.baralho.c && !x.cartas.c) || mesmo));
  const em = Date.now();
  const ops = (await Promise.all(novos.map(async x => {
    const meta = x.baralho.c ? x.baralho : await selarMeta(uid, { ...x.baralho, n: x.cartas.c ? x.baralho.n : x.cartas.length }, em);
    const cartas = x.cartas.c ? x.cartas : await selarCartas(uid, x.cartas);
    return [[COL, x.id, meta], [COL_CARTAS, x.id, cartas]];
  }))).flat();
  await gravarLotes(uid, ops);
  return novos.length;
}
