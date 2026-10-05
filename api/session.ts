import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Bewust per bestand zelfstandig (geen import uit een ander bestand): Vercel
// compileert elk bestand onder /api los en neemt relatieve .ts-imports niet
// mee, waardoor de functie op de server crasht (ERR_MODULE_NOT_FOUND).
// Houd deze constanten gelijk aan middleware.ts en de andere /api-bestanden.
const AUTH_COOKIE = 'beleggingen_auth';
const TOKEN_MESSAGE = 'auth:v1';
const DEMO_TOKEN_MESSAGE = 'auth:demo:v1';

function tokenFor(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


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
