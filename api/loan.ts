import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Instellingen voor de pagina Studieschuld (DUO-lening, DEGIRO-waarde).
// Staat in de database (tabel quote_cache, sleutel loan:v1) en NIET in de code:
// de repo is openbaar en dit zijn persoonlijke bedragen.
//
// GET  /api/loan -> { settings: {...} | null, savedAt }
// PUT  /api/loan -> bewaart { settings }
// Alleen met de echte wachtwoord-sessie (de demo-sessie roept dit nooit aan).
//
// Bewust zelfstandig (geen import uit een ander /api-bestand): Vercel compileert elk
// bestand onder /api los. Houd de auth-constanten gelijk aan de andere /api-bestanden.

const AUTH_COOKIE = 'beleggingen_auth';
const TOKEN_MESSAGE = 'auth:v1';
const KEY = 'loan:v1';

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

const isYm = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const numIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

/** Alleen bekende velden met redelijke waarden; anders null. */
function clean(input: any): Record<string, number | string> | null {
  if (!input || typeof input !== 'object') return null;
  const nums: [string, number, number][] = [
    ['debtNow', 0, 1_000_000],
    ['monthlyLoan', 0, 5_000],
    ['monthlyGrant', 0, 5_000],
    ['ageNow', 15, 80],
    ['rateLater', 0, 0.2],
    ['extraPerMonth', 0, 20_000],
    ['salary', 0, 2_000_000],
    ['degiroTotal', 0, 10_000_000],
    ['degiroCash', 0, 10_000_000],
  ];
  const out: Record<string, number | string> = {};
  for (const [k, min, max] of nums) {
    const v = numIn(input[k], min, max);
    if (v === null) return null;
    out[k] = Math.round(v * 10000) / 10000;
  }
  for (const k of ['asOf', 'bachelorEnd', 'lastLoanMonth']) {
    if (!isYm(input[k])) return null;
    out[k] = input[k];
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
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
    if (req.method === 'GET') {
      const rows: any[] = (await db(`/quote_cache?select=body&key=eq.${KEY}`)) ?? [];
      const body = rows[0]?.body;
      res.status(200).json({ settings: body?.settings ?? null, savedAt: body?.savedAt ?? null });
      return;
    }
    const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const settings = clean(raw?.settings);
    if (!settings) {
      res.status(400).json({ error: 'Ongeldige gegevens.' });
      return;
    }
    const savedAt = new Date().toISOString();
    await db('/quote_cache?on_conflict=key', {
      method: 'POST',
      body: [{ key: KEY, body: { settings, savedAt }, expires_at: '2099-12-31T00:00:00Z' }],
      prefer: 'resolution=merge-duplicates',
    });
    res.status(200).json({ ok: true, savedAt });
  } catch (err) {
    console.log(`[loan] fout: ${err instanceof Error ? err.message : 'onbekend'}`);
    res.status(500).json({ error: 'Kon de gegevens niet opslaan of ophalen.' });
  }
}
