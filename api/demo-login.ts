import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AUTH_COOKIE, DEMO_TOKEN_MESSAGE, tokenFor } from '../lib/auth.ts';

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
