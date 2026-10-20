import type { LogoSources } from "@/lib/logo";

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** Rectangular logo on its own dark plate (so it looks right in both themes). With no logo it shows the lounge name. Height is fixed, never tall. */
export function BrandWide({ name, logo, className = "" }: { name: string; logo: LogoSources; className?: string }) {
  return (
    <div className={`flex h-14 items-center justify-center overflow-hidden rounded-2xl bg-plate ring-1 ring-line ${className}`}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.wide} alt={name} className={logo.fit === "cover" ? "size-full object-cover" : "max-h-full max-w-full object-contain p-1.5"} />
      ) : (
        <span className="truncate px-3 font-display text-base font-bold tracking-wide text-white">{name}</span>
      )}
    </div>
  );
}

/** Small round version of the logo, for the collapsed sidebar and the top bar on small screens. */
export function BrandIcon({ name, logo, className = "" }: { name: string; logo: LogoSources; className?: string }) {
  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-plate ring-1 ring-line ${className}`}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.icon} alt={name} className={logo.fit === "cover" ? "size-full object-cover object-[50%_58%]" : "size-full object-contain p-1"} />
      ) : (
        <span className="font-display text-sm font-bold text-white" role="img" aria-label={name}>{initialsOf(name)}</span>
      )}
    </div>
  );
}
