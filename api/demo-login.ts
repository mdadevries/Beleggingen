import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Bewust per bestand zelfstandig (geen import uit een ander bestand): Vercel
// compileert elk bestand onder /api los en neemt relatieve .ts-imports niet
// mee, waardoor de functie op de server crasht (ERR_MODULE_NOT_FOUND).
// Houd deze constanten gelijk aan middleware.ts en de andere /api-bestanden.
const AUTH_COOKIE = '__Host-beleggingen_session';
const SESSION_PREFIX = 'v2';
const SESSION_DAYS = 7;

function signSession(secret: string, role: 'real' | 'demo'): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${SESSION_PREFIX}.${role}.${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

// Logt in als demo-account: geen wachtwoord nodig, altijd demodata (nooit
// echte transacties), zodat iemand de site kan laten zien zonder het echte
// wachtwoord te delen.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Methode niet toegestaan.' });
    return;
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    res.status(500).json({ error: 'Login is niet geconfigureerd op de server.' });
    return;
  }

  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE}=${signSession(sessionSecret, 'demo')}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}`
  );
  res.status(200).json({ ok: true, demo: true });
}
