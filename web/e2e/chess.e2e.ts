import { expect, test } from '@playwright/test';

const board = (page: import('@playwright/test').Page) =>
  page.getByRole('group', { name: 'Interactive chess board' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(board(page).getByRole('button')).toHaveCount(64);
});

test('plays against the real Java engine, records moves and undoes the turn', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await expect(board(page).getByRole('button', { name: /^e4 empty, legal destination/ })).toBeVisible();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();

  // One move from White and a separate response from the actual Java search engine.
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });
  await expect(board(page).getByRole('button', { name: /^e4 white p/ })).toBeVisible();
  await expect(page.locator('.engine-stats')).toContainText('nodes');

  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('.move-count')).toHaveText('0 MOVES');
  await expect(board(page).getByRole('button', { name: /^e2 white p/ })).toBeVisible();
  await expect(board(page).getByRole('button', { name: /^e4 empty/ })).toBeVisible();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
});

test('switching sides starts a new match with Black at the bottom and AI opening first', async ({ page }) => {
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await page.getByRole('button', { name: /New match/ }).click();

  await expect(board(page).getByRole('button').first()).toHaveAttribute('aria-label', /^h1 white r/);
  await expect(page.locator('.move-count')).toHaveText('1 MOVES', { timeout: 45_000 });
  await expect(page.locator('.human-strip')).toContainText('Playing Black');

  await board(page).getByRole('button', { name: /^e7 black p/ }).click();
  await board(page).getByRole('button', { name: /^e5 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('3 MOVES', { timeout: 45_000 });
  // The next White AI move can capture the e5 pawn, so check the move record,
  // not whether that pawn necessarily survives on its destination.
  await expect(page.locator('.move-list')).toContainText('e7–e5');
});

test('new match resets the board after a completed human-and-AI turn', async ({ page }) => {
  await board(page).getByRole('button', { name: /^d2 white p/ }).click();
  await board(page).getByRole('button', { name: /^d4 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });

  await page.getByRole('button', { name: /New match/ }).click();
  await expect(page.locator('.move-count')).toHaveText('0 MOVES');
  await expect(board(page).getByRole('button', { name: /^d2 white p/ })).toBeVisible();
  await expect(board(page).getByRole('button', { name: /^d4 empty/ })).toBeVisible();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
});

test('promotion chooser sends the selected underpromotion (mocked near-promotion position)', async ({ page }) => {
  // The public API deliberately has no arbitrary-FEN game creation endpoint.
  // Mock only this fixture; the other browser tests exercise the real Java service.
  const game = {
    id: '00000000-0000-0000-0000-000000000001',
    fen: '7k/P7/8/8/8/8/8/4K3 w - - 0 1',
    status: 'IN_PROGRESS',
    whiteToMove: true,
    inCheck: false,
    humanWhite: true,
    depth: 1,
    aiTurn: false,
    canUndo: false,
    canClaimThreefold: false,
    canClaimFifty: false,
    legalMoves: ['Q', 'R', 'B', 'N'].map(promotion => ({ from: 'a7', to: 'a8', promotion })),
    moveHistory: [],
    lastMove: null,
    aiStats: null,
  };
  let postedPromotion: string | undefined;

  await page.route('**/api/games', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: game });
    } else await route.continue();
  });
  await page.route('**/api/games/*/moves', async route => {
    const payload = route.request().postDataJSON() as { promotion: string };
    postedPromotion = payload.promotion;
    await route.fulfill({
      status: 200,
      json: {
        ...game,
        fen: 'N6k/8/8/8/8/8/8/4K3 b - - 0 1',
        status: 'DRAW_INSUFFICIENT_MATERIAL',
        whiteToMove: false,
        legalMoves: [],
        moveHistory: [{ ply: 1, white: true, ai: false, uci: 'a7a8n' }],
        lastMove: { from: 'a7', to: 'a8', promotion: 'N' },
      },
    });
  });

  await page.reload();
  await expect(board(page).getByRole('button', { name: /^a7 white p/ })).toBeVisible();
  await board(page).getByRole('button', { name: /^a7 white p/ }).click();
  await board(page).getByRole('button', { name: /^a8 empty, legal destination/ }).click();
  await expect(page.getByRole('dialog', { name: 'Choose promotion piece' })).toBeVisible();
  await page.getByRole('button', { name: 'Promote to N' }).click();
  await expect.poll(() => postedPromotion).toBe('N');
  await expect(board(page).getByRole('button', { name: /^a8 white n/ })).toBeVisible();
});

test('mobile layout keeps the board usable without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(board(page).getByRole('button')).toHaveCount(64);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await expect(board(page).getByRole('button', { name: /^e4 empty, legal destination/ })).toBeVisible();
});
