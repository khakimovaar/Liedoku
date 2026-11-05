// Связывает игровую логику со страницей.
import { DIFFICULTIES, generate } from './generator.js';
import { BOXES, boxOf, colOf, rowOf } from './grid.js';
import {
  applyHint, checkBoard, clearCell, createGame, effectiveValue, enterDigit, findConflicts,
  findEmptyCells, findMistakes, isComplete, isGiven, isWon, markHintSeen, marksByBox, nextHint, redo, revealSolution,
  toggleLiar, toggleNote, undo,
} from './game.js';
import { createPolygraph } from './polygraph.js';
import { loadGame, loadStats, recordWin, saveGame } from './storage.js';

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const message = $('message');
const pad = $('pad');
const protocol = $('protocol');
const polygraph = createPolygraph($('trace'));

let game = null;
let selected = 40;
let notesMode = false;
let chosenLevel = 'easy';
let currentHint = null;
let flagged = new Set();
let armed = null;
let lastConflicts = 0;

const cellEls = [];

function buildBoard() {
  for (let cell = 0; cell < 81; cell++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.id = `cell-${cell}`;
    el.className = 'cell';
    el.setAttribute('role', 'gridcell');
    if (colOf(cell) % 3 === 2 && colOf(cell) < 8) el.classList.add('edge-right');
    if (rowOf(cell) % 3 === 2 && rowOf(cell) < 8) el.classList.add('edge-bottom');
    el.addEventListener('click', () => select(cell));
    boardEl.append(el);
    cellEls.push(el);
  }
  for (let digit = 1; digit <= 9; digit++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.id = `digit-${digit}`;
    el.textContent = digit;
    el.setAttribute('aria-label', `Цифра ${digit}`);
    el.addEventListener('click', () => input(digit));
    pad.append(el);
  }
  for (let box = 0; box < 9; box++) {
    const el = document.createElement('span');
    el.textContent = box + 1;
    protocol.append(el);
  }
  document.querySelectorAll('[data-level]').forEach((button) => {
    button.addEventListener('click', () => {
      chosenLevel = button.dataset.level;
      disarm();
      renderLevels();
    });
  });
}

function renderLevels() {
  document.querySelectorAll('[data-level]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.level === chosenLevel));
  });
}

const formatTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

function say(text, tone = '') {
  message.textContent = text;
  message.dataset.tone = tone;
}

function cellContent(cell) {
  const state = game.cells[cell];
  const given = game.puzzle.givens[cell];
  let html = '';
  if (given) html += `<span class="printed">${given}</span>`;
  if (state.value) html += `<span class="written">${state.value}</span>`;
  if (!state.value && state.notes && (!given || state.liar)) {
    html += '<span class="notes">';
    for (let digit = 1; digit <= 9; digit++) {
      html += `<i>${state.notes & (1 << (digit - 1)) ? digit : ''}</i>`;
    }
    html += '</span>';
  }
  return html;
}

function cellLabel(cell) {
  const place = `ряд ${rowOf(cell) + 1}, столбец ${colOf(cell) + 1}`;
  const state = game.cells[cell];
  const given = game.puzzle.givens[cell];
  if (given && state.liar) {
    return `${place}, цифра ${given} отмечена как ложная${state.value ? `, вписана ${state.value}` : ''}`;
  }
  if (given) return `${place}, напечатана цифра ${given}`;
  return `${place}, ${state.value ? `вписана ${state.value}` : 'пусто'}`;
}

function render() {
  const conflicts = $('show-conflicts').checked ? findConflicts(game) : new Set();
  const focus = selected === null ? 0 : effectiveValue(game, selected);
  const hintCells = new Set(currentHint ? [currentHint.cell, ...currentHint.related] : []);
  cellEls.forEach((el, cell) => {
    const state = game.cells[cell];
    const given = isGiven(game, cell);
    el.innerHTML = cellContent(cell);
    el.setAttribute('aria-label', cellLabel(cell));
    const peer =
      selected !== null &&
      cell !== selected &&
      (rowOf(cell) === rowOf(selected) || colOf(cell) === colOf(selected) || boxOf(cell) === boxOf(selected));
    el.classList.toggle('given', given);
    el.classList.toggle('liar', given && state.liar);
    el.classList.toggle('selected', cell === selected);
    el.classList.toggle('peer', peer);
    el.classList.toggle('same', Boolean(focus) && cell !== selected && effectiveValue(game, cell) === focus);
    el.classList.toggle('conflict', conflicts.has(cell));
    el.classList.toggle('hinted', hintCells.has(cell));
    el.classList.toggle('flagged', flagged.has(cell));
  });

  const marks = marksByBox(game);
  [...protocol.children].forEach((el, box) => {
    el.dataset.state = marks[box] === 0 ? 'open' : marks[box] === 1 ? 'found' : 'excess';
    el.title = `Блок ${box + 1}: отмечено ${marks[box]}`;
  });
  const total = marks.filter((count) => count > 0).length;
  $('found').textContent = `${total} из 9`;
  $('tension').textContent = `${conflicts.size}`;
  $('left').textContent = `${findEmptyCells(game).length}`;
  polygraph.setTension(conflicts.size);
  if (conflicts.size > lastConflicts) polygraph.jolt(0.9);
  lastConflicts = conflicts.size;

  $('notes').setAttribute('aria-pressed', String(notesMode));
  const canMark = selected !== null && isGiven(game, selected) && !game.finished;
  $('mark').disabled = !canMark;
  $('mark').setAttribute('aria-pressed', String(canMark && game.cells[selected].liar));
  $('undo').disabled = !game.undo.length || Boolean(game.finished);
  $('redo').disabled = !game.redo.length || Boolean(game.finished);
  for (const id of ['hint', 'check', 'erase', 'reveal']) $(id).disabled = Boolean(game.finished);
  $('hint-apply').hidden = !currentHint?.action;
  $('level-tag').textContent = DIFFICULTIES[game.puzzle.difficulty].label;
  $('seed-tag').textContent = `№ ${game.puzzle.seed}`;
  $('timer').textContent = formatTime(game.elapsed);
  renderStats();
}

function renderStats() {
  const stats = loadStats();
  $('stats').innerHTML = Object.entries(DIFFICULTIES)
    .map(([key, { label }]) => {
      const entry = stats[key];
      return `<tr><th scope="row">${label}</th><td>${entry?.wins ?? 0}</td><td>${entry?.best == null ? '—' : formatTime(entry.best)}</td></tr>`;
    })
    .join('');
}

function persist() {
  saveGame({ ...game, undo: game.undo.slice(-30), redo: [] });
}

function afterMove() {
  flagged = new Set();
  currentHint = null;
  if (isComplete(game)) {
    if (isWon(game)) finishWon();
    else say('Поле заполнено, но где-то есть ошибка. Нажмите «Проверить».', 'warn');
  }
  persist();
  render();
}

function finishWon() {
  game.finished = 'won';
  recordWin(game.puzzle.difficulty, game.elapsed);
  polygraph.jolt(1);
  showResult();
}

function showResult() {
  say('Все лжецы разоблачены.', 'good');
  $('result-time').textContent = formatTime(game.elapsed);
  $('result-hints').textContent = game.hints;
  $('result-checks').textContent = game.checks;
  $('result').hidden = false;
}

function select(cell) {
  selected = cell;
  disarm();
  render();
}

function input(digit) {
  if (selected === null || game.finished) return;
  const printed = game.puzzle.givens[selected];
  const state = game.cells[selected];
  if (notesMode) {
    if (toggleNote(game, selected, digit)) afterMove();
    else if (printed && !state.liar) say('Заметки доступны только в пустой клетке или после отметки лжеца.');
    return;
  }
  if (printed === digit && !state.liar) {
    say('Эта цифра уже напечатана здесь.');
    return;
  }
  const newMark = printed && !state.liar;
  if (enterDigit(game, selected, digit)) {
    if (newMark) {
      polygraph.jolt(0.7);
      warnAboutBox(selected);
    } else {
      say('');
    }
    afterMove();
  }
}

function warnAboutBox(cell) {
  const count = marksByBox(game)[boxOf(cell)];
  if (count > 1) say(`В блоке ${boxOf(cell) + 1} отмечено ${count} лжеца, а должен быть один.`, 'warn');
  else say('');
}

function mark() {
  if (selected === null) return;
  if (!isGiven(game, selected)) {
    say('Лжецом можно отметить только напечатанную цифру.');
    return;
  }
  if (toggleLiar(game, selected)) {
    polygraph.jolt(0.7);
    warnAboutBox(selected);
    afterMove();
  }
}

function move(dx, dy) {
  const current = selected ?? 40;
  const row = (rowOf(current) + dy + 9) % 9;
  const col = (colOf(current) + dx + 9) % 9;
  select(row * 9 + col);
  cellEls[selected].focus({ preventScroll: true });
}

function disarm() {
  if (!armed) return;
  const button = $(armed);
  button.textContent = button.dataset.label;
  armed = null;
}

// Необратимое действие требует второго нажатия.
function confirmed(id, question) {
  if (armed === id) {
    disarm();
    return true;
  }
  disarm();
  const button = $(id);
  button.dataset.label = button.textContent;
  button.textContent = question;
  armed = id;
  return false;
}

const hasProgress = () => !game.finished && game.undo.length > 0;

function setHash() {
  const hash = `#${game.puzzle.difficulty}-${game.puzzle.seed}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function start(difficulty, seed) {
  $('result').hidden = true;
  say('Печатаю новое поле…');
  $('sheet').classList.add('busy');
  // Даём браузеру показать сообщение до расчёта: сложный уровень занимает пару секунд.
  setTimeout(() => {
    game = createGame(generate(difficulty, seed));
    chosenLevel = difficulty;
    selected = 40;
    currentHint = null;
    flagged = new Set();
    lastConflicts = 0;
    $('sheet').classList.remove('busy');
    say('');
    setHash();
    renderLevels();
    persist();
    render();
  }, 30);
}

const randomSeed = () => 1 + Math.floor(Math.random() * 999999);

function todaySeed() {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function parseHash() {
  const match = /^#(easy|medium|hard)-(\d{1,9})$/.exec(location.hash);
  return match ? { difficulty: match[1], seed: Number(match[2]) } : null;
}

function showHint() {
  const hint = nextHint(game);
  if (!hint) {
    say('Логика здесь закончилась: проверьте оставшиеся клетки.');
    return;
  }
  game.hints++;
  if (hint.action === 'info') markHintSeen(game, hint);
  currentHint = hint.action === 'info' ? { ...hint, action: null } : hint;
  selected = hint.cell;
  say(hint.text);
  persist();
  render();
}

function bindControls() {
  $('notes').addEventListener('click', () => {
    notesMode = !notesMode;
    render();
  });
  $('mark').addEventListener('click', mark);
  $('erase').addEventListener('click', () => {
    if (selected !== null && clearCell(game, selected)) afterMove();
  });
  $('undo').addEventListener('click', () => {
    if (undo(game)) afterMove();
  });
  $('redo').addEventListener('click', () => {
    if (redo(game)) afterMove();
  });
  $('hint').addEventListener('click', showHint);
  $('hint-apply').addEventListener('click', () => {
    if (applyHint(game, currentHint)) {
      say('');
      afterMove();
    }
  });
  $('check').addEventListener('click', () => {
    const count = checkBoard(game);
    flagged = new Set(findMistakes(game).map((mistake) => mistake.cell));
    const empty = findEmptyCells(game);
    if (count) {
      say(`Ошибок на поле: ${count}. Они отмечены кружками.`, 'warn');
    } else if (empty.length) {
      if (empty.length <= 3) flagged = new Set(empty);
      say(
        empty.length <= 3
          ? `Ошибок нет. Пустых клеток: ${empty.length}. Они отмечены кружками.`
          : `Ошибок нет. Пустых клеток: ${empty.length}.`,
        'good',
      );
    } else {
      say('Ошибок нет.', 'good');
    }
    persist();
    render();
  });
  $('reveal').addEventListener('click', () => {
    if (!confirmed('reveal', 'Точно показать?')) return;
    revealSolution(game);
    say('Лжецы вычеркнуты, поле заполнено. Эта партия не идёт в статистику.');
    currentHint = null;
    persist();
    render();
  });
  $('new').addEventListener('click', () => {
    if (hasProgress() && !confirmed('new', 'Точно бросить партию?')) return;
    disarm();
    start(chosenLevel, randomSeed());
  });
  $('daily').addEventListener('click', () => {
    if (hasProgress() && !confirmed('daily', 'Точно бросить партию?')) return;
    disarm();
    start('medium', todaySeed());
  });
  $('again').addEventListener('click', () => start(chosenLevel, randomSeed()));
  $('copy').addEventListener('click', async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      say('Ссылка на это поле скопирована.', 'good');
    } catch {
      say(`Скопируйте ссылку вручную: ${url}`);
    }
  });
  $('show-conflicts').addEventListener('change', render);

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.code === 'KeyZ') {
      event.preventDefault();
      $(event.shiftKey ? 'redo' : 'undo').click();
      return;
    }
    if (mod && event.code === 'KeyY') {
      event.preventDefault();
      $('redo').click();
      return;
    }
    if (mod || event.altKey) return;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (digit) input(Number(digit[1]));
    else if (event.code === 'ArrowLeft') move(-1, 0);
    else if (event.code === 'ArrowRight') move(1, 0);
    else if (event.code === 'ArrowUp') move(0, -1);
    else if (event.code === 'ArrowDown') move(0, 1);
    else if (event.code === 'KeyN') $('notes').click();
    else if (event.code === 'KeyL') mark();
    else if (event.code === 'Backspace' || event.code === 'Delete') $('erase').click();
    else return;
    event.preventDefault();
  });

  addEventListener('hashchange', () => {
    const target = parseHash();
    if (target && (target.seed !== game?.puzzle.seed || target.difficulty !== game?.puzzle.difficulty)) {
      start(target.difficulty, target.seed);
    }
  });

  setInterval(() => {
    if (!game || game.finished || document.hidden) return;
    game.elapsed++;
    $('timer').textContent = formatTime(game.elapsed);
    if (game.elapsed % 10 === 0) persist();
  }, 1000);
}

function boot() {
  buildBoard();
  bindControls();
  renderLevels();
  const target = parseHash();
  const saved = loadGame();
  const matches =
    saved?.puzzle && (!target || (saved.puzzle.seed === target.seed && saved.puzzle.difficulty === target.difficulty));
  if (matches) {
    game = saved;
    chosenLevel = saved.puzzle.difficulty;
    setHash();
    renderLevels();
    render();
    if (saved.finished === 'won') showResult();
    return;
  }
  if (target) start(target.difficulty, target.seed);
  else start('easy', randomSeed());
}

boot();
