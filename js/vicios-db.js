/* ============================================
   DataLife — Diário: Vícios (persistência e cálculo)
   ============================================
   users/{uid}/vicios/{id}
     { nome, tipo, inicio: 'YYYY-MM-DD', custoDia: centavos, minutosDia,
       motivos: [..], planos: [{se, entao}],
       recaidas: [{id, data, nota}], vontades: {'YYYY-MM-DD': n},
       criado: ms, arquivado }

   Com o cadeado do Diário ligado, vai cifrado: { c, criado }.

   Uma recaída recomeça a sequência atual, mas não apaga o caminho: o total
   de dias livres e a maior sequência continuam (Quitzilla, I Am Sober).
   ============================================ */

import { fs, LOCAL_MODE, ref, col, commitInBatches, lsWrite, lsRemove, lsList, isId, isText, isCents, DAY_RE } from './store.js';
import { fromDayKey } from './utils.js';
import { abrir, selar, cifrado, iniciarCofre, lerConfig, foraDoCadeado, cifradoParaBackup, cifradoDoBackup } from './cripto.js';

export const LIMITES = { nome: 60, motivos: 6, motivo: 140, planos: 8, plano: 140, recaidas: 300, nota: 280, vontades: 400, minutos: 1440 };

export const TIPOS = [
  { id: 'fumar', nome: 'Cigarro / vape', icone: 'cigarette' },
  { id: 'alcool', nome: 'Álcool', icone: 'wine' },
  { id: 'telas', nome: 'Celular / telas', icone: 'smartphone' },
  { id: 'apostas', nome: 'Apostas', icone: 'dice' },
  { id: 'comida', nome: 'Doces / comida', icone: 'cookie' },
  { id: 'compras', nome: 'Compras por impulso', icone: 'cart' },
  { id: 'outro', nome: 'Outro', icone: 'sprout' }
];
const TIPO_IDS = new Set(TIPOS.map(t => t.id));

/** Conquistas (em dias). */
export const MARCOS = [1, 3, 7, 14, 21, 30, 60, 90, 180, 270, 365, 545, 730, 1095, 1825, 3650];

/** Linha do tempo de benefícios de parar de fumar (INCA / OMS). */
export const BENEFICIOS_FUMO = [
  { dias: 1, texto: 'O nível de oxigênio no sangue volta ao normal e não há mais nicotina circulando.' },
  { dias: 2, texto: 'Olfato e paladar começam a melhorar.' },
  { dias: 21, texto: 'A respiração fica mais fácil e a circulação melhora.' },
  { dias: 90, texto: 'A função dos pulmões melhora e a tosse diminui.' },
  { dias: 365, texto: 'O risco de doença do coração cai para cerca da metade do de quem fuma.' },
  { dias: 1825, texto: 'O risco de AVC se aproxima do de quem nunca fumou.' },
  { dias: 3650, texto: 'O risco de câncer de pulmão cai para cerca da metade.' }
];

/* ---------- Cálculo ---------- */

/** Dias inteiros de `de` até `ate` (chaves YYYY-MM-DD). */
export function diasEntre(de, ate) {
  return Math.round((fromDayKey(ate) - fromDayKey(de)) / 86400000);
}

/** Datas de recaída (únicas, ordenadas) dentro do período acompanhado. */
const diasRecaida = (v, hoje) => [...new Set(v.recaidas.map(r => r.data))].filter(d => d >= v.inicio && d <= hoje).sort();

/**
 * Situação de um hábito hoje.
 * Dia da recaída conta como 0: a sequência nova começa ali.
 */
export function resumo(v, hoje) {
  const quedas = diasRecaida(v, hoje);
  const desde = quedas.at(-1) || v.inicio;
  const atual = Math.max(0, diasEntre(desde, hoje));
  // Sequências: inicio → 1ª recaída → … → hoje
  const pontos = [v.inicio, ...quedas];
  let melhor = 0;
  for (let i = 0; i < pontos.length; i++) {
    const fim = pontos[i + 1] || hoje;
    melhor = Math.max(melhor, diasEntre(pontos[i], fim));
  }
  const total = Math.max(0, diasEntre(v.inicio, hoje));
  // Dias contados: depois do início até hoje; o dia de uma recaída não é livre
  const livres = Math.max(0, total - quedas.filter(d => d > v.inicio).length);
  const prox = MARCOS.find(m => m > atual) || null;
  const ant = [...MARCOS].reverse().find(m => m <= atual) || 0;
  const vontades = Object.entries(v.vontades).filter(([d]) => d >= desde).reduce((s, [, n]) => s + n, 0);
  return {
    desde, atual, melhor, total, livres,
    recaidas: quedas.length,
    economia: livres * v.custoDia,
    minutos: livres * v.minutosDia,
    proximo: prox,
    anterior: ant,
    progresso: prox ? (atual - ant) / (prox - ant) : 1,
    conquistas: MARCOS.filter(m => m <= melhor),
    vontades
  };
}

/** "3 dias", "2 meses", "1 ano e 2 meses": rótulo humano de um período. */
export function duracaoDias(n) {
  if (n < 1) return 'hoje';
  if (n < 60) return `${n} ${n === 1 ? 'dia' : 'dias'}`;
  if (n < 365) { const m = Math.floor(n / 30); return `${m} meses`; }
  const a = Math.floor(n / 365), m = Math.floor((n % 365) / 30);
  return `${a} ${a === 1 ? 'ano' : 'anos'}${m ? ` e ${m} ${m === 1 ? 'mês' : 'meses'}` : ''}`;
}

/** Rótulo curto de uma conquista: 7 → "1 semana". */
export function nomeMarco(m) {
  if (m === 7) return '1 semana';
  if (m === 14) return '2 semanas';
  if (m === 21) return '3 semanas';
  if (m === 545) return '1 ano e meio';
  if (m >= 365 && m % 365 === 0) return `${m / 365} ${m === 365 ? 'ano' : 'anos'}`;
  if (m >= 30 && m % 30 === 0) return `${m / 30} ${m === 30 ? 'mês' : 'meses'}`;
  return `${m} ${m === 1 ? 'dia' : 'dias'}`;
}

/** Horas e minutos: 95 → "1 h 35 min". */
export function formatMinutos(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h >= 48) return `${Math.round(h / 24)} dias`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ---------- Validação ---------- */

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const intEntre = (v, a, b) => (Number.isInteger(v) && v >= a && v <= b ? v : 0);

export function sanitizeVicio(id, raw) {
  if (!isId(id) || !raw || typeof raw !== 'object' || !isText(raw.nome, LIMITES.nome) || !DAY_RE.test(raw.inicio)) return null;
  const vontades = {};
  for (const [d, n] of Object.entries(raw.vontades && typeof raw.vontades === 'object' ? raw.vontades : {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, LIMITES.vontades)) {
    if (DAY_RE.test(d) && Number.isInteger(n) && n > 0) vontades[d] = Math.min(n, 999);
  }
  return {
    id,
    nome: raw.nome.trim(),
    tipo: TIPO_IDS.has(raw.tipo) ? raw.tipo : 'outro',
    inicio: raw.inicio,
    custoDia: isCents(raw.custoDia) ? raw.custoDia : 0,
    minutosDia: intEntre(raw.minutosDia, 0, LIMITES.minutos),
    motivos: Array.isArray(raw.motivos) ? raw.motivos.map(m => str(m, LIMITES.motivo)).filter(Boolean).slice(0, LIMITES.motivos) : [],
    planos: Array.isArray(raw.planos)
      ? raw.planos.map(p => ({ se: str(p?.se, LIMITES.plano), entao: str(p?.entao, LIMITES.plano) })).filter(p => p.se && p.entao).slice(0, LIMITES.planos)
      : [],
    recaidas: Array.isArray(raw.recaidas)
      ? raw.recaidas.filter(r => isId(r?.id) && DAY_RE.test(r?.data)).map(r => ({ id: r.id, data: r.data, nota: str(r.nota, LIMITES.nota) }))
        .sort((a, b) => a.data.localeCompare(b.data)).slice(-LIMITES.recaidas)
      : [],
    vontades,
    criado: Number.isSafeInteger(raw.criado) && raw.criado > 0 ? raw.criado : 0,
    arquivado: raw.arquivado === true
  };
}

async function toDoc(uid, { id, ...rest }) {
  await iniciarCofre(uid);
  return selar(rest, ['criado']);
}

async function abrirVicio(id, raw) {
  try {
    return sanitizeVicio(id, await abrir(raw));
  } catch (e) {
    if (e.message === 'trancado') throw e;
    console.warn(`Hábito ${id} não pôde ser decifrado.`);
    return null;
  }
}

const lerCrus = async uid => (LOCAL_MODE
  ? lsList('vicios')
  : (await fs.getDocs(col(uid, 'vicios'))).docs.map(x => [x.id, x.data()]));

/* ---------- API ---------- */

export async function fetchVicios(uid) {
  const entries = await lerCrus(uid);
  return (await Promise.all(entries.map(([id, raw]) => abrirVicio(id, raw)))).filter(Boolean).sort((a, b) => a.criado - b.criado);
}

export async function saveVicio(uid, v) {
  const clean = sanitizeVicio(v.id, v);
  if (!clean) throw new Error('Hábito inválido');
  const doc = await toDoc(uid, clean);
  if (LOCAL_MODE) return lsWrite(`vicios/${clean.id}`, doc);
  await fs.setDoc(ref(uid, 'vicios', clean.id), doc);
}

/** Regrava todos no formato atual do cadeado (cifra ao ligar, decifra ao desligar). */
export async function regravarVicios(uid, vicios) {
  const docs = await Promise.all(vicios.map(async v => [v.id, await toDoc(uid, v)]));
  if (LOCAL_MODE) return docs.forEach(([id, d]) => lsWrite(`vicios/${id}`, d));
  await commitInBatches(docs.map(([id, d]) => [ref(uid, 'vicios', id), d]));
}

/** Regrava só os hábitos fora do estado atual do cadeado (ver foraDoCadeado). @returns quantos */
export async function regravarForaVicios(uid) {
  await iniciarCofre(uid);
  const fora = foraDoCadeado(await lerCrus(uid));
  const abertos = (await Promise.all(fora.map(([id, raw]) => abrirVicio(id, raw)))).filter(Boolean);
  await regravarVicios(uid, abertos);
  return abertos.length;
}

export async function deleteVicio(uid, id) {
  if (!isId(id)) throw new Error('Hábito inválido');
  if (LOCAL_MODE) return lsRemove(`vicios/${id}`);
  await fs.deleteDoc(ref(uid, 'vicios', id));
}

/* ---------- Backup ---------- */

/** Cifrados saem cifrados (o backup não precisa nem expõe a senha). */
export async function exportVicios(uid) {
  return (await lerCrus(uid)).map(([id, raw]) => (cifrado(raw)
    ? { id, ...cifradoParaBackup(raw, ['criado']) }
    : sanitizeVicio(id, raw))).filter(Boolean);
}
export const parseVicios = list => (Array.isArray(list)
  ? list.map(v => (cifrado(v)
    ? (isId(v.id) && cifradoDoBackup(v, 200000, ['criado']) ? { id: v.id, ...cifradoDoBackup(v, 200000, ['criado']) } : null)
    : sanitizeVicio(v?.id, v))).filter(Boolean)
  : []);
export async function importVicios(uid, parsed, criptoDoArquivo = null) {
  const ids = new Set((await lerCrus(uid)).map(([id]) => id));
  // Cifrados só servem com o mesmo cadeado (o do Diário, restaurado antes, se preciso)
  const atual = parsed.some(v => v.c) ? await lerConfig(uid) : null;
  const mesmo = !!(atual && criptoDoArquivo && atual.id === criptoDoArquivo.id);
  const novos = parsed.filter(v => !ids.has(v.id) && (!v.c || mesmo));
  const docs = await Promise.all(novos.map(async ({ id, ...v }) => [id, v.c ? v : await toDoc(uid, { id, ...v })]));
  if (LOCAL_MODE) docs.forEach(([id, d]) => lsWrite(`vicios/${id}`, d));
  else await commitInBatches(docs.map(([id, d]) => [ref(uid, 'vicios', id), d]));
  return novos.length;
}
