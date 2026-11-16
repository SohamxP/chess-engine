import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(webRoot, 'public/engine');
const stockfish = resolve(webRoot, 'node_modules/stockfish/bin');
const files = [
  'stockfish-19-lite-single.js',
  'stockfish-19-lite-single.wasm',
];

mkdirSync(directory, { recursive: true });
for (const file of files) {
  copyFileSync(resolve(stockfish, file), resolve(directory, file));
}
console.log('Staged Stockfish Lite browser worker for local game review.');
