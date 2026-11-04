// Сохранение в браузере. Если хранилище недоступно, игра продолжает работать без него.
const GAME_KEY = 'lzhedoku.game.v1';
const STATS_KEY = 'lzhedoku.stats.v1';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Приватный режим или заблокированное хранилище: прогресс живёт только до закрытия вкладки.
  }
}

export const loadGame = () => read(GAME_KEY);
export const saveGame = (game) => write(GAME_KEY, game);
export const loadStats = () => read(STATS_KEY) ?? {};

export function recordWin(difficulty, seconds) {
  const stats = loadStats();
  const entry = stats[difficulty] ?? { wins: 0, best: null };
  entry.wins++;
  entry.best = entry.best === null ? seconds : Math.min(entry.best, seconds);
  stats[difficulty] = entry;
  write(STATS_KEY, stats);
  return stats;
}
