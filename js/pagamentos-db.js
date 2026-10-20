/* ============================================
   DataLife — Pagamentos: persistência e regras de vencimento
   ============================================
   users/{uid}/settings/contas
     { itens: [ {id, nome, valor, dia, aviso, lancar, cat} ] }
       valor: estimativa em centavos · dia: vencimento (1–31) · aviso: dias
       de antecedência do alerta · lancar: ao pagar, lança no Orçamento (cat)
   users/{uid}/pagamentos/{YYYY-MM}
     { pagas: { <idDaConta>: {em: "YYYY-MM-DD", valor, gasto?} } }
       gasto: id do lançamento criado no Orçamento ao pagar (para ajustar
       ou tirar junto quando o pagamento muda ou é desfeito)

   Marcar e desmarcar mexe só na chave da conta (merge / deleteField):
   dois aparelhos não apagam o pagamento um do outro.
   ============================================ */

import { fs, LOCAL_MODE, ref, col, lsRead, lsWrite, lsList, commitInBatches, isId, isText, isCents, MONTH_RE, DAY_RE } from './store.js';
import { CATEGORIAS } from './utils.js';

export const LIMITES = { contas: 100, nome: 60 };
export const AVISOS = [1, 2, 3, 5, 7, 10];
const CAT_IDS = new Set(CATEGORIAS.map(c => c.id));

/* ---------- Validação ---------- */

function sanitizeConta(c) {
  if (!c || !isId(c.id) || !isText(c.nome, LIMITES.nome)) return null;
  return {
    id: c.id,
    nome: c.nome.trim(),
    valor: isCents(c.valor) ? c.valor : 0,
    dia: Number.isInteger(c.dia) && c.dia >= 1 && c.dia <= 31 ? c.dia : 10,
    aviso: AVISOS.includes(c.aviso) ? c.aviso : 3,
    lancar: c.lancar === true,
    cat: CAT_IDS.has(c.cat) ? c.cat : 'custosFixos'
  };
}

function sanitizePagas(raw) {
  const out = {};
  for (const [id, p] of Object.entries(raw || {})) {
    if (isId(id) && p && DAY_RE.test(p.em) && isCents(p.valor)) out[id] = { em: p.em, valor: p.valor, ...(isId(p.gasto) ? { gasto: p.gasto } : {}) };
  }
  return out;
}

/* ---------- Regras de vencimento (puras) ---------- */

const pad = n => String(n).padStart(2, '0');

/** Data de vencimento da conta no mês ("dia 31" em fevereiro vence no último dia). */
export function vencimento(conta, mes) {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${mes}-${pad(Math.min(conta.dia, ultimo))}`;
}

/** Dias corridos de `de` até `ate` (negativo = já passou). */
export function diasEntre(de, ate) {
  const [a, b] = [de, ate].map(k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86_400_000);
}

/**
 * @returns {{status:'paga'|'vencida'|'proxima'|'futura', vence:string, dias:number, pagamento?:Object}}
 */
export function situacao(conta, mes, pagas, hoje) {
  const vence = vencimento(conta, mes);
  const dias = diasEntre(hoje, vence);
  const pagamento = pagas[conta.id];
  if (pagamento) return { status: 'paga', vence, dias, pagamento };
  if (dias < 0) return { status: 'vencida', vence, dias };
  if (dias <= conta.aviso) return { status: 'proxima', vence, dias };
  return { status: 'futura', vence, dias };
}

/**
 * Pagamento feito hoje (antes ou depois do vencimento). Com "lança no Orçamento",
 * vem junto o gasto a criar; o pagamento guarda o id dele (`gasto`).
 */
export function novoPagamento(conta, hoje, gastoId) {
  const gasto = conta.lancar && conta.valor
    ? { id: gastoId, cat: conta.cat, desc: conta.nome, valor: conta.valor, data: hoje }
    : null;
  return { pagamento: { em: hoje, valor: conta.valor, ...(gasto ? { gasto: gasto.id } : {}) }, gasto };
}

/** "hoje" · "amanhã" · "em 3 dias" · "venceu ontem" · "venceu há 4 dias" */
export function quando(dias) {
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  if (dias > 1) return `vence em ${dias} dias`;
  if (dias === -1) return 'venceu ontem';
  return `venceu há ${-dias} dias`;
}

/* ---------- API ---------- */

export async function fetchContas(uid) {
  const raw = LOCAL_MODE
    ? lsRead('settings/contas')
    : await fs.getDoc(ref(uid, 'settings', 'contas')).then(s => (s.exists() ? s.data() : null));
  return Array.isArray(raw?.itens) ? raw.itens.map(sanitizeConta).filter(Boolean).slice(0, LIMITES.contas) : [];
}

export async function saveContas(uid, itens) {
  const clean = itens.map(sanitizeConta);
  if (clean.some(c => !c) || clean.length > LIMITES.contas) throw new Error('Conta inválida');
  if (LOCAL_MODE) return lsWrite('settings/contas', { itens: clean });
  await fs.setDoc(ref(uid, 'settings', 'contas'), { itens: clean });
}

export async function fetchPagas(uid, mes) {
  if (!MONTH_RE.test(mes)) throw new Error('Mês inválido');
  const raw = LOCAL_MODE
    ? lsRead(`pagamentos/${mes}`)
    : await fs.getDoc(ref(uid, 'pagamentos', mes)).then(s => (s.exists() ? s.data() : null));
  return sanitizePagas(raw?.pagas);
}

/** Marca (pagamento = {em, valor}) ou desmarca (pagamento = null) uma conta no mês. */
export async function setPaga(uid, mes, contaId, pagamento) {
  if (!MONTH_RE.test(mes) || !isId(contaId)) throw new Error('Pagamento inválido');
  if (pagamento && (!DAY_RE.test(pagamento.em) || !isCents(pagamento.valor))) throw new Error('Pagamento inválido');
  const dados = pagamento && { em: pagamento.em, valor: pagamento.valor, ...(isId(pagamento.gasto) ? { gasto: pagamento.gasto } : {}) };
  if (LOCAL_MODE) {
    const pagas = sanitizePagas(lsRead(`pagamentos/${mes}`)?.pagas);
    if (pagamento) pagas[contaId] = dados;
    else delete pagas[contaId];
    return lsWrite(`pagamentos/${mes}`, { pagas });
  }
  const r = ref(uid, 'pagamentos', mes);
  // mergeFields troca a entrada da conta inteira (merge comum mesclaria e deixaria um `gasto` antigo)
  if (pagamento) await fs.setDoc(r, { pagas: { [contaId]: dados } }, { mergeFields: [new fs.FieldPath('pagas', contaId)] });
  else await fs.setDoc(r, { pagas: { [contaId]: fs.deleteField() } }, { merge: true });
}

/* ---------- Backup ---------- */

export async function exportPagamentos(uid) {
  const [contas, docs] = await Promise.all([
    fetchContas(uid),
    LOCAL_MODE ? lsList('pagamentos') : fs.getDocs(col(uid, 'pagamentos')).then(q => q.docs.map(d => [d.id, d.data()]))
  ]);
  const meses = {};
  for (const [mes, raw] of docs) {
    const pagas = MONTH_RE.test(mes) ? sanitizePagas(raw?.pagas) : {};
    if (Object.keys(pagas).length) meses[mes] = pagas;
  }
  return { contas, meses };
}

export function parsePagamentos(json) {
  if (!json || !Array.isArray(json.contas)) return null;
  const meses = {};
  for (const [mes, pagas] of Object.entries(json.meses && typeof json.meses === 'object' ? json.meses : {})) {
    const p = MONTH_RE.test(mes) ? sanitizePagas(pagas) : {};
    if (Object.keys(p).length) meses[mes] = p;
  }
  return { contas: json.contas.map(sanitizeConta).filter(Boolean), meses };
}

/**
 * Contas do backup que ainda não existem (mesmo id) são acrescentadas;
 * no histórico, só entram pagamentos de contas que não estavam marcadas.
 */
export async function importPagamentos(uid, parsed) {
  const atuais = await fetchContas(uid);
  const ids = new Set(atuais.map(c => c.id));
  const novas = parsed.contas.filter(c => !ids.has(c.id));
  if (novas.length) await saveContas(uid, [...atuais, ...novas].slice(0, LIMITES.contas));
  const ops = [];
  for (const [mes, pagas] of Object.entries(parsed.meses || {})) {
    const cur = await fetchPagas(uid, mes);
    const add = Object.fromEntries(Object.entries(pagas).filter(([id]) => !cur[id]));
    if (!Object.keys(add).length) continue;
    if (LOCAL_MODE) lsWrite(`pagamentos/${mes}`, { pagas: { ...cur, ...add } });
    else ops.push([ref(uid, 'pagamentos', mes), { pagas: add }, { merge: true }]);
  }
  if (ops.length) await commitInBatches(ops);
  return novas.length;
}
