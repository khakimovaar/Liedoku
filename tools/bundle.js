// Собирает игру в один HTML-файл, который открывается двойным щелчком, без сервера.
// Запуск: node tools/bundle.js
// С флагом --fragment пишет страницу без <html>/<head>/<body>.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ORDER = ['rng', 'grid', 'logic', 'generator', 'game', 'storage', 'polygraph', 'main'];

const script = ORDER.map((name) =>
  readFileSync(`src/${name}.js`, 'utf8')
    .replace(/^import[\s\S]*?from '.*?';\n/gm, '')
    .replace(/^export (?=function|const|class|async)/gm, ''),
).join('\n');

const css = readFileSync('styles.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];

const headParts = head
  .replace(/<meta charset[^>]*>\n/, '')
  .replace(/<meta name="viewport"[^>]*>\n/, '')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}</style>`);
const bodyParts = body.replace(
  '<script type="module" src="src/main.js"></script>',
  () => `<script>\n(() => {\n'use strict';\n${script}\n})();\n</script>`,
);

const fragment = process.argv.includes('--fragment');
const output = fragment
  ? `${headParts}${bodyParts}`
  : `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${headParts}</head>\n<body>${bodyParts}</body>\n</html>\n`;

mkdirSync('dist', { recursive: true });
const target = fragment ? 'dist/lzhedoku-fragment.html' : 'dist/lzhedoku.html';
writeFileSync(target, output);
console.log(`Готово: ${target}`);
