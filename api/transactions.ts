import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Opslag: Supabase (Postgres), tabellen "transactions" en "stocks"
// (zie supabase/schema.sql). Praat via de REST-API met fetch, geen extra pakket.
// OrderID (DEGIRO) is de primaire sleutel van "transactions": dezelfde mail kan
// dus nooit twee keer als transactie verschijnen, ook niet als n8n 'm dubbel verwerkt.

const COLOR_SLOTS = [1, 2, 3, 4, 5] as const;

interface StoredStock {
  ticker: string;
  name: string;
  currentPrice: number;
  colorSlot: 1 | 2 | 3 | 4 | 5;
  /** Uit de DEGIRO-mail; nodig om een echte beurskoers op te zoeken (/api/quotes). */
  isin?: string;
  /** Door /api/quotes opgezocht en bewaard, zodat het maar één keer hoeft. */
  symbol?: string;
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

// Bewust zelfstandig (geen import uit een ander bestand): Vercel compileert elk
// bestand onder /api los, relatieve imports bestaan op de server niet.
// Houd deze constanten gelijk aan middleware.ts en de andere /api-bestanden.
const AUTH_COOKIE = 'beleggingen_auth';
const TOKEN_MESSAGE = 'auth:v1';

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

/** Alleen de echte (wachtwoord-)sessie mag portefeuilledata lezen; demo en anoniem niet. */
function isRealSession(req: VercelRequest): boolean {
  const secret = process.env.SESSION_SECRET;
  const token = parseCookie(req.headers.cookie, AUTH_COOKIE);
  if (!secret || !token) return false;
  const expected = crypto.createHmac('sha256', secret).update(TOKEN_MESSAGE).digest('hex');
  return timingSafeEqual(token, expected);
}

interface StoredTransaction {
  id: string;
  date: string;
  ticker: string;
  type: 'Kopen' | 'Verkopen';
  quantity: number;
  price: number;
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  let db: Db;
  try {
    db = getDb();
  } catch (err) {
    res.status(500).json({ error: 'Database niet geconfigureerd op de server.' });
    return;
  }

  if (req.method === 'GET') {
    if (!isRealSession(req)) {
      res.status(401).json({ error: 'Niet ingelogd.' });
      return;
    }
    try {
      const [txRows, stockRows] = await Promise.all([
        db('/transactions?select=id,date,ticker,type,quantity,price&order=date.asc,id.asc'),
        db('/stocks?select=*'),
      ]);
      const transactions: StoredTransaction[] = (txRows ?? []).map((r: any) => ({
        id: r.id,
        date: r.date,
        ticker: r.ticker,
        type: r.type,
        quantity: Number(r.quantity),
        price: Number(r.price),
      }));
      const stocks: StoredStock[] = (stockRows ?? []).map(toStock);
      res.status(200).json({ transactions, stocks });
    } catch (err) {
      res.status(500).json({ error: 'Kon transacties niet ophalen.' });
    }
    return;
  }

  if (req.method === 'POST') {
    const apiKey = req.headers['x-api-key'];
    const expected = process.env.N8N_API_SECRET;
    if (!expected || typeof apiKey !== 'string' || !timingSafeEqual(apiKey, expected)) {
      res.status(401).json({ error: 'Ongeldige of ontbrekende API-sleutel.' });
      return;
    }

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { orderId, date, ticker, name, type, quantity, price } = body || {};
      const isin: string | undefined = typeof body?.isin === 'string' && body.isin ? body.isin.trim().toUpperCase() : undefined;
      if (isin !== undefined && !ISIN_RE.test(isin)) {
        res.status(400).json({ error: 'Ongeldige ISIN.' });
        return;
      }

      if (typeof orderId !== 'string' || !orderId.trim()) {
        res.status(400).json({ error: 'Ongeldige of ontbrekende orderId.' });
        return;
      }
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: 'date moet ISO yyyy-mm-dd zijn.' });
        return;
      }
      if (typeof ticker !== 'string' || !ticker.trim()) {
        res.status(400).json({ error: 'Ongeldige of ontbrekende ticker.' });
        return;
      }
      if (type !== 'Kopen' && type !== 'Verkopen') {
        res.status(400).json({ error: "type moet 'Kopen' of 'Verkopen' zijn." });
        return;
      }
      if (typeof quantity !== 'number' || quantity <= 0) {
        res.status(400).json({ error: 'Ongeldige quantity.' });
        return;
      }
      if (typeof price !== 'number' || price <= 0) {
        res.status(400).json({ error: 'Ongeldige price.' });
        return;
      }

      const tickerKey = ticker.trim().toUpperCase();

      // Dedup: dezelfde order-mail twee keer verwerkt mag geen dubbele transactie geven
      // en mag de huidige prijs niet terugzetten. Wel vullen we dan een ontbrekende ISIN
      // aan op het aandeel (zo kan een oudere order alsnog een echte koers opleveren).
      const dup = await db(`/transactions?select=id&id=eq.${encodeURIComponent(orderId)}`);
      if (dup && dup.length > 0) {
        if (isin) {
          await db(`/stocks?ticker=eq.${encodeURIComponent(tickerKey)}&isin=is.null`, {
            method: 'PATCH',
            body: { isin },
          });
        }
        res.status(200).json({ ok: true, id: orderId, duplicate: true });
        return;
      }

      // Bestaand aandeel ophalen (kleurslot, ISIN, symbool blijven behouden).
      const existingRows = await db(`/stocks?select=*&ticker=eq.${encodeURIComponent(tickerKey)}`);
      const existing: StoredStock | null = existingRows?.length ? toStock(existingRows[0]) : null;

      // Nieuw aandeel krijgt een volgende kleurslot, bestaand krijgt zijn
      // 'currentPrice' bijgewerkt naar de laatst bekende transactieprijs.
      let stockRow: Record<string, unknown>;
      if (existing) {
        stockRow = {
          ticker: tickerKey,
          name: name?.trim() || existing.name,
          current_price: price,
          color_slot: existing.colorSlot,
          isin: existing.isin ?? isin ?? null,
          symbol: existing.symbol ?? null,
        };
      } else {
        const all = await db('/stocks?select=ticker');
        stockRow = {
          ticker: tickerKey,
          name: (name && String(name).trim()) || tickerKey,
          current_price: price,
          color_slot: COLOR_SLOTS[(all?.length ?? 0) % COLOR_SLOTS.length],
          isin: isin ?? null,
          symbol: null,
        };
      }
      await db('/stocks?on_conflict=ticker', { method: 'POST', body: stockRow, prefer: 'resolution=merge-duplicates' });

      // Gelijktijdige dubbele aanvraag: 'ignore-duplicates' geeft een lege lijst terug.
      const inserted = await db('/transactions?on_conflict=id', {
        method: 'POST',
        body: { id: orderId, date, ticker: tickerKey, type, quantity, price },
        prefer: 'resolution=ignore-duplicates,return=representation',
      });
      if (!inserted || inserted.length === 0) {
        res.status(200).json({ ok: true, id: orderId, duplicate: true });
        return;
      }

      res.status(200).json({ ok: true, id: orderId, duplicate: false });
    } catch (err) {
      res.status(500).json({ error: 'Kon transactie niet opslaan.' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  res.status(405).json({ error: 'Methode niet toegestaan.' });
}
