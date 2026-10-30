/* ============================================
   DataLife — Service worker (PWA)
   ============================================
   - Mesmo domínio: rede primeiro, cache como reserva (offline). Online,
     você sempre recebe a versão publicada; sem rede, a última que abriu.
   - SDK do Firebase (gstatic, URL com versão fixa): cache primeiro.
   - NUNCA guarda respostas de dados ou login (Firestore, Auth, googleapis):
     isso fica com o cache criptografado do próprio navegador/Firestore,
     e o service worker nem intercepta essas requisições.
   Troque VERSAO ao publicar mudanças na lista de arquivos.
   ============================================ */

const VERSAO = 'datalife-v6';
const SDK = 'https://www.gstatic.com/firebasejs/';
const SHELL = [
  './',
  './advice.html',
  './bills.html',
  './books.html',
  './budget.html',
  './calculators.html',
  './flashcards.html',
  './focus.html',
  './goals.html',
  './groceries.html',
  './hub.html',
  './index.html',
  './journal.html',
  './planner.html',
  './wishlist.html',
  './workouts.html',
  './css/calculadoras.css',
  './css/compras.css',
  './css/conselhos.css',
  './css/desejos.css',
  './css/diario.css',
  './css/exercicios.css',
  './css/ferramentas.css',
  './css/flashcards.css',
  './css/foco.css',
  './css/livros.css',
  './css/main.css',
  './css/objetivos.css',
  './css/orcamento.css',
  './css/pagamentos.css',
  './css/pages.css',
  './css/planejador.css',
  './css/temas.css',
  './css/vicios.css',
  './js/alertas.js',
  './js/auth.js',
  './js/backup.js',
  './js/calc-chart.js',
  './js/calculadora-aposentadoria.js',
  './js/calculadora-juros.js',
  './js/calculadora-meta.js',
  './js/calculadora-milhao.js',
  './js/calculadora-renda.js',
  './js/calculadoras-calc.js',
  './js/calculadoras-ui.js',
  './js/calculadoras.js',
  './js/cofre-ui.js',
  './js/compras-db.js',
  './js/compras.js',
  './js/config.js',
  './js/conselhos-data.js',
  './js/conselhos-db.js',
  './js/conselhos.js',
  './js/copy-dialog.js',
  './js/cripto.js',
  './js/datepicker.js',
  './js/db.js',
  './js/desejos-db.js',
  './js/desejos.js',
  './js/diario-calc.js',
  './js/diario-db.js',
  './js/diario.js',
  './js/donut.js',
  './js/escala.js',
  './js/exercicios-data.js',
  './js/exercicios-db.js',
  './js/exercicios.js',
  './js/firebase-init.js',
  './js/flashcards-calc.js',
  './js/flashcards-db.js',
  './js/flashcards.js',
  './js/foco-db.js',
  './js/foco-historico.js',
  './js/foco-notas.js',
  './js/foco-pomodoro.js',
  './js/foco-quadro.js',
  './js/foco-saude.js',
  './js/foco-tarefas.js',
  './js/foco.js',
  './js/hub.js',
  './js/livro-dialog.js',
  './js/livros-calc.js',
  './js/livros-db.js',
  './js/livros.js',
  './js/login.js',
  './js/objetivo-chart.js',
  './js/objetivo-dialog.js',
  './js/objetivos-calc.js',
  './js/objetivos-db.js',
  './js/objetivos.js',
  './js/orcamento.js',
  './js/pagamentos-db.js',
  './js/pagamentos.js',
  './js/pagina.js',
  './js/planejador-db.js',
  './js/planejador.js',
  './js/recorrentes.js',
  './js/rendas-dialog.js',
  './js/search-dialog.js',
  './js/selectpicker.js',
  './js/store.js',
  './js/tema-picker.js',
  './js/treino-data.js',
  './js/treino-db.js',
  './js/tema.js',
  './js/utils.js',
  './js/validacao.js',
  './js/vicios-db.js',
  './js/vicios.js',
  './js/visao.js',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/fonts/red-hat-text-latin.woff2',
  './assets/fonts/schibsted-grotesk-latin.woff2',
  './manifest.webmanifest'
];

self.addEventListener('install', e => {
  // Um a um: um arquivo que falhe não impede o resto (nem a instalação)
  e.waitUntil(caches.open(VERSAO)
    .then(c => Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('datalife-') && k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function redePrimeiro(req) {
  const cache = await caches.open(VERSAO);
  // Páginas são guardadas sem a query (?dia=…): uma entrada por página, não por dia visitado
  const chave = req.mode === 'navigate' ? new URL(req.url).pathname : req;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put(chave, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(chave, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('./hub.html')) || Response.error();
    throw err;
  }
}

async function cachePrimeiro(req) {
  const cache = await caches.open(VERSAO);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // config.js e firebase-init.js também passam por aqui: são públicos por natureza
    e.respondWith(redePrimeiro(req));
  } else if (req.url.startsWith(SDK) && /\/\d+\.\d+\.\d+\//.test(url.pathname)) {
    e.respondWith(cachePrimeiro(req));
  }
  // Todo o resto (Firestore, Auth, googleapis, YouTube, imagens externas): direto à rede.
});
