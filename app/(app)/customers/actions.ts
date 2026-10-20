"use server";
import { act } from "@/lib/action";
import { actor } from "@/lib/session";
import { int, str } from "@/lib/validate";
import { createCustomer, updateCustomer } from "@/lib/db/customers";

const field = (fd: FormData, k: string) => fd.get(k);
const text = (fd: FormData, k: string, label: string, max: number, required = false) => str(field(fd, k), label, { max, required });

export const addCustomerAction = async (fd: FormData) =>
  act(async () => {
    await actor();
    return createCustomer(text(fd, "name", "Customer name", 80, true), text(fd, "phone", "Phone", 30));
  });

export const updateCustomerAction = async (fd: FormData) =>
  act(async () => {
    const me = await actor();
    updateCustomer(int(field(fd, "id"), "Customer"), text(fd, "name", "Customer name", 80, true), text(fd, "phone", "Phone", 30), text(fd, "notes", "Notes", 500), me.id);
  });
