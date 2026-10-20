"use client";
import { useRouter } from "next/navigation";
import { inputCls } from "@/lib/ui";

/** "Rows per page" dropdown. Choosing a size opens page 1 of the same list at that size (the server built each address, so any search is kept). */
export function PageSizeSelect({ current, options }: { current: number; options: { size: number; url: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-mute">
      Rows per page
      <select
        value={current}
        onChange={(e) => {
          const next = options.find((o) => o.size === Number(e.target.value));
          if (next) router.push(next.url);
        }}
        className={`${inputCls} w-20! py-1.5!`}
      >
        {options.map((o) => <option key={o.size} value={o.size}>{o.size}</option>)}
      </select>
    </label>
  );
}
