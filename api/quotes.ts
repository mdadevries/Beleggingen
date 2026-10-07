import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Live (licht vertraagde) koersen voor je aandelen, in euro's.
//
// Volgorde per aandeel:
//   1. Twelve Data (officiële API, sleutel in Vercel: TWELVEDATA_API_KEY)
//   2. Yahoo Finance als reserve (niet-officieel, geen garantie)
//   3. Lukt beide niet: de site toont de laatste transactieprijs en zegt dat.
//
// Bewust GEEN opzoeken op naam: een verkeerd bedrijf is erger dan geen koers.
// Zonder ISIN of vaste mapping hieronder krijgt een aandeel dus geen live koers.
//
// Bewust zelfstandig (geen import uit een ander /api-bestand): Vercel
// compileert elk bestand onder /api los, relatieve imports bestaan op de
// server niet. Houd de auth-constanten gelijk aan de andere /api-bestanden.

// Per aandeel bewaren we de laatste koers in de database (tabel quote_cache). Zo hoeft
// niet elke pagina-laad alle bronnen te bestoken en vult het overzicht zich ronde voor
// ronde als het Twelve Data-budget (8 per minuut) niet voor alle aandelen genoeg is.
const CACHE_PREFIX = 'quote:v1:';
const CREDITS_KEY = 'td-credits:v1';
const FAILS_KEY = 'quote-fails:v1';
// Hoe vers een koers moet zijn voordat we hem opnieuw opvragen:
//  - de dagelijkse update (cron) ververst alles wat ouder is dan 30 minuten,
//  - de knop "Nu verversen" hooguit één keer per uur,
//  - een gewoon bezoek laat de laatste koers staan en haalt alleen bij als hij ouder is dan 30 uur
//    (vangnet voor als de dagelijkse update een keer mislukt, of voor een nieuw aandeel).
const CRON_FRESH_MS = 30 * 60 * 1000;
const MANUAL_FRESH_MS = 60 * 60 * 1000;
const USER_FRESH_MS = 30 * 60 * 60 * 1000;
const HISTORY_PREFIX = 'history:v1:';
const HISTORY_FRESH_MS = 20 * 60 * 60 * 1000;
const FUND_PREFIX = 'fund:v1:';
const FUND_FRESH_MS = 24 * 60 * 60 * 1000;
const TD_CREDITS_PER_DAY = 700; // gratis plan: 800 per dag; hier houden we marge onder
const MAX_STALE_MS = 14 * 24 * 60 * 60 * 1000; // een koers van het weekend of een vakantie blijft zichtbaar
const DIVIDEND_RETRY_MS = 3 * 60 * 60 * 1000;
const YAHOO_CALLS_PER_RUN = 5;
const KEEP_DAYS = 30;
const REQUEST_TIMEOUT_MS = 3500;

const TD = 'https://api.twelvedata.com';
const YAHOO = 'https://query1.finance.yahoo.com';
const YAHOO2 = 'https://query2.finance.yahoo.com';
const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';
const FRANKFURTER = `${FRANKFURTER_BASE}/latest`;
const FINNHUB = 'https://finnhub.io/api/v1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Twelve Data Basic: 8 credits per minuut. Een koers kost 1 credit, een
// wisselkoers ook (die halen we daarom eerst bij de gratis ECB-koersen). Boven dit
// budget gaat een aandeel naar Yahoo of wacht het op de volgende ronde.
const TD_CREDITS_PER_MINUTE = 8;

// Afwijking t.o.v. laatste transactieprijs waarbij we "controleer" tonen.
const WARN_DEVIATION = 0.15;

// Vaste koppeling: jouw ticker (zoals in de database) -> Twelve Data-symbool + beurs.
// Dit is de betrouwbaarste manier: eenmalig controleren, daarna geen gokwerk.
// Controleer elke regel zelf (symbool + beurs + valuta) voor je hem vertrouwt.
const TD_MAP: Record<string, { symbol: string; mic: string }> = {
  PRENET: { symbol: 'PRE', mic: 'XNAS' }, // Prenetics, Nasdaq (USD) - controleren!
  // TODO: iShares-ETF toevoegen, bijvoorbeeld:
  // IWDA: { symbol: 'IWDA', mic: 'XAMS' }, // Amsterdam, EUR
};

const AUTH_COOKIE = 'beleggingen_auth';
const TOKEN_MESSAGE = 'auth:v1';

interface StoredStock {
  ticker: string;
  name: string;
  currentPrice: number;
  colorSlot: 1 | 2 | 3 | 4 | 5;
  isin?: string;
  symbol?: string;
}

interface Quote {
  /** Prijs per stuk in euro's */
  price: number;
  symbol: string;
  /** Valuta waarin de bron de koers gaf (vóór omrekenen) */
  currency: string;
  /** Welke bron de koers leverde */
  source: 'twelvedata' | 'yahoo';
  /** Hoe het symbool gevonden is */
  matchedBy: 'map' | 'isin' | 'saved';
  /** Tijdstip van de koers volgens de bron (ISO), indien bekend */
  asOf: string | null;
  /** Gevuld als de koers sterk afwijkt van je laatste transactieprijs */
  warning?: string;
  /** Verandering t.o.v. vorige slotkoers als fractie (0.012 = +1,2%), indien bekend */
  changePct?: number | null;
  /** 52-wekenbereik in euro's, indien bekend */
  range52?: { low: number; high: number } | null;
  /** Naam van de beurs, indien bekend */
  exchange?: string | null;
  /** Beurscode (MIC) bij Twelve Data, nodig om later de koershistorie op te vragen */
  mic?: string | null;
  /** Uitkeringen (dividend) van de afgelopen 12 maanden, per aandeel in euro's, indien bekend */
  dividends?: { date: string; amount: number }[];
}

interface QuotesResponse {
  quotes: Record<string, Quote>;
  failed: { ticker: string; reason: string }[];
  fetchedAt: string;
  /** Wanneer de koersen daadwerkelijk bij de bron zijn opgehaald (nieuwste en oudste) */
  updatedAt: string | null;
  oldestAt: string | null;
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isRealSession(req: VercelRequest): boolean {
  const secret = process.env.SESSION_SECRET;
  const token = parseCookie(req.headers.cookie, AUTH_COOKIE);
  if (!secret || !token) return false;
  const expected = crypto.createHmac('sha256', secret).update(TOKEN_MESSAGE).digest('hex');
  return timingSafeEqual(token, expected);
}

type Db = (path: string, init?: { method?: string; body?: unknown; prefer?: string }) => Promise<any>;

function getDb(): Db {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreken in de environment variables.');
  }
  const base = url.replace(/\/$/, '') + '/rest/v1';
  return async (path, init = {}) => {
    const r = await fetch(base + path, {
      method: init.method ?? 'GET',
      headers: {
        apikey: key,
        // Nieuwe 'sb_secret_...'-sleutels zijn geen JWT: die gaan alleen in 'apikey'.
        ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
        'Content-Type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
}

function toStock(r: any): StoredStock {
  return {
    ticker: r.ticker,
    name: r.name,
    currentPrice: Number(r.current_price),
    colorSlot: r.color_slot,
    ...(r.isin ? { isin: r.isin } : {}),
    ...(r.symbol ? { symbol: r.symbol } : {}),
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Onbekende fout';
}

// ---------- Twelve Data ----------

/** Telt hoeveel Twelve Data-credits we in deze ronde nog mogen uitgeven. */
function makeBudget(left: number) {
  let remaining = Math.max(0, left);
  let used = 0;
  return {
    take: () => {
      if (remaining > 0) {
        remaining--;
        used++;
        return true;
      }
      return false;
    },
    used: () => used,
  };
}

async function tdJson(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error('TWELVEDATA_API_KEY ontbreekt');
  const res = await fetch(`${TD}${path}`, {
    headers: { Authorization: `apikey ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // geen JSON
  }
  // Twelve Data geeft fouten soms als HTTP 200 met status "error".
  if (!res.ok || data?.status === 'error') {
    const detail = data?.message ? `: ${String(data.message).slice(0, 120)}` : '';
    throw new Error(`Twelve Data ${data?.code ?? res.status}${detail}`);
  }
  return data;
}

interface RawQuote {
  symbol: string;
  price: number;
  currency: string;
  asOf: string | null;
  matchedBy: 'map' | 'isin';
  /** Extra marktgegevens; range52 staat nog in de valuta van de bron */
  changePct?: number | null;
  range52?: { low: number; high: number } | null;
  exchange?: string | null;
  mic?: string | null;
}

/** Leest een getal uit een tekst of getal; anders null. */
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

async function tdQuote(stock: StoredStock): Promise<RawQuote> {
  const mapped = TD_MAP[stock.ticker];
  // Eerst de vaste koppeling (als die er is), daarna de ISIN. Lukt de koppeling niet,
  // dan proberen we de ISIN alsnog (kost één extra credit, maar is beter dan geen koers).
  const attempts: { query: string; matchedBy: 'map' | 'isin' }[] = [];
  if (mapped) {
    attempts.push({ query: `symbol=${encodeURIComponent(mapped.symbol)}&mic_code=${encodeURIComponent(mapped.mic)}`, matchedBy: 'map' });
  }
  if (stock.isin) attempts.push({ query: `isin=${encodeURIComponent(stock.isin)}`, matchedBy: 'isin' });
  if (attempts.length === 0) throw new Error('Geen Twelve Data-koppeling (geen mapping en geen ISIN)');

  let lastError = 'Geen bruikbare koers in Twelve Data-antwoord';
  for (const { query, matchedBy } of attempts) {
    try {
      const data = await tdJson(`/quote?${query}&dp=4`);
      const price = Number.parseFloat(data?.close);
      const currency = data?.currency;
      if (!Number.isFinite(price) || !(price > 0) || typeof currency !== 'string' || !currency) {
        throw new Error('Geen bruikbare koers in Twelve Data-antwoord');
      }
      const t = Number(data?.last_quote_at ?? data?.timestamp);
      const pct = num(data?.percent_change);
      const lo = num(data?.fifty_two_week?.low);
      const hi = num(data?.fifty_two_week?.high);
      return {
        symbol: String(data?.symbol ?? mapped?.symbol ?? stock.isin),
        price,
        currency,
        asOf: Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : null,
        matchedBy,
        // Twelve Data geeft percent_change als "1.24" (procent), wij willen een fractie.
        changePct: pct === null ? null : pct / 100,
        range52: lo !== null && hi !== null && lo > 0 && hi > 0 ? { low: lo, high: hi } : null,
        exchange: typeof data?.exchange === 'string' && data.exchange ? data.exchange : null,
        mic: typeof data?.mic_code === 'string' && data.mic_code ? data.mic_code : null,
      };
    } catch (e) {
      lastError = errMsg(e);
      // Geen credits meer of netwerkprobleem: een tweede poging heeft geen zin.
      if (/429|credits|limit/i.test(lastError)) break;
    }
  }
  throw new Error(lastError);
}

async function tdRate(cur: string): Promise<number> {
  const data = await tdJson(`/exchange_rate?symbol=${encodeURIComponent(`EUR/${cur}`)}`);
  const rate = Number(data?.rate);
  if (!Number.isFinite(rate) || !(rate > 0)) throw new Error('Geen bruikbare wisselkoers');
  return rate;
}

// ---------- Yahoo (reserve) ----------

async function yahooJson(path: string): Promise<any> {
  const get = (host: string) =>
    fetch(`${host}${path}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  let res = await get(YAHOO);
  // Yahoo geeft vanaf servers vaak 429; de tweede host heeft soms een andere limiet.
  if (res.status === 429) res = await get(YAHOO2);
  if (!res.ok) throw new Error(`Yahoo status ${res.status}`);
  return res.json();
}

/** Zoekt het Yahoo-symbool bij een ISIN. Alleen op ISIN, nooit op naam. */
async function yahooResolveIsin(isin: string): Promise<string | null> {
  const data = await yahooJson(
    `/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=6&newsCount=0&listsCount=0`
  );
  const hits: any[] = Array.isArray(data?.quotes) ? data.quotes : [];
  const hit = hits.find((h) => (h.quoteType === 'EQUITY' || h.quoteType === 'ETF') && typeof h.symbol === 'string');
  return hit ? hit.symbol : null;
}

async function yahooChart(symbol: string): Promise<{
  price: number;
  currency: string;
  asOf: string | null;
  changePct: number | null;
  range52: { low: number; high: number } | null;
  exchange: string | null;
}> {
  const data = await yahooJson(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const currency = meta?.currency;
  if (typeof price !== 'number' || !(price > 0) || typeof currency !== 'string') {
    throw new Error('Geen bruikbare koers in Yahoo-antwoord');
  }
  const t = meta?.regularMarketTime;
  const prev = num(meta?.chartPreviousClose ?? meta?.previousClose);
  const lo = num(meta?.fiftyTwoWeekLow);
  const hi = num(meta?.fiftyTwoWeekHigh);
  return {
    price,
    currency,
    asOf: typeof t === 'number' ? new Date(t * 1000).toISOString() : null,
    changePct: prev && prev > 0 ? price / prev - 1 : null,
    range52: lo !== null && hi !== null && lo > 0 && hi > 0 ? { low: lo, high: hi } : null,
    exchange: typeof meta?.fullExchangeName === 'string' ? meta.fullExchangeName : null,
  };
}

/** Dividenden van het afgelopen jaar (bijzaak: mislukt dit, dan tonen we gewoon geen dividend). */
async function yahooDividends(symbol: string): Promise<{ currency: string; items: { date: string; amount: number }[] }> {
  const data = await yahooJson(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1mo&events=div`);
  const result = data?.chart?.result?.[0];
  const currency = result?.meta?.currency;
  const divs = result?.events?.dividends;
  if (typeof currency !== 'string' || !divs || typeof divs !== 'object') return { currency: 'EUR', items: [] };
  const items: { date: string; amount: number }[] = [];
  for (const d of Object.values(divs) as any[]) {
    const amount = num(d?.amount);
    const ts = num(d?.date);
    if (amount !== null && amount > 0 && ts !== null) {
      items.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), amount });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { currency, items };
}

async function yahooQuote(stock: StoredStock, db: Db): Promise<RawQuote> {
  let symbol = stock.symbol;
  let matchedBy: 'isin' | 'map' | 'saved' = 'saved';
  if (!symbol) {
    if (!stock.isin) throw new Error('Geen ISIN bekend, dus geen betrouwbaar Yahoo-symbool');
    symbol = (await yahooResolveIsin(stock.isin)) ?? undefined;
    if (!symbol) throw new Error('Geen Yahoo-symbool gevonden voor ISIN');
    matchedBy = 'isin';
    // Alleen een ISIN-match onthouden, zodat opzoeken maar één keer nodig is.
    await db(`/stocks?ticker=eq.${encodeURIComponent(stock.ticker)}`, { method: 'PATCH', body: { symbol } });
  }
  const m = await yahooChart(symbol);
  return {
    symbol,
    price: m.price,
    currency: m.currency,
    asOf: m.asOf,
    matchedBy: matchedBy as 'map' | 'isin',
    changePct: m.changePct,
    range52: m.range52,
    exchange: m.exchange,
  };
}

// ---------- Omrekenen en samenvoegen ----------

async function ecbRate(cur: string): Promise<number> {
  const res = await fetch(`${FRANKFURTER}?base=EUR&symbols=${encodeURIComponent(cur)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ECB-koers status ${res.status}`);
  const data: any = await res.json();
  const rate = Number(data?.rates?.[cur]);
  if (!Number.isFinite(rate) || !(rate > 0)) throw new Error('Geen bruikbare ECB-wisselkoers');
  return rate;
}

async function toEuro(
  amount: number,
  currency: string,
  fxCache: Map<string, Promise<number>>,
  takeCredit: () => boolean
): Promise<number> {
  let value = amount;
  let cur = currency;
  // Londense koersen komen vaak in pence (GBp/GBX) i.p.v. pond.
  if (cur === 'GBp' || cur === 'GBX') {
    value = value / 100;
    cur = 'GBP';
  }
  if (cur === 'EUR') return value;

  if (!fxCache.has(cur)) {
    // EUR/USD = hoeveel USD je voor 1 EUR krijgt (zelfde bij ECB, Twelve Data en Yahoo).
    // Eerst de gratis ECB-koersen (kost geen Twelve Data-credit), dan Yahoo, dan Twelve Data.
    const viaTd = () => (takeCredit() ? tdRate(cur) : Promise.reject(new Error('Geen wisselkoers beschikbaar')));
    const viaYahoo = () => yahooChart(`EUR${cur}=X`).then((m) => m.price);
    fxCache.set(cur, ecbRate(cur).catch(viaYahoo).catch(viaTd));
  }
  const rate = await fxCache.get(cur)!;
  return value / rate;
}

async function quoteForStock(
  stock: StoredStock,
  db: Db,
  fxCache: Map<string, Promise<number>>,
  takeCredit: () => boolean,
  takeYahoo: () => boolean
): Promise<Quote> {
  let raw: RawQuote | null = null;
  let source: Quote['source'] = 'twelvedata';
  let tdError = '';

  if (takeCredit()) {
    try {
      raw = await tdQuote(stock);
    } catch (e) {
      tdError = errMsg(e);
    }
  } else {
    tdError = 'Twelve Data-budget voor deze ronde op';
  }

  if (!raw) {
    source = 'yahoo';
    try {
      if (!takeYahoo()) throw new Error('Yahoo-budget van deze ronde op, volgende ronde opnieuw');
      raw = await yahooQuote(stock, db);
    } catch (e) {
      throw new Error(`${tdError || 'Twelve Data niet gebruikt'}; ${errMsg(e)}`);
    }
  }

  const eur = await toEuro(raw.price, raw.currency, fxCache, takeCredit);
  const price = Math.round(eur * 10000) / 10000;

  let warning: string | undefined;
  if (stock.currentPrice > 0) {
    const dev = (price - stock.currentPrice) / stock.currentPrice;
    if (Math.abs(dev) > WARN_DEVIATION) {
      warning = `Wijkt ${Math.round(dev * 100)}% af van laatste transactieprijs, controleer deze koers`;
    }
  }

  // 52-wekenbereik op dezelfde manier naar euro omrekenen (wisselkoers zit al in fxCache).
  let range52: Quote['range52'] = null;
  if (raw.range52) {
    try {
      const low = await toEuro(raw.range52.low, raw.currency, fxCache, takeCredit);
      const high = await toEuro(raw.range52.high, raw.currency, fxCache, takeCredit);
      range52 = { low: Math.round(low * 100) / 100, high: Math.round(high * 100) / 100 };
    } catch {
      range52 = null; // bijzaak: de koers zelf mag hier niet door falen
    }
  }

  return {
    price,
    symbol: raw.symbol,
    currency: raw.currency,
    source,
    matchedBy: raw.matchedBy,
    asOf: raw.asOf,
    warning,
    changePct: raw.changePct ?? null,
    range52,
    exchange: raw.exchange ?? null,
    mic: raw.mic ?? null,
  };
}

/** Dividend van het afgelopen jaar via Yahoo, omgerekend naar euro. Bijzaak: mislukt dit, dan blijft het leeg. */
async function dividendsFor(
  stock: StoredStock,
  quote: Quote,
  fxCache: Map<string, Promise<number>>,
  takeCredit: () => boolean
): Promise<{ date: string; amount: number }[]> {
  let ySymbol: string | null | undefined = quote.source === 'yahoo' ? quote.symbol : stock.symbol;
  if (!ySymbol && stock.isin) ySymbol = await yahooResolveIsin(stock.isin);
  if (!ySymbol) throw new Error('Geen Yahoo-symbool bekend');
  const d = await yahooDividends(ySymbol);
  const out: { date: string; amount: number }[] = [];
  for (const item of d.items) {
    const eur = await toEuro(item.amount, d.currency, fxCache, takeCredit);
    out.push({ date: item.date, amount: Math.round(eur * 10000) / 10000 });
  }
  return out;
}

interface CacheEntry {
  fetchedAt: string;
  quote: Quote;
  /** Laatste poging om dividend op te halen (ISO), zodat we niet blijven proberen */
  divTriedAt?: string;
}

// ---------- Tegoed bijhouden (Twelve Data-credits) ----------

interface CreditState {
  windowStart?: number;
  used?: number;
  day?: string;
  dayUsed?: number;
}

/** Leest hoeveel credits er deze minuut en vandaag nog over zijn. */
async function loadCredits(db: Db, now: number) {
  const rows: any[] = (await db(`/quote_cache?select=body&key=eq.${CREDITS_KEY}`).catch(() => null)) ?? [];
  const prev = (rows[0]?.body ?? {}) as CreditState;
  const inWindow = prev.windowStart !== undefined && now - prev.windowStart < 60_000;
  const usedBefore = inWindow ? Number(prev.used ?? 0) : 0;
  const today = new Date(now).toISOString().slice(0, 10);
  const dayUsedBefore = prev.day === today ? Number(prev.dayUsed ?? 0) : 0;
  const left = Math.max(0, Math.min(TD_CREDITS_PER_MINUTE - usedBefore, TD_CREDITS_PER_DAY - dayUsedBefore));
  return {
    left,
    /** De rij om op te slaan na afloop, of null als er niets is uitgegeven. */
    row(usedNow: number) {
      if (usedNow <= 0) return null;
      const body: CreditState = {
        windowStart: inWindow ? prev.windowStart! : now,
        used: usedBefore + usedNow,
        day: today,
        dayUsed: dayUsedBefore + usedNow,
      };
      return { key: CREDITS_KEY, body, expires_at: new Date(now + KEEP_DAYS * 86400_000).toISOString() };
    },
  };
}

function isCronRequest(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.authorization;
  return !!secret && typeof header === 'string' && timingSafeEqual(header, `Bearer ${secret}`);
}

/** Welke aandelen heb je nog? (Verkochte slaan we over: scheelt koersen opvragen.) null = onbekend. */
async function heldTickers(db: Db): Promise<Set<string> | null> {
  const rows: any[] | null = await db('/transactions?select=ticker,type,quantity').catch(() => null);
  if (!rows || rows.length === 0) return null;
  const net = new Map<string, number>();
  for (const r of rows) {
    const q = Number(r.quantity) * (r.type === 'Verkopen' ? -1 : 1);
    net.set(r.ticker, (net.get(r.ticker) ?? 0) + q);
  }
  return new Set([...net].filter(([, n]) => n > 1e-9).map(([t]) => t));
}

// ---------- Koershistorie per aandeel ----------

type Points = [string, number][]; // [datum, koers in euro]

/** ECB-koers per dag (vooruit invullen in het weekend); lukt dat niet, dan één vaste koers. */
async function ecbSeries(cur: string, from: string, to: string): Promise<(date: string) => number> {
  try {
    const res = await fetch(`${FRANKFURTER_BASE}/${from}..${to}?base=EUR&symbols=${encodeURIComponent(cur)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data: any = await res.json();
    const days = Object.keys(data?.rates ?? {}).sort();
    if (days.length === 0) throw new Error('leeg');
    return (date: string) => {
      let best = days[0];
      for (const d of days) {
        if (d <= date) best = d;
        else break;
      }
      return Number(data.rates[best]?.[cur]);
    };
  } catch {
    const fixed = await ecbRate(cur);
    return () => fixed;
  }
}

async function toEuroSeries(rows: { date: string; close: number }[], currency: string): Promise<Points> {
  let cur = currency;
  let factor = 1;
  if (cur === 'GBp' || cur === 'GBX') {
    factor = 0.01;
    cur = 'GBP';
  }
  let rateAt: (d: string) => number = () => 1;
  if (cur !== 'EUR') rateAt = await ecbSeries(cur, rows[0].date, rows[rows.length - 1].date);
  const out: Points = [];
  for (const r of rows) {
    const eur = (r.close * factor) / rateAt(r.date);
    if (Number.isFinite(eur) && eur > 0) out.push([r.date, Math.round(eur * 10000) / 10000]);
  }
  return out;
}

async function tdHistory(stock: StoredStock, quote: Quote | undefined) {
  const mapped = TD_MAP[stock.ticker];
  const sym = mapped?.symbol ?? quote?.symbol;
  const mic = mapped?.mic ?? quote?.mic;
  const attempts: string[] = [];
  if (sym && mic) attempts.push(`symbol=${encodeURIComponent(sym)}&mic_code=${encodeURIComponent(mic)}`);
  if (stock.isin) attempts.push(`isin=${encodeURIComponent(stock.isin)}`);
  if (attempts.length === 0) throw new Error('Geen Twelve Data-koppeling');
  let last = 'geen data';
  for (const q of attempts) {
    try {
      const data = await tdJson(`/time_series?${q}&interval=1day&outputsize=1300&order=asc&dp=4`, 8000);
      const values: any[] = Array.isArray(data?.values) ? data.values : [];
      const currency = data?.meta?.currency;
      const rows = values
        .map((v) => ({ date: String(v.datetime).slice(0, 10), close: Number.parseFloat(v.close) }))
        .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.close) && r.close > 0);
      if (rows.length < 5 || typeof currency !== 'string') throw new Error('Te weinig koersen in antwoord');
      return { rows, currency };
    } catch (e) {
      last = errMsg(e);
      if (/429|credits|limit/i.test(last)) break;
    }
  }
  throw new Error(`Twelve Data: ${last}`);
}

async function yahooHistory(symbol: string) {
  const data = await yahooJson(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`);
  const r = data?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const currency = r?.meta?.currency;
  const rows: { date: string; close: number }[] = [];
  ts.forEach((t, i) => {
    const c = closes[i];
    if (typeof c === 'number' && c > 0) rows.push({ date: new Date(t * 1000).toISOString().slice(0, 10), close: c });
  });
  if (rows.length < 5 || typeof currency !== 'string') throw new Error('Te weinig koersen in Yahoo-antwoord');
  return { rows, currency };
}

async function handleHistory(ticker: string, db: Db, res: VercelResponse) {
  const now = Date.now();
  const stockRows: any[] = (await db(`/stocks?select=*&ticker=eq.${encodeURIComponent(ticker)}`)) ?? [];
  if (stockRows.length === 0) {
    res.status(404).json({ error: 'Onbekend aandeel.' });
    return;
  }
  const stock = toStock(stockRows[0]);
  const cached: any[] = (await db(`/quote_cache?select=body&key=eq.${encodeURIComponent(HISTORY_PREFIX + ticker)}`).catch(() => null)) ?? [];
  const hit = cached[0]?.body as { fetchedAt: string; points: Points; source: string } | undefined;
  if (hit && now - new Date(hit.fetchedAt).getTime() < HISTORY_FRESH_MS) {
    res.status(200).json({ ticker, points: hit.points, source: hit.source, updatedAt: hit.fetchedAt });
    return;
  }

  const entryRows: any[] = (await db(`/quote_cache?select=body&key=eq.${encodeURIComponent(CACHE_PREFIX + ticker)}`).catch(() => null)) ?? [];
  const quote = (entryRows[0]?.body as CacheEntry | undefined)?.quote;
  const credits = await loadCredits(db, now);
  const budget = makeBudget(credits.left);

  let raw: { rows: { date: string; close: number }[]; currency: string } | null = null;
  let source = 'twelvedata';
  let tdError = '';
  if (budget.take()) {
    try {
      raw = await tdHistory(stock, quote);
    } catch (e) {
      tdError = errMsg(e);
    }
  } else {
    tdError = 'Twelve Data-budget op';
  }
  if (!raw) {
    source = 'yahoo';
    try {
      let sym: string | null | undefined = quote?.source === 'yahoo' ? quote.symbol : stock.symbol;
      if (!sym && stock.isin) sym = await yahooResolveIsin(stock.isin);
      if (!sym) throw new Error('Geen Yahoo-symbool bekend');
      raw = await yahooHistory(sym);
    } catch (e) {
      console.log(`[history] ${ticker}: MISLUKT - ${tdError}; ${errMsg(e)}`);
      // Liever een oudere historie dan niets.
      if (hit) {
        res.status(200).json({ ticker, points: hit.points, source: hit.source, updatedAt: hit.fetchedAt });
      } else {
        res.status(502).json({ error: 'Koershistorie niet beschikbaar.' });
      }
      return;
    }
  }

  const points = await toEuroSeries(raw.rows, raw.currency);
  console.log(`[history] ${ticker}: ok via ${source}, ${points.length} dagkoersen`);
  const rows = [
    { key: HISTORY_PREFIX + ticker, body: { fetchedAt: new Date(now).toISOString(), points, source }, expires_at: new Date(now + KEEP_DAYS * 86400_000).toISOString() },
  ];
  const cr = credits.row(budget.used());
  if (cr) rows.push(cr as any);
  await db('/quote_cache?on_conflict=key', { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates' }).catch(() => undefined);
  res.status(200).json({ ticker, points, source, updatedAt: new Date(now).toISOString() });
}

// ---------- Kerncijfers (Finnhub, gratis sleutel, alleen Amerikaanse aandelen) ----------

async function finnhub(path: string): Promise<any> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('NO_KEY');
  const res = await fetch(`${FINNHUB}${path}`, {
    headers: { 'X-Finnhub-Token': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Finnhub status ${res.status}`);
  return res.json();
}

const pct = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n / 100; // Finnhub geeft procenten als 14.2; wij werken met fracties
};

async function handleFundamentals(ticker: string, db: Db, res: VercelResponse) {
  const now = Date.now();
  const cached: any[] = (await db(`/quote_cache?select=body&key=eq.${encodeURIComponent(FUND_PREFIX + ticker)}`).catch(() => null)) ?? [];
  const hit = cached[0]?.body as { fetchedAt: string; data: unknown } | undefined;
  if (hit && now - new Date(hit.fetchedAt).getTime() < FUND_FRESH_MS) {
    res.status(200).json(hit.data);
    return;
  }
  if (!process.env.FINNHUB_API_KEY) {
    res.status(200).json({ available: false, reason: 'no-key' });
    return;
  }
  const entryRows: any[] = (await db(`/quote_cache?select=body&key=eq.${encodeURIComponent(CACHE_PREFIX + ticker)}`).catch(() => null)) ?? [];
  const quote = (entryRows[0]?.body as CacheEntry | undefined)?.quote;
  // Gratis Finnhub dekt vooral Amerikaanse aandelen: andere noteringen slaan we over.
  if (!quote || quote.currency !== 'USD') {
    res.status(200).json({ available: false, reason: 'not-us' });
    return;
  }
  try {
    const sym = encodeURIComponent(quote.symbol.split(':')[0]);
    const [profile, metric] = await Promise.all([finnhub(`/stock/profile2?symbol=${sym}`), finnhub(`/stock/metric?symbol=${sym}&metric=all`)]);
    const m = metric?.metric ?? {};
    const usdPerEur = await ecbRate('USD');
    const mcUsd = num(profile?.marketCapitalization ?? m.marketCapitalization);
    const data = {
      available: true,
      industry: typeof profile?.finnhubIndustry === 'string' && profile.finnhubIndustry ? profile.finnhubIndustry : null,
      country: typeof profile?.country === 'string' && profile.country ? profile.country : null,
      ipo: typeof profile?.ipo === 'string' && profile.ipo ? profile.ipo : null,
      website: typeof profile?.weburl === 'string' && profile.weburl ? profile.weburl : null,
      marketCapEur: mcUsd !== null && mcUsd > 0 ? (mcUsd * 1e6) / usdPerEur : null,
      pe: num(m.peTTM ?? m.peBasicExclExtraTTM),
      pb: num(m.pbQuarterly ?? m.pbAnnual),
      ps: num(m.psTTM),
      beta: num(m.beta),
      dividendYield: pct(m.currentDividendYieldTTM ?? m.dividendYieldIndicatedAnnual),
      grossMargin: pct(m.grossMarginTTM),
      netMargin: pct(m.netProfitMarginTTM),
      roe: pct(m.roeTTM),
      revenueGrowth: pct(m.revenueGrowthTTMYoy),
    };
    await db('/quote_cache?on_conflict=key', {
      method: 'POST',
      body: [{ key: FUND_PREFIX + ticker, body: { fetchedAt: new Date(now).toISOString(), data }, expires_at: new Date(now + KEEP_DAYS * 86400_000).toISOString() }],
      prefer: 'resolution=merge-duplicates',
    }).catch(() => undefined);
    console.log(`[fundamentals] ${ticker}: ok`);
    res.status(200).json(data);
  } catch (e) {
    console.log(`[fundamentals] ${ticker}: MISLUKT - ${errMsg(e)}`);
    res.status(200).json({ available: false, reason: 'failed' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Methode niet toegestaan.' });
    return;
  }
  // Twee manieren binnen: de wachtwoord-sessie (jij) of de dagelijkse update van Vercel (CRON_SECRET).
  const isCron = isCronRequest(req);
  if (!isCron && !isRealSession(req)) {
    res.status(401).json({ error: 'Niet ingelogd.' });
    return;
  }

  let db: Db;
  try {
    db = getDb();
  } catch {
    res.status(500).json({ error: 'Database niet geconfigureerd op de server.' });
    return;
  }

  const q = (k: string) => {
    const v = req.query?.[k];
    return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const tickerParam = (v: string | undefined) => (v && /^[A-Za-z0-9._-]{1,20}$/.test(v) ? v.toUpperCase() : undefined);

  try {
    if (!isCron) {
      const h = tickerParam(q('history'));
      if (h) return await handleHistory(h, db, res);
      const f = tickerParam(q('fundamentals'));
      if (f) return await handleFundamentals(f, db, res);
    }

    const allStockRows = await db('/stocks?select=*');
    const held = await heldTickers(db);
    const stocks: StoredStock[] = (allStockRows ?? []).map(toStock).filter((s: StoredStock) => !held || held.has(s.ticker));
    const now = Date.now();

    // Wat we per aandeel al hebben (vorige rondes) en hoeveel Twelve Data-credits er nog over zijn.
    const cacheRows: any[] =
      (await db(`/quote_cache?select=key,body&key=like.${encodeURIComponent(CACHE_PREFIX + '*')}`).catch(() => null)) ?? [];
    const cache = new Map<string, CacheEntry>();
    for (const row of cacheRows) {
      const e = row?.body as CacheEntry | undefined;
      if (typeof row?.key === 'string' && e?.quote && typeof e.fetchedAt === 'string') {
        cache.set(row.key.slice(CACHE_PREFIX.length), e);
      }
    }
    const credits = await loadCredits(db, now);
    const budget = makeBudget(credits.left);
    // Aandelen waarvan de koers net mislukte, proberen we niet bij elk bezoek opnieuw (kost credits).
    const failRows: any[] = (await db(`/quote_cache?select=body&key=eq.${FAILS_KEY}`).catch(() => null)) ?? [];
    const fails: Record<string, { at: number; reason: string }> = { ...(failRows[0]?.body ?? {}) };
    let yahooLeft = YAHOO_CALLS_PER_RUN;
    const takeYahoo = () => {
      if (yahooLeft <= 0) return false;
      yahooLeft--;
      return true;
    };

    const ageOf = (t: string) => now - new Date(t).getTime();
    const manual = q('refresh') === '1';
    const freshMs = isCron ? CRON_FRESH_MS : manual ? MANUAL_FRESH_MS : USER_FRESH_MS;
    // Verversen: alles zonder verse koers, het oudste (of ontbrekende) eerst.
    const retryAfterMs = isCron ? 30 * 60 * 1000 : manual ? 10 * 60 * 1000 : 6 * 60 * 60 * 1000;
    const need = stocks
      .filter((s) => {
        const e = cache.get(s.ticker);
        if (e && ageOf(e.fetchedAt) <= freshMs) return false;
        const f = fails[s.ticker];
        if (f && now - f.at < retryAfterMs) return false; // net nog geprobeerd, wacht even
        return true;
      })
      .sort((a, b) => {
        const ea = cache.get(a.ticker);
        const eb = cache.get(b.ticker);
        return (eb ? ageOf(eb.fetchedAt) : Infinity) - (ea ? ageOf(ea.fetchedAt) : Infinity);
      });

    const fxCache = new Map<string, Promise<number>>();
    const results = await Promise.allSettled(need.map((s) => quoteForStock(s, db, fxCache, budget.take, takeYahoo)));

    const body: QuotesResponse = { quotes: {}, failed: [], fetchedAt: new Date(now).toISOString(), updatedAt: null, oldestAt: null };
    const toSave = new Map<string, { key: string; body: unknown; expires_at: string }>();
    const expires = new Date(now + KEEP_DAYS * 86400_000).toISOString();
    const save = (ticker: string, entry: CacheEntry) =>
      toSave.set(ticker, { key: CACHE_PREFIX + ticker, body: entry, expires_at: expires });
    const reason = new Map<string, string>();
    results.forEach((r, i) => {
      const s = need[i];
      if (r.status === 'fulfilled') {
        const prevEntry = cache.get(s.ticker);
        const entry: CacheEntry = {
          fetchedAt: new Date(now).toISOString(),
          quote: { ...r.value, ...(prevEntry?.quote.dividends ? { dividends: prevEntry.quote.dividends } : {}) },
          ...(prevEntry?.divTriedAt ? { divTriedAt: prevEntry.divTriedAt } : {}),
        };
        cache.set(s.ticker, entry);
        save(s.ticker, entry);
        delete fails[s.ticker];
        console.log(
          `[quotes] ${s.ticker}: ok via ${r.value.source} (${r.value.symbol}, ${r.value.currency}, ${r.value.matchedBy})${r.value.warning ? ' WAARSCHUWING: ' + r.value.warning : ''}`
        );
      } else {
        reason.set(s.ticker, errMsg(r.reason));
        fails[s.ticker] = { at: now, reason: errMsg(r.reason).slice(0, 200) };
        console.log(`[quotes] ${s.ticker}: MISLUKT - ${errMsg(r.reason)} [${s.name}${s.isin ? ', ' + s.isin : ', geen ISIN'}]`);
      }
    });

    // Dividend ophalen voor aandelen met een koers, maar rustig aan: hooguit 2 per ronde,
    // en alleen als de ronde nog niet te lang duurt (Vercel kapt functies na een tijdje af).
    if (Date.now() - now < 5000) {
      const divTodo = stocks
        .filter((s) => {
          const e = cache.get(s.ticker);
          return e && !(e.divTriedAt && ageOf(e.divTriedAt) < DIVIDEND_RETRY_MS);
        })
        .slice(0, 2)
        .filter(() => takeYahoo());
      await Promise.all(
        divTodo.map(async (s) => {
          const e = cache.get(s.ticker)!;
          try {
            e.quote = { ...e.quote, dividends: await dividendsFor(s, e.quote, fxCache, budget.take) };
            console.log(`[quotes] ${s.ticker}: dividend ${e.quote.dividends?.length ?? 0} uitkeringen`);
          } catch (err) {
            console.log(`[quotes] ${s.ticker}: dividend niet beschikbaar - ${errMsg(err)}`);
          }
          e.divTriedAt = new Date(now).toISOString();
          save(s.ticker, e);
        })
      );
    }

    // Antwoord: de laatste bekende koers per aandeel (tot 12 uur na de verwachte update).
    let newest = 0;
    let oldest = Infinity;
    for (const s of stocks) {
      const e = cache.get(s.ticker);
      if (e && ageOf(e.fetchedAt) <= MAX_STALE_MS) {
        body.quotes[s.ticker] = e.quote;
        const t = new Date(e.fetchedAt).getTime();
        newest = Math.max(newest, t);
        oldest = Math.min(oldest, t);
      } else {
        body.failed.push({ ticker: s.ticker, reason: reason.get(s.ticker) ?? fails[s.ticker]?.reason ?? 'Nog geen koers binnen' });
      }
    }
    body.updatedAt = newest > 0 ? new Date(newest).toISOString() : null;
    body.oldestAt = Number.isFinite(oldest) ? new Date(oldest).toISOString() : null;

    // Opslaan (bijzaak: mislukt dit, dan werkt het overzicht gewoon).
    const rows: { key: string; body: unknown; expires_at: string }[] = [...toSave.values()];
    const cr = credits.row(budget.used());
    if (cr) rows.push(cr);
    // Alleen aandelen die we nog volgen bewaren in de lijst met mislukte pogingen.
    const activeFails = Object.fromEntries(Object.entries(fails).filter(([t]) => stocks.some((s) => s.ticker === t)));
    if (need.length > 0) rows.push({ key: FAILS_KEY, body: activeFails, expires_at: expires });
    if (rows.length > 0) {
      await db('/quote_cache?on_conflict=key', {
        method: 'POST',
        body: rows,
        prefer: 'resolution=merge-duplicates',
      }).catch((err) => console.log(`[quotes] cache opslaan mislukt: ${errMsg(err)}`));
    }
    console.log(`[quotes] ${isCron ? 'dagelijkse update' : manual ? 'handmatig verversen' : 'bezoek'}: ${need.length} opgevraagd, ${Object.keys(body.quotes).length}/${stocks.length} beschikbaar`);
    res.status(200).json(body);
  } catch (err) {
    console.log(`[quotes] fout: ${errMsg(err)}`);
    res.status(500).json({ error: 'Kon koersen niet ophalen.' });
  }
}
