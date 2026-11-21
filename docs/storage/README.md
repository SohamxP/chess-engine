# Game Library v1 — persistence, migration and backup

PlySense's authoritative game library is now **browser-local IndexedDB**.
It holds up to **2,000 game snapshots**; PGN imports still preview a maximum
of 50 games at a time (a parsing cap, not a storage cap). Large libraries
render 24 game cards at a time.

## Non-destructive migration

On first use, the library opens database `plysense-game-library-v1`,
with versioned `games` and `metadata` stores. It imports valid games from
the existing `openfile-chess-games-v1` localStorage key. Records and the
migration marker are written in **one transaction**, then the library is read.
The original localStorage value is **not deleted or rewritten**.

If a previous version of PlySense changes the legacy value in another tab,
the migration detects the changed fingerprint and imports only game IDs not
already present. IndexedDB takes precedence for existing IDs, so an older
snapshot cannot overwrite a newer record; deletions aren't reversed when
the untouched legacy string remains. The marker alone cannot certify that
two browser stores are globally synchronized; close old tabs when migrating.

New gameplay saves, PGN imports, deletions and restores use serialized
IndexedDB transactions. No imported game is evicted to make room. If the
library is full or IndexedDB is unavailable, a **visible error** is returned
instead of silently falling back to a 50-game store.

## Portable local backup

**My Games → Download library backup** exports a JSON file containing:

- Every valid, saved IndexedDB game, including player metadata, PGN and FEN
  snapshots.
- Decision Lab cards, streaks, written plans and retained attempt histories.
- Versioned, already-saved Stockfish evaluation cache entries (up to 2,400).

**My Games → Restore JSON backup** checks the entire file and rejects an
unsupported version, duplicate identifiers, malformed FEN/move metadata,
unsupported score entries, oversized data or invalid practice cards **before
writing any records**. The restore is **additive**: existing games, practice
cards and cached analysis are not overwritten. The 2,000-game and 180-card
limits remain enforced. The JSON backup size limit is 50 MiB.

IndexedDB games are restored together in one transaction; Decision Lab
(localStorage) and Stockfish cached evaluations (a separate IndexedDB
database) cannot participate in that transaction. A storage failure between
steps can leave a **partial additive import**, which the app reports. It does
not delete existing data, and retrying the same backup is safe.

No cloud sync or account exists; an exported JSON file is the user's only
portable full backup. The stockfish cache only contains durable evaluations:
in-memory-only intermediate search scores are deliberately not exported.

## Browser acceptance tests

`web/e2e/library.e2e.ts` covers:

1. Importing two old localStorage games, preserving the legacy bytes, deleting
   one in IndexedDB and ensuring reload doesn't resurrect it.
2. Restoring 75 games from JSON, verifying archive pagination, exporting a
   complete backup including a real practice card and versioned evaluation,
   then reloading and restoring the same file again without duplicates.
3. Rejecting a corrupt backup containing one invalid game without modifying
   the original library.

The standard `mvn clean verify`, `npm test`, `npm run build`, Playwright
browser E2E and Docker smoke suite run in GitHub Actions.
