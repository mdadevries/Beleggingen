import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Inloggen met gebruikersnaam + wachtwoord.
//
// Beveiliging:
// - Gebruikersnaam en wachtwoord worden altijd allebei gecontroleerd en de fout is
//   altijd dezelfde, zodat je niet kunt zien welke van de twee klopt.
// - Wachtwoord staat bij voorkeur als scrypt-hash in SITE_PASSWORD_HASH (maak 'm met
//   `node scripts/hash-wachtwoord.mjs`); SITE_PASSWORD (leesbaar) blijft als terugval werken.
// - Na 5 foute pogingen binnen 15 minuten gaat dat IP-adres op slot (15 min, daarna steeds
//   langer tot 24 uur). De teller staat in Supabase (quote_cache), met geheugen als vangnet.
// - De sessie is een getekend token met een einddatum (SESSION_DAYS) en een willekeurig deel,
//   dus niet meer één eeuwig geldige code.
//
// Bewust per bestand zelfstandig (geen import uit een ander bestand): Vercel
// compileert elk bestand onder /api los en neemt relatieve .ts-imports niet
// mee, waardoor de functie op de server crasht (ERR_MODULE_NOT_FOUND).
// Houd de sessie-constanten gelijk aan middleware.ts en de andere /api-bestanden.
const AUTH_COOKIE = '__Host-beleggingen_session';
const SESSION_PREFIX = 'v2';
const SESSION_DAYS = 7;

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;
const BASE_LOCK_MS = 15 * 60_000;
const MAX_LOCK_MS = 24 * 3_600_000;
const FAIL_DELAY_MS = 700;

function signSession(secret: string, role: 'real' | 'demo'): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${SESSION_PREFIX}.${role}.${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function sha256(text: string): Buffer {
  return crypto.createHash('sha256').update(text).digest();
}

/** Vergelijkt twee teksten in vaste tijd, ook als ze niet even lang zijn. */
function sameText(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

async function verifyPassword(input: string): Promise<boolean> {
  const stored = process.env.SITE_PASSWORD_HASH?.trim();
  if (stored) {
    // Formaat: scrypt:N:r:p:zout:hash (zout en hash in base64url)
    const [scheme, n, r, p, salt, hash] = stored.split(':');
    if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64url');
    const N = Number(n);
    const R = Number(r);
    const P = Number(p);
    const derived = await new Promise<Buffer>((resolve, reject) =>
      crypto.scrypt(
        input.normalize('NFKC'),
        Buffer.from(salt, 'base64url'),
        expected.length,
        { N, r: R, p: P, maxmem: 256 * N * R },
        (err, key) => (err ? reject(err) : resolve(key))
      )
    );
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  }
  const plain = process.env.SITE_PASSWORD;
  return !!plain && sameText(input, plain);
}

// ---- Poging-teller (tegen gokken) ----

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

interface Attempts {
  count: number;
  first: number;
  locks: number;
  lockedUntil: number;
  updated: number;
}

const emptyAttempts = (): Attempts => ({ count: 0, first: 0, locks: 0, lockedUntil: 0, updated: 0 });
const memory = new Map<string, Attempts>();

async function loadAttempts(db: Db | null, key: string): Promise<Attempts> {
  let found: Attempts | undefined;
  if (db) {
    try {
      const rows: any[] = (await db(`/quote_cache?select=body&key=eq.${encodeURIComponent(key)}`)) ?? [];
      if (rows[0]?.body) found = { ...emptyAttempts(), ...rows[0].body };
    } catch (err) {
      console.error('[login] teller lezen mislukt, geheugen gebruikt:', (err as Error).message);
    }
  }
  const a = found ?? memory.get(key) ?? emptyAttempts();
  // Na een dag rust beginnen we weer schoon.
  return Date.now() - a.updated > MAX_LOCK_MS ? emptyAttempts() : a;
}

async function saveAttempts(db: Db | null, key: string, a: Attempts): Promise<void> {
  memory.set(key, a);
  if (!db) return;
  try {
    await db('/quote_cache?on_conflict=key', {
      method: 'POST',
      body: [{ key, body: a, expires_at: new Date(Date.now() + 2 * MAX_LOCK_MS).toISOString() }],
      prefer: 'resolution=merge-duplicates',
    });
  } catch (err) {
    console.error('[login] teller schrijven mislukt:', (err as Error).message);
  }
}

async function clearAttempts(db: Db | null, key: string): Promise<void> {
  memory.delete(key);
  if (!db) return;
  try {
    await db(`/quote_cache?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch (err) {
    console.error('[login] teller wissen mislukt:', (err as Error).message);
  }
}

function clientKey(req: VercelRequest, secret: string): string {
  const raw =
    (req.headers['x-vercel-forwarded-for'] as string | undefined) ||
    (req.headers['x-real-ip'] as string | undefined) ||
    (req.headers['x-forwarded-for'] as string | undefined) ||
    req.socket?.remoteAddress ||
    'onbekend';
  const ip = raw.split(',')[0].trim();
  // Alleen een afgeleide code bewaren, geen echt IP-adres.
  const hash = crypto.createHmac('sha256', secret).update(`ip:${ip}`).digest('hex').slice(0, 32);
  return `login-fail:v1:${hash}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function minutesText(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min >= 120) return `${Math.ceil(min / 60)} uur`;
  return min === 1 ? '1 minuut' : `${min} minuten`;
}

function sameOrigin(req: VercelRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // niet-browser of zelfde-site verzoek zonder Origin
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Methode niet toegestaan.' });
    return;
  }

  const siteUsername = process.env.SITE_USERNAME;
  const hasPassword = !!(process.env.SITE_PASSWORD_HASH || process.env.SITE_PASSWORD);
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || !hasPassword) {
    res.status(500).json({ error: 'Login is niet geconfigureerd op de server.' });
    return;
  }
  if (!siteUsername) {
    res.status(500).json({ error: 'SITE_USERNAME ontbreekt in de environment variables van Vercel.' });
    return;
  }
  if (!sameOrigin(req)) {
    res.status(403).json({ error: 'Verzoek geweigerd.' });
    return;
  }

  let username = '';
  let password = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (typeof body?.username === 'string') username = body.username;
    if (typeof body?.password === 'string') password = body.password;
  } catch {
    res.status(400).json({ error: 'Ongeldig verzoek.' });
    return;
  }
  if (username.length > 200 || password.length > 1000) {
    res.status(400).json({ error: 'Ongeldig verzoek.' });
    return;
  }

  let db: Db | null = null;
  try {
    db = getDb();
  } catch {
    db = null; // geen database: dan telt alleen het geheugen van deze server
  }

  const key = clientKey(req, sessionSecret);
  const attempts = await loadAttempts(db, key);
  const now = Date.now();

  if (attempts.lockedUntil > now) {
    const wait = attempts.lockedUntil - now;
    res.setHeader('Retry-After', String(Math.ceil(wait / 1000)));
    res.status(429).json({
      error: `Te veel mislukte pogingen. Probeer het over ${minutesText(wait)} opnieuw.`,
      retryAfter: Math.ceil(wait / 1000),
    });
    return;
  }

  try {
    // Altijd allebei controleren, ook als de gebruikersnaam al fout is.
    const userOk = sameText(username.trim().toLowerCase(), siteUsername.trim().toLowerCase());
    const passOk = await verifyPassword(password.normalize('NFKC'));

    if (userOk && passOk) {
      await clearAttempts(db, key);
      res.setHeader(
        'Set-Cookie',
        `${AUTH_COOKIE}=${signSession(sessionSecret, 'real')}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}`
      );
      res.status(200).json({ ok: true });
      return;
    }
  } catch (err) {
    console.error('[login] fout bij controleren:', (err as Error).message);
    res.status(500).json({ error: 'Inloggen is nu niet beschikbaar, probeer het later opnieuw.' });
    return;
  }

  // Mislukt: tel de poging, vertraag het antwoord en zet zo nodig op slot.
  await sleep(FAIL_DELAY_MS);
  const next: Attempts = { ...attempts, updated: now };
  if (next.first === 0 || now - next.first > WINDOW_MS) {
    next.first = now;
    next.count = 0;
  }
  next.count += 1;

  if (next.count >= MAX_ATTEMPTS) {
    const lockMs = Math.min(BASE_LOCK_MS * 2 ** next.locks, MAX_LOCK_MS);
    next.locks += 1;
    next.lockedUntil = now + lockMs;
    next.count = 0;
    next.first = 0;
    await saveAttempts(db, key, next);
    res.setHeader('Retry-After', String(Math.ceil(lockMs / 1000)));
    res.status(429).json({
      error: `Te veel mislukte pogingen. Probeer het over ${minutesText(lockMs)} opnieuw.`,
      retryAfter: Math.ceil(lockMs / 1000),
    });
    return;
  }

  await saveAttempts(db, key, next);
  res.status(401).json({
    error: 'Onjuiste gebruikersnaam of wachtwoord.',
    attemptsLeft: MAX_ATTEMPTS - next.count,
  });
}
