// Состояние партии и правила ввода. Модуль не знает о браузере, поэтому его легко тестировать.
import { BOXES, PEERS, cellName } from './grid.js';

const HISTORY_LIMIT = 300;

export function createGame(puzzle) {
  return {
    puzzle,
    cells: Array.from({ length: 81 }, () => ({ value: 0, notes: 0, liar: false })),
    hints: 0,
    checks: 0,
    elapsed: 0,
    finished: null, // 'won' или 'revealed'
    undo: [],
    redo: [],
  };
}

export const isGiven = (game, cell) => game.puzzle.givens[cell] !== 0;

// Цифра, которую клетка показывает сейчас.
export function effectiveValue(game, cell) {
  const { value, liar } = game.cells[cell];
  if (isGiven(game, cell) && !liar) return game.puzzle.givens[cell];
  return value;
}

function snapshot(game) {
  game.undo.push(JSON.stringify(game.cells));
  if (game.undo.length > HISTORY_LIMIT) game.undo.shift();
  game.redo = [];
}

function clearNotesAround(game, cell, digit) {
  const mask = 1 << (digit - 1);
  for (const peer of PEERS[cell]) game.cells[peer].notes &= ~mask;
}

// Ввод в напечатанную цифру автоматически отмечает её как ложную.
export function enterDigit(game, cell, digit) {
  if (game.finished) return false;
  const given = game.puzzle.givens[cell];
  const state = game.cells[cell];
  if (given === digit && !state.liar) return false;
  if (state.value === digit && (!given || state.liar)) {
    snapshot(game);
    state.value = 0;
    return true;
  }
  snapshot(game);
  if (given) state.liar = true;
  state.value = digit;
  state.notes = 0;
  clearNotesAround(game, cell, digit);
  return true;
}

export function toggleNote(game, cell, digit) {
  if (game.finished) return false;
  const state = game.cells[cell];
  if ((isGiven(game, cell) && !state.liar) || state.value) return false;
  snapshot(game);
  state.notes ^= 1 << (digit - 1);
  return true;
}

export function clearCell(game, cell) {
  if (game.finished) return false;
  const state = game.cells[cell];
  if (!state.value && !state.notes) return false;
  snapshot(game);
  state.value = 0;
  state.notes = 0;
  return true;
}

export function toggleLiar(game, cell) {
  if (game.finished || !isGiven(game, cell)) return false;
  snapshot(game);
  const state = game.cells[cell];
  state.liar = !state.liar;
  state.value = 0;
  state.notes = 0;
  return true;
}

export function undo(game) {
  if (game.finished || !game.undo.length) return false;
  game.redo.push(JSON.stringify(game.cells));
  game.cells = JSON.parse(game.undo.pop());
  return true;
}

export function redo(game) {
  if (game.finished || !game.redo.length) return false;
  game.undo.push(JSON.stringify(game.cells));
  game.cells = JSON.parse(game.redo.pop());
  return true;
}

// Клетки, где одинаковые цифры видят друг друга.
export function findConflicts(game) {
  const conflicts = new Set();
  for (let cell = 0; cell < 81; cell++) {
    const digit = effectiveValue(game, cell);
    if (!digit) continue;
    for (const peer of PEERS[cell]) {
      if (effectiveValue(game, peer) === digit) conflicts.add(cell);
    }
  }
  return conflicts;
}

// Сколько лжецов отмечено в каждом блоке.
export const marksByBox = (game) =>
  BOXES.map((box) => box.filter((cell) => isGiven(game, cell) && game.cells[cell].liar).length);

export const isComplete = (game) =>
  game.cells.every((_, cell) => effectiveValue(game, cell) !== 0) &&
  marksByBox(game).every((count) => count === 1);

export function findMistakes(game) {
  const { solution, liars } = game.puzzle;
  const mistakes = [];
  game.cells.forEach((state, cell) => {
    const value = effectiveValue(game, cell);
    const wrongMark = isGiven(game, cell) && state.liar && !liars.includes(cell);
    if (wrongMark) {
      mistakes.push({ cell, kind: 'mark' });
    } else if (value && value !== solution[cell] && (!isGiven(game, cell) || state.liar)) {
      mistakes.push({ cell, kind: 'value' });
    }
  });
  return mistakes;
}

export function isWon(game) {
  const { solution, liars } = game.puzzle;
  return (
    game.cells.every((_, cell) => effectiveValue(game, cell) === solution[cell]) &&
    liars.every((cell) => game.cells[cell].liar)
  );
}

export function checkBoard(game) {
  game.checks++;
  return findMistakes(game).length;
}

// Подсказка объясняет следующий логический шаг. Сначала она указывает на ошибку игрока,
// потому что шаги решателя верны только на поле без ошибок.
export function nextHint(game) {
  if (game.finished) return null;
  const mistake = findMistakes(game)[0];
  if (mistake) {
    return {
      cell: mistake.cell,
      related: [],
      action: 'fix',
      text:
        mistake.kind === 'mark'
          ? `Клетка «${cellName(mistake.cell)}»: эта цифра правдива, снимите с неё отметку.`
          : `Клетка «${cellName(mistake.cell)}»: здесь неверная цифра.`,
    };
  }
  for (const [index, step] of game.puzzle.steps.entries()) {
    const state = game.cells[step.cell];
    if (step.kind === 'truth' && !game.seen?.includes(index)) return { ...step, action: 'info', index };
    if (step.kind === 'liar' && !state.liar) return { ...step, action: 'mark' };
    if (step.kind === 'place' && effectiveValue(game, step.cell) !== step.digit) {
      return { ...step, action: 'place' };
    }
  }
  return null;
}

// Шаг-рассуждение ничего не меняет на поле, поэтому запоминаем, что его уже показали.
export function markHintSeen(game, hint) {
  game.seen = [...(game.seen ?? []), hint.index];
  return true;
}

// Выполняет шаг подсказки за игрока.
export function applyHint(game, hint) {
  if (!hint || game.finished) return false;
  if (hint.action === 'fix') {
    const state = game.cells[hint.cell];
    snapshot(game);
    state.value = 0;
    if (!game.puzzle.liars.includes(hint.cell)) state.liar = false;
    return true;
  }
  if (hint.action === 'info') return markHintSeen(game, hint);
  if (hint.action === 'mark') return toggleLiar(game, hint.cell);
  return enterDigit(game, hint.cell, hint.digit);
}

export function revealSolution(game) {
  if (game.finished) return;
  game.cells = game.cells.map((_, cell) => ({
    value: game.puzzle.liars.includes(cell) || !isGiven(game, cell) ? game.puzzle.solution[cell] : 0,
    notes: 0,
    liar: game.puzzle.liars.includes(cell),
  }));
  game.finished = 'revealed';
}
