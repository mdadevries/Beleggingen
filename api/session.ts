import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AUTH_COOKIE, TOKEN_MESSAGE, DEMO_TOKEN_MESSAGE, tokenFor, timingSafeEqual } from '../lib/auth.ts';

// Vertelt de front-end welk type sessie dit is, zodat usePortfolioData() weet
// of hij echte transacties mag ophalen (role "real") of alleen demodata mag
// tonen (role "demo") — zonder dat een demo-sessie ooit /api/transactions
// hoeft aan te roepen.

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Methode niet toegestaan.' });
    return;
  }

  const sessionSecret = process.env.SESSION_SECRET;
  const token = parseCookie(req.headers.cookie, AUTH_COOKIE);

  if (!sessionSecret || !token) {
    res.status(200).json({ role: 'none' });
    return;
  }

  if (timingSafeEqual(token, tokenFor(sessionSecret, TOKEN_MESSAGE))) {
    res.status(200).json({ role: 'real' });
    return;
  }

  if (timingSafeEqual(token, tokenFor(sessionSecret, DEMO_TOKEN_MESSAGE))) {
    res.status(200).json({ role: 'demo' });
    return;
  }

  res.status(200).json({ role: 'none' });
}
