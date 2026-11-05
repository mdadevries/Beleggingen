// Service worker voor de app op je telefoon.
//
// Bewust zuinig: we bewaren ALLEEN de vaste bestanden van de site (scripts, stijlen, iconen;
// die hebben een unieke naam per versie). Pagina's en /api/* gaan altijd live naar de server,
// zodat je nooit oude of andermans financiële data te zien krijgt en uitloggen echt uitlogt.
// Geen internet? Dan zie je een korte melding in plaats van een lege pagina.

const CACHE = 'beleggingen-static-v1';
const OFFLINE_HTML = `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Geen verbinding</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui;background:#0f0f11;color:#f3f4f6;text-align:center;padding:24px">
<div><div style="font-size:48px">📡</div><h1 style="font-size:20px">Geen verbinding</h1><p style="color:#96969e">Je beleggingen worden geladen zodra je weer online bent.</p>
<button onclick="location.reload()" style="margin-top:12px;padding:10px 18px;border-radius:10px;border:0;font-weight:600">Opnieuw proberen</button></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Vaste bestanden: eerst uit de cache, anders ophalen en bewaren.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Pagina's: altijd live; alleen bij geen verbinding de offline-melding.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    );
  }
});
