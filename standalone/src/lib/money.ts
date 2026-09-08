// money — the one place prices become strings.
//
// All prices in src/data/catalogue.json are integer PENCE, the same shape
// Shopify used, so arithmetic never touches a float. In the Liquid theme money
// was formatted server-side by the `money` filter and never in JS; here the
// same rule holds for rendered pages, and cart.js imports formatMoney so the
// drawer matches the server output character for character.

export function formatMoney(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(Math.round(pence));
  return `${sign}£${(abs / 100).toFixed(2)}`;
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    key in vars ? String(vars[key]) : ''
  );
}
