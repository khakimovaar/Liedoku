import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFICULTIES, generate } from '../src/generator.js';
import { BOXES, boxOf, COLS, ROWS } from '../src/grid.js';
import { logicSolve } from '../src/logic.js';
import { createRng } from '../src/rng.js';
import { countSolutions } from '../src/verify.js';

const puzzles = Object.keys(DIFFICULTIES).flatMap((difficulty) =>
  [11, 222, 3333, 44444].map((seed) => generate(difficulty, seed)),
);

test('в решении нет повторов в рядах, столбцах и блоках', () => {
  for (const { solution } of puzzles) {
    for (const house of [...ROWS, ...COLS, ...BOXES]) {
      assert.equal(new Set(house.map((cell) => solution[cell])).size, 9);
    }
  }
});

test('в каждом блоке ровно один лжец', () => {
  for (const { givens, solution, liars } of puzzles) {
    assert.equal(liars.length, 9);
    assert.equal(new Set(liars.map(boxOf)).size, 9);
    for (let cell = 0; cell < 81; cell++) {
      if (!givens[cell]) continue;
      assert.equal(givens[cell] !== solution[cell], liars.includes(cell));
    }
  }
});

test('независимый перебор подтверждает единственность решения', () => {
  for (const { givens } of puzzles) assert.equal(countSolutions(givens, 2), 1);
});

test('логика решает поле без угадывания', () => {
  for (const { givens, solution } of puzzles) {
    const result = logicSolve(givens);
    assert.equal(result.solved, true);
    assert.deepEqual(result.solution, solution);
  }
});

test('лёгкий уровень не требует рассуждений от противного', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { assumptions, deepAssumptions } = generate('easy', seed);
    assert.equal(assumptions + deepAssumptions, 0);
  }
});

test('на лёгком уровне в каждом блоке есть пара одинаковых цифр', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { givens } = generate('easy', seed);
    for (const box of BOXES) {
      const digits = box.map((cell) => givens[cell]).filter(Boolean);
      assert.ok(new Set(digits).size < digits.length);
    }
  }
});

test('рассуждений от противного становится больше с уровнем', () => {
  const total = (difficulty) =>
    puzzles.filter((p) => p.difficulty === difficulty).reduce((sum, p) => sum + p.assumptions, 0);
  assert.ok(total('easy') <= total('medium'));
  assert.ok(total('medium') <= total('hard'));
});

test('один сид всегда даёт одно и то же поле', () => {
  assert.deepEqual(generate('medium', 20261105).givens, generate('medium', 20261105).givens);
  assert.notDeepEqual(generate('medium', 1).givens, generate('medium', 2).givens);
});

test('сложность растёт с уровнем', () => {
  const average = (difficulty) => {
    const items = puzzles.filter((puzzle) => puzzle.difficulty === difficulty);
    return items.reduce((sum, puzzle) => sum + puzzle.clues, 0) / items.length;
  };
  assert.ok(average('easy') > average('medium'));
  assert.ok(average('medium') > average('hard'));
});

test('решатель отвергает поле с двумя лжецами в блоке', () => {
  const { givens, solution } = puzzles[0];
  const broken = [...givens];
  const liarCell = BOXES[0].find((cell) => givens[cell] && givens[cell] !== solution[cell]);
  const honest = BOXES[0].find((cell) => givens[cell] && cell !== liarCell);
  broken[honest] = (solution[honest] % 9) + 1;
  assert.notEqual(countSolutions(broken, 2), 1);
});

test('генератор случайных чисел детерминирован', () => {
  const a = createRng(5);
  const b = createRng(5);
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
});
