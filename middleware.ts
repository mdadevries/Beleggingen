// Vercel Edge Middleware: beschermt de hele site met één wachtwoord, want er
// komt straks echte (eigen) beleggingsdata in te staan. /api/* loopt er niet
// doorheen — die routes hebben hun eigen auth (login zelf, x-api-key voor n8n).

export const config = {
  matcher: '/((?!api/).*)',
};

const AUTH_COOKIE = 'beleggingen_auth';
const TOKEN_MESSAGE = 'auth:v1';
// Zelfde geheim, ander bericht -> aparte token voor het demo-account
// (/api/demo-login). Laat de middleware 'm ook door, de front-end herkent
// 'm via /api/session en laat dan nooit echte transacties zien.
const DEMO_TOKEN_MESSAGE = 'auth:demo:v1';

async function deriveToken(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

function loginPage(showError?: boolean): string {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Beleggingen — inloggen</title>
<style>
  :root {
    color-scheme: light;
    --bg: #f9f9f7; --card: #ffffff; --text: #1f2937; --sub: #71717a; --border: #e4e4e7;
    --btn-bg: #1f2937; --btn-fg: #ffffff; --hover: #f9f9f7; --secondary: #52514e;
    --error: #c0362c; --muted: #8a8a85; --accent: #2a78d6;
  }
  :root[data-theme='dark'] {
    color-scheme: dark;
    --bg: #0f0f11; --card: #1a1a1d; --text: #f3f4f6; --sub: #96969e; --border: #303036;
    --btn-bg: #f3f4f6; --btn-fg: #1a1a1d; --hover: #222226; --secondary: #c4c4ca;
    --error: #f87171; --muted: #96969e; --accent: #60a5fa;
  }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg); font-family: Inter, system-ui, -apple-system, sans-serif;
    padding: 16px; box-sizing: border-box;
  }
  .card {
    background: var(--card); border-radius: 16px; padding: 32px 28px; width: 100%; max-width: 360px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04); border: 1px solid var(--border);
  }
  h1 { font-size: 18px; margin: 0 0 4px; color: var(--text); }
  p.sub { margin: 0 0 20px; font-size: 13px; color: var(--sub); }
  input {
    width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--card); color: var(--text);
    font-size: 14px; margin-bottom: 12px;
  }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
  button {
    width: 100%; padding: 12px; border-radius: 10px; border: none;
    font-size: 14px; font-weight: 600; cursor: pointer; min-height: 44px;
  }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .btn-primary { background: var(--btn-bg); color: var(--btn-fg); }
  .btn-primary:disabled { opacity: 0.6; cursor: default; }
  .btn-secondary {
    background: transparent; color: var(--secondary); border: 1px solid var(--border); margin-top: 10px;
  }
  .btn-secondary:hover { background: var(--hover); }
  .error { color: var(--error); font-size: 13px; margin: 0 0 12px; min-height: 16px; }
  .divider { display: flex; align-items: center; gap: 10px; margin: 18px 0 2px; color: var(--muted); font-size: 12px; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
</style>
<script>
  (function () {
    try {
      var pref = localStorage.getItem('beleggingen_theme') || 'system';
      var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    } catch (e) {}
  })();
</script>
</head>
<body>
  <div class="card">
    <form id="f">
      <h1>Beleggingen</h1>
      <p class="sub">Dit is mijn persoonlijke portefeuille. Wachtwoord vereist.</p>
      <p class="error">${showError ? 'Onjuist wachtwoord, probeer opnieuw.' : ''}</p>
      <input type="password" name="password" placeholder="Wachtwoord" autofocus required />
      <button type="submit" class="btn-primary">Inloggen</button>
    </form>
    <div class="divider">of</div>
    <button type="button" id="demoBtn" class="btn-secondary">Doorgaan met demo-account</button>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      const password = e.target.password.value;
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        location.reload();
      } else {
        location.href = '/?auth_error=1';
      }
    });

    document.getElementById('demoBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const res = await fetch('/api/demo-login', { method: 'POST' });
      if (res.ok) {
        location.reload();
      } else {
        btn.disabled = false;
        alert('Demo-login is nu niet beschikbaar, probeer het later opnieuw.');
      }
    });
  </script>
</body>
</html>`;
}

export default async function middleware(request: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return new Response('SESSION_SECRET ontbreekt in de environment variables.', { status: 500 });
  }

  const cookieHeader = request.headers.get('cookie');
  const token = parseCookie(cookieHeader, AUTH_COOKIE);
  const [expectedReal, expectedDemo] = await Promise.all([
    deriveToken(secret, TOKEN_MESSAGE),
    deriveToken(secret, DEMO_TOKEN_MESSAGE),
  ]);

  if (token === expectedReal || token === expectedDemo) {
    return undefined; // doorlaten naar de rest van de site (echt of demo-account)
  }

  const url = new URL(request.url);
  const hadError = url.searchParams.get('auth_error') === '1';
  return new Response(loginPage(hadError), {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
