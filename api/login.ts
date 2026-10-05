import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AUTH_COOKIE, TOKEN_MESSAGE, tokenFor, timingSafeEqual } from '../lib/auth.ts';

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
