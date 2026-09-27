const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("en-US");

export const formatPercent = (n: number): string => pct.format(n);
export const formatCurrency = (n: number): string => usd.format(n);
export const formatInt = (n: number): string => int.format(n);
