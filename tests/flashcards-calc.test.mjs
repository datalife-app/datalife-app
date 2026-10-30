// Regras puras dos flashcards (repetição espaçada, junção entre aparelhos, importação).
// Rodar: node --test tests/*.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

// utils.js mexe no DOM ao carregar: o mínimo para importar no Node
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = { addEventListener() {}, documentElement: { dataset: {}, classList: { toggle() {} } } };
globalThis.window = globalThis;

const m = await import('../js/flashcards-calc.js');
const HOJE = '2026-10-30';
const nova = () => ({ rep: 0, int: 0, ease: m.EASE_INI, venc: '', lapsos: 0, ini: '', t: 0 });

test('intervalos: carta nova e ordem preservada com a variação', () => {
  assert.deepEqual(m.intervalos(nova()), { 1: 0, 2: 1, 3: 1, 4: 4 });
  for (let int = 1; int < 400; int += 7) {
    const iv = m.intervalos({ ...nova(), rep: 3, int }, `c${int}:${HOJE}`);
    assert.ok(iv[2] < iv[3] && iv[3] < iv[4], `int ${int}: ${JSON.stringify(iv)}`);
    assert.ok(iv[4] <= m.INT_MAX);
  }
});

test('responder: o intervalo gravado é o mesmo do botão', () => {
  const s = { ...nova(), rep: 4, int: 30 };
  const chave = `abc:${HOJE}`;
  const iv = m.intervalos(s, chave);
  for (const nota of [2, 3, 4]) assert.equal(m.responder(s, nota, HOJE, chave).int, iv[nota]);
});

test('responder: errei volta para hoje e só conta lapso se já tinha aprendido', () => {
  const r1 = m.responder(nova(), 1, HOJE, 'x', 5);
  assert.equal(r1.venc, HOJE);
  assert.equal(r1.lapsos, 0);
  assert.equal(r1.ini, HOJE);
  assert.equal(r1.t, 5);
  const r2 = m.responder({ ...nova(), rep: 3, int: 10, ini: '2026-01-01' }, 1, HOJE, 'x');
  assert.equal(r2.lapsos, 1);
  assert.equal(r2.rep, 0);
  assert.equal(r2.ini, '2026-01-01');
});

test('contagem e fila: vencidas primeiro, novas no limite do dia', () => {
  const b = {
    n: 4, novosDia: 1,
    cartas: [1, 2, 3, 4].map(i => ({ id: `c${i}`, criado: i })),
    srs: { c1: { ...nova(), rep: 1, int: 1, venc: '2026-10-29', ini: '2026-10-28' } }
  };
  assert.deepEqual(m.contagem(b, HOJE), { revisar: 1, novas: 1, novasTotal: 3, total: 4 });
  assert.deepEqual(m.filaDoDia(b, HOJE), ['c1', 'c2']);
  assert.deepEqual(m.filaDoDia(b, HOJE, 10), ['c1', 'c2', 'c3', 'c4']);
});

test('juntarProgresso: vence a resposta mais recente de cada carta', () => {
  const local = { srs: { a: { t: 10 }, b: { t: 5 }, novaDaqui: { t: 30 }, zerada: { t: 1 } }, hist: { [HOJE]: [3, 2] } };
  const remoto = { srs: { a: { t: 20 }, b: { t: 2 } }, hist: { [HOJE]: [1, 1] } };
  const { srs, hist, daqui } = m.juntarProgresso(local, remoto, 25);
  assert.equal(srs.a.t, 20);
  assert.equal(srs.b.t, 5);
  assert.ok(srs.novaDaqui, 'respondida depois da gravação de lá: fica');
  assert.ok(!srs.zerada, 'mais antiga que a gravação de lá: foi recomeçada ou excluída lá');
  assert.deepEqual(hist[HOJE], [3, 2]);
  assert.equal(daqui, true);
  assert.equal(m.juntarProgresso({ srs: {}, hist: {} }, remoto, 25).daqui, false);
});

test('ajustarAoConteudo: tira progresso de cartas excluídas e acerta n', () => {
  const b = { n: 3, cartas: [{ id: 'a' }], srs: { a: {}, b: {} } };
  assert.equal(m.ajustarAoConteudo(b), true);
  assert.deepEqual(Object.keys(b.srs), ['a']);
  assert.equal(b.n, 1);
  assert.equal(m.ajustarAoConteudo(b), false);
});

test('parseTexto: CSV com aspas, várias linhas, cabeçalho e comentários', () => {
  const r = m.parseTexto('Frente;Verso\n#notetype:Basic\num;1\n"duas\nlinhas";"com ""aspas"""\nsem verso\n', 1000);
  assert.deepEqual(r.cartas, [{ frente: 'um', verso: '1' }, { frente: 'duas\nlinhas', verso: 'com "aspas"' }]);
  assert.equal(r.ignoradas, 1);
  const tab = m.parseTexto('x;y\tz\r\na\tb', 1000);
  assert.deepEqual(tab.cartas, [{ frente: 'x;y', verso: 'z' }, { frente: 'a', verso: 'b' }]);
  assert.equal(m.parseTexto('a;' + 'b'.repeat(11), 10).ignoradas, 1);
});

test('chaveCarta: repetida ignora acento, caixa e espaços', () => {
  assert.equal(m.chaveCarta({ frente: ' Coração ', verso: 'HEART' }), m.chaveCarta({ frente: 'coracao', verso: 'heart' }));
  assert.notEqual(m.chaveCarta({ frente: 'a', verso: '1' }), m.chaveCarta({ frente: 'a', verso: '2' }));
});

test('histórico: sequência de dias e taxa de acerto', () => {
  const hist = { '2026-10-28': [2, 1], '2026-10-29': [3, 3] };
  assert.equal(m.sequenciaEstudo(hist, HOJE), 2);
  assert.equal(m.taxaAcerto(hist, HOJE), 4 / 5);
  assert.equal(m.taxaAcerto({}, HOJE), null);
  assert.equal(m.rotuloIntervalo(0), 'agora');
  assert.equal(m.rotuloIntervalo(1), '1 dia');
  assert.equal(m.rotuloIntervalo(800), '2,2 anos');
});
