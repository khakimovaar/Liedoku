// Независимая проверка правил полным перебором.
// Логический решатель её не использует, поэтому тесты могут сверять их друг с другом.
import { BOXES, boxOf, bit, colOf, rowOf, ALL_DIGITS, popcount } from './grid.js';

// Считает решения: в каждом блоке ровно одна стартовая цифра ложна, остальные верны.
export function countSolutions(givens, limit = 2) {
  const grid = new Array(81).fill(0);
  const forbidden = new Array(81).fill(0);
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  let found = 0;

  const canPlace = (cell, digit) =>
    !(rows[rowOf(cell)] & bit(digit)) &&
    !(cols[colOf(cell)] & bit(digit)) &&
    !(boxes[boxOf(cell)] & bit(digit)) &&
    !(forbidden[cell] & bit(digit));

  const toggle = (cell, digit) => {
    rows[rowOf(cell)] ^= bit(digit);
    cols[colOf(cell)] ^= bit(digit);
    boxes[boxOf(cell)] ^= bit(digit);
  };

  const fill = () => {
    let best = -1;
    let bestMask = 0;
    let bestSize = 10;
    for (let cell = 0; cell < 81; cell++) {
      if (grid[cell]) continue;
      const used = rows[rowOf(cell)] | cols[colOf(cell)] | boxes[boxOf(cell)] | forbidden[cell];
      const mask = ALL_DIGITS & ~used;
      const size = popcount(mask);
      if (size === 0) return;
      if (size < bestSize) {
        best = cell;
        bestMask = mask;
        bestSize = size;
      }
    }
    if (best < 0) {
      found++;
      return;
    }
    for (let digit = 1; digit <= 9 && found < limit; digit++) {
      if (!(bestMask & bit(digit))) continue;
      grid[best] = digit;
      toggle(best, digit);
      fill();
      toggle(best, digit);
      grid[best] = 0;
    }
  };

  const chooseLiar = (box) => {
    if (found >= limit) return;
    if (box === 9) {
      fill();
      return;
    }
    const clues = BOXES[box].filter((cell) => givens[cell]);
    for (const liar of clues) {
      const placed = [];
      let valid = true;
      for (const cell of clues) {
        if (cell === liar) continue;
        if (!canPlace(cell, givens[cell])) {
          valid = false;
          break;
        }
        grid[cell] = givens[cell];
        toggle(cell, givens[cell]);
        placed.push(cell);
      }
      if (valid) {
        forbidden[liar] |= bit(givens[liar]);
        chooseLiar(box + 1);
        forbidden[liar] &= ~bit(givens[liar]);
      }
      for (const cell of placed) {
        toggle(cell, givens[cell]);
        grid[cell] = 0;
      }
    }
  };

  chooseLiar(0);
  return found;
}
