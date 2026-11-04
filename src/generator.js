// Генератор: готовое судоку → один лжец в блоке → убираем цифры,
// пока логический решатель доходит до конца без угадывания.
import { BOXES, COLS, ROWS, boxOf, bit, colOf, rowOf } from './grid.js';
import { logicSolve } from './logic.js';
import { createRng } from './rng.js';

// pairs — в скольких блоках лжец повторяет соседнюю цифру. Такая пара видна сразу и даёт вход в блок.
// witnesses — лжец дополнительно повторяет правдивую цифру на своей линии вне блока.
// maxAssumptions — сколько рассуждений «допустим, что…» разрешено на всё поле.
export const DIFFICULTIES = {
  easy: { label: 'Лёгкий', clues: 46, pairs: 9, witnesses: true, maxAssumptions: 0, maxDeep: 0 },
  medium: { label: 'Средний', clues: 35, pairs: 5, maxAssumptions: 2, maxDeep: 0 },
  hard: { label: 'Сложный', clues: 33, pairs: 2, maxAssumptions: 7, maxDeep: 0 },
};

const MIN_CLUES_PER_BOX = 3;

function fullGrid(rng) {
  const grid = new Array(81).fill(0);
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  const fill = (cell) => {
    if (cell === 81) return true;
    const r = rowOf(cell);
    const c = colOf(cell);
    const b = boxOf(cell);
    for (const digit of rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      const m = bit(digit);
      if ((rows[r] | cols[c] | boxes[b]) & m) continue;
      grid[cell] = digit;
      rows[r] |= m;
      cols[c] |= m;
      boxes[b] |= m;
      if (fill(cell + 1)) return true;
      rows[r] &= ~m;
      cols[c] &= ~m;
      boxes[b] &= ~m;
      grid[cell] = 0;
    }
    return false;
  };
  fill(0);
  return grid;
}

// Ищет для лжеца-пары правдивую цифру-свидетеля на его линии вне блока.
function findWitness(cell, digit, solution, liars, pairDigits) {
  const line = [...ROWS[rowOf(cell)], ...COLS[colOf(cell)]];
  return line.find(
    (other) =>
      boxOf(other) !== boxOf(cell) &&
      solution[other] === digit &&
      !liars.includes(other) &&
      pairDigits[boxOf(other)] !== digit,
  );
}

// У лёгкого уровня вторая цифра пары не должна иметь таких же повторов: иначе выбор неочевиден.
function pickWitnesses(givens, solution, liars, partnerOf) {
  const pairDigits = liars.map((cell) => givens[cell]);
  const witnesses = [];
  for (const cell of liars) {
    const digit = givens[cell];
    const witness = findWitness(cell, digit, solution, liars, pairDigits);
    if (witness === undefined) return null;
    const partner = partnerOf.get(cell);
    const line = [...ROWS[rowOf(partner)], ...COLS[colOf(partner)]];
    if (line.some((other) => boxOf(other) !== boxOf(partner) && givens[other] === digit && liars.includes(other))) {
      return null;
    }
    witnesses.push(witness);
  }
  return witnesses;
}

function attempt(settings, rng) {
  const solution = fullGrid(rng);
  const givens = [...solution];
  const liars = BOXES.map((box) => box[rng.int(9)]);
  const pairBoxes = new Set(rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, settings.pairs));
  const partners = new Set();
  const partnerOf = new Map();
  liars.forEach((cell, box) => {
    if (pairBoxes.has(box)) {
      const partner = rng.shuffle(BOXES[box]).find((other) => other !== cell);
      partners.add(partner);
      partnerOf.set(cell, partner);
      givens[cell] = solution[partner];
    } else {
      givens[cell] = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).find((digit) => digit !== solution[cell]);
    }
  });

  if (settings.witnesses) {
    const witnesses = pickWitnesses(givens, solution, liars, partnerOf);
    if (!witnesses) return null;
    witnesses.forEach((cell) => partners.add(cell));
  }

  const inBox = new Array(9).fill(9);
  let clues = 81;
  for (const cell of rng.shuffle(Array.from({ length: 81 }, (_, i) => i))) {
    if (clues <= settings.clues) break;
    if (liars.includes(cell) || partners.has(cell) || inBox[boxOf(cell)] <= MIN_CLUES_PER_BOX) continue;
    const kept = givens[cell];
    givens[cell] = 0;
    const result = logicSolve(givens);
    const accepted =
      result.solved &&
      result.assumptions <= settings.maxAssumptions &&
      result.deepAssumptions <= settings.maxDeep;
    if (accepted) {
      clues--;
      inBox[boxOf(cell)]--;
    } else {
      givens[cell] = kept;
    }
  }
  return clues <= settings.clues + 2 ? { givens, clues } : null;
}

export function generate(difficulty, seed) {
  const settings = DIFFICULTIES[difficulty];
  if (!settings) throw new Error(`Неизвестная сложность: ${difficulty}`);
  const rng = createRng(seed);
  // Если строгие условия не выполняются, постепенно разрешаем чуть больше цифр на поле.
  let best = null;
  for (let tries = 0; !best; tries++) {
    const extraClues = Math.floor(tries / 200);
    best = attempt({ ...settings, clues: settings.clues + extraClues }, rng);
  }
  const rated = logicSolve(best.givens);
  return {
    difficulty,
    seed,
    givens: best.givens,
    solution: rated.solution,
    liars: rated.liars,
    clues: best.clues,
    assumptions: rated.assumptions,
    deepAssumptions: rated.deepAssumptions,
    steps: rated.steps,
  };
}
