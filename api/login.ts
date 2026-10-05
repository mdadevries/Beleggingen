import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Bewust per bestand zelfstandig (geen import uit een ander bestand): Vercel
// compileert elk bestand onder /api los en neemt relatieve .ts-imports niet
// mee, waardoor de functie op de server crasht (ERR_MODULE_NOT_FOUND).
// Houd deze constanten gelijk aan middleware.ts en de andere /api-bestanden.
const AUTH_COOKIE = 'beleggingen_auth';
const TOKEN_MESSAGE = 'auth:v1';

function tokenFor(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Methode niet toegestaan.' });
    return;
  }

  const sitePassword = process.env.SITE_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sitePassword || !sessionSecret) {
    res.status(500).json({ error: 'Login is niet geconfigureerd op de server.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const password = body?.password;

    if (typeof password !== 'string' || !timingSafeEqual(password, sitePassword)) {
      res.status(401).json({ error: 'Onjuist wachtwoord.' });
      return;
    }

    const token = tokenFor(sessionSecret, TOKEN_MESSAGE);
    const maxAgeSeconds = 60 * 60 * 24 * 30; // 30 dagen
    res.setHeader(
      'Set-Cookie',
      `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'Ongeldig verzoek.' });
  }
}
