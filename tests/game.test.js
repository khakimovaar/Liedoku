import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyHint, clearCell, createGame, effectiveValue, enterDigit, findConflicts, findEmptyCells, findMistakes,
  isComplete, isWon, marksByBox, nextHint, redo, revealSolution, toggleLiar, toggleNote, undo,
} from '../src/game.js';
import { generate } from '../src/generator.js';

const puzzle = generate('easy', 777);
const newGame = () => createGame(puzzle);
const emptyCell = puzzle.givens.indexOf(0);
const liar = puzzle.liars[0];
const honest = puzzle.givens.findIndex((digit, cell) => digit && !puzzle.liars.includes(cell));

test('ввод в напечатанную цифру отмечает её лжецом', () => {
  const game = newGame();
  const digit = puzzle.solution[liar];
  enterDigit(game, liar, digit);
  assert.equal(game.cells[liar].liar, true);
  assert.equal(effectiveValue(game, liar), digit);
});

test('снятие отметки возвращает напечатанную цифру', () => {
  const game = newGame();
  toggleLiar(game, liar);
  assert.equal(effectiveValue(game, liar), 0);
  toggleLiar(game, liar);
  assert.equal(effectiveValue(game, liar), puzzle.givens[liar]);
});

test('отмена и повтор восстанавливают поле', () => {
  const game = newGame();
  enterDigit(game, emptyCell, 5);
  undo(game);
  assert.equal(game.cells[emptyCell].value, 0);
  redo(game);
  assert.equal(game.cells[emptyCell].value, 5);
});

test('цифра стирает заметки у соседних клеток', () => {
  const game = newGame();
  const peer = puzzle.givens.findIndex((digit, cell) => !digit && cell !== emptyCell && Math.floor(cell / 9) === Math.floor(emptyCell / 9));
  assert.ok(peer >= 0);
  toggleNote(game, peer, 4);
  enterDigit(game, emptyCell, 4);
  assert.equal(game.cells[peer].notes & 8, 0);
});

test('заметки нельзя ставить на правдоподобную напечатанную цифру', () => {
  assert.equal(toggleNote(newGame(), honest, 3), false);
});

test('очистка клетки убирает значение', () => {
  const game = newGame();
  enterDigit(game, emptyCell, 3);
  assert.equal(clearCell(game, emptyCell), true);
  assert.equal(game.cells[emptyCell].value, 0);
});

test('ложная отметка считается ошибкой', () => {
  const game = newGame();
  toggleLiar(game, honest);
  assert.deepEqual(findMistakes(game), [{ cell: honest, kind: 'mark' }]);
});

test('конфликт находит одинаковые цифры в одной линии', () => {
  const game = newGame();
  const wrong = puzzle.givens.find((digit, cell) => digit && Math.floor(cell / 9) === Math.floor(emptyCell / 9));
  if (wrong) {
    enterDigit(game, emptyCell, wrong);
    assert.ok(findConflicts(game).has(emptyCell));
  }
});

test('отметка считается по блокам', () => {
  const game = newGame();
  toggleLiar(game, liar);
  assert.equal(marksByBox(game).reduce((a, b) => a + b), 1);
});

test('подсказки сами доводят партию до победы', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const game = createGame(generate(difficulty, 909));
    for (let guard = 0; guard < 200 && !isWon(game); guard++) {
      const hint = nextHint(game);
      assert.ok(hint, `${difficulty}: подсказка закончилась раньше решения`);
      assert.ok(hint.text.length > 0);
      applyHint(game, hint);
    }
    assert.equal(isWon(game), true);
    assert.equal(isComplete(game), true);
  }
});

test('подсказка сначала показывает ошибку игрока', () => {
  const game = newGame();
  const wrong = (puzzle.solution[emptyCell] % 9) + 1;
  enterDigit(game, emptyCell, wrong);
  const hint = nextHint(game);
  assert.equal(hint.action, 'fix');
  assert.equal(hint.cell, emptyCell);
  applyHint(game, hint);
  assert.equal(game.cells[emptyCell].value, 0);
});

test('отмеченный лжец без новой цифры считается пустой клеткой', () => {
  const game = newGame();
  const before = findEmptyCells(game).length;
  toggleLiar(game, liar);
  assert.equal(findEmptyCells(game).length, before + 1);
  assert.ok(findEmptyCells(game).includes(liar));
});

test('партия завершается победой, только когда вписан последний лжец', () => {
  const game = newGame();
  for (let cell = 0; cell < 81; cell++) {
    if (cell === liar || (puzzle.givens[cell] && !puzzle.liars.includes(cell))) continue;
    enterDigit(game, cell, puzzle.solution[cell]);
  }
  toggleLiar(game, liar);
  assert.equal(isComplete(game), false);
  enterDigit(game, liar, puzzle.solution[liar]);
  assert.equal(isComplete(game), true);
  assert.equal(isWon(game), true);
});

test('показанный ответ совпадает с решением', () => {
  const game = newGame();
  revealSolution(game);
  assert.equal(isWon(game), true);
  assert.equal(game.finished, 'revealed');
});
