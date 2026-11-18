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
  await expect(page.locator('.engine-stats')).toContainText('Positions visited');

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
    initialFen: '7k/P7/8/8/8/8/8/4K3 w - - 0 1',
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
        moveHistory: [{ ply: 1, white: true, ai: false, uci: 'a7a8n', san: 'a8=N',
          fen: 'N6k/8/8/8/8/8/8/4K3 b - - 0 1' }],
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
  // VS15 tells iOS to render a CSS-colorable pawn, not a precolored emoji.
  const whitePawn = board(page).getByRole('button', { name: /^e2 white p/ }).locator('.piece');
  const blackPawn = board(page).getByRole('button', { name: /^e7 black p/ }).locator('.piece');
  await expect(whitePawn).toHaveText('♟\uFE0E');
  await expect(blackPawn).toHaveText('♟\uFE0E');
  await expect(whitePawn).toHaveCSS('color', 'rgb(255, 250, 240)');
  await expect(blackPawn).toHaveCSS('color', 'rgb(37, 48, 42)');
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await expect(board(page).getByRole('button', { name: /^e4 empty, legal destination/ })).toBeVisible();
});

test('AI movement has readable pacing and a visible piece animation', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  // Record DOM transitions instead of racing a 420 ms animation with
  // Playwright polling. This observes both flights even on slow CI runners.
  await page.evaluate(() => {
    const w = window as Window & {
      flightEvents?: Array<{ destination: string; at: number }>
    };
    w.flightEvents = [];
    const element = document.querySelector('[aria-label="Interactive chess board"]');
    if (!element) throw new Error('Chessboard was not rendered');
    new MutationObserver(() => {
      const destination = element.getAttribute('data-moving-to');
      if (destination) w.flightEvents?.push({ destination, at: performance.now() });
    }).observe(element, { attributes: true, attributeFilter: ['data-moving-to'] });
  });

  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  const flights = await page.evaluate(() =>
    (window as Window & {
      flightEvents?: Array<{ destination: string; at: number }>
    }).flightEvents ?? []);
  expect(flights).toHaveLength(2);
  expect(flights[0].destination).toBe('e4');
  expect(flights[1].destination).not.toBe('e4');
  // Human travel (420ms) completes before the engine's concurrent 700ms
  // calculation/presentation pause; the gap should exceed one second.
  expect(flights[1].at - flights[0].at).toBeGreaterThanOrEqual(1000);
});


test('move history uses standard algebraic notation from the real Java API', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });
  const first = page.locator('.move-pair').first();
  await expect(first.locator('.move-entry').nth(0)).toHaveText('e4');
  await expect(first.locator('.move-entry').nth(1)).not.toHaveText(/^[a-h][1-8][–-][a-h][1-8]$/);
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
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'Game result' })).toBeVisible();
    await expect(page.locator('.result-score')).toHaveText(expected);
    await page.getByRole('button', { name: 'Review board' }).click();
    await expect(page.getByRole('dialog', { name: 'Game result' })).toHaveCount(0);
    await expect(board(page).getByRole('button')).toHaveCount(64);
  }
});


test('dragging a white pawn makes a legal move against the real Java AI', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await board(page).getByRole('button', { name: /^e2 white p/ }).dragTo(
    board(page).getByRole('button', { name: /^e4 empty/ }),
  );
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });
  await expect(board(page).getByRole('button', { name: /^e4 white p/ })).toBeVisible();
  await expect(page.locator('.move-pair .move-entry').first()).toHaveText('e4');
});

test('dragging a knight also uses legal engine moves rather than pawn-only logic', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await board(page).getByRole('button', { name: /^g1 white n/ }).dragTo(
    board(page).getByRole('button', { name: /^f3 empty/ }),
  );
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });
  await expect(board(page).getByRole('button', { name: /^f3 white n/ })).toBeVisible();
  await expect(page.locator('.move-pair .move-entry').first()).toHaveText('Nf3');
});

test('opening SAN history navigates to a dedicated review URL, and back preserves gameplay', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });

  await page.getByRole('button', { name: 'View position after move 1: e4' }).click();
  await expect(page).toHaveURL(/\?review=/);
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  // A direct reload retrieves the same session from the Java API.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(board(page)).toHaveAttribute('data-review-ply', '0');
  await page.getByRole('button', { name: 'View position after move 1: e4' }).click();
  await expect(board(page)).toHaveAttribute('data-review-ply', '1');
  await expect(board(page).getByRole('button', { name: /^e4 white p/ })).toBeDisabled();

  await page.keyboard.press('ArrowLeft');
  await expect(board(page)).toHaveAttribute('data-review-ply', '0');
  await expect(board(page).getByRole('button', { name: /^e2 white p/ })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(board(page)).toHaveAttribute('data-review-ply', '1');
  await page.keyboard.press('ArrowRight');
  await expect(board(page)).toHaveAttribute('data-review-ply', '2');

  await page.getByRole('button', { name: 'First position' }).click();
  await expect(board(page)).toHaveAttribute('data-review-ply', '0');
  // Reloaded reviews now use the local snapshot. They return to My Games,
  // because the original Java session might no longer exist on Render.
  await page.getByRole('button', { name: 'Back to game' }).click();
  await expect(page).toHaveURL(/\?games=1/);
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  await expect(page.locator('.archive-game-card')).toHaveCount(1);
});

test('a later SAN move opens its exact historical position on the review page', async ({ page }) => {
  const opening = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const target = '4k3/8/8/4R3/8/8/8/4K3 b - - 1 20';
  const final = '4k3/8/8/4R3/8/8/8/3K4 w - - 2 21';
  const moves = Array.from({ length: 40 }, (_, i) => ({
    ply: i + 1, white: i % 2 === 0, ai: i % 2 === 1,
    uci: i === 38 ? 'e4e5' : 'e8e7',
    san: i === 38 ? 'Re5' : 'Ke7',
    fen: i === 38 ? target : i === 39 ? final : opening,
  }));
  const game = {
    id: '00000000-0000-0000-0000-000000000045',
    fen: final, initialFen: opening,
    status: 'IN_PROGRESS', whiteToMove: true, inCheck: false,
    humanWhite: true, depth: 1, aiTurn: false,
    canUndo: false, canClaimThreefold: false, canClaimFifty: false,
    legalMoves: [], moveHistory: moves, lastMove: {from: 'e8', to: 'e7', promotion: null},
    aiStats: null,
  };
  await page.route('**/api/games', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 201, json: game });
    else await route.continue();
  });
  await page.reload();
  await expect(page.locator('.move-count')).toHaveText('40 MOVES');
  await page.getByRole('button', { name: 'View position after move 39: Re5' }).click();
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(board(page)).toHaveAttribute('data-review-ply', '39');
  await expect(board(page).getByRole('button', { name: /^e5 white r/ })).toBeVisible();
  await expect(board(page).getByRole('button', { name: /^e1 white k/ })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(board(page)).toHaveAttribute('data-review-ply', '40');
  await expect(board(page).getByRole('button', { name: /^d1 white k/ })).toBeVisible();
});

test('touch drag moves a pawn on a small board', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/');
    await expect(page.getByText('Your move', { exact: true })).toBeVisible();

    const from = await board(page).getByRole('button', { name: /^d2 white p/ }).boundingBox();
    const to = await board(page).getByRole('button', { name: /^d4 empty/ }).boundingBox();
    if (!from || !to) throw new Error('Chess square not visible in mobile viewport');
    const point = (box: { x: number; y: number; width: number; height: number }) =>
      ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    const start = point(from), end = point(to);
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: start.x + (end.x - start.x) * step / 12,
          y: start.y + (end.y - start.y) * step / 12,
        }],
      });
      await page.waitForTimeout(12);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });
    await expect(board(page).getByRole('button', { name: /^d4 white p/ })).toBeVisible();
  } finally {
    await context.close();
  }
});


test('resigning shows the correct game result and requires confirmation', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Confirm resignation' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm resignation' }).click();
  await expect(page.getByRole('dialog', { name: 'Game result' })).toBeVisible();
  await expect(page.locator('.result-score')).toHaveText('0-1');
  await page.getByRole('button', { name: 'Review board' }).click();
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(page.getByText('0-1', { exact: true })).toBeVisible();
  await expect(board(page).getByRole('button', { name: /^e2 / })).toBeDisabled();
});

test('offering a draw can be declined and game continues without changing position', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Offer draw' }).click();
  await expect(page.getByRole('status')).toContainText('Computer declined your draw offer.');
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await expect(page.locator('.move-count')).toHaveText('0 MOVES');
  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });
});

test('arrow key from a completed-game popup opens the dedicated review page', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });

  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm resignation' }).click();
  await expect(page.getByRole('dialog', { name: 'Game result' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('dialog', { name: 'Game result' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(board(page)).toHaveAttribute('data-review-ply', '1');

  await page.getByRole('button', { name: 'Previous move' }).click();
  await expect(board(page)).toHaveAttribute('data-review-ply', '0');
  await page.getByRole('button', { name: 'Next move' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(board(page)).toHaveAttribute('data-review-ply', '1');
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(board(page)).toHaveAttribute('data-review-ply', '2');
});

test('dedicated page runs Stockfish and displays SAN feedback on mobile', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });

  await page.getByRole('button', { name: 'Open Game Review' }).click();
  const evaluation = page.getByRole('region', { name: 'Engine evaluation' });
  await evaluation.getByRole('button', { name: 'Analyze game' }).click();
  await expect(evaluation.getByRole('status')).toHaveText('Analyzed 3 positions.', { timeout: 95_000 });
  await expect(evaluation.locator('.review-chart')).toBeVisible();
  await expect(evaluation.locator('.review-summary')).toContainText('Blunders');
  await expect(board(page)).toHaveAttribute('data-review-ply', '0');

  await page.getByRole('button', { name: 'View position after move 1: e4' }).click();
  await expect(board(page)).toHaveAttribute('data-review-ply', '1');
  await expect(page.getByRole('region', { name: 'Selected move analysis' })).toContainText('e4');
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Back to game' }).click();
  await expect(board(page)).toHaveAttribute('data-review-ply', 'live');
});



test('captured pawn appears beneath player name and updates during SAN history review', async ({ page }) => {
  const initial = '4k2r/8/8/8/4p3/8/P7/4R1K1 w - - 0 1';
  const final = '4k2r/8/8/8/4R3/8/P7/6K1 b - - 0 1';
  const game = {
    id: '00000000-0000-0000-0000-000000000056',
    fen: final, initialFen: initial, status: 'IN_PROGRESS',
    whiteToMove: false, inCheck: true, humanWhite: true, depth: 1,
    aiTurn: true, canUndo: true, canClaimThreefold: false, canClaimFifty: false,
    legalMoves: [], moveHistory: [{ ply: 1, white: true, ai: false, uci: 'e1e4', san: 'Rxe4+', fen: final }],
    lastMove: { from: 'e1', to: 'e4', promotion: null }, aiStats: null,
  };
  await page.route('**/api/games', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 201, json: game });
    else await route.continue();
  });
  await page.route('**/api/games/*/ai', route => route.fulfill({ status: 200, json: game }));
  await page.reload();
  await expect(page.getByLabel('You captured 1 pieces')).toContainText('♟\uFE0E');
  await expect(page.getByLabel('You captured 1 pieces')).toContainText('+1');

  // Game creation is still completing its mocked AI reply; wait until controls unlock.
  await expect(page.getByRole('button', { name: 'Open Game Review' })).toBeEnabled();
  await page.getByRole('button', { name: 'View position after move 1: Rxe4+' }).click();
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Review notation' })).toContainText('Rxe4+');
  await expect(page.getByLabel('You captured 1 pieces')).toBeVisible();
  await page.getByRole('button', { name: 'First position' }).click();
  await expect(page.getByLabel('You captured 1 pieces')).toHaveCount(0);
  await page.getByRole('button', { name: 'Last position' }).click();
  await expect(page.getByLabel('You captured 1 pieces')).toBeVisible();
});


test('My Games preserves a playable match for offline review and exports PGN', async ({ page }) => {
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /My Games/ }).click();
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No saved games yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Play chess' }).click();

  await board(page).getByRole('button', { name: /^e2 white p/ }).click();
  await board(page).getByRole('button', { name: /^e4 empty, legal destination/ }).click();
  await expect(page.locator('.move-count')).toHaveText('2 MOVES', { timeout: 45_000 });
  await expect(page.getByRole('button', { name: /My Games \(1\)/ })).toBeVisible();
  await page.getByRole('button', { name: /My Games/ }).click();
  await expect(page).toHaveURL(/\?games=1/);
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  const card = page.locator('.archive-game-card').first();
  await expect(card).toContainText('2 half-moves');
  await expect(card).toContainText('Unfinished');

  const downloadPromise = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Download PGN' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/plyforge-.+\.pgn$/);

  await card.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page).toHaveURL(/\?review=/);
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('saved snapshot');
  await expect(page.getByRole('region', { name: 'Review notation' })).toContainText('e4');

  // Even if Render forgot the session, a saved snapshot reopens without calling the server.
  await page.route('**/api/games/*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 404, json: { message: 'Game expired' } });
    } else await route.continue();
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await page.getByRole('button', { name: 'View position after move 1: e4' }).click();
  await expect(board(page)).toHaveAttribute('data-review-ply', '1');

  await page.getByRole('button', { name: 'Back to game' }).click();
  await expect(page).toHaveURL(/\?games=1/);
  await card.getByRole('button', { name: 'Remove' }).click();
  await card.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByRole('heading', { name: 'No saved games yet' })).toBeVisible();
});

test('My Games is responsive on narrow mobile browsers', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: /My Games/ }).click();
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Decision Lab evaluates a blind retry, records the plan and survives reload on mobile', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const now = '2020-01-01T00:00:00.000Z';
    localStorage.setItem('plyforge-decision-lab-v1', JSON.stringify([{
      id: 'lesson:1', gameId: 'lesson', ply: 1,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      white: true, originalUci: 'e2e4', originalSan: 'e4',
      addedAt: now, dueAt: now, streak: 0, attempts: 0,
      lastPlan: '', lastSuccess: null,
    }]));
  });
  await page.goto('/?lab=1');
  await expect(page.getByRole('heading', { name: 'Decision Lab' })).toBeVisible();
  const labBoard = page.getByRole('group', { name: 'Decision Lab chess board' });
  await expect(labBoard.getByRole('button')).toHaveCount(64);
  await expect(page.getByRole('region', { name: 'Decision feedback' })).toHaveCount(0);
  await expect(page.getByText('Due now', { exact: true }).first()).toBeVisible();
  await page.getByLabel('What is your plan in this position?')
    .fill('I want to open the center and develop my bishop.');
  await labBoard.getByRole('button', { name: /^e2 white pawn/ }).click();
  await labBoard.getByRole('button', { name: /^e4 empty, legal destination/ }).click();
  await expect(page.getByRole('region', { name: 'Decision feedback' }))
    .toContainText('Your original move (e4)', { timeout: 120_000 });
  await expect(page.getByRole('region', { name: 'Decision feedback' }))
    .toContainText('Engine suggestion');
  await expect(labBoard.getByRole('button', { name: /^e4 white pawn/ })).toBeDisabled();
  const record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('plyforge-decision-lab-v1') ?? '[]')[0]);
  expect(record.attempts).toBe(1);
  expect(record.lastPlan).toBe('I want to open the center and develop my bishop.');
  expect(Date.parse(record.dueAt)).toBeGreaterThan(Date.now());

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Decision Lab' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You are caught up.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your decision library' })).toContainText('1 attempts');
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your decision library' }))
    .toContainText('1 attempts');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByRole('heading', { name: 'Your practice deck is empty.' })).toBeVisible();
});


test('imports multiple PGN games with player-side selection, replays history and re-exports real names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /My Games/ }).click();
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  await page.getByRole('button', { name: 'Import PGN' }).click();
  await page.getByLabel('Your player name (optional)').fill('Soham');
  const batch = `[Event "Lichess Blitz"]
[Site "https://lichess.org/test"]
[Date "2026.11.17"]
[White "Soham"]
[Black "Opponent"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "Chess.com Rapid"]
[Site "https://www.chess.com/game/live/example"]
[Date "2026.11.18"]
[White "Opponent"]
[Black "Soham"]
[Result "0-1"]

1. d4 Nf6 2. c4 e6 0-1`;
  await page.getByLabel('Or paste PGN text').fill(batch);
  await page.getByRole('button', { name: 'Preview pasted games' }).click();
  const preview = page.getByRole('region', { name: 'PGN import preview' });
  await expect(preview.locator('.pgn-preview-card')).toHaveCount(2);
  await expect(preview.locator('.pgn-preview-card').first().getByRole('combobox')).toHaveValue('white');
  await expect(preview.locator('.pgn-preview-card').last().getByRole('combobox')).toHaveValue('black');
  await preview.getByRole('button', { name: 'Import 2 selected games' }).click();
  await expect(page.getByRole('status')).toContainText('2 imported');
  await expect(page.locator('.archive-game-card')).toHaveCount(2);

  // Result and original players survive review and round-trip PGN download.
  const firstCard = page.locator('.archive-game-card').filter({ hasText: 'Lichess' }).first();
  await expect(firstCard).toContainText('Soham vs. Opponent');
  const downloadPromise = page.waitForEvent('download');
  await firstCard.getByRole('button', { name: 'Download PGN' }).click();
  const download = await downloadPromise;
  const fs = await import('node:fs/promises');
  const savedPath = await download.path();
  if (!savedPath) throw new Error('PGN download path not available');
  const exported = await fs.readFile(savedPath, 'utf8');
  expect(exported).toContain('[White "Soham"]');
  expect(exported).toContain('[Site "https://lichess.org/test"]');
  expect(exported).toContain('1. e4 e5 2. Nf3 Nc6 1-0');

  await firstCard.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page).toHaveURL(/\?review=pgn-/);
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Review notation' })).toContainText('Nf3');
  await expect(page.locator('.review-result')).toContainText('Soham vs. Opponent');
  await page.getByRole('button', { name: 'View position after move 3: Nf3' }).click();
  await expect(board(page)).toHaveAttribute('data-review-ply', '3');

  // The browser snapshot works even when the Java server cannot return the ID.
  await page.route('**/api/games/*', route => route.fulfill({ status: 404, json: { message: 'No session' } }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Review notation' })).toContainText('Nf3');
  await page.getByRole('button', { name: 'Back to game' }).click();
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('rejects invalid PGN without losing valid games and never reimports identical moves', async ({ page }) => {
  await page.getByRole('button', { name: /My Games/ }).click();
  await page.getByRole('button', { name: 'Import PGN' }).click();
  const batch = `[Event "Valid"]
[White "A"]
[Black "B"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 1/2-1/2

[Event "Invalid"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Bh6 *`;
  await page.getByLabel('Or paste PGN text').fill(batch);
  await page.getByRole('button', { name: 'Preview pasted games' }).click();
  await expect(page.getByRole('alert')).toContainText('1 game could not be imported');
  await expect(page.getByRole('region', { name: 'PGN import preview' }).locator('.pgn-preview-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Import 1 selected game' }).click();
  await expect(page.locator('.archive-game-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Preview pasted games' }).click();
  await page.getByRole('button', { name: 'Import 1 selected game' }).click();
  await expect(page.getByRole('status')).toContainText('1 already saved');
  await expect(page.locator('.archive-game-card')).toHaveCount(1);
});

test('imports uploaded .pgn files without sending PGN content to an API', async ({ page }) => {
  await page.getByRole('button', { name: /My Games/ }).click();
  await page.getByRole('button', { name: 'Import PGN' }).click();
  let uploaded = false;
  page.on('request', request => {
    if (request.method() !== 'GET' && request.url().includes('/api/') && request.postData()?.includes('[Event')) {
      uploaded = true;
    }
  });
  await page.getByLabel('Choose PGN files').setInputFiles({
    name: 'game.pgn', mimeType: 'text/plain',
    buffer: Buffer.from('[Event "From file"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 c5 *'),
  });
  await expect(page.getByRole('region', { name: 'PGN import preview' })).toContainText('From file');
  await page.getByRole('button', { name: 'Import 1 selected game' }).click();
  await expect(page.locator('.archive-game-card')).toHaveCount(1);
  expect(uploaded).toBe(false);
});

test('custom FEN PGN keeps original fullmove numbering and Black-side orientation', async ({ page }) => {
  await page.getByRole('button', { name: /My Games/ }).click();
  await page.getByRole('button', { name: 'Import PGN' }).click();
  const pgn = `[Event "Endgame"]
[White "Opponent"]
[Black "Soham"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/8/4K3 b - - 0 12"]
[Result "*"]

12... Kd7 13. Kd2 *`;
  await page.getByLabel('Or paste PGN text').fill(pgn);
  await page.getByRole('button', { name: 'Preview pasted games' }).click();
  await page.getByRole('region', { name: 'PGN import preview' }).getByRole('combobox').selectOption('black');
  await page.getByRole('button', { name: 'Import 1 selected game' }).click();
  await page.locator('.archive-game-card').first().getByRole('button', { name: 'Review' }).click();
  const review = page.getByRole('region', { name: 'Review notation' });
  await expect(review.locator('.move-pair')).toHaveCount(2);
  await expect(review.locator('.move-number').first()).toHaveText('12.');
  await expect(review.locator('.move-number').last()).toHaveText('13.');
  await expect(page.locator('.human-strip')).toContainText('Soham');
  await expect(page.locator('.human-strip')).toContainText('Black');
  await expect(page.getByRole('note')).toContainText('Imported PGN');
});
