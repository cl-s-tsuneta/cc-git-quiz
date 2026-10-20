// questions.js（クイズの問題データ）の整合性テスト。実行: node --test tests/
//
// questions.js はブラウザ用の通常スクリプトで、window.QUESTIONS / window.CATEGORIES を
// 設定するだけ。Node では vm の中で window を用意して読み込む。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCES = ['page', 'general'];

function loadQuestions() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'questions.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox);
  return sandbox.window;
}

// 問題データの不整合を、人が読める文字列の一覧で返す（空なら問題なし）。
function problems(questions, categories) {
  if (!Array.isArray(questions) || questions.length === 0) return ['QUESTIONS must be a non-empty array'];
  if (!Array.isArray(categories) || categories.length === 0) return ['CATEGORIES must be a non-empty array'];

  const out = [];
  const ids = new Set();
  const texts = new Set();

  questions.forEach((q, n) => {
    const at = `#${n + 1}${q && q.id ? ` (${q.id})` : ''}`;
    if (!q || typeof q !== 'object') { out.push(`${at}: not an object`); return; }

    for (const key of ['id', 'category', 'question', 'explanation']) {
      if (typeof q[key] !== 'string' || q[key].trim() === '') out.push(`${at}: ${key} must be a non-empty string`);
    }
    if (ids.has(q.id)) out.push(`${at}: duplicate id`);
    ids.add(q.id);
    if (texts.has(q.question)) out.push(`${at}: duplicate question text`);
    texts.add(q.question);

    if (!categories.includes(q.category)) out.push(`${at}: unknown category`);
    if (!SOURCES.includes(q.source)) out.push(`${at}: source must be one of ${SOURCES.join(', ')}`);

    if (!Array.isArray(q.choices) || q.choices.length !== 4) {
      out.push(`${at}: choices must have exactly 4 items`);
    } else {
      q.choices.forEach((c, i) => {
        if (typeof c !== 'string' || c.trim() === '') out.push(`${at}: choice ${i} must be a non-empty string`);
        else if (c !== c.trim()) out.push(`${at}: choice ${i} has leading/trailing whitespace`);
      });
      if (new Set(q.choices).size !== q.choices.length) out.push(`${at}: choices must be distinct`);
    }

    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) out.push(`${at}: answer must be an integer 0-3`);
  });

  // スタート画面はカテゴリごとにカードを出すので、問題が 0 件のカテゴリがあってはいけない
  for (const c of categories) {
    if (!questions.some((q) => q && q.category === c)) out.push(`category "${c}" has no questions`);
  }
  return out;
}

// ---- 本物のデータ（正常系） ----

const { QUESTIONS, CATEGORIES } = loadQuestions();

test('questions.js defines QUESTIONS and CATEGORIES as arrays', () => {
  assert.ok(Array.isArray(QUESTIONS));
  assert.ok(Array.isArray(CATEGORIES));
  assert.ok(QUESTIONS.length > 0);
  assert.ok(CATEGORIES.length > 0);
});

test('the real question data has no structural problems', () => {
  assert.deepEqual(problems(QUESTIONS, CATEGORIES), []);
});

test('every category has at least one question (the start screen shows one card per category)', () => {
  for (const c of CATEGORIES) {
    assert.ok(QUESTIONS.some((q) => q.category === c), `no question in "${c}"`);
  }
});

test('git / gh questions are marked source "general"; Claude Code questions are marked "page"', () => {
  // 出題元ページ(cc-handson)に無い git / gh は general、ページ由来は page、という取り決め
  const general = ['Git', 'GitHub CLI (gh)'];
  for (const q of QUESTIONS) {
    const expected = general.includes(q.category) ? 'general' : 'page';
    assert.equal(q.source, expected, `${q.id} (${q.category}) should be source "${expected}"`);
  }
});

test('the correct choice is a real, non-empty choice for every question', () => {
  for (const q of QUESTIONS) {
    assert.equal(typeof q.choices[q.answer], 'string', q.id);
    assert.notEqual(q.choices[q.answer].trim(), '', q.id);
  }
});

// ---- 検査関数そのものの異常系（壊したデータを、ちゃんと検出できるか） ----
// 本物のデータが通るだけでは、検査が緩すぎても気付けない。1つずつ壊して検出を確かめる。

const CATS = ['A', 'B'];
const good = () => ({
  id: 'q1', category: 'A', question: 'Q?', choices: ['a', 'b', 'c', 'd'],
  answer: 0, explanation: 'because', source: 'page',
});
const goodList = () => [good(), { ...good(), id: 'q2', category: 'B', question: 'Q2?' }];

test('problems(): accepts a minimal valid data set', () => {
  assert.deepEqual(problems(goodList(), CATS), []);
});

const broken = [
  ['QUESTIONS is empty', () => [], 'non-empty array'],
  ['an item is not an object', () => [...goodList(), null], 'not an object'],
  ['id is missing', () => { const l = goodList(); delete l[0].id; return l; }, 'id must be a non-empty string'],
  ['id is blank', () => { const l = goodList(); l[0].id = '  '; return l; }, 'id must be a non-empty string'],
  ['id is duplicated', () => { const l = goodList(); l[1].id = 'q1'; return l; }, 'duplicate id'],
  ['question text is duplicated', () => { const l = goodList(); l[1].question = 'Q?'; return l; }, 'duplicate question text'],
  ['explanation is empty', () => { const l = goodList(); l[0].explanation = ''; return l; }, 'explanation must be a non-empty string'],
  ['category is unknown', () => { const l = goodList(); l[0].category = 'Z'; return l; }, 'unknown category'],
  ['source is invalid', () => { const l = goodList(); l[0].source = 'web'; return l; }, 'source must be one of'],
  ['only 3 choices', () => { const l = goodList(); l[0].choices = ['a', 'b', 'c']; return l; }, 'exactly 4 items'],
  ['5 choices', () => { const l = goodList(); l[0].choices = ['a', 'b', 'c', 'd', 'e']; return l; }, 'exactly 4 items'],
  ['choices is not an array', () => { const l = goodList(); l[0].choices = 'abcd'; return l; }, 'exactly 4 items'],
  ['a choice is empty', () => { const l = goodList(); l[0].choices[2] = ''; return l; }, 'choice 2 must be a non-empty string'],
  ['a choice has surrounding whitespace', () => { const l = goodList(); l[0].choices[1] = ' b'; return l; }, 'leading/trailing whitespace'],
  ['choices are duplicated', () => { const l = goodList(); l[0].choices[3] = 'a'; return l; }, 'choices must be distinct'],
  ['answer is 4 (out of range)', () => { const l = goodList(); l[0].answer = 4; return l; }, 'answer must be an integer 0-3'],
  ['answer is -1', () => { const l = goodList(); l[0].answer = -1; return l; }, 'answer must be an integer 0-3'],
  ['answer is a string "1"', () => { const l = goodList(); l[0].answer = '1'; return l; }, 'answer must be an integer 0-3'],
  ['answer is a non-integer 1.5', () => { const l = goodList(); l[0].answer = 1.5; return l; }, 'answer must be an integer 0-3'],
];

for (const [name, make, expected] of broken) {
  test(`problems(): detects "${name}"`, () => {
    const found = problems(make(), CATS);
    assert.ok(found.some((p) => p.includes(expected)), `expected a problem containing "${expected}", got: ${JSON.stringify(found)}`);
  });
}

test('problems(): detects a category that has no questions', () => {
  const found = problems([good()], CATS); // 'B' に問題がない
  assert.ok(found.some((p) => p.includes('category "B" has no questions')), JSON.stringify(found));
});

test('problems(): rejects missing or empty CATEGORIES', () => {
  assert.ok(problems(goodList(), []).some((p) => p.includes('CATEGORIES')));
  assert.ok(problems(goodList(), undefined).some((p) => p.includes('CATEGORIES')));
});
