// Логический решатель. Он рассуждает как человек и записывает каждый вывод,
// поэтому заодно оценивает сложность уровня и даёт текст подсказок.
//
// Кандидаты стартовой клетки сначала не ограничены: цифра на ней может быть ложной.
// «Цифра d в клетке — правда»  → кандидат только d.
// «Цифра d в клетке — ложь»    → d вычеркнута из кандидатов.
import { ALL_DIGITS, BOXES, HOUSES, PEERS, bit, digitOf, popcount } from './grid.js';

const houseName = (index) => {
  if (index < 9) return `ряду ${index + 1}`;
  if (index < 18) return `столбце ${index - 8}`;
  return `блоке ${index - 17}`;
};

class Contradiction extends Error {}

function createState(givens) {
  return {
    givens,
    cand: new Array(81).fill(ALL_DIGITS),
    settled: new Array(81).fill(false),
    announced: new Array(81).fill(false),
    pairs: new Array(9).fill(false),
    steps: null,
  };
}

const cloneState = (s) => ({
  givens: s.givens,
  cand: [...s.cand],
  settled: [...s.settled],
  announced: [...s.announced],
  pairs: [...s.pairs],
  steps: null,
});

function assign(s, cell, digit) {
  if (!(s.cand[cell] & bit(digit))) throw new Contradiction();
  s.cand[cell] = bit(digit);
}

function eliminate(s, cell, mask) {
  if (!(s.cand[cell] & mask)) return false;
  s.cand[cell] &= ~mask;
  if (!s.cand[cell]) throw new Contradiction();
  return true;
}

const isLiar = (s, cell) => s.givens[cell] && !(s.cand[cell] & bit(s.givens[cell]));
const isTrue = (s, cell) => s.givens[cell] && s.cand[cell] === bit(s.givens[cell]);

function record(s, step) {
  if (s.steps) s.steps.push(step);
}

// Сообщает о ложной цифре один раз, как только её удалось вывести.
function announceLiars(s) {
  for (let cell = 0; cell < 81; cell++) {
    if (!s.givens[cell] || s.announced[cell] || !isLiar(s, cell)) continue;
    s.announced[cell] = true;
    const digit = s.givens[cell];
    const witness = PEERS[cell].find((peer) => s.settled[peer] && s.cand[peer] === bit(digit));
    record(s, {
      kind: 'liar',
      cell,
      digit,
      related: witness === undefined ? [] : [witness],
      text:
        witness === undefined
          ? `Цифра ${digit} никак не помещается в эту клетку, поэтому здесь она лжёт.`
          : `Цифра ${digit} уже точно стоит на одной линии или в одном блоке с этой клеткой, поэтому здесь ${digit} лжёт.`,
    });
  }
}

function applyBoxRule(s) {
  let changed = false;
  for (let box = 0; box < 9; box++) {
    const clues = BOXES[box].filter((cell) => s.givens[cell]);
    const liars = clues.filter((cell) => isLiar(s, cell));
    if (liars.length > 1) throw new Contradiction();
    if (liars.length === 1) {
      for (const cell of clues) {
        if (cell !== liars[0] && !isTrue(s, cell)) {
          assign(s, cell, s.givens[cell]);
          changed = true;
        }
      }
      continue;
    }
    const undecided = clues.filter((cell) => !isTrue(s, cell));
    if (undecided.length === 0) throw new Contradiction();
    if (undecided.length === 1) {
      const cell = undecided[0];
      eliminate(s, cell, bit(s.givens[cell]));
      s.announced[cell] = true;
      record(s, {
        kind: 'liar',
        cell,
        digit: s.givens[cell],
        related: clues.filter((c) => c !== cell),
        text: `Все остальные стартовые цифры блока ${box + 1} правдивы, а один лжец в блоке обязателен. Значит, лжёт эта цифра.`,
      });
      changed = true;
    }
  }
  return changed;
}

// Две одинаковые напечатанные цифры в блоке: лжец точно одна из них,
// значит, все остальные напечатанные цифры этого блока правдивы.
function applyPairRule(s) {
  let changed = false;
  for (let box = 0; box < 9; box++) {
    if (s.pairs[box]) continue;
    const clues = BOXES[box].filter((cell) => s.givens[cell]);
    const first = clues.find((cell, index) => clues.slice(index + 1).some((c) => s.givens[c] === s.givens[cell]));
    if (first === undefined) continue;
    const digit = s.givens[first];
    const pair = clues.filter((cell) => s.givens[cell] === digit);
    s.pairs[box] = true;
    for (const cell of clues) {
      if (!pair.includes(cell) && !isTrue(s, cell)) assign(s, cell, s.givens[cell]);
    }
    record(s, {
      kind: 'truth',
      cell: pair[0],
      digit,
      related: pair.slice(1),
      text: `В блоке ${box + 1} две цифры ${digit}: одна из них лжец. Значит, все остальные напечатанные цифры этого блока правдивы.`,
    });
    changed = true;
  }
  return changed;
}

function settleSingles(s) {
  let changed = false;
  for (let cell = 0; cell < 81; cell++) {
    if (s.settled[cell] || popcount(s.cand[cell]) !== 1) continue;
    s.settled[cell] = true;
    changed = true;
    const digit = digitOf(s.cand[cell]);
    for (const peer of PEERS[cell]) eliminate(s, peer, s.cand[cell]);
    if (!isTrue(s, cell)) {
      record(s, {
        kind: 'place',
        cell,
        digit,
        related: [],
        text: `В этой клетке осталась только одна возможная цифра: ${digit}.`,
      });
    }
  }
  return changed;
}

function hiddenSingles(s) {
  for (let house = 0; house < HOUSES.length; house++) {
    for (let digit = 1; digit <= 9; digit++) {
      const spots = HOUSES[house].filter((cell) => s.cand[cell] & bit(digit));
      if (spots.length === 0) throw new Contradiction();
      if (spots.length === 1 && s.cand[spots[0]] !== bit(digit)) {
        const cell = spots[0];
        s.cand[cell] = bit(digit);
        s.settled[cell] = true;
        for (const peer of PEERS[cell]) eliminate(s, peer, bit(digit));
        if (!isTrue(s, cell)) {
          record(s, {
            kind: 'place',
            cell,
            digit,
            related: [],
            text: `В ${houseName(house)} цифре ${digit} больше негде стоять.`,
          });
        }
        return true;
      }
    }
  }
  return false;
}

function propagate(s) {
  for (;;) {
    let changed = settleSingles(s);
    changed = applyBoxRule(s) || changed;
    changed = applyPairRule(s) || changed;
    announceLiars(s);
    if (!changed) changed = hiddenSingles(s);
    if (!changed) return;
  }
}

function refutes(s, change) {
  const trial = cloneState(s);
  try {
    change(trial);
    propagate(trial);
    return false;
  } catch (error) {
    if (error instanceof Contradiction) return true;
    throw error;
  }
}

// Один шаг рассуждения «допустим, эта цифра правдива (или ложна)».
function tryAssumption(s) {
  for (let cell = 0; cell < 81; cell++) {
    const digit = s.givens[cell];
    if (!digit || isTrue(s, cell) || isLiar(s, cell)) continue;
    if (refutes(s, (t) => assign(t, cell, digit))) {
      eliminate(s, cell, bit(digit));
      s.announced[cell] = true;
      record(s, {
        kind: 'liar',
        cell,
        digit,
        related: [],
        assumption: true,
        text: `Предположите, что эта ${digit} правдива, и проставьте следствия: вы придёте к противоречию. Значит, она лжёт.`,
      });
      return true;
    }
    if (refutes(s, (t) => eliminate(t, cell, bit(digit)))) {
      assign(s, cell, digit);
      record(s, {
        kind: 'truth',
        cell,
        digit,
        related: [],
        assumption: true,
        text: `Предположите, что эта ${digit} лжёт, и проставьте следствия: вы придёте к противоречию. Значит, она правдива.`,
      });
      return true;
    }
  }
  return false;
}

// Рассуждение по незаполненной клетке с двумя кандидатами.
function tryCellAssumption(s) {
  for (let cell = 0; cell < 81; cell++) {
    if (s.givens[cell] || popcount(s.cand[cell]) !== 2) continue;
    for (let digit = 1; digit <= 9; digit++) {
      if (!(s.cand[cell] & bit(digit))) continue;
      if (refutes(s, (t) => assign(t, cell, digit))) {
        eliminate(s, cell, bit(digit));
        return true;
      }
    }
  }
  return false;
}

export function logicSolve(givens) {
  const s = createState(givens);
  s.steps = [];
  let assumptions = 0;
  let deepAssumptions = 0;
  try {
    propagate(s);
    while (!s.cand.every((mask) => popcount(mask) === 1)) {
      if (tryAssumption(s)) assumptions++;
      else if (tryCellAssumption(s)) deepAssumptions++;
      else return { solved: false, assumptions, deepAssumptions, steps: s.steps };
      propagate(s);
    }
  } catch (error) {
    if (error instanceof Contradiction) {
      return { solved: false, assumptions, deepAssumptions, steps: s.steps };
    }
    throw error;
  }
  const solution = s.cand.map(digitOf);
  const liars = solution.flatMap((digit, cell) => (givens[cell] && givens[cell] !== digit ? [cell] : []));
  return { solved: true, solution, liars, assumptions, deepAssumptions, steps: s.steps };
}
