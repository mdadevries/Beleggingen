import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// Opslag:
//   hash "transactions"  key = OrderID (DEGIRO) of een gegenereerde id -> JSON-string Transaction
//   hash "stocks"        key = ticker -> JSON-string Stock
// OrderID als sleutel zorgt dat dezelfde mail nooit twee keer als transactie verschijnt,
// ook als n8n 'm per ongeluk twee keer verwerkt.

const TRANSACTIONS_KEY = 'transactions';
const STOCKS_KEY = 'stocks';
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

function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN ontbreken in de environment variables.');
  }
  return new Redis({ url, token });
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

  let redis: Redis;
  try {
    redis = getRedis();
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
      const [txRaw, stockRaw] = await Promise.all([
        redis.hgetall<Record<string, string>>(TRANSACTIONS_KEY),
        redis.hgetall<Record<string, string>>(STOCKS_KEY),
      ]);
      const transactions: StoredTransaction[] = Object.values(txRaw || {}).map((v) =>
        typeof v === 'string' ? JSON.parse(v) : (v as unknown as StoredTransaction)
      );
      const stocks: StoredStock[] = Object.values(stockRaw || {}).map((v) =>
        typeof v === 'string' ? JSON.parse(v) : (v as unknown as StoredStock)
      );
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

      // Dedup: dezelfde order-mail twee keer verwerkt mag geen dubbele transactie geven.
      // Wel vullen we dan een ontbrekende ISIN aan op het aandeel (zo kan een
      // order van vóór de ISIN-koppeling alsnog een echte koers krijgen).
      const alreadyExists = await redis.hexists(TRANSACTIONS_KEY, orderId);
      if (alreadyExists) {
        if (isin) {
          const raw = await redis.hget<string>(STOCKS_KEY, tickerKey);
          if (raw) {
            const st: StoredStock = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as StoredStock);
            if (!st.isin) {
              await redis.hset(STOCKS_KEY, { [tickerKey]: JSON.stringify({ ...st, isin }) });
            }
          }
        }
        res.status(200).json({ ok: true, id: orderId, duplicate: true });
        return;
      }

      // Stock upserten: nieuw aandeel krijgt een volgende kleurslot, bestaande
      // krijgt zijn 'currentPrice' bijgewerkt naar de laatst bekende transactieprijs
      // (geen live koers-feed in v1 — dat is een bewuste latere uitbreiding).
      const existingStockRaw = await redis.hget<string>(STOCKS_KEY, tickerKey);
      let stock: StoredStock;
      if (existingStockRaw) {
        const existing: StoredStock = typeof existingStockRaw === 'string' ? JSON.parse(existingStockRaw) : (existingStockRaw as unknown as StoredStock);
        stock = { ...existing, name: name?.trim() || existing.name, currentPrice: price, isin: existing.isin ?? isin };
      } else {
        const stockCount = await redis.hlen(STOCKS_KEY);
        const colorSlot = COLOR_SLOTS[stockCount % COLOR_SLOTS.length];
        stock = { ticker: tickerKey, name: (name && String(name).trim()) || tickerKey, currentPrice: price, colorSlot, ...(isin ? { isin } : {}) };
      }

      const transaction: StoredTransaction = {
        id: orderId,
        date,
        ticker: tickerKey,
        type,
        quantity,
        price,
      };

      await Promise.all([
        redis.hset(TRANSACTIONS_KEY, { [orderId]: JSON.stringify(transaction) }),
        redis.hset(STOCKS_KEY, { [tickerKey]: JSON.stringify(stock) }),
      ]);

      res.status(200).json({ ok: true, id: orderId, duplicate: false });
    } catch (err) {
      res.status(500).json({ error: 'Kon transactie niet opslaan.' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  res.status(405).json({ error: 'Methode niet toegestaan.' });
}
