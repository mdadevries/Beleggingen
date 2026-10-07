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
  /** Vaste feiten, alleen voor ETF's (afgerond; kunnen veranderen, dus altijd met een voorbehoud tonen). */
  facts?: { label: string; value: string }[];
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
    match: /galaxy/i,
    kind: 'Aandeel',
    sector: 'Crypto',
    country: 'Verenigde Staten',
    about: 'Amerikaans financieel bedrijf voor crypto en digitale activa: handel, vermogensbeheer en datacenters.',
  },
  {
    match: /uipath/i,
    kind: 'Aandeel',
    sector: 'Software',
    country: 'Verenigde Staten',
    about: 'Maakt software die saaie, steeds terugkerende kantoortaken automatiseert met robots en AI.',
  },
  {
    match: /paypal/i,
    kind: 'Aandeel',
    sector: 'Betalen',
    country: 'Verenigde Staten',
    about: 'Online betaaldienst waarmee mensen en webshops veilig geld versturen en ontvangen.',
  },
  {
    match: /servicenow|\bservic\b/i,
    kind: 'Aandeel',
    sector: 'Software',
    country: 'Verenigde Staten',
    about: 'Cloudsoftware waarmee grote bedrijven hun werkprocessen regelen, bijvoorbeeld IT-hulp en klantenservice.',
  },
  {
    match: /oscar/i,
    kind: 'Aandeel',
    sector: 'Zorgverzekering',
    country: 'Verenigde Staten',
    about: 'Amerikaanse zorgverzekeraar die met een app en simpele tarieven zorgverzekeringen aanbiedt.',
  },
  {
    match: /\bsnap\b/i,
    kind: 'Aandeel',
    sector: 'Sociale media',
    country: 'Verenigde Staten',
    about: 'Het bedrijf achter Snapchat, de berichten- en camera-app die vooral jongeren gebruiken.',
  },
  {
    match: /s&p ?500|sp500|issp/i,
    kind: 'ETF',
    sector: 'Amerikaanse aandelen',
    country: 'Verenigde Staten',
    about: 'Een ETF die de S&P 500 volgt: de 500 grootste beursgenoteerde bedrijven van de Verenigde Staten.',
    facts: [
      { label: 'Index', value: 'S&P 500' },
      { label: 'Kosten per jaar', value: '0,07%' },
      { label: 'Aantal bedrijven', value: '± 500' },
      { label: 'Land van het fonds', value: 'Ierland' },
    ],
  },
  {
    match: /all-?world|ftse/i,
    kind: 'ETF',
    sector: 'Wereldwijd gespreid',
    about: 'Een ETF met bedrijven uit de hele wereld, ontwikkelde landen én opkomende markten, in één aankoop.',
    facts: [
      { label: 'Index', value: 'FTSE All-World' },
      { label: 'Kosten per jaar', value: '0,19%' },
      { label: 'Aantal bedrijven', value: '± 3.700' },
      { label: 'Land van het fonds', value: 'Ierland' },
    ],
  },
  {
    match: /msci world/i,
    kind: 'ETF',
    sector: 'Wereldwijd gespreid',
    about:
      'Een ETF die de MSCI World-index volgt: een brede mix van grote bedrijven uit ontwikkelde landen. Met één aankoop spreid je over duizenden aandelen.',
    facts: [
      { label: 'Index', value: 'MSCI World' },
      { label: 'Kosten per jaar', value: '0,20%' },
      { label: 'Aantal bedrijven', value: '± 1.400' },
      { label: 'Land van het fonds', value: 'Ierland' },
    ],
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

/** Is dit een ETF/indexfonds (en geen losse aandelen)? Eerst het profiel, anders op de naam. */
export function isEtf(stock: Pick<Stock, 'ticker' | 'name'>): boolean {
  const profile = findProfile(stock);
  if (profile) return profile.kind === 'ETF';
  return /\betf\b|ucits|ishares|vanguard|spdr|xtrackers|amundi|lyxor|index fund|tracker/i.test(stock.name);
}
