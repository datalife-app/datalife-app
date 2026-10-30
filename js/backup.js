/* ============================================
   DataLife — Backup (exportar / importar)
   ============================================
   JSON: cópia completa de todas as ferramentas, reimportável.
   CSV: planilha de lançamentos do Orçamento e movimentações dos Objetivos
   (pt-BR: ";" e vírgula decimal, com BOM para o Excel).
   ============================================ */

import { exportAll, parseBackup, importBackup } from './db.js';
import { exportFoco, parseFoco, importFoco } from './foco-db.js';
import { exportObjetivos, parseObjetivos, importObjetivos, TIPOS } from './objetivos-db.js';
import { exportLivros, parseLivros, importLivros } from './livros-db.js';
import { exportDiario, parseDiario, importDiario } from './diario-db.js';
import { exportPagamentos, parsePagamentos, importPagamentos } from './pagamentos-db.js';
import { exportEventos, parseEventos, importEventos } from './planejador-db.js';
import { exportCompras, parseCompras, importCompras } from './compras-db.js';
import { exportDesejos, parseDesejos, importDesejos } from './desejos-db.js';
import { exportExercicios, parseExercicios, importExercicios } from './exercicios-db.js';
import { exportTreino, parseTreino, importTreino, contarTreino } from './treino-db.js';
import { exportConselhos, parseConselhos, importConselhos } from './conselhos-db.js';
import { exportVicios, parseVicios, importVicios } from './vicios-db.js';
import { exportFlashcards, parseFlashcards, importFlashcards } from './flashcards-db.js';
import { CATEGORIAS, icon, downloadFile, formatBRLRaw, showToast, dayKey } from './utils.js';

const $ = id => document.getElementById(id);
const CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.nome]));
const stamp = () => dayKey(new Date()); // data local (toISOString é UTC: depois das 21h viraria amanhã)

/** Campo CSV seguro: aspas e proteção contra fórmula (=, +, -, @) ao abrir no Excel. */
function csvField(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const centsCsv = c => (c / 100).toFixed(2).replace('.', ',');

function toCsv(data) {
  const rows = [['Tipo', 'Data', 'Mês', 'Categoria', 'Descrição', 'Valor (R$)', 'Fixo']];
  for (const m of data.months) {
    for (const r of m.rendas) rows.push(['Renda', '', m.key, '', r.desc, centsCsv(r.valor), '']);
    if (m.va) rows.push(['Renda', '', m.key, '', 'Vale-alimentação', centsCsv(m.va), '']);
    for (const g of [...m.gastos].sort((a, b) => a.data.localeCompare(b.data))) {
      rows.push(['Gasto', g.data.split('-').reverse().join('/'), m.key, CAT[g.cat], g.desc, centsCsv(g.valor), g.rec ? 'sim' : '']);
    }
  }
  for (const o of data.objetivos || []) {
    for (const mv of [...o.movimentos].sort((a, b) => a.data.localeCompare(b.data))) {
      rows.push([TIPOS[mv.tipo].nome, mv.data.split('-').reverse().join('/'), mv.data.slice(0, 7), `Objetivo: ${o.nome}`, mv.nota || '', centsCsv(mv.valor), '']);
    }
  }
  return '﻿' + rows.map(r => r.map(csvField).join(';')).join('\r\n');
}

async function withBusy(btn, fn) {
  btn.disabled = true;
  try {
    await fn();
  } catch (e) {
    console.error(e);
    showToast(e.message?.startsWith('Arquivo') ? e.message
      : e.message === 'trancado' ? 'O Diário está com cadeado: destranque-o no Diário (marque "lembrar neste aparelho") e importe de novo.'
        : 'Não foi possível concluir. Tente novamente.', 'error', 7000);
  } finally {
    btn.disabled = false;
  }
}

/**
 * Ferramentas mais novas, todas no mesmo formato: chave no JSON, export,
 * parse, import, e como contar o que veio (resumo antes de importar).
 * Diário, Vícios e Flashcards cifrados pelo cadeado saem e voltam cifrados.
 */
const EXTRAS = [
  { chave: 'pagamentos', exp: exportPagamentos, parse: parsePagamentos, imp: importPagamentos, n: p => p?.contas.length || 0, um: 'conta fixa', varios: 'contas fixas' },
  { chave: 'eventos', exp: exportEventos, parse: parseEventos, imp: importEventos, n: p => p.length, um: 'data no Planejador', varios: 'datas no Planejador' },
  { chave: 'compras', exp: exportCompras, parse: parseCompras, imp: importCompras, n: p => p?.itens.length || 0, um: 'item na lista de compras', varios: 'itens na lista de compras' },
  { chave: 'desejos', exp: exportDesejos, parse: parseDesejos, imp: importDesejos, n: p => p.length, um: 'compra consciente', varios: 'compras conscientes' },
  { chave: 'exercicios', exp: exportExercicios, parse: parseExercicios, imp: importExercicios, n: p => p?.proprios.length || 0, um: 'exercício seu', varios: 'exercícios seus' },
  { chave: 'treino', exp: exportTreino, parse: parseTreino, imp: importTreino, n: contarTreino, um: 'registro de carga', varios: 'registros de carga' },
  { chave: 'conselhos', exp: exportConselhos, parse: parseConselhos, imp: importConselhos, n: p => p.length, um: 'ação dos Conselhos', varios: 'ações dos Conselhos' },
  { chave: 'vicios', exp: exportVicios, parse: parseVicios, imp: importVicios, n: p => p.length, um: 'hábito em Vícios', varios: 'hábitos em Vícios' },
  { chave: 'flashcards', exp: exportFlashcards, parse: parseFlashcards, imp: importFlashcards, n: p => p.length, um: 'baralho de flashcards', varios: 'baralhos de flashcards' }
];
const vazio = p => p == null || (Array.isArray(p) && !p.length);
const rotulo = (x, n) => `${n} ${n === 1 ? x.um : x.varios}`;

async function exportTudo(userId) {
  const [financas, foco, objetivos, livros, diario, ...extras] = await Promise.all([
    exportAll(userId), exportFoco(userId), exportObjetivos(userId), exportLivros(userId), exportDiario(userId),
    ...EXTRAS.map(x => x.exp(userId))
  ]);
  return { ...financas, foco, objetivos, livros, diario, ...Object.fromEntries(EXTRAS.map((x, i) => [x.chave, extras[i]])) };
}

export function initBackup(userId) {
  const btnJson = $('btn-export-json');
  const btnCsv = $('btn-export-csv');
  const btnImport = $('btn-import');
  btnJson.innerHTML = `${icon('download', 15)} Backup (.json)`;
  btnCsv.innerHTML = `${icon('download', 15)} Planilha (.csv)`;
  btnImport.innerHTML = `${icon('upload', 15)} Importar backup`;

  btnJson.addEventListener('click', () => withBusy(btnJson, async () => {
    const data = await exportTudo(userId);
    downloadFile(`datalife-backup-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
    showToast('Backup baixado.');
  }));

  btnCsv.addEventListener('click', () => withBusy(btnCsv, async () => {
    const data = await exportTudo(userId);
    downloadFile(`datalife-lancamentos-${stamp()}.csv`, toCsv(data), 'text/csv;charset=utf-8');
    showToast('Planilha baixada.');
  }));

  const dialog = $('import-dialog');
  let parsed = null;
  dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));

  btnImport.addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Arquivo grande demais para um backup do DataLife.', 'error');
      return;
    }
    try {
      const json = JSON.parse(await file.text());
      // Backups antigos (só do Orçamento) não têm foco/objetivos: viram listas vazias
      parsed = { ...parseBackup(json), foco: parseFoco(json.foco), objetivos: parseObjetivos(json.objetivos), livros: parseLivros(json.livros), diario: parseDiario(json.diario) };
      for (const x of EXTRAS) parsed[x.chave] = json[x.chave] == null ? null : x.parse(json[x.chave]);
    } catch (err) {
      showToast(err instanceof SyntaxError ? 'Arquivo inválido: não é um JSON.' : err.message, 'error', 5000);
      return;
    }
    const renda = parsed.months.reduce((a, m) => a + m.renda, 0);
    $('import-sub').textContent = file.name;
    $('import-facts').innerHTML = `
      <li><strong>${parsed.months.length}</strong> ${parsed.months.length === 1 ? 'mês' : 'meses'}</li>
      <li><strong>${parsed.totalGastos}</strong> lançamentos</li>
      <li><strong class="num">${formatBRLRaw(renda)}</strong> em rendas</li>
      <li><strong>${parsed.recorrentes.length}</strong> gastos fixos</li>
      <li><strong>${parsed.foco?.dias.length || 0}</strong> dias no Foco</li>
      <li><strong>${parsed.objetivos.length}</strong> ${parsed.objetivos.length === 1 ? 'objetivo' : 'objetivos'}</li>
      <li><strong>${parsed.livros?.livros.length || 0}</strong> livros</li>
      <li><strong>${parsed.diario?.entradas.length || 0}</strong> dias no Diário</li>
      ${EXTRAS.filter(x => parsed[x.chave] != null && x.n(parsed[x.chave])).map(x => { const [n, ...r] = rotulo(x, x.n(parsed[x.chave])).split(' '); return `<li><strong>${n}</strong> ${r.join(' ')}</li>`; }).join('')}`;
    dialog.showModal();
  });

  $('import-form').addEventListener('submit', e => {
    e.preventDefault();
    const btn = $('import-submit');
    withBusy(btn, async () => {
      const n = await importBackup(userId, parsed);
      const d = parsed.foco ? await importFoco(userId, parsed.foco) : 0;
      const o = parsed.objetivos.length ? await importObjetivos(userId, parsed.objetivos) : 0;
      const l = parsed.livros ? await importLivros(userId, parsed.livros) : 0;
      const j = parsed.diario ? await importDiario(userId, parsed.diario) : 0;
      const extras = [];
      for (const x of EXTRAS) {
        if (vazio(parsed[x.chave])) continue;
        const k = await x.imp(userId, parsed[x.chave], parsed.diario?.cripto);
        if (k) extras.push(rotulo(x, k));
      }
      dialog.close();
      const partes = [
        n && `${n} ${n === 1 ? 'mês' : 'meses'}`,
        d && `${d} ${d === 1 ? 'dia' : 'dias'} no Foco`,
        o && `${o} ${o === 1 ? 'objetivo' : 'objetivos'}`,
        l && `${l} ${l === 1 ? 'livro' : 'livros'}`,
        j && `${j} ${j === 1 ? 'dia no Diário' : 'dias no Diário'}`,
        ...extras
      ].filter(Boolean);
      showToast(partes.length ? `Backup importado: ${partes.join(', ')}.` : 'Nada novo para importar.');
    });
  });
}
