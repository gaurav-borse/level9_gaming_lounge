// Append-only. Index + 1 is the PRAGMA user_version after that entry runs. Never edit a shipped entry.
export const MIGRATIONS: string[] = [
  `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE zones (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX zones_name_active ON zones(name) WHERE active = 1;

CREATE TABLE stations (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  name TEXT NOT NULL,
  maintenance INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX stations_name_active ON stations(zone_id, name) WHERE active = 1;

CREATE TABLE rates (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  name TEXT NOT NULL,
  hourly_paise INTEGER NOT NULL CHECK (hourly_paise >= 0),
  extra_controller_paise INTEGER NOT NULL DEFAULT 0 CHECK (extra_controller_paise >= 0),
  increment_min INTEGER NOT NULL DEFAULT 1 CHECK (increment_min >= 1),
  min_minutes INTEGER NOT NULL DEFAULT 15 CHECK (min_minutes >= 0),
  grace_min INTEGER NOT NULL DEFAULT 0 CHECK (grace_min >= 0),
  days_mask INTEGER NOT NULL DEFAULT 127 CHECK (days_mask BETWEEN 1 AND 127),
  from_min INTEGER NOT NULL DEFAULT 0 CHECK (from_min BETWEEN 0 AND 1439),
  to_min INTEGER NOT NULL DEFAULT 1440 CHECK (to_min BETWEEN 1 AND 1440),
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  name TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp_consent INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  customer_id INTEGER REFERENCES customers(id),
  staff_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('open','fixed','prepaid')),
  started_at INTEGER NOT NULL,
  planned_minutes INTEGER,
  advance_paise INTEGER NOT NULL DEFAULT 0,
  advance_method TEXT CHECK (advance_method IN ('cash','upi','card')),
  players INTEGER NOT NULL DEFAULT 1,
  paused_at INTEGER,
  paused_total_ms INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER,
  rate_json TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  billed INTEGER NOT NULL DEFAULT 0
);
-- A station can have only one unbilled session: it stays busy until the bill is paid.
CREATE UNIQUE INDEX one_unbilled_session_per_station ON sessions(station_id) WHERE billed = 0;

CREATE TABLE session_items (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_paise INTEGER NOT NULL CHECK (unit_paise >= 0),
  created_at INTEGER NOT NULL
);

CREATE TABLE bills (
  id INTEGER PRIMARY KEY,
  invoice_no INTEGER NOT NULL UNIQUE,
  session_id INTEGER UNIQUE REFERENCES sessions(id),
  customer_id INTEGER REFERENCES customers(id),
  staff_id TEXT NOT NULL,
  subtotal_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  discount_reason TEXT NOT NULL DEFAULT '',
  tax_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','void')),
  void_reason TEXT,
  voided_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE bill_lines (
  id INTEGER PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  kind TEXT NOT NULL CHECK (kind IN ('session','item')),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_paise INTEGER NOT NULL,
  tax_pct INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  method TEXT NOT NULL CHECK (method IN ('cash','upi','card')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  staff_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
`,
  // 2: menu and stock. Stock on hand is always the sum of stock_moves, so it can never disagree with its history.
  `
CREATE TABLE menu_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE menu_items (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES menu_categories(id),
  name TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  tax_pct INTEGER CHECK (tax_pct IS NULL OR (tax_pct >= 0 AND tax_pct <= 100)),
  track_stock INTEGER NOT NULL DEFAULT 0,
  low_at INTEGER CHECK (low_at IS NULL OR low_at >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stock_moves (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES menu_items(id),
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL CHECK (reason IN ('restock','sale','wastage','adjust','void')),
  bill_id INTEGER REFERENCES bills(id),
  staff_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);
CREATE INDEX stock_moves_item ON stock_moves(item_id, id);

ALTER TABLE session_items ADD COLUMN item_id INTEGER REFERENCES menu_items(id);
ALTER TABLE bill_lines ADD COLUMN item_id INTEGER REFERENCES menu_items(id);
`,
  // 3: every menu item is counted in stock automatically. menu_items.tax_pct is no longer used (GST is the lounge rate); the column stays so nothing is dropped.
  `
UPDATE menu_items SET track_stock = 1;
`,
  // 4: WhatsApp prompt mode. A row means the message was opened or skipped, so it leaves the tray and is never offered again.
  `
CREATE TABLE message_log (
  key TEXT PRIMARY KEY,
  outcome TEXT NOT NULL CHECK (outcome IN ('opened','skipped')),
  at INTEGER NOT NULL
);
`,
  // 5: expenses, for net profit. `day` is the lounge's local date (yyyy-mm-dd) the money was spent.
  `
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,
  category TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  staff_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX expenses_day ON expenses(day);
`,
  // 6: time packages were removed from the app; the table was never used by anything else.
  `
DROP TABLE IF EXISTS packages;
`,
  // 7: investments (what was spent on equipment, to see when it pays back) and expenses that belong to one station.
  `
CREATE TABLE investments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  bought_on TEXT NOT NULL,
  station_id INTEGER REFERENCES stations(id),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
ALTER TABLE expenses ADD COLUMN station_id INTEGER REFERENCES stations(id);
`,
];
