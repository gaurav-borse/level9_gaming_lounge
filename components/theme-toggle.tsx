import { cookies } from "next/headers";
import { ThemeToggleButton } from "./theme-toggle-button";

export async function ThemeToggle() {
  const theme = (await cookies()).get("theme")?.value;
  return <ThemeToggleButton current={theme === "light" || theme === "dark" ? theme : "system"} />;
}
