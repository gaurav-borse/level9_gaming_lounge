# Gaming Lounge Manager

Gaming lounge management for one laptop: floor board with live timers, billing with UPI QR, digital invoices, staff PINs. Next.js 16, Tailwind v4, SQLite (`node:sqlite`), Better Auth. Offline.

## Develop

    npm install
    npm run dev         # http://localhost:3000 (data in ./data)
    npm test            # unit tests (Node 24 test runner)
    npx tsc --noEmit && npx eslint

## Ship to a lounge laptop

    npm run release     # builds ./release (double-click folder with its own node.exe)

Copy the whole `release` folder to the laptop and double-click `start.bat`. See `release/README.txt` for owner instructions. Stop any running copy (`release\stop.bat`) before building a new release.

## Check a build over HTTP

    cd release && cmd //c ".\start.bat"        # with PORT=3200 LOUNGE_NO_BROWSER=1 in the environment
    BASE=http://127.0.0.1:3200 DATA=<path to release/data> MANIFEST=release/app/.next/server/server-reference-manifest.json npm run smoke

The smoke test needs an empty data folder and no browser.

## Notes

- All money is stored as integer paise. SQL lives only in `lib/db`; moving to Postgres on Vercel later means rewriting that folder.
- `next build` must never open the database: put `await connection()` or `await headers()` before any database call in layouts, pages and route handlers.
- Data (`data/`) and builds (`release/`) are git-ignored.
