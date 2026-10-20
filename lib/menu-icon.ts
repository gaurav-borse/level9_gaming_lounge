export type MenuIconKey =
  | "soda" | "water" | "coffee" | "juice" | "beer" | "milk" | "snack" | "popcorn" | "sandwich" | "burger" | "pizza" | "noodles"
  | "icecream" | "cake" | "candy" | "egg" | "meal" | "other";

// First match wins, so put the specific words before the general ones. Matching is on whole-word starts, in lower case.
const RULES: [RegExp, MenuIconKey][] = [
  [/\b(water|aqua|bisleri|soda water|mineral)/, "water"],
  [/\b(coffee|latte|cappuccino|espresso|mocha|tea|chai)/, "coffee"],
  [/\b(juice|lemonade|nimbu|mojito|smoothie|shake|mocktail)/, "juice"],
  [/\b(beer|wine|whisky|vodka|rum)/, "beer"],
  [/\b(milk|lassi|buttermilk|chaas)/, "milk"],
  [/\b(coke|cola|pepsi|sprite|fanta|thums|limca|mountain dew|dew|7up|soda|drink|energy|red bull|monster)/, "soda"],
  [/\b(popcorn)/, "popcorn"],
  [/\b(sandwich|toast|sub|wrap|roll)/, "sandwich"],
  [/\b(burger)/, "burger"],
  [/\b(pizza)/, "pizza"],
  [/\b(maggi|noodle|pasta|soup|momo|ramen)/, "noodles"],
  [/\b(ice ?cream|kulfi|sundae|cone)/, "icecream"],
  [/\b(cake|brownie|pastry|donut|doughnut|muffin)/, "cake"],
  [/\b(candy|chocolate|toffee|gum|lollipop)/, "candy"],
  [/\b(egg|omelette|omelet)/, "egg"],
  [/\b(chips|kurkure|lays|nachos|fries|biscuit|cookie|snack|namkeen|bhujia|puff|samosa|wafer|nuts|peanut)/, "snack"],
  [/\b(meal|thali|rice|biryani|curry|paneer|roti|lunch|dinner)/, "meal"],
];

/** Picks a picture for a menu item from its name ("Cold coffee" gets a cup, "Chips" a cookie). Unknown names get a box. */
export function menuIconFor(name: string): MenuIconKey {
  const n = name.toLowerCase();
  for (const [re, key] of RULES) if (re.test(n)) return key;
  return "other";
}
