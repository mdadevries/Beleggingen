import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

// Alles rond je account: wachtwoord vergeten (resetlink per mail), wachtwoord wijzigen,
// inloggen met Face ID / Touch ID (passkeys) en mail bij een nieuwe login.
//
// Opslag: in de bestaande Supabase-tabel quote_cache (geen nieuwe tabel nodig), onder sleutels
// die met "auth:" beginnen. Een wachtwoord dat je hier instelt (reset of wijzigen) gaat vóór
// SITE_PASSWORD_HASH / SITE_PASSWORD uit Vercel. Wil je terug naar het wachtwoord uit Vercel?
// Verwijder dan in Supabase de rij met key "auth:password".
//
// Mail gaat via Resend (gratis): RESEND_API_KEY + ALERT_EMAIL (jouw mailadres) in Vercel.
// Optioneel RESEND_FROM (standaard "Beleggingen <onboarding@resend.dev>", werkt zonder eigen domein
// zolang ALERT_EMAIL het adres is waarmee je bij Resend bent aangemeld).
//
// Bewust zelfstandig (geen import uit een ander /api-bestand): Vercel compileert elk bestand los.
// Houd de sessie-constanten gelijk aan middleware.ts en de andere /api-bestanden.

const AUTH_COOKIE = '__Host-beleggingen_session';
const SESSION_PREFIX = 'v2';
const SESSION_DAYS = 7;

const K_PASSWORD = 'auth:password';
const K_RESET = 'auth:reset';
const K_RESET_RATE = 'auth:reset-rate';
const K_PASSKEYS = 'auth:passkeys';
const K_CHALLENGES = 'auth:challenges';
const K_SETTINGS = 'auth:settings';
const FOREVER = '2999-12-31T00:00:00Z';
const RESET_MINUTES = 30;
const MIN_PASSWORD = 12;
const SCRYPT = { N: 32768, r: 8, p: 1, keyLen: 32 };

// ---------- Sessie ----------

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

function sha256(text: string): Buffer {
  return crypto.createHash('sha256').update(text).digest();
}

function sameText(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function readSession(secret: string, token: string | null): 'real' | 'demo' | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== SESSION_PREFIX) return null;
  const [prefix, role, exp, nonce, sig] = parts;
  if (role !== 'real' && role !== 'demo') return null;
  if (!/^\d{1,12}$/.test(exp)) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${prefix}.${role}.${exp}.${nonce}`).digest('hex');
  if (!sameText(sig, expected)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return role;
}

function signSession(secret: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${SESSION_PREFIX}.real.${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function setSessionCookie(res: VercelResponse, secret: string) {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${signSession(secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}`);
}

// ---------- Database ----------

type Db = (path: string, init?: { method?: string; body?: unknown; prefer?: string }) => Promise<any>;

function getDb(): Db {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Database niet geconfigureerd.');
  const base = url.replace(/\/$/, '') + '/rest/v1';
  return async (path, init = {}) => {
    const r = await fetch(base + path, {
      method: init.method ?? 'GET',
      headers: {
        apikey: key,
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

async function getKey<T>(db: Db, key: string): Promise<T | null> {
  const rows: any[] = (await db(`/quote_cache?select=body&key=eq.${encodeURIComponent(key)}`)) ?? [];
  return (rows[0]?.body as T) ?? null;
}

async function setKey(db: Db, key: string, body: unknown, expires = FOREVER) {
  await db('/quote_cache?on_conflict=key', { method: 'POST', body: [{ key, body, expires_at: expires }], prefer: 'resolution=merge-duplicates' });
}

async function delKey(db: Db, key: string) {
  await db(`/quote_cache?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
}

// ---------- Wachtwoord ----------

function scrypt(password: string, salt: Buffer, keyLen: number, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password.normalize('NFKC'), salt, keyLen, { N, r, p, maxmem: 256 * N * r }, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keyLen, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join(':');
}

async function checkHash(input: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const derived = await scrypt(input, Buffer.from(salt, 'base64url'), expected.length, Number(n), Number(r), Number(p));
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

/** Zelfde volgorde als api/login.ts: eerst het wachtwoord uit de database, dan dat uit Vercel. */
async function verifyPassword(db: Db, input: string): Promise<boolean> {
  const own = await getKey<{ hash: string }>(db, K_PASSWORD).catch(() => null);
  if (own?.hash) return checkHash(input, own.hash);
  const stored = process.env.SITE_PASSWORD_HASH?.trim();
  if (stored) return checkHash(input, stored);
  const plain = process.env.SITE_PASSWORD;
  return !!plain && sameText(input, plain);
}

function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Kies minstens ${MIN_PASSWORD} tekens.`;
  if (pw.length > 200) return 'Dat is wel heel lang. Hooguit 200 tekens.';
  if (/^(.)\1+$/.test(pw)) return 'Kies iets minder voorspelbaars.';
  if (process.env.SITE_USERNAME && pw.toLowerCase().includes(process.env.SITE_USERNAME.toLowerCase())) return 'Je gebruikersnaam mag er niet in zitten.';
  return null;
}

// ---------- Mail (Resend) ----------

const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL);

function maskEmail(e: string) {
  const [u, d] = e.split('@');
  if (!d) return '•••';
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(2, u.length - 2))}@${d}`;
}

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Inter,sans-serif;padding:24px">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7">
<div style="background:linear-gradient(135deg,#2a78d6,#8b5cf6);padding:20px 24px;color:#fff;font-weight:700;font-size:16px">📈 Beleggingen</div>
<div style="padding:24px;color:#1f2937;font-size:15px;line-height:1.55"><h1 style="font-size:20px;margin:0 0 12px">${title}</h1>${body}</div>
</div><p style="text-align:center;color:#a1a1aa;font-size:12px;margin-top:14px">Automatische mail van je beleggingssite.</p></body></html>`;
}

async function sendMail(subject: string, html: string): Promise<boolean> {
  if (!mailReady()) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.RESEND_FROM || 'Beleggingen <onboarding@resend.dev>', to: [process.env.ALERT_EMAIL], subject, html }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) console.log(`[account] mail mislukt: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.ok;
  } catch (e) {
    console.log(`[account] mail mislukt: ${(e as Error).message}`);
    return false;
  }
}

/** Korte omschrijving van het apparaat en de plek, voor in de meldingsmail. */
function whoAmI(req: VercelRequest) {
  const ua = String(req.headers['user-agent'] ?? '');
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'onbekend apparaat';
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  const decode = (v: unknown) => {
    try {
      return v ? decodeURIComponent(String(v)) : '';
    } catch {
      return String(v ?? '');
    }
  };
  const city = decode(req.headers['x-vercel-ip-city']);
  const country = decode(req.headers['x-vercel-ip-country']);
  const place = [city, country].filter(Boolean).join(', ') || 'onbekende plek';
  const when = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Amsterdam' }).format(new Date());
  return { device: `${device} · ${browser}`, place, when };
}

function siteUrl(req: VercelRequest) {
  return `https://${String(req.headers['x-forwarded-host'] || req.headers.host)}`;
}

async function loginAlert(db: Db, req: VercelRequest, method: string) {
  const settings = (await getKey<{ loginAlerts?: boolean }>(db, K_SETTINGS).catch(() => null)) ?? {};
  if (settings.loginAlerts === false || !mailReady()) return;
  const w = whoAmI(req);
  await sendMail(
    `Nieuwe login op je beleggingssite (${w.device.split(' ·')[0]})`,
    shell(
      'Er is net ingelogd',
      `<table style="font-size:14px;border-collapse:collapse">
<tr><td style="color:#71717a;padding:3px 12px 3px 0">Wanneer</td><td><b>${w.when}</b></td></tr>
<tr><td style="color:#71717a;padding:3px 12px 3px 0">Hoe</td><td><b>${method}</b></td></tr>
<tr><td style="color:#71717a;padding:3px 12px 3px 0">Apparaat</td><td><b>${w.device}</b></td></tr>
<tr><td style="color:#71717a;padding:3px 12px 3px 0">Plek (ongeveer)</td><td><b>${w.place}</b></td></tr></table>
<p style="margin-top:16px">Was jij dit? Dan hoef je niets te doen.</p>
<p>Was jij dit <b>niet</b>? <a href="${siteUrl(req)}/reset" style="color:#2a78d6;font-weight:600">Stel meteen een nieuw wachtwoord in</a>.</p>`
    )
  );
}

// ---------- Passkeys (Face ID / Touch ID) ----------

interface StoredPasskey {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  name: string;
  createdAt: string;
  lastUsed: string | null;
}

interface Challenge {
  c: string;
  exp: number;
  kind: 'reg' | 'auth';
}

function rp(req: VercelRequest) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  return { rpID: host, origin: `https://${host}` };
}

async function saveChallenge(db: Db, c: string, kind: Challenge['kind']) {
  const now = Date.now();
  const list = ((await getKey<Challenge[]>(db, K_CHALLENGES).catch(() => null)) ?? []).filter((x) => x.exp > now).slice(-9);
  list.push({ c, exp: now + 5 * 60_000, kind });
  await setKey(db, K_CHALLENGES, list, new Date(now + 3600_000).toISOString());
}

async function takeChallenge(db: Db, c: string, kind: Challenge['kind']): Promise<boolean> {
  const now = Date.now();
  const list = (await getKey<Challenge[]>(db, K_CHALLENGES).catch(() => null)) ?? [];
  const hit = list.find((x) => x.c === c && x.kind === kind && x.exp > now);
  if (!hit) return false;
  await setKey(db, K_CHALLENGES, list.filter((x) => x !== hit && x.exp > now), new Date(now + 3600_000).toISOString());
  return true;
}

function challengeOf(response: any): string {
  try {
    const json = JSON.parse(Buffer.from(String(response?.response?.clientDataJSON ?? ''), 'base64url').toString('utf8'));
    return typeof json.challenge === 'string' ? json.challenge : '';
  } catch {
    return '';
  }
}

function deviceName(req: VercelRequest) {
  return whoAmI(req).device;
}

// ---------- Handler ----------

function sameOrigin(req: VercelRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Login is niet geconfigureerd.' });
    return;
  }
  let db: Db;
  try {
    db = getDb();
  } catch {
    res.status(500).json({ error: 'Database niet geconfigureerd.' });
    return;
  }
  const action = String(req.query?.action ?? '');
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) ?? {};
  const loggedIn = readSession(secret, parseCookie(req.headers.cookie, AUTH_COOKIE)) === 'real';

  if (req.method !== 'GET' && !sameOrigin(req)) {
    res.status(403).json({ error: 'Verzoek geweigerd.' });
    return;
  }

  try {
    // ---------- Openbaar (vanaf het inlogscherm) ----------

    if (action === 'reset-request' && req.method === 'POST') {
      // Altijd hetzelfde antwoord: zo verraadt de site niets.
      const reply = { ok: true, mail: mailReady() };
      if (!mailReady()) {
        res.status(200).json(reply);
        return;
      }
      const now = Date.now();
      const rate = ((await getKey<number[]>(db, K_RESET_RATE).catch(() => null)) ?? []).filter((t) => now - t < 3600_000);
      if (rate.length >= 3) {
        res.status(200).json(reply);
        return;
      }
      await setKey(db, K_RESET_RATE, [...rate, now], new Date(now + 3600_000).toISOString());
      const token = crypto.randomBytes(32).toString('base64url');
      await setKey(db, K_RESET, { hash: sha256(token).toString('hex'), exp: now + RESET_MINUTES * 60_000 }, new Date(now + RESET_MINUTES * 60_000).toISOString());
      const link = `${siteUrl(req)}/reset#t=${token}`;
      const w = whoAmI(req);
      await sendMail(
        'Nieuw wachtwoord instellen voor je beleggingssite',
        shell(
          'Wachtwoord vergeten? Geen stress.',
          `<p>Klik op de knop om een nieuw wachtwoord te kiezen. De link werkt <b>${RESET_MINUTES} minuten</b> en maar één keer.</p>
<p style="margin:22px 0"><a href="${link}" style="background:#1f2937;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">Nieuw wachtwoord instellen</a></p>
<p style="font-size:14px">Je gebruikersnaam is: <b>${process.env.SITE_USERNAME ?? '(niet ingesteld)'}</b></p>
<p style="font-size:13px;color:#71717a">Aangevraagd op ${w.when} vanaf ${w.device} (${w.place}). Was jij dit niet? Dan kun je deze mail negeren: er verandert niets.</p>`
        )
      );
      res.status(200).json(reply);
      return;
    }

    if (action === 'reset-confirm' && req.method === 'POST') {
      const token = typeof body.token === 'string' ? body.token : '';
      const password = typeof body.password === 'string' ? body.password.normalize('NFKC') : '';
      const stored = await getKey<{ hash: string; exp: number }>(db, K_RESET).catch(() => null);
      const valid = !!stored && stored.exp > Date.now() && token.length > 20 && sameText(sha256(token).toString('hex'), stored.hash);
      if (!valid) {
        res.status(400).json({ error: 'Deze link is verlopen of al gebruikt. Vraag een nieuwe aan via "Wachtwoord vergeten".' });
        return;
      }
      const problem = passwordProblem(password);
      if (problem) {
        res.status(400).json({ error: problem });
        return;
      }
      await setKey(db, K_PASSWORD, { hash: await hashPassword(password), changedAt: new Date().toISOString(), via: 'reset' });
      await delKey(db, K_RESET);
      setSessionCookie(res, secret);
      const w = whoAmI(req);
      await sendMail('Je wachtwoord is gewijzigd', shell('Je wachtwoord is gewijzigd', `<p>Op ${w.when} is via een resetlink een nieuw wachtwoord ingesteld (${w.device}, ${w.place}).</p><p>Was jij dit niet? Vraag dan direct opnieuw een resetlink aan en verander ook <code>SESSION_SECRET</code> in Vercel, zodat iedereen wordt uitgelogd.</p>`));
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'passkey-login-options' && req.method === 'POST') {
      const keys = (await getKey<StoredPasskey[]>(db, K_PASSKEYS).catch(() => null)) ?? [];
      if (keys.length === 0) {
        res.status(404).json({ error: 'Face ID is nog niet ingesteld. Log in met je wachtwoord en zet het aan via Account.' });
        return;
      }
      const { rpID } = rp(req);
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred',
        allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports as any })),
      });
      await saveChallenge(db, options.challenge, 'auth');
      res.status(200).json(options);
      return;
    }

    if (action === 'passkey-login-verify' && req.method === 'POST') {
      const response = body.response;
      const keys = (await getKey<StoredPasskey[]>(db, K_PASSKEYS).catch(() => null)) ?? [];
      const key = keys.find((k) => k.id === response?.id);
      const challenge = challengeOf(response);
      if (!key || !challenge || !(await takeChallenge(db, challenge, 'auth'))) {
        res.status(401).json({ error: 'Face ID-login mislukt. Probeer het opnieuw of log in met je wachtwoord.' });
        return;
      }
      const { rpID, origin } = rp(req);
      const v = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: { id: key.id, publicKey: new Uint8Array(Buffer.from(key.publicKey, 'base64url')), counter: key.counter, transports: key.transports as any },
        requireUserVerification: false,
      });
      if (!v.verified) {
        res.status(401).json({ error: 'Face ID-login mislukt.' });
        return;
      }
      key.counter = v.authenticationInfo.newCounter;
      key.lastUsed = new Date().toISOString();
      await setKey(db, K_PASSKEYS, keys);
      setSessionCookie(res, secret);
      await loginAlert(db, req, 'Face ID / passkey');
      res.status(200).json({ ok: true });
      return;
    }

    // Kleine statuscheck voor het inlogscherm: is Face ID beschikbaar, werkt mail?
    if (action === 'public-status' && req.method === 'GET') {
      const keys = (await getKey<StoredPasskey[]>(db, K_PASSKEYS).catch(() => null)) ?? [];
      res.status(200).json({ passkeys: keys.length > 0, mail: mailReady() });
      return;
    }

    // ---------- Alleen ingelogd ----------

    if (!loggedIn) {
      res.status(401).json({ error: 'Niet ingelogd.' });
      return;
    }

    if (action === 'status' && req.method === 'GET') {
      const [keys, settings, pw] = await Promise.all([
        getKey<StoredPasskey[]>(db, K_PASSKEYS).catch(() => null),
        getKey<{ loginAlerts?: boolean }>(db, K_SETTINGS).catch(() => null),
        getKey<{ changedAt?: string }>(db, K_PASSWORD).catch(() => null),
      ]);
      res.status(200).json({
        mail: mailReady(),
        email: process.env.ALERT_EMAIL ? maskEmail(process.env.ALERT_EMAIL) : null,
        loginAlerts: settings?.loginAlerts !== false,
        passwordChangedAt: pw?.changedAt ?? null,
        passkeys: (keys ?? []).map((k) => ({ id: k.id, name: k.name, createdAt: k.createdAt, lastUsed: k.lastUsed })),
      });
      return;
    }

    if (action === 'change-password' && req.method === 'POST') {
      const current = typeof body.current === 'string' ? body.current.normalize('NFKC') : '';
      const next = typeof body.next === 'string' ? body.next.normalize('NFKC') : '';
      if (!(await verifyPassword(db, current))) {
        await new Promise((r) => setTimeout(r, 700));
        res.status(400).json({ error: 'Je huidige wachtwoord klopt niet.' });
        return;
      }
      const problem = passwordProblem(next);
      if (problem) {
        res.status(400).json({ error: problem });
        return;
      }
      await setKey(db, K_PASSWORD, { hash: await hashPassword(next), changedAt: new Date().toISOString(), via: 'app' });
      const w = whoAmI(req);
      await sendMail('Je wachtwoord is gewijzigd', shell('Je wachtwoord is gewijzigd', `<p>Op ${w.when} heb je in de site een nieuw wachtwoord ingesteld (${w.device}, ${w.place}).</p><p>Was jij dit niet? <a href="${siteUrl(req)}/reset">Reset je wachtwoord</a>.</p>`));
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'settings' && req.method === 'POST') {
      const current = (await getKey<Record<string, unknown>>(db, K_SETTINGS).catch(() => null)) ?? {};
      await setKey(db, K_SETTINGS, { ...current, loginAlerts: body.loginAlerts !== false });
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'test-mail' && req.method === 'POST') {
      if (!mailReady()) {
        res.status(400).json({ error: 'Mail is nog niet ingesteld: zet RESEND_API_KEY en ALERT_EMAIL in Vercel.' });
        return;
      }
      const ok = await sendMail('Testmail van je beleggingssite ✅', shell('Mail werkt!', '<p>Hiermee komen resetlinks en inlogmeldingen bij je binnen.</p>'));
      res.status(ok ? 200 : 502).json(ok ? { ok: true } : { error: 'Versturen mislukt. Klopt je Resend-sleutel, en is ALERT_EMAIL het adres van je Resend-account?' });
      return;
    }

    if (action === 'passkey-register-options' && req.method === 'POST') {
      const keys = (await getKey<StoredPasskey[]>(db, K_PASSKEYS).catch(() => null)) ?? [];
      const { rpID } = rp(req);
      const options = await generateRegistrationOptions({
        rpName: 'Beleggingen',
        rpID,
        userName: process.env.SITE_USERNAME || 'beleggingen',
        userDisplayName: 'Beleggingen',
        userID: new Uint8Array(sha256(`beleggingen-user:${process.env.SITE_USERNAME ?? ''}`).subarray(0, 16)),
        attestationType: 'none',
        excludeCredentials: keys.map((k) => ({ id: k.id, transports: k.transports as any })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      });
      await saveChallenge(db, options.challenge, 'reg');
      res.status(200).json(options);
      return;
    }

    if (action === 'passkey-register-verify' && req.method === 'POST') {
      const response = body.response;
      const challenge = challengeOf(response);
      if (!challenge || !(await takeChallenge(db, challenge, 'reg'))) {
        res.status(400).json({ error: 'Instellen is verlopen. Probeer het opnieuw.' });
        return;
      }
      const { rpID, origin } = rp(req);
      const v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
      if (!v.verified || !v.registrationInfo) {
        res.status(400).json({ error: 'Instellen mislukt.' });
        return;
      }
      const c = v.registrationInfo.credential;
      const keys = (await getKey<StoredPasskey[]>(db, K_PASSKEYS).catch(() => null)) ?? [];
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : deviceName(req);
      keys.push({
        id: c.id,
        publicKey: Buffer.from(c.publicKey).toString('base64url'),
        counter: c.counter,
        transports: c.transports,
        name,
        createdAt: new Date().toISOString(),
        lastUsed: null,
      });
      await setKey(db, K_PASSKEYS, keys.slice(-10));
      res.status(200).json({ ok: true, name });
      return;
    }

    if (action === 'passkey-delete' && req.method === 'POST') {
      const keys = (await getKey<StoredPasskey[]>(db, K_PASSKEYS).catch(() => null)) ?? [];
      await setKey(db, K_PASSKEYS, keys.filter((k) => k.id !== body.id));
      res.status(200).json({ ok: true });
      return;
    }

    res.status(404).json({ error: 'Onbekende actie.' });
  } catch (e) {
    console.log(`[account] ${action}: ${(e as Error).message}`);
    res.status(500).json({ error: 'Er ging iets mis. Probeer het opnieuw.' });
  }
}
