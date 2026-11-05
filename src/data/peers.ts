import { Stock } from './types.ts';

/**
 * "Second best": per aandeel of ETF de grootste concurrent of het logische alternatief.
 * Zo zie je of je keuze beter uitpakte dan de andere optie die je had kunnen kopen
 * (zelfde bedragen, op dezelfde dagen).
 *
 * `symbol` is een Amerikaans beurssymbool (koershistorie via Twelve Data / Yahoo) of een
 * ISIN (ETF, via justETF). Vast in de code, net als de profielen: een verkeerd bedrijf
 * tonen is erger dan niets. Nieuw aandeel? Voeg een regel toe; de eerste treffer wint.
 */
export interface Peer {
  match: RegExp;
  symbol: string;
  name: string;
  why: string;
}

export const PEERS: Peer[] = [
  { match: /uipath/i, symbol: 'NOW', name: 'ServiceNow', why: 'Ook software die bedrijfsprocessen automatiseert, en zet net als UiPath vol in op AI-agents.' },
  { match: /servicenow|\bservic\b/i, symbol: 'CRM', name: 'Salesforce', why: 'De andere grote cloudsoftware-reus voor bedrijven, met een eigen AI-agentplatform.' },
  { match: /paypal/i, symbol: 'XYZ', name: 'Block', why: 'Het bedrijf achter Cash App en Square: concurreert direct met Venmo en PayPal-betalingen.' },
  { match: /oscar/i, symbol: 'CNC', name: 'Centene', why: 'Grootste aanbieder op dezelfde Amerikaanse zorgverzekeringsmarkt (ACA) als Oscar.' },
  { match: /novo/i, symbol: 'LLY', name: 'Eli Lilly', why: 'De directe rivaal in afslank- en diabetesmedicijnen.' },
  { match: /strive/i, symbol: 'MSTR', name: 'Strategy', why: 'Het bekendste bedrijf dat bitcoin op de balans spaart: hetzelfde idee, veel groter.' },
  { match: /galaxy/i, symbol: 'COIN', name: 'Coinbase', why: 'De grootste Amerikaanse cryptobeurs: ook een gok op de groei van crypto.' },
  { match: /\bsnap\b/i, symbol: 'PINS', name: 'Pinterest', why: 'Sociale app van vergelijkbare grootte die ook van advertenties leeft.' },
  { match: /asml/i, symbol: 'AMAT', name: 'Applied Materials', why: 'Maakt ook machines voor chipfabrieken, alleen voor andere stappen in het proces.' },
  { match: /shell/i, symbol: 'BP', name: 'BP', why: 'De andere grote Britse olie- en gasreus.' },
  { match: /adyen/i, symbol: 'PYPL', name: 'PayPal', why: 'Concurreert om dezelfde webshops met online betaaldiensten (Braintree).' },
  { match: /marvell/i, symbol: 'AVGO', name: 'Broadcom', why: 'Maakt ook maatwerkchips en netwerkchips voor AI-datacenters.' },
  // ETF's: het logische alternatieve fonds.
  { match: /s&p ?500.*(info|tech)|information tech/i, symbol: 'IE00B53SZB19', name: 'Nasdaq-100 ETF', why: 'De andere populaire manier om op Amerikaanse tech in te zetten, iets breder.' },
  { match: /msci europe/i, symbol: 'IE00B5BMR087', name: 'S&P 500 ETF', why: 'De andere kant van de oceaan: had je je Europa-geld beter in Amerika kunnen stoppen?' },
  { match: /all-?world|ftse/i, symbol: 'IE00B4L5Y983', name: 'MSCI World ETF', why: 'Het populaire alternatief: alleen ontwikkelde landen, iets lagere kosten.' },
  { match: /msci world/i, symbol: 'IE00BK5BQT80', name: 'FTSE All-World ETF', why: 'Het alternatief mét opkomende landen erbij.' },
  { match: /s&p ?500|sp500|issp/i, symbol: 'IE00B4L5Y983', name: 'MSCI World ETF', why: 'Hetzelfde, maar over alle ontwikkelde landen gespreid in plaats van alleen de VS.' },
];

export function findPeer(stock: Pick<Stock, 'ticker' | 'name'>): Peer | null {
  const haystack = `${stock.ticker} ${stock.name}`;
  return PEERS.find((p) => p.match.test(haystack)) ?? null;
}

export const isIsin = (s: string) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s);
