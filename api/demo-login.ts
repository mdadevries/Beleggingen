import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Bewust per bestand zelfstandig (geen import uit een ander bestand): Vercel
// compileert elk bestand onder /api los en neemt relatieve .ts-imports niet
// mee, waardoor de functie op de server crasht (ERR_MODULE_NOT_FOUND).
// Houd deze constanten gelijk aan middleware.ts en de andere /api-bestanden.
const AUTH_COOKIE = 'beleggingen_auth';
const DEMO_TOKEN_MESSAGE = 'auth:demo:v1';

function tokenFor(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}


// Logt in als demo-account: geen wachtwoord nodig, altijd demodata (nooit
// echte transacties), zodat iemand de site kan laten zien zonder het echte
// wachtwoord te delen.
export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const token = tokenFor(sessionSecret, DEMO_TOKEN_MESSAGE);
  const maxAgeSeconds = 60 * 60 * 24 * 30; // 30 dagen, zelfde als het echte account
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  );
  res.status(200).json({ ok: true, demo: true });
}
