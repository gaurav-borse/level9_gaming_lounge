"use server";
import { act } from "@/lib/action";
import { actor, ownerActor } from "@/lib/session";
import { UserError } from "@/lib/errors";
import { int, oneOf, rupeesToPaise, str } from "@/lib/validate";
import { deleteCategory, deleteItem, recordStock, saveCategory, saveItem } from "@/lib/db/menu";

const field = (fd: FormData, k: string) => fd.get(k);
const blank = (v: FormDataEntryValue | null) => typeof v !== "string" || v.trim() === "";

export const saveCategoryAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    const id = blank(field(fd, "id")) ? null : int(field(fd, "id"), "Category");
    saveCategory(id, str(field(fd, "name"), "Category name", { max: 60 }), me.id);
  });

export const deleteCategoryAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    deleteCategory(int(field(fd, "id"), "Category"), me.id);
  });

/** Every item is counted in stock automatically and warns at 5 or fewer: there is nothing to set. */
export const saveItemAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    const id = blank(field(fd, "id")) ? null : int(field(fd, "id"), "Item");
    saveItem(
      id,
      {
        categoryId: int(field(fd, "categoryId"), "Category"),
        name: str(field(fd, "name"), "Item name", { max: 60 }),
        pricePaise: rupeesToPaise(field(fd, "price"), "Price"),
      },
      me.id,
    );
  });

export const deleteItemAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    deleteItem(int(field(fd, "id"), "Item"), me.id);
  });

/** Restock is for any signed-in staff; a stock-take (adjust) overwrites the count, so it is owner-only. */
export const stockAction = async (fd: FormData) =>
  act(async () => {
    const kind = oneOf(field(fd, "kind"), ["restock", "adjust"] as const, "Stock action");
    const me = kind === "adjust" ? await ownerActor() : await actor();
    const qtyRaw = field(fd, "qty");
    if (blank(qtyRaw)) throw new UserError("Enter a quantity");
    recordStock(int(field(fd, "id"), "Item"), kind, int(qtyRaw, "Quantity", { max: 1_000_000 }), me.id, str(field(fd, "note"), "Note", { max: 120, required: false }));
  });
