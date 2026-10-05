import type { VercelRequest, VercelResponse } from '@vercel/node';
// Bewust per bestand zelfstandig (geen import uit een ander bestand): Vercel
// compileert elk bestand onder /api los en neemt relatieve .ts-imports niet
// mee, waardoor de functie op de server crasht (ERR_MODULE_NOT_FOUND).
// Houd deze constanten gelijk aan middleware.ts en de andere /api-bestanden.
const AUTH_COOKIE = 'beleggingen_auth';



export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Methode niet toegestaan.' });
    return;
  }
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  res.status(200).json({ ok: true });
}
