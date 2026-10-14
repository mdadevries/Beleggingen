// Vercel Edge Middleware: beschermt de hele site met een login (gebruikersnaam +
// wachtwoord), want er staat eigen (financiële) beleggingsdata in. /api/* loopt er
// niet doorheen — die routes hebben hun eigen auth (login zelf, x-api-key voor n8n).

export const config = {
  matcher: '/((?!api/).*)',
};

// Houd deze constanten gelijk aan api/login.ts en de andere /api-bestanden.
const AUTH_COOKIE = '__Host-beleggingen_session';
const SESSION_PREFIX = 'v2';

async function hmacHex(secret: string, message: string): Promise<string> {
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

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

/**
 * Controleert handtekening en einddatum van het sessietoken
 * (v2.<rol>.<einde>.<willekeurig>.<handtekening>). Rol 'demo' laat de middleware ook door:
 * de front-end herkent die via /api/session en toont dan nooit echte transacties.
 */
async function readSession(secret: string, token: string | null): Promise<'real' | 'demo' | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== SESSION_PREFIX) return null;
  const [prefix, role, exp, nonce, sig] = parts;
  if (role !== 'real' && role !== 'demo') return null;
  if (!/^\d{1,12}$/.test(exp)) return null;
  const expected = await hmacHex(secret, `${prefix}.${role}.${exp}.${nonce}`);
  if (!safeEqual(sig, expected)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return role;
}

function loginPage(nonce: string): string {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Beleggingen — inloggen</title>
<style nonce="${nonce}">
  :root {
    color-scheme: light;
    --bg: #f9f9f7; --card: #ffffff; --text: #1f2937; --sub: #71717a; --border: #e4e4e7;
    --btn-bg: #1f2937; --btn-fg: #ffffff; --hover: #f9f9f7; --secondary: #52514e;
    --error: #c0362c; --muted: #8a8a85; --accent: #2a78d6; --accent-soft: #eaf2fc;
  }
  :root[data-theme='dark'] {
    color-scheme: dark;
    --bg: #0f0f11; --card: #1a1a1d; --text: #f3f4f6; --sub: #96969e; --border: #303036;
    --btn-bg: #f3f4f6; --btn-fg: #1a1a1d; --hover: #222226; --secondary: #c4c4ca;
    --error: #f87171; --muted: #96969e; --accent: #60a5fa; --accent-soft: #1b2a3d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg); font-family: Inter, system-ui, -apple-system, sans-serif;
    padding: 16px;
  }
  .card {
    background: var(--card); border-radius: 16px; padding: 32px 28px; width: 100%; max-width: 380px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04); border: 1px solid var(--border);
  }
  h1 { font-size: 18px; margin: 0 0 4px; color: var(--text); }
  p.sub { margin: 0 0 18px; font-size: 13px; color: var(--sub); }
  label.field { display: block; font-size: 12px; font-weight: 600; color: var(--secondary); margin: 0 0 6px; }
  input[type='text'], input[type='password'] {
    width: 100%; padding: 10px 12px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--card); color: var(--text);
    font-size: 16px; margin-bottom: 14px; font-family: inherit;
  }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
  .pw { position: relative; }
  .pw input { padding-right: 46px; }
  .eye {
    position: absolute; right: 4px; top: 0; height: 42px; width: 42px; border: none; background: transparent;
    color: var(--sub); cursor: pointer; border-radius: 10px; display: flex; align-items: center; justify-content: center;
  }
  .eye:hover { color: var(--text); }
  .eye:focus-visible, .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .eye svg { width: 18px; height: 18px; }
  .anon {
    display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; margin: 2px 0 16px;
    border: 1px solid var(--border); border-radius: 10px; cursor: pointer; color: var(--text);
  }
  .anon:hover { background: var(--hover); }
  .anon:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
  .anon input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
  .anon b { display: block; font-size: 13px; font-weight: 600; }
  .anon span { display: block; font-size: 12px; color: var(--sub); margin-top: 1px; }
  .btn {
    width: 100%; padding: 12px; border-radius: 10px; border: none;
    font-size: 14px; font-weight: 600; cursor: pointer; min-height: 44px; font-family: inherit;
  }
  .btn-primary { background: var(--btn-bg); color: var(--btn-fg); }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .btn-secondary {
    background: transparent; color: var(--secondary); border: 1px solid var(--border); margin-top: 10px;
  }
  .btn-secondary:hover:not(:disabled) { background: var(--hover); }
  .error { color: var(--error); font-size: 13px; margin: 0 0 12px; min-height: 18px; }
  .divider { display: flex; align-items: center; gap: 10px; margin: 18px 0 2px; color: var(--muted); font-size: 12px; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
</style>
<script nonce="${nonce}">
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
    <form id="f" novalidate>
      <h1>Beleggingen</h1>
      <p class="sub">Dit is mijn persoonlijke portefeuille. Log in om verder te gaan.</p>
      <p class="error" id="err" role="alert" aria-live="polite"></p>

      <label class="field" for="u">Gebruikersnaam</label>
      <input id="u" name="username" type="text" autocomplete="username" autocapitalize="none"
        autocorrect="off" spellcheck="false" maxlength="200" autofocus required />

      <label class="field" for="p">Wachtwoord</label>
      <div class="pw">
        <input id="p" name="password" type="password" autocomplete="current-password" maxlength="1000" required />
        <button type="button" id="eye" class="eye" aria-label="Toon wachtwoord" aria-pressed="false">
          <svg id="eyeOn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
          <svg id="eyeOff" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>
        </button>
      </div>

      <label class="anon" for="anon">
        <input id="anon" type="checkbox" />
        <div>
          <b>Anonieme modus</b>
          <span>Verberg aantallen en bedragen direct na het inloggen.</span>
        </div>
      </label>

      <button type="submit" id="go" class="btn btn-primary">Inloggen</button>
    </form>
    <div class="divider">of</div>
    <button type="button" id="demoBtn" class="btn btn-secondary">Doorgaan met demo-account</button>
  </div>
  <script nonce="${nonce}">
    (function () {
      var PRIVACY_KEY = 'beleggingen_privacy';
      var form = document.getElementById('f');
      var err = document.getElementById('err');
      var user = document.getElementById('u');
      var pass = document.getElementById('p');
      var anon = document.getElementById('anon');
      var go = document.getElementById('go');
      var demo = document.getElementById('demoBtn');
      var eye = document.getElementById('eye');

      // De keuze van de vorige keer staat alvast goed.
      try { anon.checked = localStorage.getItem(PRIVACY_KEY) === '1'; } catch (e) {}

      // De site zelf leest deze sleutel bij het opstarten, dus na het inloggen staat
      // de anonieme modus meteen goed (geen flits met zichtbare bedragen).
      function savePrivacy() {
        try { localStorage.setItem(PRIVACY_KEY, anon.checked ? '1' : '0'); } catch (e) {}
      }

      function show(msg) { err.textContent = msg || ''; }

      eye.addEventListener('click', function () {
        var visible = pass.type === 'text';
        pass.type = visible ? 'password' : 'text';
        eye.setAttribute('aria-pressed', visible ? 'false' : 'true');
        eye.setAttribute('aria-label', visible ? 'Toon wachtwoord' : 'Verberg wachtwoord');
        document.getElementById('eyeOn').style.display = visible ? '' : 'none';
        document.getElementById('eyeOff').style.display = visible ? 'none' : '';
        pass.focus();
      });

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        show('');
        if (!user.value.trim() || !pass.value) {
          show('Vul je gebruikersnaam en wachtwoord in.');
          (user.value.trim() ? pass : user).focus();
          return;
        }
        go.disabled = true;
        demo.disabled = true;
        go.textContent = 'Bezig…';
        var reload = false;
        try {
          var res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: user.value, password: pass.value }),
          });
          var data = {};
          try { data = await res.json(); } catch (x) {}
          if (res.ok) {
            savePrivacy();
            reload = true;
            location.reload();
            return;
          }
          var msg = data.error || 'Inloggen is mislukt, probeer het opnieuw.';
          if (res.status === 401 && typeof data.attemptsLeft === 'number' && data.attemptsLeft <= 2) {
            msg += ' Nog ' + data.attemptsLeft + (data.attemptsLeft === 1 ? ' poging' : ' pogingen') + ' over.';
          }
          show(msg);
          pass.value = '';
          pass.focus();
        } catch (x) {
          show('Geen verbinding, probeer het opnieuw.');
        } finally {
          if (!reload) {
            go.disabled = false;
            demo.disabled = false;
            go.textContent = 'Inloggen';
          }
        }
      });

      demo.addEventListener('click', async function () {
        show('');
        demo.disabled = true;
        go.disabled = true;
        try {
          var res = await fetch('/api/demo-login', { method: 'POST' });
          if (res.ok) {
            savePrivacy();
            location.reload();
            return;
          }
        } catch (x) {}
        demo.disabled = false;
        go.disabled = false;
        show('Demo-login is nu niet beschikbaar, probeer het later opnieuw.');
      });
    })();
  </script>
</body>
</html>`;
}

export default async function middleware(request: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return new Response('SESSION_SECRET ontbreekt in de environment variables.', { status: 500 });
  }

  const token = parseCookie(request.headers.get('cookie'), AUTH_COOKIE);
  if (await readSession(secret, token)) {
    return undefined; // doorlaten naar de rest van de site (echt of demo-account)
  }

  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  return new Response(loginPage(nonce), {
    status: 401,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy':
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; ` +
        `connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    },
  });
}
