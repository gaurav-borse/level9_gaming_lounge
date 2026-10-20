export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return; // the build must not open the database
  const { bootServer } = await import("./lib/boot.ts");
  await bootServer();
}
