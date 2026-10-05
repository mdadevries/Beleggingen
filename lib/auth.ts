import crypto from 'crypto';

// Gedeelde auth-logica voor de /api-routes (login, demo-login, logout,
// session). BEWUST buiten /api/ geplaatst: Vercel bouwt elk bestand direct
// onder /api/ als een eigen, losstaande serverless functie. Importeer je
// vanuit het ene /api-bestand iets uit een ANDER /api-bestand, dan bundelt
// Vercel dat niet automatisch mee — op de server bestaat dat bestand dan
// niet meer (Error [ERR_MODULE_NOT_FOUND]). Code die meerdere /api-routes
// delen, hoort dus hier, nooit in een ander bestand onder /api/.

export const AUTH_COOKIE = 'beleggingen_auth';
export const TOKEN_MESSAGE = 'auth:v1';
// Los bericht voor het demo-account: zelfde geheim (SESSION_SECRET), andere
// afgeleide token. Geeft toegang tot de site (middleware laat 'm door) maar
// usePortfolioData() herkent 'm en laat dan NOOIT echte transacties zien —
// alleen de demodata, ook als er al echte data in Redis staat.
export const DEMO_TOKEN_MESSAGE = 'auth:demo:v1';

export function tokenFor(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
