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

const CACHE_KEY = 'quotes:v3';
const CACHE_TTL_SECONDS = 300; // 5 minuten
const REQUEST_TIMEOUT_MS = 3500;

const TD = 'https://api.twelvedata.com';
const YAHOO = 'https://query1.finance.yahoo.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Twelve Data Basic: 8 credits per minuut. Een koers kost 1 credit, een
// wisselkoers ook. Boven dit budget gaat een aandeel direct naar Yahoo.
const TD_CREDITS_PER_RUN = 7;

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
}

interface QuotesResponse {
  quotes: Record<string, Quote>;
  failed: { ticker: string; reason: string }[];
  fetchedAt: string;
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

/** Per aanroep van de handler maximaal TD_CREDITS_PER_RUN credits uitgeven. */
function makeBudget() {
  let left = TD_CREDITS_PER_RUN;
  return () => {
    if (left > 0) {
      left--;
      return true;
    }
    return false;
  };
}

async function tdJson(path: string): Promise<any> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error('TWELVEDATA_API_KEY ontbreekt');
  const res = await fetch(`${TD}${path}`, {
    headers: { Authorization: `apikey ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
}

/** Leest een getal uit een tekst of getal; anders null. */
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

async function tdQuote(stock: StoredStock): Promise<RawQuote> {
  const mapped = TD_MAP[stock.ticker];
  let query: string;
  let matchedBy: 'map' | 'isin';
  if (mapped) {
    query = `symbol=${encodeURIComponent(mapped.symbol)}&mic_code=${encodeURIComponent(mapped.mic)}`;
    matchedBy = 'map';
  } else if (stock.isin) {
    // ISIN-opzoeking werkt alleen als dit in je Twelve Data-plan/add-ons aan staat.
    query = `isin=${encodeURIComponent(stock.isin)}`;
    matchedBy = 'isin';
  } else {
    throw new Error('Geen Twelve Data-koppeling (geen mapping en geen ISIN)');
  }

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
  };
}

async function tdRate(cur: string): Promise<number> {
  const data = await tdJson(`/exchange_rate?symbol=${encodeURIComponent(`EUR/${cur}`)}`);
  const rate = Number(data?.rate);
  if (!Number.isFinite(rate) || !(rate > 0)) throw new Error('Geen bruikbare wisselkoers');
  return rate;
}

// ---------- Yahoo (reserve) ----------

async function yahooJson(path: string): Promise<any> {
  const res = await fetch(`${YAHOO}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
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
    const viaYahoo = () => yahooChart(`EUR${cur}=X`).then((m) => m.price);
    // EUR/USD = hoeveel USD je voor 1 EUR krijgt (zelfde bij Twelve Data en Yahoo).
    fxCache.set(cur, takeCredit() ? tdRate(cur).catch(viaYahoo) : viaYahoo());
  }
  const rate = await fxCache.get(cur)!;
  return value / rate;
}

async function quoteForStock(
  stock: StoredStock,
  db: Db,
  fxCache: Map<string, Promise<number>>,
  takeCredit: () => boolean
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
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Methode niet toegestaan.' });
    return;
  }
  if (!isRealSession(req)) {
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

  try {
    const stockRows = await db('/stocks?select=*');
    const stocks: StoredStock[] = (stockRows ?? []).map(toStock);
    const tickers = stocks.map((s) => s.ticker).sort();

    // Korte cache, alleen geldig voor precies deze set aandelen.
    const cacheRows = await db(
      `/quote_cache?select=body&key=eq.${CACHE_KEY}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`
    ).catch(() => null);
    const cached: { tickers: string[]; body: QuotesResponse } | null = cacheRows?.[0]?.body ?? null;
    if (cached && JSON.stringify(cached.tickers) === JSON.stringify(tickers)) {
      res.status(200).json(cached.body);
      return;
    }

    const fxCache = new Map<string, Promise<number>>();
    const takeCredit = makeBudget();
    const results = await Promise.allSettled(stocks.map((s) => quoteForStock(s, db, fxCache, takeCredit)));

    const body: QuotesResponse = { quotes: {}, failed: [], fetchedAt: new Date().toISOString() };
    results.forEach((r, i) => {
      const ticker = stocks[i].ticker;
      if (r.status === 'fulfilled') body.quotes[ticker] = r.value;
      else body.failed.push({ ticker, reason: errMsg(r.reason) });
    });

    // Bij (deels) mislukte ronde maar kort cachen: een tijdelijke hapering
    // mag niet 5 minuten blijven hangen, maar een onvindbaar aandeel mag de
    // bronnen ook niet bij elke paginalaad opnieuw bestoken.
    const ttl = body.failed.length === 0 ? CACHE_TTL_SECONDS : 60;
    await db('/quote_cache?on_conflict=key', {
      method: 'POST',
      body: { key: CACHE_KEY, body: { tickers, body }, expires_at: new Date(Date.now() + ttl * 1000).toISOString() },
      prefer: 'resolution=merge-duplicates',
    }).catch(() => undefined); // cache is bijzaak: mislukt opslaan mag de koersen niet breken
    res.status(200).json(body);
  } catch {
    res.status(500).json({ error: 'Kon koersen niet ophalen.' });
  }
}
