import { Stock } from './types.ts';

/**
 * Korte uitleg per aandeel, in gewone taal. Staat hier bewust vast in de code
 * (niet van internet opgehaald): een verkeerd bedrijf tonen is erger dan niets.
 * Nieuw aandeel? Voeg onderaan een regel toe. `match` wordt gecontroleerd op
 * de ticker + naam (hoofdletters maken niet uit); de eerste treffer wint.
 */
export interface StockProfile {
  match: RegExp;
  kind: 'Aandeel' | 'ETF';
  sector?: string;
  country?: string;
  about: string;
}

export const STOCK_PROFILES: StockProfile[] = [
  {
    match: /prenetics/i,
    kind: 'Aandeel',
    sector: 'Gezondheid',
    country: 'Hongkong',
    about:
      'Gezondheids- en DNA-bedrijf met hoofdkantoor in Hongkong. Het bedrijf is genoteerd aan de Nasdaq (VS) en bekend van DNA-tests voor consumenten.',
  },
  {
    match: /asml/i,
    kind: 'Aandeel',
    sector: 'Technologie',
    country: 'Nederland',
    about:
      'Maakt de machines waarmee computerchips worden geproduceerd. Bijna alle moderne chipfabrikanten in de wereld gebruiken ze.',
  },
  {
    match: /shell/i,
    kind: 'Aandeel',
    sector: 'Energie',
    country: 'Verenigd Koninkrijk',
    about: 'Een van de grootste energiebedrijven ter wereld. Verdient vooral aan olie en gas, en investeert ook in groene energie.',
  },
  {
    match: /\bing\b/i,
    kind: 'Aandeel',
    sector: 'Financieel',
    country: 'Nederland',
    about: 'Nederlandse bank met klanten in Europa. Bekend van het online bankieren en betaalt regelmatig dividend.',
  },
  {
    match: /adyen/i,
    kind: 'Aandeel',
    sector: 'Betalen',
    country: 'Nederland',
    about: 'Verwerkt online en winkelbetalingen voor grote webshops en bedrijven, in veel landen en valuta.',
  },
  {
    match: /prosus/i,
    kind: 'Aandeel',
    sector: 'Internet',
    country: 'Nederland',
    about: 'Beleggingsbedrijf in internetbedrijven wereldwijd, zoals online marktplaatsen en bezorgdiensten. Heeft ook een groot belang in het Chinese Tencent.',
  },
  {
    match: /msci world/i,
    kind: 'ETF',
    sector: 'Wereldwijd gespreid',
    about:
      'Een ETF die de MSCI World-index volgt: een brede mix van grote bedrijven uit ontwikkelde landen. Met één aankoop spreid je over duizenden aandelen.',
  },
  {
    match: /ishares|ucits|\betf\b|vanguard|spdr|xtrackers/i,
    kind: 'ETF',
    about:
      'Een ETF is een beursgenoteerd mandje met veel aandelen. Het volgt een index, kost weinig en spreidt je risico over meerdere bedrijven.',
  },
];

export function findProfile(stock: Pick<Stock, 'ticker' | 'name'>): StockProfile | null {
  const haystack = `${stock.ticker} ${stock.name}`;
  return STOCK_PROFILES.find((p) => p.match.test(haystack)) ?? null;
}
