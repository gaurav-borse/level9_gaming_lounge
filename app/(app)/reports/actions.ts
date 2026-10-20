"use server";
import { act } from "@/lib/action";
import { ownerActor } from "@/lib/session";
import { int, oneOf, rupeesToPaise, str } from "@/lib/validate";
import { EXPENSE_CATEGORIES, addExpense, deleteExpense } from "@/lib/db/expenses";
import { deleteInvestment, saveInvestment } from "@/lib/db/investments";

const field = (fd: FormData, k: string) => fd.get(k);
const blank = (v: FormDataEntryValue | null) => typeof v !== "string" || v.trim() === "";

export const addExpenseAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    addExpense(
      {
        day: str(field(fd, "day"), "Date", { max: 10 }),
        category: oneOf(field(fd, "category"), EXPENSE_CATEGORIES, "Category"),
        note: str(field(fd, "note"), "Note", { max: 200, required: false }),
        amountPaise: rupeesToPaise(field(fd, "amount"), "Amount", { min: 1 }),
        stationId: blank(field(fd, "station")) ? null : int(field(fd, "station"), "Station"),
      },
      me.id,
    );
  });

export const deleteExpenseAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    deleteExpense(int(field(fd, "id"), "Expense"), me.id);
  });

export const saveInvestmentAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    saveInvestment(
      blank(field(fd, "id")) ? null : int(field(fd, "id"), "Investment"),
      {
        name: str(field(fd, "name"), "Name", { max: 80 }),
        amountPaise: rupeesToPaise(field(fd, "amount"), "Amount", { min: 1 }),
        boughtOn: str(field(fd, "boughtOn"), "Date", { max: 10 }),
        stationId: blank(field(fd, "station")) ? null : int(field(fd, "station"), "Station"),
        note: str(field(fd, "note"), "Note", { max: 200, required: false }),
      },
      me.id,
    );
  });

export const deleteInvestmentAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    deleteInvestment(int(field(fd, "id"), "Investment"), me.id);
  });
