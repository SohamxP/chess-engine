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
  await expect(page.locator('.move-list')).toContainText('e5');
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
        moveHistory: [{ ply: 1, white: true, ai: false, uci: 'a7a8n', san: 'a8=N' }],
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
  await expect(page.getByRole('dialog', { name: 'Game result' })).toBeVisible();
  await expect(page.locator('.result-score')).toHaveText('1/2-1/2');
  await page.getByRole('button', { name: 'Review board' }).click();
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

test('AI movement has readable pacing and a visible piece animation', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  const moveStarted = Date.now();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();

  // AI search happens on the real Java server. It should still display a
  // readable thinking interval before showing the piece's travel.
  await expect(page.locator('.piece-flight')).toBeVisible({ timeout: 45_000 });
  expect(Date.now() - moveStarted).toBeGreaterThanOrEqual(550);
  await expect(page.locator('.piece-flight')).toHaveCount(0);
  await expect(page.locator('.move-count')).toHaveText('2 MOVES');
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
});


test('move history uses standard algebraic notation from the real Java API', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });
  const first = page.locator('.move-pair').first();
  await expect(first.locator('span').nth(1)).toHaveText('e4');
  await expect(first.locator('span').nth(2)).not.toHaveText(/^[a-h][1-8][–-][a-h][1-8]$/);
});

test('captured piece remains on destination during flight and disappears on arrival', async ({ page }) => {
  // Mock a tactical FEN to reliably reach a capture. The real Java engine is
  // tested by the regular browser flows; only this precise visual state is stubbed.
  const game = {
    id: '00000000-0000-0000-0000-000000000021',
    fen: '4k3/8/8/8/4q3/8/8/K3R3 w - - 0 1',
    status: 'IN_PROGRESS',
    whiteToMove: true,
    inCheck: false,
    humanWhite: true,
    depth: 1,
    aiTurn: false,
    canUndo: false,
    canClaimThreefold: false,
    canClaimFifty: false,
    legalMoves: [{ from: 'e1', to: 'e4', promotion: null }],
    moveHistory: [],
    lastMove: null,
    aiStats: null,
  };
  await page.route('**/api/games', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 201, json: game });
    else await route.continue();
  });
  await page.route('**/api/games/*/moves', route => route.fulfill({
    status: 200,
    json: {
      ...game,
      fen: '4k3/8/8/8/4R3/8/8/K7 b - - 0 1',
      whiteToMove: false,
      aiTurn: true,
      canUndo: true,
      legalMoves: [],
      moveHistory: [{ ply: 1, white: true, ai: false, uci: 'e1e4', san: 'Rxe4+' }],
      lastMove: { from: 'e1', to: 'e4', promotion: null },
    },
  }));
  await page.route('**/api/games/*/ai', async route => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 200,
      json: {
        ...game,
        fen: '8/4k3/8/8/4R3/8/8/K7 w - - 1 2',
        whiteToMove: true,
        aiTurn: false,
        canUndo: true,
        legalMoves: [],
        moveHistory: [
          { ply: 1, white: true, ai: false, uci: 'e1e4', san: 'Rxe4+' },
          { ply: 2, white: false, ai: true, uci: 'e8e7', san: 'Ke7' },
        ],
        lastMove: { from: 'e8', to: 'e7', promotion: null },
      },
    });
  });
  await page.reload();
  await expect(board(page).getByRole('button', { name: /^e1 white r/ })).toBeVisible();
  await board(page).getByRole('button', { name: /^e1 white r/ }).click();
  await board(page).getByRole('button', { name: /^e4 black q, legal destination/ }).click();

  await expect(page.locator('.piece-flight')).toBeVisible();
  await expect(board(page)).toHaveAttribute('data-moving-to', 'e4');
  await expect(board(page).getByRole('button', { name: /^e4 black q/ })).toBeVisible();
  await expect(board(page).getByRole('button', { name: /^e1 white r/ }).locator('.piece'))
    .toHaveCSS('visibility', 'hidden');

  await expect(board(page).getByRole('button', { name: /^e4 white r/ })).toBeVisible();
  await expect(board(page).getByRole('button', { name: /^e4 black q/ })).toHaveCount(0);
  await expect(page.locator('.move-pair').first()).toContainText('Rxe4+');
});

test('game result dialog shows official scores for either winner and drawn games', async ({ page }) => {
  const game = {
    id: '00000000-0000-0000-0000-000000000022',
    fen: '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1',
    status: 'CHECKMATE',
    whiteToMove: false,
    inCheck: true,
    humanWhite: true,
    depth: 1,
    aiTurn: false,
    canUndo: false,
    canClaimThreefold: false,
    canClaimFifty: false,
    legalMoves: [],
    moveHistory: [],
    lastMove: null,
    aiStats: null,
  };
  let data = game;
  await page.route('**/api/games', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 201, json: data });
    else await route.continue();
  });

  for (const [status, whiteToMove, expected] of [
    ['CHECKMATE', false, '1-0'],
    ['CHECKMATE', true, '0-1'],
    ['STALEMATE', false, '1/2-1/2'],
  ] as const) {
    data = { ...game, status, whiteToMove };
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Game result' })).toBeVisible();
    await expect(page.locator('.result-score')).toHaveText(expected);
    await page.getByRole('button', { name: 'Review board' }).click();
    await expect(page.getByRole('dialog', { name: 'Game result' })).toHaveCount(0);
    await expect(board(page).getByRole('button')).toHaveCount(64);
  }
});
