import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Weekrapport: n8n schrijft elke week een AI-analyse van je portefeuille weg (tabel
// weekly_reports, zie supabase/weekly_reports.sql) en de site toont ze.
//
//   GET  /api/reports                 jouw wachtwoord-sessie  -> lijst met rapporten (nieuwste eerst)
//   GET  /api/reports?snapshot=1      n8n (x-api-key)         -> alle data die de workflow nodig heeft
//   POST /api/reports                 n8n (x-api-key)         -> rapport opslaan (zelfde week = overschrijven)
//
// Bewust zelfstandig (geen import uit een ander /api-bestand): Vercel compileert elk
// bestand onder /api los, relatieve imports bestaan op de server niet.
// Houd de auth-constanten gelijk aan middleware.ts en de andere /api-bestanden.

const AUTH_COOKIE = 'beleggingen_auth';
const TOKEN_MESSAGE = 'auth:v1';

// Dezelfde sleutels als in api/quotes.ts (daar worden ze gevuld).
const CACHE_PREFIX = 'quote:v1:';
const HISTORY_PREFIX = 'history:v1:';
const FUND_PREFIX = 'fund:v1:';
const FINNHUB = 'https://finnhub.io/api/v1';

const MAX_REPORTS = 26; // een half jaar aan weken in de lijst
const NEWS_PER_TICKER = 3;
const NEWS_TIMEOUT_MS = 4000;

type Db = (path: string, init?: { method?: string; body?: unknown; prefer?: string }) => Promise<any>;

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

/** Alleen de echte (wachtwoord-)sessie mag rapporten lezen; demo en anoniem niet. */
function isRealSession(req: VercelRequest): boolean {
  const secret = process.env.SESSION_SECRET;
  const token = parseCookie(req.headers.cookie, AUTH_COOKIE);
  if (!secret || !token) return false;
  const expected = crypto.createHmac('sha256', secret).update(TOKEN_MESSAGE).digest('hex');
  return timingSafeEqual(token, expected);
}

function isN8n(req: VercelRequest): boolean {
  const apiKey = req.headers['x-api-key'];
  const expected = process.env.N8N_API_SECRET;
  return !!expected && typeof apiKey === 'string' && timingSafeEqual(apiKey, expected);
}

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

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Maandag en zondag van de week waarin `now` valt (UTC). */
function weekBounds(now: Date): { weekStart: string; weekEnd: string } {
  const day = (now.getUTCDay() + 6) % 7; // maandag = 0
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return { weekStart: iso(monday), weekEnd: iso(sunday) };
}

/** Zelfde herkenning als in api/quotes.ts, zodat ETF's overal hetzelfde tellen. */
function isEtfName(ticker: string, name: string): boolean {
  return /\betf\b|ucits|ishares|vanguard|spdr|xtrackers|amundi|lyxor|invesco|wisdomtree|vaneck|index ?fund|tracker|s&p ?500|msci|ftse|all-?world|stoxx/i.test(
    `${ticker} ${name}`
  );
}

/** Rijen uit quote_cache met een bepaalde sleutel-voorvoegsel -> { ticker: body }. */
async function cacheByPrefix(db: Db, prefix: string): Promise<Record<string, any>> {
  const rows: any[] = (await db(`/quote_cache?select=key,body&key=like.${encodeURIComponent(prefix + '*')}`).catch(() => null)) ?? [];
  const out: Record<string, any> = {};
  for (const r of rows) {
    if (typeof r?.key === 'string') out[r.key.slice(prefix.length)] = r.body;
  }
  return out;
}

interface NewsItem {
  headline: string;
  source: string;
  date: string;
}

/** Laatste koppen per Amerikaans aandeel (Finnhub, gratis sleutel). Mislukt het: leeg, nooit een fout. */
async function fetchNews(symbol: string, from: string, to: string): Promise<NewsItem[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];
  try {
    const url = `${FINNHUB}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(NEWS_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data: any = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((n) => typeof n?.headline === 'string' && n.headline.trim())
      .sort((a, b) => Number(b.datetime) - Number(a.datetime))
      .slice(0, NEWS_PER_TICKER)
      .map((n) => ({
        headline: String(n.headline).slice(0, 200),
        source: typeof n.source === 'string' ? n.source.slice(0, 40) : '',
        date: Number.isFinite(Number(n.datetime)) ? iso(new Date(Number(n.datetime) * 1000)) : '',
      }));
  } catch {
    return [];
  }
}

async function handleSnapshot(db: Db, res: VercelResponse) {
  const now = new Date();
  const { weekStart, weekEnd } = weekBounds(now);

  const [stockRows, txRows, quoteBodies, historyBodies, fundBodies, prevRows] = await Promise.all([
    db('/stocks?select=*'),
    db('/transactions?select=id,date,ticker,type,quantity,price&order=date.asc,id.asc'),
    cacheByPrefix(db, CACHE_PREFIX),
    cacheByPrefix(db, HISTORY_PREFIX),
    cacheByPrefix(db, FUND_PREFIX),
    db(`/weekly_reports?select=week_start,stats&week_start=lt.${weekStart}&order=week_start.desc&limit=1`).catch(() => null),
  ]);

  const stocks = (stockRows ?? []).map((r: any) => ({
    ticker: r.ticker,
    name: r.name,
    isin: r.isin ?? null,
    isEtf: isEtfName(r.ticker, r.name),
    currentPrice: Number(r.current_price),
  }));
  const transactions = (txRows ?? []).map((r: any) => ({
    id: r.id,
    date: r.date,
    ticker: r.ticker,
    type: r.type,
    quantity: Number(r.quantity),
    price: Number(r.price),
  }));

  // Alleen de laatste koers per aandeel en de vorm die n8n nodig heeft.
  const quotes: Record<string, unknown> = {};
  for (const [ticker, entry] of Object.entries(quoteBodies)) {
    const q = entry?.quote;
    if (!q || typeof q.price !== 'number') continue;
    quotes[ticker] = {
      price: q.price,
      currency: q.currency ?? null,
      symbol: q.symbol ?? null,
      source: q.source ?? null,
      asOf: q.asOf ?? entry.fetchedAt ?? null,
      fetchedAt: entry.fetchedAt ?? null,
      changePct: typeof q.changePct === 'number' ? q.changePct : null,
      range52: q.range52 ?? null,
      dividends: Array.isArray(q.dividends) ? q.dividends : null,
    };
  }

  // Koershistorie: laatste ~3 weken is genoeg om "een week geleden" te vinden.
  const cutoff = iso(new Date(now.getTime() - 21 * 86_400_000));
  const history: Record<string, [string, number][]> = {};
  for (const [ticker, body] of Object.entries(historyBodies)) {
    const pts = Array.isArray(body?.points) ? (body.points as [string, number][]) : [];
    const recent = pts.filter((p) => Array.isArray(p) && typeof p[0] === 'string' && p[0] >= cutoff && typeof p[1] === 'number');
    if (recent.length > 0) history[ticker] = recent;
  }

  const fundamentals: Record<string, unknown> = {};
  for (const [ticker, body] of Object.entries(fundBodies)) {
    if (body?.data?.available) fundamentals[ticker] = body.data;
  }

  // Nieuws alleen voor aandelen die je nog hebt en die in USD noteren (daar dekt gratis Finnhub).
  const net = new Map<string, number>();
  for (const t of transactions) net.set(t.ticker, (net.get(t.ticker) ?? 0) + (t.type === 'Kopen' ? t.quantity : -t.quantity));
  const newsFrom = iso(new Date(now.getTime() - 7 * 86_400_000));
  const newsTo = iso(now);
  const news: Record<string, NewsItem[]> = {};
  await Promise.all(
    stocks
      .filter((s: any) => (net.get(s.ticker) ?? 0) > 1e-9)
      .map(async (s: any) => {
        const q: any = quotes[s.ticker];
        if (!q || q.currency !== 'USD' || !q.symbol) return;
        const items = await fetchNews(String(q.symbol).split(':')[0], newsFrom, newsTo);
        if (items.length > 0) news[s.ticker] = items;
      })
  );

  const prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
  res.status(200).json({
    generatedAt: now.toISOString(),
    today: iso(now),
    weekStart,
    weekEnd,
    stocks,
    transactions,
    quotes,
    history,
    fundamentals,
    news,
    previous: prev ? { weekStart: prev.week_start, prices: prev.stats?.prices ?? {}, totalValue: prev.stats?.totalValue ?? null } : null,
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  let db: Db;
  try {
    db = getDb();
  } catch {
    res.status(500).json({ error: 'Database niet geconfigureerd op de server.' });
    return;
  }

  const snapshot = req.query?.snapshot;
  const wantsSnapshot = snapshot === '1' || (Array.isArray(snapshot) && snapshot[0] === '1');

  if (req.method === 'GET') {
    if (wantsSnapshot) {
      if (!isN8n(req)) {
        res.status(401).json({ error: 'Ongeldige of ontbrekende API-sleutel.' });
        return;
      }
      try {
        await handleSnapshot(db, res);
      } catch (err) {
        console.log(`[reports] snapshot mislukt: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Kon de portefeuillegegevens niet ophalen.' });
      }
      return;
    }

    if (!isRealSession(req)) {
      res.status(401).json({ error: 'Niet ingelogd.' });
      return;
    }
    try {
      const rows: any[] =
        (await db(`/weekly_reports?select=week_start,week_end,created_at,model,stats,content&order=week_start.desc&limit=${MAX_REPORTS}`)) ?? [];
      res.status(200).json({
        reports: rows.map((r) => ({
          weekStart: r.week_start,
          weekEnd: r.week_end,
          createdAt: r.created_at,
          model: r.model ?? null,
          stats: r.stats,
          content: r.content,
        })),
      });
    } catch (err) {
      console.log(`[reports] lezen mislukt: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Kon de rapporten niet ophalen.' });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!isN8n(req)) {
      res.status(401).json({ error: 'Ongeldige of ontbrekende API-sleutel.' });
      return;
    }
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { weekStart, weekEnd, model, stats, content } = body || {};
      if (typeof weekStart !== 'string' || !DATE_RE.test(weekStart) || typeof weekEnd !== 'string' || !DATE_RE.test(weekEnd)) {
        res.status(400).json({ error: 'weekStart en weekEnd moeten ISO yyyy-mm-dd zijn.' });
        return;
      }
      if (!isObject(stats) || !isObject(content)) {
        res.status(400).json({ error: 'stats en content moeten objecten zijn.' });
        return;
      }
      if (typeof content.headline !== 'string' || typeof content.summary !== 'string') {
        res.status(400).json({ error: 'content.headline en content.summary zijn verplicht.' });
        return;
      }
      if (JSON.stringify(body).length > 200_000) {
        res.status(400).json({ error: 'Rapport is te groot.' });
        return;
      }
      // Zelfde week opnieuw draaien overschrijft het rapport (handig bij een testrun).
      await db('/weekly_reports?on_conflict=week_start', {
        method: 'POST',
        body: {
          week_start: weekStart,
          week_end: weekEnd,
          created_at: new Date().toISOString(),
          model: typeof model === 'string' ? model.slice(0, 80) : null,
          stats,
          content,
        },
        prefer: 'resolution=merge-duplicates',
      });
      res.status(200).json({ ok: true, weekStart });
    } catch (err) {
      console.log(`[reports] opslaan mislukt: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Kon het rapport niet opslaan.' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Methode niet toegestaan.' });
}
