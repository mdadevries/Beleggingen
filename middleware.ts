// Vercel Edge Middleware: beschermt de hele site met één wachtwoord, want er
// komt straks echte (eigen) beleggingsdata in te staan. /api/* loopt er niet
// doorheen — die routes hebben hun eigen auth (login zelf, x-api-key voor n8n).

export const config = {
  matcher: '/((?!api/).*)',
};

const AUTH_COOKIE = 'beleggingen_auth';
const TOKEN_MESSAGE = 'auth:v1';

async function expectedToken(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(TOKEN_MESSAGE));
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
  :root { color-scheme: light; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: rgb(249 249 247); font-family: Inter, system-ui, -apple-system, sans-serif;
    padding: 16px; box-sizing: border-box;
  }
  .card {
    background: #fff; border-radius: 16px; padding: 32px 28px; width: 100%; max-width: 360px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  }
  h1 { font-size: 18px; margin: 0 0 4px; color: #18181b; }
  p.sub { margin: 0 0 20px; font-size: 13px; color: #71717a; }
  input {
    width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px;
    border: 1px solid #e4e4e7; font-size: 14px; margin-bottom: 12px;
  }
  input:focus { outline: 2px solid #2a78d6; outline-offset: 1px; border-color: #2a78d6; }
  button {
    width: 100%; padding: 10px 12px; border-radius: 10px; border: none;
    background: #18181b; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .error { color: #c0362c; font-size: 13px; margin: 0 0 12px; min-height: 16px; }
</style>
</head>
<body>
  <form class="card" id="f">
    <h1>Beleggingen</h1>
    <p class="sub">Dit is mijn persoonlijke portefeuille. Wachtwoord vereist.</p>
    <p class="error">${showError ? 'Onjuist wachtwoord, probeer opnieuw.' : ''}</p>
    <input type="password" name="password" placeholder="Wachtwoord" autofocus required />
    <button type="submit">Inloggen</button>
  </form>
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
  const expected = await expectedToken(secret);

  if (token === expected) {
    return undefined; // doorlaten naar de rest van de site
  }

  const url = new URL(request.url);
  const hadError = url.searchParams.get('auth_error') === '1';
  return new Response(loginPage(hadError), {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
