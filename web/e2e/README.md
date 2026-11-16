# Browser end-to-end tests

Playwright launches Chromium, Vite and the real Spring Boot chess service.
The tests exercise opening moves against the Java AI, the move record,
turn undo, restarting games, playing as Black, and mobile-board layout.

Promotion is tested with a mocked near-promotion API position because the
public game-creation API intentionally does not accept arbitrary FEN.

To run locally, install JDK 25, Maven and Node.js 22, then:

```sh
cd web
npm install
npx playwright install chromium
npm run test:e2e
```

Running both services manually first is also supported. CI runs these tests
in the required `test` check so failed E2E tests block merging to `main`.
