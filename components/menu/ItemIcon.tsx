import { Beer, Cake, Candy, Coffee, Cookie, CupSoda, Egg, GlassWater, Hamburger, IceCreamCone, Milk, Package, Pizza, Popcorn, Salad, Sandwich, Soup, Citrus, type LucideIcon } from "lucide-react";
import { menuIconFor, type MenuIconKey } from "@/lib/menu-icon";

const ICONS: Record<MenuIconKey, LucideIcon> = {
  soda: CupSoda, water: GlassWater, coffee: Coffee, juice: Citrus, beer: Beer, milk: Milk, snack: Cookie, popcorn: Popcorn,
  sandwich: Sandwich, burger: Hamburger, pizza: Pizza, noodles: Soup, icecream: IceCreamCone, cake: Cake, candy: Candy, egg: Egg, meal: Salad, other: Package,
};

/** A small picture chosen from the item's name, so a long stock list is easy to scan. */
export function ItemIcon({ name, className = "size-6" }: { name: string; className?: string }) {
  const Icon = ICONS[menuIconFor(name)];
  return <Icon className={className} aria-hidden />;
}
