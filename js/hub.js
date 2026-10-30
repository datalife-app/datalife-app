/* ============================================
   DataLife — Hub de ferramentas
   ============================================
   Para adicionar uma ferramenta, inclua um item em TOOLS.
   Sem href = aparece como "Em breve".
   ============================================ */

import { requireAuth } from './auth.js';
import { icon, escapeHtml } from './utils.js';
import { initPagina, dadosProntos } from './pagina.js';
import { initBackup } from './backup.js';
import { listarAlertas, restaurarDispensados, iconeDe } from './alertas.js';

// Agrupadas por assunto; dentro do grupo, na ordem de uso
const TOOLS = [
  { grupo: 'Dinheiro', nome: 'Orçamento doméstico', desc: 'Quanto entra, quanto sai e se cada parte da renda está dentro do combinado.', icon: 'wallet', href: 'budget.html' },
  { grupo: 'Dinheiro', nome: 'Situação de contas pendentes', desc: 'As contas fixas do mês, o que já foi pago e um aviso antes de cada vencimento.', icon: 'receipt', href: 'bills.html' },
  { grupo: 'Dinheiro', nome: 'Objetivos', desc: 'Quanto guardar por mês para chegar lá no prazo, e se isso cabe no orçamento.', icon: 'flag', href: 'goals.html' },
  { grupo: 'Dinheiro', nome: 'Compras conscientes', desc: 'Anote o preço do que você quer comprar e descubra quando a oferta é real.', icon: 'tag', href: 'wishlist.html' },
  { grupo: 'Dinheiro', nome: 'Calculadoras e simuladores', desc: 'Primeiro milhão, tempo até a meta, juros compostos, renda e aposentadoria.', icon: 'calculator', href: 'calculators.html' },
  { grupo: 'Dinheiro', nome: 'Conselhos', discreto: true, desc: 'Guias curtos para organizar o dinheiro, montar a reserva e fugir de juros e golpes.', icon: 'lightbulb', href: 'advice.html' },
  { grupo: 'Rotina', nome: 'Foco', desc: 'Um dia de cada vez: tarefas, notas, pomodoro, água e o quadro do que está andando.', icon: 'timer', href: 'focus.html' },
  { grupo: 'Rotina', nome: 'Planejador', desc: 'Datas que não podem passar, com aviso um mês antes, na semana e no próprio dia.', icon: 'calendarClock', href: 'planner.html' },
  { grupo: 'Rotina', nome: 'Lista de compras', desc: 'A lista do mercado já separada por corredor, com o que você sempre compra.', icon: 'cart', href: 'groceries.html' },
  { grupo: 'Rotina', nome: 'Exercícios', desc: 'Escolha o músculo no corpo e veja como executar cada exercício do jeito certo.', icon: 'dumbbell', href: 'workouts.html' },
  { grupo: 'Você', nome: 'Livros', desc: 'O que você está lendo, o que já leu e o desafio do ano, numa estante sua.', icon: 'book', href: 'books.html' },
  { grupo: 'Você', nome: 'Flashcards', desc: 'Seus cartões de memória: cada um volta no dia em que você estaria para esquecer.', icon: 'layers', href: 'flashcards.html' },
  { grupo: 'Você', nome: 'Diário', desc: 'Um lugar só seu para o dia, o humor e os hábitos que você está deixando para trás.', icon: 'pencil', href: 'journal.html' }
];

const user = await requireAuth();
initBackup(user.uid);

initPagina();
dadosProntos(); // o Hub não lê dados (só os avisos, que não gravam nada)

const grupos = [...new Set(TOOLS.map(t => t.grupo))];
// Ferramentas "discretas" (Conselhos) viram um link pequeno ao lado do título do grupo
document.getElementById('tool-list').innerHTML = grupos.map(g => {
  const doGrupo = TOOLS.filter(t => t.grupo === g && !t.discreto);
  return `
  <li class="tool-group">
    <div class="tool-group-head">
      <h2 class="tool-group-title">${g}</h2>
      ${TOOLS.filter(t => t.grupo === g && t.discreto).map(t => `
        <a class="tool-mini" href="${t.href}" title="${t.desc}">${icon(t.icon, 14)}<span>${t.nome}</span></a>`).join('')}
    </div>
    <ul class="tool-grid">
      ${doGrupo.map(t => `
        <li>
          <a class="tool-card" href="${t.href}">
            <span class="tool-icon">${icon(t.icon, 20)}</span>
            <span class="tool-text"><strong>${t.nome}</strong><span>${t.desc}</span></span>
            <span class="tool-go">${icon('arrowRight', 18)}</span>
          </a>
        </li>`).join('')}
    </ul>
  </li>`;
}).join('');

/* ---------- Alertas (hub.html#alertas, aberto pelo sino da faixa) ---------- */
// Uma tela dentro do próprio Hub: a lista completa, inclusive o que foi dispensado
const viewAlertas = document.getElementById('alertas-view');
const telaHub = [document.querySelector('.hub-head'), document.getElementById('tool-list')];

const itemAlerta = i => `
  <li><a class="alertas-item${i.atencao ? ' is-atencao' : ''}${i.dispensado ? ' is-dispensado' : ''}" href="${i.href}">
    <span class="alertas-item-icon">${icon(iconeDe(i), 18)}</span>
    <span class="alertas-item-txt">${escapeHtml(i.texto)}${i.dispensado ? '<small>Dispensado</small>' : ''}</span>
    <span class="alertas-item-go">${icon('arrowRight', 16)}</span>
  </a></li>`;

function grupoAlertas(titulo, itens) {
  if (!itens.length) return '';
  return `<div class="alertas-grupo"><h2 class="tool-group-title">${titulo}</h2><ul class="alertas-lista">${itens.map(itemAlerta).join('')}</ul></div>`;
}

async function renderAlertas() {
  viewAlertas.innerHTML = `
    <a class="alertas-voltar" href="hub.html">${icon('chevronLeft', 16)}Hub</a>
    <h1 id="alertas-title">Alertas</h1>
    <div class="alertas-corpo"><p class="alertas-vazio">Carregando…</p></div>`;
  const corpo = viewAlertas.querySelector('.alertas-corpo');
  let itens;
  try { itens = await listarAlertas(); } catch {
    corpo.innerHTML = '<p class="alertas-vazio">Não foi possível carregar os alertas agora.</p>';
    return;
  }
  if (location.hash !== '#alertas') return; // saiu da tela enquanto carregava
  if (!itens.length) {
    corpo.innerHTML = '<p class="alertas-vazio">Nada pendente: nenhuma conta perto do vencimento e nenhuma data chegando.</p>';
    return;
  }
  const algumDispensado = itens.some(i => i.dispensado);
  corpo.innerHTML = `
    ${grupoAlertas('Contas', itens.filter(i => i.tipo === 'conta'))}
    ${grupoAlertas('Datas', itens.filter(i => i.tipo === 'evento'))}
    ${algumDispensado ? '<button class="btn btn-ghost btn-sm alertas-restaurar" type="button">Mostrar os dispensados na faixa de novo</button>' : ''}`;
  corpo.querySelector('.alertas-restaurar')?.addEventListener('click', () => {
    restaurarDispensados();
    renderAlertas();
  });
}

function rotaHub() {
  const alertas = location.hash === '#alertas';
  viewAlertas.hidden = !alertas;
  telaHub.forEach(el => { el.hidden = alertas; });
  document.title = alertas ? 'Alertas · DataLife' : 'Hub · DataLife';
  if (alertas) { renderAlertas(); window.scrollTo(0, 0); }
}
window.addEventListener('hashchange', rotaHub);
rotaHub();

/* ---------- Instalar como app (PWA) ---------- */
// Só em celular e tablet. Android/Chrome/Edge: o navegador oferece o convite (beforeinstallprompt).
// iPhone/iPad: não há convite; o caminho é Compartilhar → Adicionar à Tela de Início.
const OCULTO = 'datalife:instalar-oculto';
const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Só no celular/tablet: no computador, o convite não aparece
const movel = ios || navigator.userAgentData?.mobile === true || /android|mobi/i.test(navigator.userAgent);

function renderInstalar() {
  const box = document.getElementById('instalar');
  let oculto = false;
  try { oculto = localStorage.getItem(OCULTO) === '1'; } catch { /* ok */ }
  const convite = window.__dlInstalar;
  if (!movel || instalado() || oculto || (!convite && !ios)) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <span class="instalar-icon">${icon('smartphone', 20)}</span>
    <div class="instalar-txt">
      <strong>DataLife como app</strong>
      <span>${convite
        ? 'Ícone na tela inicial, abre em tela cheia e funciona mesmo com a conexão instável.'
        : 'No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.'}</span>
    </div>
    <div class="instalar-acoes">
      ${convite ? '<button class="btn btn-primary btn-sm" type="button" data-instalar>Instalar</button>' : ''}
      <button class="icon-btn" type="button" data-ocultar aria-label="Não mostrar de novo">${icon('x', 16)}</button>
    </div>`;
}

document.getElementById('instalar').addEventListener('click', async e => {
  if (e.target.closest('[data-ocultar]')) {
    try { localStorage.setItem(OCULTO, '1'); } catch { /* ok */ }
    return renderInstalar();
  }
  if (e.target.closest('[data-instalar]') && window.__dlInstalar) {
    const convite = window.__dlInstalar;
    window.__dlInstalar = null;
    convite.prompt();
    await convite.userChoice.catch(() => null);
    renderInstalar();
  }
});
window.addEventListener('datalife:instalavel', renderInstalar);
window.addEventListener('appinstalled', renderInstalar);
renderInstalar();
