# Active Management

Financial & logistics admin app for the Active community: events (sport sessions, tournaments, …), their income
and expenses, general overhead costs, and dashboards with profit per event, month and year. Amounts are in RON.

## Stack

- **Backend:** Node.js ≥ 22.13 + Express 5, SQLite via the built-in `node:sqlite` (no native build needed)
- **Frontend:** React 18 + Vite + Recharts
- **Data:** a single file, `data/active.db` (override with `DB_PATH`). Back it up by copying the file.

## Running

```bash
npm install
npm run seed      # optional: demo data + demo admin admin@active.local / active123
npm run dev       # API on :3001, web UI on http://localhost:5173
```

Production (one process serves the API and the built UI):

```bash
npm run build
PORT=3001 npm start          # set COOKIE_SECURE=true when served over HTTPS
```

On a fresh database the first visit asks you to create the first admin; more admins are added in **Settings**.

## How the numbers are calculated

- **Event profit** = participants × participation fee + other income − organizing costs − benefits offered.
  Expense categories are tagged *organizing* (venue, trainers…) or *benefit* (drinks, food, prizes…);
  products taken from stock always count as benefits, at price × quantity (price frozen when used).
- **Profit split** — default in Settings, overridable per month on the Payouts page:
  - 50% reinvested in the community: ⅓ to the general community fund, ⅔ to the event's sport fund.
  - 20% founders, split equally between people marked as founders.
  - 30% organisers, shared each month in proportion to points: organisers/co-organisers of that month's
    finalized events, plus standalone contributions (partnerships, promo events…).
  - Points come from the points table (Settings → Points table); each event picks an activity from it.
  - Losses are split the same way (they reduce the funds).
- Only **finalized** events count. Events start as *live*; their share shows as "pending" until finalized.
- Transactions not tied to an event are **fund movements**: spending = reinvestment from the general fund
  or a sport fund; income (e.g. donations) is added to that fund directly, without splitting.
- Everything is attributed to the event's date (month). Money is stored as integer bani.
- In the DB, status `planned` = Live and `completed` = Finalized.
