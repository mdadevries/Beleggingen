import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// Live (licht vertraagde) koersen voor je aandelen, in euro's.
//
// Bron: Yahoo Finance — een NIET-officiële, sleutelloze endpoint. Geen
// garantie: Yahoo kan 'm aanpassen, vertragen of blokkeren. Daarom is alles
// hier defensief: faalt een koers, dan laat de site voor dat aandeel gewoon de
// laatste transactieprijs zien (zoals vóór deze functie) en zegt dat ook.
// Koersen zijn voor eigen overzicht, geen handelsadvies en niet realtime.
//
// Bewust zelfstandig (geen import uit een ander /api-bestand): Vercel
// compileert elk bestand onder /api los, relatieve imports bestaan op de
// server niet. Houd de auth-constanten gelijk aan de andere /api-bestanden.

const STOCKS_KEY = 'stocks';
const CACHE_KEY = 'quotes:v1';
const CACHE_TTL_SECONDS = 300; // 5 minuten: zacht voor Yahoo, vers genoeg voor een overzicht
const REQUEST_TIMEOUT_MS = 3000;
const YAHOO = 'https://query1.finance.yahoo.com';
const UA = 'Mozilla/5.0 (compatible; beleggingen-overzicht)';

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
  /** Valuta waarin Yahoo de koers gaf (vóór omrekenen) */
  currency: string;
  /** Op welke manier het Yahoo-symbool gevonden is */
  matchedBy: 'saved' | 'isin' | 'name';
  /** Tijdstip van de koers volgens Yahoo (ISO), indien bekend */
  asOf: string | null;
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

function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN ontbreken.');
  return new Redis({ url, token });
}

async function yahooJson(path: string): Promise<any> {
  const res = await fetch(`${YAHOO}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Yahoo status ${res.status}`);
  return res.json();
}

/** Zoekt het Yahoo-symbool bij een ISIN (nauwkeurig) of, als terugval, een naam. */
async function resolveSymbol(query: string): Promise<string | null> {
  const data = await yahooJson(
    `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0&listsCount=0`
  );
  const hits: any[] = Array.isArray(data?.quotes) ? data.quotes : [];
  const hit = hits.find((h) => (h.quoteType === 'EQUITY' || h.quoteType === 'ETF') && typeof h.symbol === 'string');
  return hit ? hit.symbol : null;
}

interface ChartMeta {
  price: number;
  currency: string;
  asOf: string | null;
}

async function fetchChartMeta(symbol: string): Promise<ChartMeta> {
  const data = await yahooJson(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const currency = meta?.currency;
  if (typeof price !== 'number' || !(price > 0) || typeof currency !== 'string') {
    throw new Error('Geen bruikbare koers in Yahoo-antwoord');
  }
  const t = meta?.regularMarketTime;
  return { price, currency, asOf: typeof t === 'number' ? new Date(t * 1000).toISOString() : null };
}

/** Rekent een bedrag in `currency` om naar euro's. */
async function toEuro(
  amount: number,
  currency: string,
  fxCache: Map<string, Promise<number>>
): Promise<{ eur: number; nativeCurrency: string }> {
  let value = amount;
  let cur = currency;
  // Londense koersen komen vaak in pence (GBp/GBX) i.p.v. pond.
  if (cur === 'GBp' || cur === 'GBX') {
    value = value / 100;
    cur = 'GBP';
  }
  if (cur === 'EUR') return { eur: value, nativeCurrency: currency };

  if (!fxCache.has(cur)) {
    // EURUSD=X geeft hoeveel USD je voor 1 EUR krijgt.
    fxCache.set(
      cur,
      fetchChartMeta(`EUR${cur}=X`).then((m) => m.price)
    );
  }
  const rate = await fxCache.get(cur)!;
  return { eur: value / rate, nativeCurrency: currency };
}

async function quoteForStock(
  stock: StoredStock,
  redis: Redis,
  fxCache: Map<string, Promise<number>>
): Promise<Quote> {
  let symbol = stock.symbol;
  let matchedBy: Quote['matchedBy'] = 'saved';

  if (!symbol) {
    if (stock.isin) {
      symbol = (await resolveSymbol(stock.isin)) ?? undefined;
      matchedBy = 'isin';
    }
    if (!symbol) {
      symbol = (await resolveSymbol(stock.name)) ?? undefined;
      matchedBy = 'name';
    }
    if (!symbol) throw new Error('Geen Yahoo-symbool gevonden');
    // Onthouden, zodat opzoeken maar één keer nodig is.
    await redis.hset(STOCKS_KEY, { [stock.ticker]: JSON.stringify({ ...stock, symbol }) });
  }

  const meta = await fetchChartMeta(symbol);
  const { eur, nativeCurrency } = await toEuro(meta.price, meta.currency, fxCache);
  return {
    price: Math.round(eur * 10000) / 10000,
    symbol,
    currency: nativeCurrency,
    matchedBy,
    asOf: meta.asOf,
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

  let redis: Redis;
  try {
    redis = getRedis();
  } catch {
    res.status(500).json({ error: 'Database niet geconfigureerd op de server.' });
    return;
  }

  try {
    const raw = await redis.hgetall<Record<string, string>>(STOCKS_KEY);
    const stocks: StoredStock[] = Object.values(raw || {}).map((v) =>
      typeof v === 'string' ? JSON.parse(v) : (v as unknown as StoredStock)
    );
    const tickers = stocks.map((s) => s.ticker).sort();

    // Korte cache, alleen geldig voor precies deze set aandelen.
    const cached = await redis.get<{ tickers: string[]; body: QuotesResponse }>(CACHE_KEY);
    if (cached && JSON.stringify(cached.tickers) === JSON.stringify(tickers)) {
      res.status(200).json(cached.body);
      return;
    }

    const fxCache = new Map<string, Promise<number>>();
    const results = await Promise.allSettled(stocks.map((s) => quoteForStock(s, redis, fxCache)));

    const body: QuotesResponse = { quotes: {}, failed: [], fetchedAt: new Date().toISOString() };
    results.forEach((r, i) => {
      const ticker = stocks[i].ticker;
      if (r.status === 'fulfilled') body.quotes[ticker] = r.value;
      else body.failed.push({ ticker, reason: r.reason instanceof Error ? r.reason.message : 'Onbekende fout' });
    });

    // Bij (deels) mislukte ronde maar kort cachen: een tijdelijke Yahoo-hapering
    // mag niet 5 minuten blijven hangen, maar een onvindbaar aandeel mag Yahoo
    // ook niet bij elke paginalaad opnieuw bestoken.
    await redis.set(CACHE_KEY, { tickers, body }, { ex: body.failed.length === 0 ? CACHE_TTL_SECONDS : 60 });
    res.status(200).json(body);
  } catch {
    res.status(500).json({ error: 'Kon koersen niet ophalen.' });
  }
}
