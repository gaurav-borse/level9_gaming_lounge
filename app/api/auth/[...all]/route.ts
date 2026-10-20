import { connection } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// `next build` pre-renders GET route handlers, so opt out first: the build must never open the database.
const handler = () => toNextJsHandler(getAuth().auth);
export const GET = async (req: Request) => {
  await connection();
  return handler().GET(req);
};
export const POST = async (req: Request) => {
  await connection();
  return handler().POST(req);
};
