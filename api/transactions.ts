import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

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

      // Dedup: dezelfde order-mail twee keer verwerkt mag geen dubbele transactie geven.
      const alreadyExists = await redis.hexists(TRANSACTIONS_KEY, orderId);
      if (alreadyExists) {
        res.status(200).json({ ok: true, id: orderId, duplicate: true });
        return;
      }

      const tickerKey = ticker.trim().toUpperCase();

      // Stock upserten: nieuw aandeel krijgt een volgende kleurslot, bestaande
      // krijgt zijn 'currentPrice' bijgewerkt naar de laatst bekende transactieprijs
      // (geen live koers-feed in v1 — dat is een bewuste latere uitbreiding).
      const existingStockRaw = await redis.hget<string>(STOCKS_KEY, tickerKey);
      let stock: StoredStock;
      if (existingStockRaw) {
        const existing: StoredStock = typeof existingStockRaw === 'string' ? JSON.parse(existingStockRaw) : (existingStockRaw as unknown as StoredStock);
        stock = { ...existing, name: name?.trim() || existing.name, currentPrice: price };
      } else {
        const stockCount = await redis.hlen(STOCKS_KEY);
        const colorSlot = COLOR_SLOTS[stockCount % COLOR_SLOTS.length];
        stock = { ticker: tickerKey, name: (name && String(name).trim()) || tickerKey, currentPrice: price, colorSlot };
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
