# Menu & stock (Plan 2, part 1) — Design

Date: 2026-10-06. Implements spec §3 E1–E3 (see `2026-10-05-gaming-lounge-management-design.md`). Approved in chat; built without a separate spec review at the owner's request.

## Decisions
- **GST:** every line uses the lounge rate from Settings (0 when GST is off). A per-item rate was built first and then removed at the owner's request.
- **Every menu item is counted in stock automatically** (no switch) and **warns at 5 or fewer** (fixed, not shown or editable). Out means 0 or below.
- **Delete, not hide:** deleting an item or a category (with its items) removes it from the menu and stock; the rows stay hidden in the database so old bills keep their history.
- **Stock is the sum of `stock_moves`** (restock, sale, wastage, adjust, void), so the count can never disagree with its history.
- **Stock leaves when the bill is paid**, once per bill, inside the bill transaction. Voiding a bill puts back exactly what it took out.
- **Counts never block a sale.** Zero or negative shows "Out"; staff can still add the item.
- **Counter sale = a bill with no session**, same invoice sequence, discount rules and payment checks as a session bill (`finalizeCounterSale`, one shared `writeBill`).
- **Roles:** owner edits categories, items, prices and takes stock (Set count); any signed-in staff can sell, restock and record wastage. Every change is audited.
- Price is frozen on the tab when an item is added.
- **Upgrade safety:** before the database is upgraded, `backups/lounge-before-vN.db` is written next to it.

## Data (migration 2)
`menu_categories`, `menu_items`, `stock_moves`; `session_items.item_id` and `bill_lines.item_id` (nullable, free-text extras stay null).

## Screens
- `/menu`: Stock tab (everyone), Menu tab (owner). Sidebar badge counts items that are low or out.
- Session drawer: "Add from menu" grid above the free-text form.
- Floor header: "Counter sale" dialog (pick items, then the shared payment panel with UPI QR).

## Not included
Recipes, suppliers and purchase orders, barcodes, kitchen slips, a customer on a counter sale. Customers and WhatsApp are the next two parts of Plan 2.
