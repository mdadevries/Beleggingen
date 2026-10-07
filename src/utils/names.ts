/**
 * Korte, leesbare naam voor in lijsten en grafieken. De afkorting in de database komt uit
 * de naam (bv. "ISHARE" of "VANGUA") en zegt weinig; dit maakt er bv. "iShares Core S&P 500"
 * of "Vanguard FTSE All-World" van. Lange namen worden netjes afgekapt door de CSS.
 */
export function shortName(name: string): string {
  const cleaned = name
    .replace(/\bUCITS\b/gi, ' ')
    .replace(/\bETF\b/gi, ' ')
    .replace(/\((?:acc|dist|usd|eur)\)/gi, ' ')
    .replace(/\b(?:USD|EUR|GBP)\b(?=\s*(?:\(|$|acc|dist))/gi, ' ')
    .replace(/\b(?:acc|dist|accumulating|distributing)\b/gi, ' ')
    .replace(/\b(?:holding|holdings|groep|group|plc|ltd|limited|inc|n\.?v\.?|s\.?a\.?|ag|se|corp(?:oration)?|class [ab])\b\.?/gi, ' ')
    .replace(/\s*-\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || name;
}
