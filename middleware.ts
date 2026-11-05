// Vercel Edge Middleware: beschermt de hele site met een login (gebruikersnaam +
// wachtwoord), want er staat eigen (financiële) beleggingsdata in. /api/* loopt er
// niet doorheen — die routes hebben hun eigen auth (login zelf, x-api-key voor n8n).

// Uitgezonderd: /api (eigen auth) en de bestanden die je telefoon nodig heeft om de site als app te
// installeren (manifest, service worker, iconen). Daar staat niets persoonlijks in, en de telefoon
// vraagt ze op zonder je login-cookie.
export const config = {
  matcher: '/((?!api/|manifest\\.webmanifest|sw\\.js|icons/).*)',
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

// ---------- Inlog- en resetpagina (zonder React, strikte CSP met nonce) ----------

function head(nonce: string, title: string): string {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>${title}</title>
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Beleggingen" />
<meta name="theme-color" content="#0f0f11" />
<style nonce="${nonce}">
  :root {
    color-scheme: light;
    --bg: #f4f4f6; --card: rgba(255,255,255,0.86); --text: #111827; --sub: #6b7280; --border: rgba(17,24,39,0.09);
    --field: #ffffff; --btn-bg: #111827; --btn-fg: #ffffff; --hover: rgba(17,24,39,0.04); --secondary: #374151;
    --error: #c0362c; --good: #047857; --accent: #2a78d6; --accent-soft: rgba(42,120,214,0.10);
    --blob1: rgba(42,120,214,0.35); --blob2: rgba(139,92,246,0.30); --blob3: rgba(219,39,119,0.18);
  }
  :root[data-theme='dark'] {
    color-scheme: dark;
    --bg: #0b0b0e; --card: rgba(24,24,28,0.82); --text: #f4f4f5; --sub: #9a9aa3; --border: rgba(255,255,255,0.09);
    --field: rgba(255,255,255,0.04); --btn-bg: #f4f4f5; --btn-fg: #111827; --hover: rgba(255,255,255,0.05); --secondary: #d4d4d8;
    --error: #f87171; --good: #34d399; --accent: #60a5fa; --accent-soft: rgba(96,165,250,0.12);
    --blob1: rgba(42,120,214,0.35); --blob2: rgba(139,92,246,0.32); --blob3: rgba(219,39,119,0.20);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg); font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--text);
    padding: max(20px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom)); overflow-x: hidden; position: relative;
    -webkit-font-smoothing: antialiased;
  }
  .blob { position: fixed; border-radius: 50%; filter: blur(70px); pointer-events: none; animation: float 14s ease-in-out infinite; }
  .b1 { width: 420px; height: 420px; background: var(--blob1); top: -140px; left: -120px; }
  .b2 { width: 380px; height: 380px; background: var(--blob2); bottom: -140px; right: -100px; animation-delay: -5s; }
  .b3 { width: 260px; height: 260px; background: var(--blob3); top: 40%; left: 55%; animation-delay: -9s; }
  @keyframes float { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-24px) scale(1.08); } }
  @media (prefers-reduced-motion: reduce) { .blob { animation: none; } .view { animation: none !important; } }
  .card {
    position: relative; width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--border);
    border-radius: 24px; padding: 30px 26px 24px; backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
    box-shadow: 0 20px 60px -20px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.04);
  }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .logo { width: 44px; height: 44px; border-radius: 13px; background: linear-gradient(135deg,#2a78d6,#8b5cf6); display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px -6px rgba(99,102,241,0.6); flex: none; }
  .logo svg { width: 24px; height: 24px; }
  h1 { font-size: 21px; margin: 0; letter-spacing: -0.02em; }
  p.sub { margin: 2px 0 0; font-size: 13px; color: var(--sub); }
  label.field { display: block; font-size: 12px; font-weight: 600; color: var(--secondary); margin: 0 0 6px; }
  input[type='text'], input[type='password'] {
    width: 100%; padding: 12px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--field);
    color: var(--text); font-size: 16px; margin-bottom: 14px; font-family: inherit; transition: border-color .15s, box-shadow .15s;
  }
  input:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
  .pw { position: relative; }
  .pw input { padding-right: 46px; }
  .eye { position: absolute; right: 3px; top: 0; height: 46px; width: 44px; border: none; background: transparent; color: var(--sub); cursor: pointer; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .eye:hover { color: var(--text); }
  .eye svg { width: 18px; height: 18px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: -4px 0 16px; }
  .switch, .link { white-space: nowrap; }
  .link { background: none; border: none; padding: 0; color: var(--accent); font-weight: 600; font-size: 13px; cursor: pointer; font-family: inherit; }
  .link:hover { text-decoration: underline; }
  .switch { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--secondary); cursor: pointer; user-select: none; }
  .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .track { width: 34px; height: 20px; border-radius: 999px; background: var(--border); position: relative; transition: background .2s; flex: none; }
  .track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .2s; }
  .switch input:checked + .track { background: var(--accent); }
  .switch input:checked + .track::after { transform: translateX(14px); }
  .switch input:focus-visible + .track { box-shadow: 0 0 0 3px var(--accent-soft); }
  .btn {
    width: 100%; padding: 13px; border-radius: 12px; border: none; font-size: 15px; font-weight: 650; cursor: pointer;
    min-height: 48px; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform .08s, opacity .15s;
  }
  .btn:active { transform: scale(0.985); }
  .btn svg { width: 20px; height: 20px; }
  .btn-primary { background: var(--btn-bg); color: var(--btn-fg); }
  .btn-face { background: linear-gradient(135deg,#2a78d6,#8b5cf6); color: #fff; box-shadow: 0 10px 24px -10px rgba(99,102,241,0.8); }
  .btn-secondary { background: transparent; color: var(--secondary); border: 1px solid var(--border); margin-top: 10px; }
  .btn-secondary:hover:not(:disabled) { background: var(--hover); }
  .btn:disabled { opacity: 0.55; cursor: default; }
  .btn:focus-visible, .eye:focus-visible, .link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .msg { font-size: 13px; margin: 0 0 12px; min-height: 18px; color: var(--error); }
  .msg.ok { color: var(--good); }
  .divider { display: flex; align-items: center; gap: 10px; margin: 16px 0; color: var(--sub); font-size: 12px; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .foot { margin-top: 18px; text-align: center; font-size: 11px; color: var(--sub); display: flex; align-items: center; justify-content: center; gap: 6px; }
  .foot svg { width: 12px; height: 12px; }
  .hidden { display: none !important; }
  .mt8 { margin-top: 8px; }
  .nolink { text-decoration: none; box-sizing: border-box; }
  .view { animation: in .35s cubic-bezier(.22,1,.36,1); }
  @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .note { font-size: 13px; color: var(--secondary); line-height: 1.55; margin: 0 0 16px; }
  .note code { font-size: 12px; background: var(--hover); padding: 1px 5px; border-radius: 6px; }
  .big-icon { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; background: var(--accent-soft); margin-bottom: 14px; }
  .meter { display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; margin: -6px 0 6px; }
  .meter span { height: 4px; border-radius: 4px; background: var(--border); transition: background .2s; }
  .meter-label { font-size: 12px; color: var(--sub); margin: 0 0 14px; min-height: 16px; }
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
</head>`;
}

const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16l5-5 3.5 3L20 7"/><path d="M15 7h5v5"/></svg>`;
const FACE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3H5a2 2 0 0 0-2 2v2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M17 21h2a2 2 0 0 0 2-2v-2"/><path d="M9 9v1"/><path d="M15 9v1"/><path d="M12 9v4h-1"/><path d="M9 16c1.6 1.2 4.4 1.2 6 0"/></svg>`;
const LOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
const EYE_ON = `<svg class="on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg class="off hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>`;

/** Gedeelde stukjes JavaScript: oogje bij wachtwoordvelden en de "vergeten"-aanvraag. */
const SHARED_JS = `
  function $(id) { return document.getElementById(id); }
  document.querySelectorAll('.eye').forEach(function (eye) {
    eye.addEventListener('click', function () {
      var input = eye.parentNode.querySelector('input');
      var visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      eye.setAttribute('aria-pressed', visible ? 'false' : 'true');
      eye.setAttribute('aria-label', visible ? 'Toon wachtwoord' : 'Verberg wachtwoord');
      eye.querySelector('.on').classList.toggle('hidden', !visible);
      eye.querySelector('.off').classList.toggle('hidden', visible);
      input.focus();
    });
  });
  async function requestReset(btn, msg, done) {
    btn.disabled = true; btn.textContent = 'Versturen…'; msg.textContent = ''; msg.className = 'msg';
    try {
      var res = await fetch('/api/account?action=reset-request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      var data = {}; try { data = await res.json(); } catch (x) {}
      if (res.ok && data.mail === false) {
        msg.textContent = 'Mail is nog niet ingesteld op de server (RESEND_API_KEY en ALERT_EMAIL in Vercel).';
        btn.disabled = false; btn.textContent = 'Stuur resetlink naar mijn mail';
        return;
      }
      done();
    } catch (x) {
      msg.textContent = 'Geen verbinding, probeer het opnieuw.';
      btn.disabled = false; btn.textContent = 'Stuur resetlink naar mijn mail';
    }
  }
`;

const FORGOT_VIEW = `
    <div id="forgot" class="view hidden">
      <div class="big-icon" aria-hidden="true">🔑</div>
      <h1>Wachtwoord vergeten?</h1>
      <p class="note mt8">Geen stress. Je krijgt een mail met een link om een nieuw wachtwoord te kiezen, plus je gebruikersnaam. De link werkt 30 minuten.</p>
      <p class="msg" id="fmsg" role="alert" aria-live="polite"></p>
      <button type="button" id="fsend" class="btn btn-primary">Stuur resetlink naar mijn mail</button>
      <button type="button" id="fback" class="btn btn-secondary">Terug naar inloggen</button>
    </div>
    <div id="sent" class="view hidden">
      <div class="big-icon" aria-hidden="true">📬</div>
      <h1>Check je mail</h1>
      <p class="note mt8">Als alles klopt staat er binnen een minuut een mail in je inbox (kijk ook even bij spam). Klik op de knop in de mail en kies een nieuw wachtwoord.</p>
      <button type="button" id="sback" class="btn btn-secondary">Terug naar inloggen</button>
    </div>`;

function loginPage(nonce: string): string {
  return `${head(nonce, 'Beleggingen — inloggen')}
<body>
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
  <main class="card">
    <div id="login" class="view">
      <div class="brand">
        <div class="logo">${LOGO_SVG}</div>
        <div>
          <h1>Welkom terug</h1>
          <p class="sub">Log in op je beleggingen</p>
        </div>
      </div>

      <p class="msg" id="err" role="alert" aria-live="polite"></p>

      <div id="faceBox" class="hidden">
        <button type="button" id="face" class="btn btn-face">${FACE_SVG}<span>Inloggen met Face ID</span></button>
        <div class="divider">of met je wachtwoord</div>
      </div>

      <form id="f" novalidate>
        <label class="field" for="u">Gebruikersnaam</label>
        <input id="u" name="username" type="text" autocomplete="username webauthn" autocapitalize="none"
          autocorrect="off" spellcheck="false" maxlength="200" required />

        <label class="field" for="p">Wachtwoord</label>
        <div class="pw">
          <input id="p" name="password" type="password" autocomplete="current-password" maxlength="1000" required />
          <button type="button" class="eye" aria-label="Toon wachtwoord" aria-pressed="false">${EYE_ON}${EYE_OFF}</button>
        </div>

        <div class="row">
          <label class="switch" for="anon" title="Verberg aantallen en bedragen direct na het inloggen">
            <input id="anon" type="checkbox" /><span class="track"></span>Anonieme modus
          </label>
          <button type="button" id="forgotLink" class="link">Wachtwoord vergeten?</button>
        </div>

        <button type="submit" id="go" class="btn btn-primary">Inloggen</button>
      </form>
      <button type="button" id="demoBtn" class="btn btn-secondary">Bekijk de demo</button>
      <p class="foot">${LOCK_SVG} Beveiligd · na 5 foute pogingen even op slot</p>
    </div>
    ${FORGOT_VIEW}
  </main>
  <script nonce="${nonce}">
    (function () {
      ${SHARED_JS}
      var PRIVACY_KEY = 'beleggingen_privacy';
      var form = $('f'), err = $('err'), user = $('u'), pass = $('p'), anon = $('anon'), go = $('go'), demo = $('demoBtn'), face = $('face');

      try { anon.checked = localStorage.getItem(PRIVACY_KEY) === '1'; } catch (e) {}
      function savePrivacy() { try { localStorage.setItem(PRIVACY_KEY, anon.checked ? '1' : '0'); } catch (e) {} }
      function show(msg) { err.textContent = msg || ''; }
      function busy(on) { go.disabled = on; demo.disabled = on; face.disabled = on; }
      function view(id) {
        ['login', 'forgot', 'sent'].forEach(function (v) { $(v).classList.toggle('hidden', v !== id); });
      }

      // Face ID-knop alleen tonen als dit apparaat het kan én er al een passkey is ingesteld.
      if (window.PublicKeyCredential) {
        fetch('/api/account?action=public-status').then(function (r) { return r.ok ? r.json() : {}; }).then(function (s) {
          if (s && s.passkeys) $('faceBox').classList.remove('hidden');
        }).catch(function () {});
      }
      setTimeout(function () { if ($('faceBox').classList.contains('hidden')) user.focus(); }, 50);

      function b64uToBuf(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s); var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
      function bufToB64u(b) { var u = new Uint8Array(b), s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); }

      face.addEventListener('click', async function () {
        show(''); busy(true);
        var label = face.querySelector('span'); label.textContent = 'Even kijken…';
        try {
          var r = await fetch('/api/account?action=passkey-login-options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
          var o = await r.json();
          if (!r.ok) throw new Error(o.error || 'Niet beschikbaar');
          var cred = await navigator.credentials.get({ publicKey: {
            challenge: b64uToBuf(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification,
            allowCredentials: (o.allowCredentials || []).map(function (c) { return { type: 'public-key', id: b64uToBuf(c.id), transports: c.transports }; })
          } });
          var resp = { id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment || undefined,
            clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
            response: { clientDataJSON: bufToB64u(cred.response.clientDataJSON), authenticatorData: bufToB64u(cred.response.authenticatorData),
              signature: bufToB64u(cred.response.signature), userHandle: cred.response.userHandle ? bufToB64u(cred.response.userHandle) : undefined } };
          var v = await fetch('/api/account?action=passkey-login-verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ response: resp }) });
          var d = {}; try { d = await v.json(); } catch (x) {}
          if (!v.ok) throw new Error(d.error || 'Face ID-login mislukt.');
          savePrivacy();
          location.reload();
          return;
        } catch (x) {
          var m = x && x.name === 'NotAllowedError' ? 'Geannuleerd. Probeer opnieuw of log in met je wachtwoord.' : (x && x.message) || 'Face ID-login mislukt.';
          show(m);
        }
        busy(false); label.textContent = 'Inloggen met Face ID';
      });

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        show('');
        if (!user.value.trim() || !pass.value) {
          show('Vul je gebruikersnaam en wachtwoord in.');
          (user.value.trim() ? pass : user).focus();
          return;
        }
        busy(true); go.textContent = 'Bezig…';
        var reload = false;
        try {
          var res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user.value, password: pass.value }) });
          var data = {}; try { data = await res.json(); } catch (x) {}
          if (res.ok) { savePrivacy(); reload = true; location.reload(); return; }
          var msg = data.error || 'Inloggen is mislukt, probeer het opnieuw.';
          if (res.status === 401 && typeof data.attemptsLeft === 'number' && data.attemptsLeft <= 2) {
            msg += ' Nog ' + data.attemptsLeft + (data.attemptsLeft === 1 ? ' poging' : ' pogingen') + ' over.';
          }
          show(msg); pass.value = ''; pass.focus();
        } catch (x) {
          show('Geen verbinding, probeer het opnieuw.');
        } finally {
          if (!reload) { busy(false); go.textContent = 'Inloggen'; }
        }
      });

      demo.addEventListener('click', async function () {
        show(''); busy(true);
        try {
          var res = await fetch('/api/demo-login', { method: 'POST' });
          if (res.ok) { savePrivacy(); location.reload(); return; }
        } catch (x) {}
        busy(false);
        show('Demo-login is nu niet beschikbaar, probeer het later opnieuw.');
      });

      $('forgotLink').addEventListener('click', function () { view('forgot'); });
      $('fback').addEventListener('click', function () { view('login'); });
      $('sback').addEventListener('click', function () { view('login'); });
      $('fsend').addEventListener('click', function () { requestReset($('fsend'), $('fmsg'), function () { view('sent'); }); });
    })();
  </script>
</body>
</html>`;
}

/** /reset: nieuw wachtwoord kiezen via de link uit de mail (token staat na het #, dus nooit in serverlogs). */
function resetPage(nonce: string): string {
  return `${head(nonce, 'Beleggingen — nieuw wachtwoord')}
<body>
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
  <main class="card">
    <form id="reset" class="view hidden" novalidate>
      <div class="brand">
        <div class="logo">${LOGO_SVG}</div>
        <div><h1>Nieuw wachtwoord</h1><p class="sub">Kies iets sterks dat je nergens anders gebruikt</p></div>
      </div>
      <p class="msg" id="rmsg" role="alert" aria-live="polite"></p>
      <label class="field" for="n1">Nieuw wachtwoord</label>
      <div class="pw">
        <input id="n1" type="password" autocomplete="new-password" maxlength="200" required />
        <button type="button" class="eye" aria-label="Toon wachtwoord" aria-pressed="false">${EYE_ON}${EYE_OFF}</button>
      </div>
      <div class="meter" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p class="meter-label" id="mlabel">Minstens 12 tekens. Tip: een zinnetje van 4 woorden is sterk én makkelijk te onthouden.</p>
      <label class="field" for="n2">Herhaal wachtwoord</label>
      <div class="pw">
        <input id="n2" type="password" autocomplete="new-password" maxlength="200" required />
        <button type="button" class="eye" aria-label="Toon wachtwoord" aria-pressed="false">${EYE_ON}${EYE_OFF}</button>
      </div>
      <button type="submit" id="save" class="btn btn-primary">Opslaan en inloggen</button>
    </form>
    <div id="done" class="view hidden">
      <div class="big-icon" aria-hidden="true">✅</div>
      <h1>Gelukt!</h1>
      <p class="note mt8">Je nieuwe wachtwoord is opgeslagen en je bent ingelogd. Tip: zet in je account ook Face ID aan, dan hoef je het bijna nooit meer te typen.</p>
      <a href="/#/account" class="btn btn-primary nolink">Naar mijn beleggingen</a>
    </div>
    <div id="login" class="view hidden">
      <div class="big-icon" aria-hidden="true">⏰</div>
      <h1>Geen geldige link</h1>
      <p class="note mt8">Deze pagina werkt met de link uit je resetmail. Vraag hieronder een nieuwe aan.</p>
      <button type="button" id="forgotLink" class="btn btn-primary">Nieuwe resetlink aanvragen</button>
      <a href="/" class="btn btn-secondary nolink">Naar inloggen</a>
    </div>
    ${FORGOT_VIEW}
  </main>
  <script nonce="${nonce}">
    (function () {
      ${SHARED_JS}
      function view(id) { ['reset', 'done', 'login', 'forgot', 'sent'].forEach(function (v) { $(v).classList.toggle('hidden', v !== id); }); }
      var m = /[#&]t=([A-Za-z0-9_-]+)/.exec(location.hash);
      var token = m ? m[1] : '';
      // Token meteen uit de adresbalk halen, zodat hij niet in je geschiedenis blijft staan.
      if (token) { try { history.replaceState(null, '', '/reset'); } catch (e) {} }
      view(token ? 'reset' : 'login');
      if (token) setTimeout(function () { $('n1').focus(); }, 50);

      var colors = ['#d03b3b', '#eb6834', '#eda100', '#1baf7a'];
      var labels = ['Te zwak', 'Matig', 'Goed', 'Sterk'];
      function score(pw) {
        if (!pw) return -1;
        var s = 0;
        if (pw.length >= 12) s++;
        if (pw.length >= 16) s++;
        var kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(function (r) { return r.test(pw); }).length;
        if (kinds >= 3) s++;
        if (pw.length >= 20 || (kinds === 4 && pw.length >= 14)) s++;
        if (pw.length < 12) s = 0;
        return Math.min(3, s);
      }
      $('n1').addEventListener('input', function () {
        var s = score($('n1').value);
        document.querySelectorAll('.meter span').forEach(function (el, i) { el.style.background = s >= 0 && i <= s ? colors[s] : ''; });
        $('mlabel').textContent = s < 0 ? 'Minstens 12 tekens.' : $('n1').value.length < 12 ? 'Nog ' + (12 - $('n1').value.length) + ' tekens te gaan.' : labels[s];
      });

      $('reset').addEventListener('submit', async function (e) {
        e.preventDefault();
        var msg = $('rmsg'); msg.textContent = '';
        var a = $('n1').value, b = $('n2').value;
        if (a.length < 12) { msg.textContent = 'Kies minstens 12 tekens.'; $('n1').focus(); return; }
        if (a !== b) { msg.textContent = 'De twee wachtwoorden zijn niet hetzelfde.'; $('n2').focus(); return; }
        var btn = $('save'); btn.disabled = true; btn.textContent = 'Opslaan…';
        try {
          var res = await fetch('/api/account?action=reset-confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token, password: a }) });
          var data = {}; try { data = await res.json(); } catch (x) {}
          if (res.ok) { view('done'); return; }
          msg.textContent = data.error || 'Opslaan mislukt.';
        } catch (x) { msg.textContent = 'Geen verbinding, probeer het opnieuw.'; }
        btn.disabled = false; btn.textContent = 'Opslaan en inloggen';
      });

      $('forgotLink').addEventListener('click', function () { view('forgot'); });
      $('fback').addEventListener('click', function () { location.href = '/'; });
      $('sback').addEventListener('click', function () { location.href = '/'; });
      $('fsend').addEventListener('click', function () { requestReset($('fsend'), $('fmsg'), function () { view('sent'); }); });
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

  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const isReset = new URL(request.url).pathname === '/reset';

  const token = parseCookie(request.headers.get('cookie'), AUTH_COOKIE);
  if (!isReset && (await readSession(secret, token))) {
    return undefined; // doorlaten naar de rest van de site (echt of demo-account)
  }

  // /reset is altijd bereikbaar (ook ingelogd): daar kies je een nieuw wachtwoord via de link uit je mail.
  return new Response(isReset ? resetPage(nonce) : loginPage(nonce), {
    status: isReset ? 200 : 401,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy':
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; ` +
        `connect-src 'self'; img-src 'self' data:; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    },
  });
}
