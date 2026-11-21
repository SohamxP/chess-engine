import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const NOW = '2026-11-21T06:00:00.000Z';

function game(id: string) {
  return {
    id, fen: START, initialFen: START, status: 'IMPORTED_UNFINISHED',
    whiteToMove: true, inCheck: false, humanWhite: true, depth: 1,
    aiTurn: false, canUndo: false, canClaimThreefold: false, canClaimFifty: false,
    legalMoves: [], lastMove: null, aiStats: null, moveHistory: [],
  };
}
function archived(id: string) {
  return { id, savedAt: NOW, game: game(id) };
}

test('migrates legacy localStorage without deleting it, and a deleted game stays deleted', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(data => {
    localStorage.setItem('openfile-chess-games-v1', JSON.stringify(data));
  }, [archived('legacy-1'), archived('legacy-2')]);
  await page.reload();
  await page.getByRole('button', { name: /My Games/ }).click();
  await expect(page.locator('.archive-game-card')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('openfile-chess-games-v1')))
    .toContain('legacy-1');

  await page.locator('.archive-game-card').first().getByRole('button', { name: 'Remove' }).click();
  await page.locator('.archive-game-card').first().getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.locator('.archive-game-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.archive-game-card')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('openfile-chess-games-v1')))
    .toContain('legacy-1');
});

test('restores more than 50 games, preserves training and analysis, and exports a portable backup', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?games=1');
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download library backup' })).toBeEnabled();

  const card = {
    id: 'g0:1', gameId: 'g0', ply: 1, fen: START, white: true,
    originalUci: 'e2e4', originalSan: 'e4', addedAt: NOW, dueAt: NOW,
    streak: 3, attempts: 4, lastPlan: 'Check all forcing lines',
    lastSuccess: true, patterns: ['missed-free-capture'],
  };
  const evaluation = {
    key: 'stockfish-19-lite-v2|hash8|depth10|' + START,
    evaluation: { cp: 40, mate: null, bestMove: 'e2e4', depth: 10 },
    storedAt: Date.now(),
  };
  const games = Array.from({ length: 75 }, (_, i) => archived('g' + i));
  const backup = {
    kind: 'plysense-local-backup', version: 1, exportedAt: NOW,
    games, practiceCards: [card], evaluations: [evaluation],
  };
  const upload = page.getByLabel('Restore JSON backup');
  await upload.setInputFiles({
    name: 'plysense-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole('status').filter({ hasText: '75 games' }))
    .toContainText('1 training cards');
  await expect(page.locator('.archive-total')).toContainText('75 saved');
  await expect(page.locator('.archive-game-card')).toHaveCount(72);
  await page.getByRole('button', { name: /Show more games/ }).click();
  await expect(page.locator('.archive-game-card')).toHaveCount(75);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download library backup' }).click();
  const download = await downloadPromise;
  const location = await download.path();
  if (!location) throw new Error('Download path is unavailable');
  const exported = JSON.parse(await readFile(location, 'utf8'));
  expect(exported.games).toHaveLength(75);
  expect(exported.practiceCards).toMatchObject([card]);
  expect(exported.evaluations).toMatchObject([evaluation]);

  await page.reload();
  await expect(page.locator('.archive-total')).toContainText('75 saved');
  const savedCard = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('plyforge-decision-lab-v1') ?? '[]')[0]);
  expect(savedCard.streak).toBe(3);
  expect(savedCard.attempts).toBe(4);
  expect(savedCard.lastPlan).toBe('Check all forcing lines');

  await page.getByLabel('Restore JSON backup').setInputFiles({
    name: 'repeated-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole('status').filter({ hasText: '75 games already present' }))
    .toContainText('0 games');
  await expect(page.locator('.archive-total')).toContainText('75 saved');
});

test('rejects invalid backup atomically without deleting existing games', async ({ page }) => {
  await page.goto('/?games=1');
  await expect(page.getByRole('button', { name: 'Download library backup' })).toBeEnabled();
  await page.getByLabel('Restore JSON backup').setInputFiles({
    name: 'invalid-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      kind: 'plysense-local-backup', version: 1, exportedAt: NOW,
      games: [archived('keep'), { ...archived('bad'), game: { ...game('bad'), fen: 'corrupt' } }],
      practiceCards: [], evaluations: [],
    })),
  });
  await expect(page.getByRole('status').filter({ hasText: 'invalid or duplicated' })).toBeVisible();
  await expect(page.locator('.archive-total')).toContainText('0 saved');
});
