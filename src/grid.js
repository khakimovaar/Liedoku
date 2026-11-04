// Геометрия поля 9×9. Клетка — число от 0 до 80, цифры хранятся как 1..9.
export const CELLS = 81;
export const ALL_DIGITS = 0x1ff;

export const rowOf = (cell) => Math.floor(cell / 9);
export const colOf = (cell) => cell % 9;
export const boxOf = (cell) => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
export const bit = (digit) => 1 << (digit - 1);

export function popcount(mask) {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
}

export const digitOf = (mask) => 32 - Math.clz32(mask);

const cells = Array.from({ length: CELLS }, (_, i) => i);
export const ROWS = Array.from({ length: 9 }, (_, n) => cells.filter((c) => rowOf(c) === n));
export const COLS = Array.from({ length: 9 }, (_, n) => cells.filter((c) => colOf(c) === n));
export const BOXES = Array.from({ length: 9 }, (_, n) => cells.filter((c) => boxOf(c) === n));
export const HOUSES = [...ROWS, ...COLS, ...BOXES];

export const PEERS = cells.map((cell) =>
  cells.filter(
    (other) =>
      other !== cell &&
      (rowOf(other) === rowOf(cell) || colOf(other) === colOf(cell) || boxOf(other) === boxOf(cell)),
  ),
);

export const cellName = (cell) => `ряд ${rowOf(cell) + 1}, столбец ${colOf(cell) + 1}`;
