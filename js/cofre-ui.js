/* ============================================
   DataLife — Cadeado do Diário (telas)
   ============================================
   Tela de senha quando trancado e o diálogo para ligar, trocar a senha,
   trancar agora ou desligar. A criptografia em si está em cripto.js.
   Usado pelo Diário (com os Vícios) e pelos Flashcards: a mesma senha
   e a mesma chave cifram os três.
   ============================================ */

import {
  iniciarCofre, situacao, destrancar, trancar, criarCofre, trocarSenha, prepararDesligar, cancelarDesligar, desligarCofre,
  vigiarConfig, modoResgate, temChave, prepararMigracao
} from './cripto.js';
import { fetchEntradas, regravarDiario, regravarForaDiario } from './diario-db.js';
import { fetchVicios, regravarVicios, regravarForaVicios } from './vicios-db.js';
import { carregarFlashcards, regravarFlashcards, regravarForaFlashcards } from './flashcards-db.js';
import { icon, showToast } from './utils.js';
import { enhanceSelect } from './selectpicker.js';

const $ = id => document.getElementById(id);
const MIN = 10;

/**
 * Tudo o que o cadeado cifra. carregar: tudo aberto; regravar: no formato
 * atual do cadeado; fora: só o que ficou fora dele (ver foraDoCadeado).
 */
const RECURSOS = [
  { carregar: fetchEntradas, regravar: regravarDiario, fora: regravarForaDiario },
  { carregar: fetchVicios, regravar: regravarVicios, fora: regravarForaVicios },
  { carregar: carregarFlashcards, regravar: regravarFlashcards, fora: regravarForaFlashcards }
];
const carregarTudo = uid => Promise.all(RECURSOS.map(r => r.carregar(uid)));
/** Se parar no meio, o que faltou fica marcado: é corrigido na próxima abertura (curarSePreciso). */
async function regravarTudo(uid, dados) {
  try {
    for (const [i, r] of RECURSOS.entries()) await r.regravar(uid, dados[i]);
  } catch (e) {
    marcarCura();
    throw e;
  }
}
const regravarFora = async uid => (await Promise.all(RECURSOS.map(r => r.fora(uid)))).reduce((a, n) => a + n, 0);

/* ---------- Cadeado mudou em outro aparelho ---------- */
// Marca (por aparelho) que algo pode ter ficado fora do cadeado novo: corrigido ao destrancar
const CURAR_KEY = 'datalife:cofre-curar';
const marcarCura = () => { try { localStorage.setItem(CURAR_KEY, '1'); } catch { /* ok */ } };
const curaPendente = () => { try { return localStorage.getItem(CURAR_KEY) === '1'; } catch { return false; } };

/**
 * Ligado, desligado ou recriado em outro aparelho com esta aba aberta.
 * As gravações já estão travadas (selar recusa). Desligado: o que esta aba
 * cifrou e o outro aparelho não converteu volta em claro (senão ficaria
 * ilegível para sempre). Recriado: pede a senha nova e passa o que ficou
 * com a chave antiga para a nova (nada sai em claro com o cadeado ligado).
 * Ligado: o que estiver em claro é cifrado depois de destrancar. Então recarrega.
 */
async function cadeadoMudou({ antes, depois }) {
  if (depois) marcarCura();
  if (antes && depois && temChave()) return migrar(depois);
  showToast('O cadeado foi alterado em outro aparelho. Recarregando para continuar com segurança…', 'error', 10000);
  if (antes && temChave()) {
    try {
      modoResgate();
      await regravarFora(user.uid);
    } catch (e) {
      console.error(e);
    }
  }
  setTimeout(() => location.reload(), 1500);
}

/** Cadeado recriado em outro aparelho: a senha nova, para recifrar o que esta aba ainda tem na chave antiga. */
function migrar(depois) {
  prepararMigracao(depois);
  document.body.dataset.cofre = 'migrando'; // esconde o conteúdo mesmo se a página redesenhar
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  const abas = document.querySelector('.topbar .tabs');
  if (abas) abas.style.visibility = 'hidden';
  // Formulário limpo (sem o ouvinte da abertura da página)
  const velho = $('cofre-abrir');
  const f = velho.cloneNode(true);
  velho.replaceWith(f);
  f.querySelector('h1').textContent = 'Cadeado novo';
  f.querySelector('h1 + p').textContent = 'O cadeado foi recriado em outro aparelho, com outra senha. Digite a senha nova para continuar: o que esta página gravou com a senha antiga passa para a nova.';
  f.lembrar.closest('.check-row').hidden = true;
  $('cofre-tela').hidden = false;
  f.senha.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Abrindo…';
    $('cofre-erro').hidden = true;
    try {
      await destrancar(f.senha.value);
    } catch (err) {
      $('cofre-erro').textContent = err.message === 'senha' ? 'Senha incorreta.' : 'Não foi possível abrir. Tente de novo.';
      $('cofre-erro').hidden = false;
      btn.disabled = false;
      btn.textContent = 'Destrancar';
      return f.senha.select();
    }
    btn.textContent = 'Cifrando…';
    try {
      await regravarFora(user.uid);
    } catch (err) {
      console.error(err); // o que faltou fica com a chave antiga; a cura marcada cuida do que está em claro
    }
    location.reload();
  });
}

/** Destrancado (ou sem cadeado): corrige o que ficou fora do estado atual, se outro aparelho mexeu no cadeado. */
async function curarSePreciso() {
  if (!curaPendente()) return;
  try {
    const n = await regravarFora(user.uid);
    localStorage.removeItem(CURAR_KEY);
    if (n) showToast(`${n} ${n === 1 ? 'documento ajustado' : 'documentos ajustados'} ao cadeado atual.`);
  } catch (e) {
    console.error(e); // tenta de novo na próxima abertura
  }
}

/**
 * Quem tem gravação pendente (o texto do Diário salva 0,8 s depois da última
 * tecla) se registra aqui: antes de esquecer a chave, o cadeado espera.
 */
export const antesDeTrancar = new Set();
async function trancarComSeguranca() {
  try { await Promise.all([...antesDeTrancar].map(f => f())); } catch (e) { console.error(e); }
  await trancar();
}

/* ---------- Trancar sozinho (por aparelho) ---------- */
const AUTO_KEY = 'datalife:cofre-auto';
const AUTO_OPCOES = [0, 5, 10, 15, 30, 60]; // minutos sem uso; 0 = nunca
const lerAuto = () => { try { const n = Number(localStorage.getItem(AUTO_KEY)); return AUTO_OPCOES.includes(n) ? n : 0; } catch { return 0; } };
let ultimoUso = Date.now(), vigia = 0;

/** Sem uso por N minutos (contando com a aba em segundo plano): tranca e volta à tela de senha. */
function vigiarInatividade() {
  clearInterval(vigia);
  const min = lerAuto();
  if (!min || situacao() !== 'aberto') return;
  ultimoUso = Date.now();
  vigia = setInterval(async () => {
    if (situacao() !== 'aberto') return clearInterval(vigia); // desligado ou já trancado
    if (Date.now() - ultimoUso < min * 60_000) return;
    clearInterval(vigia);
    await trancarComSeguranca();
    location.reload();
  }, 15_000);
}
for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
  window.addEventListener(ev, () => { ultimoUso = Date.now(); }, { passive: true, capture: true });
}
// Voltou para a aba depois do prazo: tranca na hora
document.addEventListener('visibilitychange', () => {
  const min = lerAuto();
  if (!document.hidden && min && situacao() === 'aberto' && Date.now() - ultimoUso >= min * 60_000) trancarComSeguranca().then(() => location.reload());
});
let user = null;

function iconeBotao() {
  const s = situacao();
  $('btn-cofre').innerHTML = icon(s === 'desligado' ? 'unlock' : 'lock');
  $('btn-cofre').title = s === 'desligado' ? 'Cadeado: desligado' : 'Cadeado: ligado';
}

/** Mostra a tela de senha até destrancar. Resolve quando o conteúdo pode ser lido. */
export async function exigirCofre(u) {
  user = u;
  $('cofre-tela').querySelector('.cofre-icon').innerHTML = icon('lock', 26);
  let s;
  try {
    s = await iniciarCofre(user.uid);
  } catch (e) {
    console.error(e);
    s = 'desligado'; // sem rede e sem cache: as leituras seguintes avisam
  }
  iconeBotao();
  bindDialog();
  vigiarConfig(user.uid, cadeadoMudou);
  $('cofre-tela').querySelector('.cofre-voltar').insertAdjacentHTML('afterbegin', icon('chevronLeft', 15));
  if (s !== 'trancado') {
    vigiarInatividade();
    return curarSePreciso();
  }
  $('cofre-tela').hidden = false;
  const abas = document.querySelector('.topbar .tabs');
  if (abas) abas.style.visibility = 'hidden';
  const f = $('cofre-abrir');
  f.senha.focus();
  await new Promise(resolve => {
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = f.querySelector('[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Abrindo…';
      $('cofre-erro').hidden = true;
      try {
        await destrancar(f.senha.value, { lembrarAparelho: f.lembrar.checked });
        f.reset();
        $('cofre-tela').hidden = true;
        if (abas) abas.style.visibility = '';
        iconeBotao();
        vigiarInatividade();
        await curarSePreciso();
        resolve();
      } catch (err) {
        $('cofre-erro').textContent = err.message === 'senha' ? 'Senha incorreta.' : 'Não foi possível abrir. Tente de novo.';
        $('cofre-erro').hidden = false;
        f.senha.select();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Destrancar';
      }
    });
  });
}

/* ---------- Diálogo ---------- */

const campoSenha = (name, label, auto = 'new-password') => `
  <label class="field"><span class="field-label">${label}</span>
    <input class="input" type="password" name="${name}" required autocomplete="${auto}" maxlength="200"></label>`;

function render() {
  const s = situacao();
  $('cofre-sub').textContent = s === 'desligado' ? 'Desligado' : 'Ligado: Diário, Vícios e Flashcards cifrados neste navegador';
  const body = $('cofre-body');
  if (s === 'desligado') {
    body.innerHTML = `
      <div class="cofre-info">
        <p>Com o cadeado, as entradas do Diário, os Vícios e os Flashcards são <strong>cifrados no seu aparelho</strong> antes de ir para o banco de dados. Nem o Google nem quem conseguisse acesso ao banco leria o conteúdo.</p>
        <ul>
          <li>${icon('lock', 14)}<span>AES-256 com uma chave derivada da sua senha (PBKDF2, 600 mil rodadas).</span></li>
          <li>${icon('info', 14)}<span><strong>Sem a senha, não há recuperação.</strong> Anote-a num gerenciador de senhas.</span></li>
          <li>${icon('smartphone', 14)}<span>Cada aparelho pede a senha uma vez por visita, ou fica lembrado até você sair.</span></li>
        </ul>
      </div>
      <form id="cofre-ligar" autocomplete="off" class="form-body cofre-form">
        <input type="text" name="username" autocomplete="username" value="DataLife: cadeado do Diário" hidden>
        ${campoSenha('senha', `Senha (mínimo ${MIN} caracteres; uma frase é ótima)`)}
        ${campoSenha('confirma', 'Repita a senha')}
        <label class="check-row"><input type="checkbox" name="lembrar"> <span>Lembrar neste aparelho</span></label>
        <label class="check-row"><input type="checkbox" name="ciente" required> <span>Entendo que, se esquecer a senha, o Diário, os Vícios e os Flashcards não podem ser recuperados.</span></label>
        <button class="btn btn-primary" type="submit">Ligar o cadeado</button>
      </form>`;
    return;
  }
  const auto = lerAuto();
  body.innerHTML = `
    <button class="btn btn-ghost cofre-acao" type="button" data-acao="trancar">${icon('lock', 16)} Trancar agora</button>
    <label class="field cofre-auto"><span class="field-label">Trancar sozinho depois de</span>
      <select class="input" id="cofre-auto">
        ${AUTO_OPCOES.map(m => `<option value="${m}" ${m === auto ? 'selected' : ''}>${m ? `${m} minutos sem uso` : 'Nunca (só quando eu trancar)'}</option>`).join('')}
      </select>
      <span class="field-hint">Vale neste aparelho. Com a aba em segundo plano, o tempo continua contando.</span>
    </label>
    <details class="cofre-sec">
      <summary>Trocar a senha</summary>
      <form id="cofre-trocar" autocomplete="off" class="form-body cofre-form">
        <input type="text" name="username" autocomplete="username" value="DataLife: cadeado do Diário" hidden>
        ${campoSenha('atual', 'Senha atual', 'current-password')}
        ${campoSenha('senha', `Senha nova (mínimo ${MIN})`)}
        ${campoSenha('confirma', 'Repita a senha nova')}
        <button class="btn btn-primary btn-sm" type="submit">Trocar senha</button>
      </form>
    </details>
    <details class="cofre-sec">
      <summary>Desligar o cadeado</summary>
      <form id="cofre-desligar" autocomplete="off" class="form-body cofre-form">
        <p class="text-muted">Tudo volta a ser gravado sem cifra (ainda protegido pelas regras do banco e pelo seu login).</p>
        <input type="text" name="username" autocomplete="username" value="DataLife: cadeado do Diário" hidden>
        ${campoSenha('senha', 'Senha do cadeado', 'current-password')}
        <button class="btn btn-ghost btn-sm danger-btn" type="submit">Desligar</button>
      </form>
    </details>`;
}

function validarNova(f) {
  f.confirma.setCustomValidity('');
  f.senha.setCustomValidity('');
  if (f.senha.value.length < MIN) f.senha.setCustomValidity(`Use pelo menos ${MIN} caracteres.`);
  else if (f.senha.value !== f.confirma.value) f.confirma.setCustomValidity('As senhas não são iguais.');
  return f.reportValidity();
}

async function ocupado(f, texto, fn) {
  const btn = f.querySelector('[type="submit"]');
  const antes = btn.textContent;
  btn.disabled = true;
  btn.textContent = texto;
  try { await fn(); } finally { btn.disabled = false; btn.textContent = antes; }
}

let ligado = false;
function bindDialog() {
  if (ligado) return;
  ligado = true;
  const dlg = $('cofre-dialog');
  dlg.querySelector('[data-close]').innerHTML = icon('x', 18);
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  $('btn-cofre').addEventListener('click', () => {
    if (situacao() === 'trancado') return $('cofre-abrir').senha.focus();
    render();
    dlg.showModal();
    const sel = $('cofre-auto');
    if (sel) enhanceSelect(sel);
  });

  $('cofre-body').addEventListener('click', async e => {
    if (e.target.closest('[data-acao="trancar"]')) {
      await trancarComSeguranca();
      location.reload();
    }
  });
  $('cofre-body').addEventListener('input', e => e.target.setCustomValidity?.(''));
  $('cofre-body').addEventListener('change', e => {
    if (e.target.id !== 'cofre-auto') return;
    try { localStorage.setItem(AUTO_KEY, e.target.value); } catch { /* ok */ }
    vigiarInatividade();
    showToast(Number(e.target.value) ? `O cadeado tranca sozinho depois de ${e.target.value} minutos sem uso.` : 'Trancar sozinho: desligado.');
  });

  $('cofre-body').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.id === 'cofre-ligar') {
        if (!validarNova(f)) return;
        await ocupado(f, 'Cifrando…', async () => {
          // Lê tudo em claro antes; depois de criar o cofre, regrava cifrado
          const dados = await carregarTudo(user.uid);
          await criarCofre(user.uid, f.senha.value, { lembrarAparelho: f.lembrar.checked });
          await regravarTudo(user.uid, dados);
          const n = dados[0].size;
          showToast(`Cadeado ligado: ${n} ${n === 1 ? 'entrada cifrada' : 'entradas cifradas'}.`);
        });
      } else if (f.id === 'cofre-trocar') {
        if (!validarNova(f)) return;
        await ocupado(f, 'Trocando…', async () => {
          await trocarSenha(f.atual.value, f.senha.value);
          showToast('Senha trocada. Outros aparelhos vão pedir a senha nova.');
        });
      } else if (f.id === 'cofre-desligar') {
        await ocupado(f, 'Decifrando…', async () => {
          await prepararDesligar(f.senha.value);
          try {
            await regravarTudo(user.uid, await carregarTudo(user.uid));
          } catch (err) {
            cancelarDesligar();
            throw err;
          }
          await desligarCofre(user.uid);
          showToast('Cadeado desligado.');
        });
      }
      $('cofre-dialog').close();
      iconeBotao();
      vigiarInatividade(); // liga/desliga o trancar sozinho conforme o novo estado
    } catch (err) {
      console.error(err);
      if (err.message === 'senha') {
        const campo = f.atual || f.senha;
        campo.setCustomValidity('Senha incorreta.');
        campo.reportValidity();
      } else {
        showToast(`Não foi possível concluir: ${err.code || err.message || 'erro'}. Nada foi perdido; tente de novo.`, 'error', 6000);
      }
    }
  });
}
