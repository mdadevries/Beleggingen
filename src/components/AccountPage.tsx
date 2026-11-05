import React, { useCallback, useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { KeyRound, ScanFace, Bell, Smartphone, Trash2, Check, Mail, Eye, EyeOff, Download, Share } from 'lucide-react';
import { Card } from './Card.tsx';
import { PageHeader, Pill } from './ui.tsx';
import { formatDate } from '../utils/portfolio.ts';

interface Status {
  mail: boolean;
  email: string | null;
  loginAlerts: boolean;
  passwordChangedAt: string | null;
  passkeys: { id: string; name: string; createdAt: string; lastUsed: string | null }[];
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

declare global {
  interface Window {
    __installPrompt?: InstallPromptEvent | null;
  }
}

const post = async (action: string, body: unknown = {}) => {
  const r = await fetch(`/api/account?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Er ging iets mis.');
  return d;
};

const dateOf = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : 'nog nooit');

export const AccountPage: React.FC<{ isDemo: boolean }> = ({ isDemo }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (isDemo) return;
    fetch('/api/account?action=status')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setStatus)
      .catch(() => setLoadError('Accountgegevens konden niet geladen worden.'));
  }, [isDemo]);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader emoji="👤" title="Account" subtitle="Inloggen, beveiliging en de app op je telefoon." />
      {isDemo && (
        <Card>
          <p className="text-sm">In het demo-account kun je geen wachtwoord of Face ID instellen. Log in met je eigen account om dit te gebruiken.</p>
        </Card>
      )}
      {loadError && (
        <Card>
          <p className="text-sm text-[rgb(var(--status-critical))]">{loadError}</p>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        {!isDemo && <FaceIdCard status={status} onChange={load} />}
        <InstallCard />
        {!isDemo && <PasswordCard status={status} onChange={load} />}
        {!isDemo && <AlertsCard status={status} onChange={load} />}
      </div>
    </>
  );
};

/* ---------- Face ID ---------- */

const FaceIdCard: React.FC<{ status: Status | null; onChange: () => void }> = ({ status, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const supported = typeof window !== 'undefined' && !!window.PublicKeyCredential;

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const options = await post('passkey-register-options');
      const response = await startRegistration({ optionsJSON: options });
      const r = await post('passkey-register-verify', { response });
      setMsg({ ok: true, text: `Gelukt! Vanaf nu log je op dit apparaat in met Face ID (${r.name}).` });
      onChange();
    } catch (e) {
      const name = (e as { name?: string }).name;
      setMsg({
        ok: false,
        text: name === 'NotAllowedError' ? 'Geannuleerd.' : name === 'InvalidStateError' ? 'Dit apparaat is al ingesteld.' : (e as Error).message,
      });
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    if (!confirm('Face ID voor dit apparaat verwijderen?')) return;
    await post('passkey-delete', { id }).catch(() => undefined);
    onChange();
  };

  return (
    <section className="rounded-2xl overflow-hidden border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="p-5 text-white bg-gradient-to-br from-[#2a78d6] to-[#8b5cf6]">
        <ScanFace className="w-8 h-8" aria-hidden="true" />
        <h2 className="text-lg font-extrabold text-white mt-2">Inloggen met Face ID</h2>
        <p className="text-sm text-white/85 mt-1">Nooit meer je wachtwoord typen: even naar je telefoon kijken en je bent binnen. Werkt ook met Touch ID op je Mac.</p>
      </div>
      <div className="p-5 space-y-3">
        {!supported ? (
          <p className="text-sm text-[rgb(var(--text-muted))]">Deze browser ondersteunt dit niet.</p>
        ) : (
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text-primary))] text-[rgb(var(--surface))] px-4 py-3 text-sm font-bold disabled:opacity-50"
          >
            <ScanFace className="w-4 h-4" aria-hidden="true" /> {busy ? 'Even geduld…' : 'Face ID instellen op dit apparaat'}
          </button>
        )}
        {msg && <p className={`text-sm ${msg.ok ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>{msg.text}</p>}
        {status && status.passkeys.length > 0 && (
          <ul className="divide-y divide-[rgb(var(--border))]">
            {status.passkeys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 py-2.5">
                <Smartphone className="w-4 h-4 text-[rgb(var(--text-muted))]" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[rgb(var(--text-primary))] truncate">{k.name}</p>
                  <p className="text-xs text-[rgb(var(--text-muted))]">
                    Ingesteld {dateOf(k.createdAt)} · laatst gebruikt {dateOf(k.lastUsed)}
                  </p>
                </div>
                <button type="button" onClick={() => remove(k.id)} className="p-2 rounded-lg hover:bg-[rgb(var(--surface-sunken))] text-[rgb(var(--text-muted))]" aria-label={`Verwijder ${k.name}`}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-[rgb(var(--text-muted))]">
          Stel het in op elk apparaat waarmee je inlogt. Je gezicht of vingerafdruk verlaat je apparaat nooit; de site krijgt alleen een digitale sleutel.
        </p>
      </div>
    </section>
  );
};

/* ---------- App installeren ---------- */

const InstallCard: React.FC = () => {
  const standalone =
    typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(() => window.__installPrompt ?? null);

  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      window.__installPrompt = e as InstallPromptEvent;
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  return (
    <Card title="De app op je telefoon" subtitle="Eigen icoon op je beginscherm, opent zonder adresbalk, net als een echte app.">
      {standalone ? (
        <p className="text-sm flex items-center gap-2 text-[rgb(var(--status-good))] font-semibold">
          <Check className="w-4 h-4" aria-hidden="true" /> Je gebruikt de app nu al. Lekker bezig.
        </p>
      ) : prompt ? (
        <button
          type="button"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice.catch(() => undefined);
            window.__installPrompt = null;
            setPrompt(null);
          }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[rgb(var(--series-1))] text-white px-4 py-3 text-sm font-bold"
        >
          <Download className="w-4 h-4" aria-hidden="true" /> Installeer de app
        </button>
      ) : (
        <ol className="space-y-2.5 text-sm">
          {ios ? (
            <>
              <li className="flex gap-2">
                <Step n={1} /><span>Open deze site in <b>Safari</b>.</span>
              </li>
              <li className="flex gap-2">
                <Step n={2} /><span>Tik op <Share className="w-4 h-4 inline -mt-0.5" aria-label="deelknop" /> <b>Deel</b> onderin.</span>
              </li>
              <li className="flex gap-2">
                <Step n={3} /><span>Kies <b>Zet op beginscherm</b> en tik op <b>Voeg toe</b>.</span>
              </li>
            </>
          ) : (
            <>
              <li className="flex gap-2">
                <Step n={1} /><span>iPhone: Safari → <b>Deel</b> → <b>Zet op beginscherm</b>.</span>
              </li>
              <li className="flex gap-2">
                <Step n={2} /><span>Android: Chrome → menu (⋮) → <b>App installeren</b>.</span>
              </li>
              <li className="flex gap-2">
                <Step n={3} /><span>Mac/pc: in Chrome het installeer-icoontje rechts in de adresbalk.</span>
              </li>
            </>
          )}
        </ol>
      )}
      <p className="mt-3 text-xs text-[rgb(var(--text-muted))]">De app heeft een eigen login: log er één keer in, en zet daarna meteen Face ID aan.</p>
    </Card>
  );
};

const Step: React.FC<{ n: number }> = ({ n }) => (
  <span className="shrink-0 w-5 h-5 rounded-full bg-[rgb(var(--series-1))]/12 text-[rgb(var(--accent-text))] text-[11px] font-bold flex items-center justify-center">{n}</span>
);

/* ---------- Wachtwoord ---------- */

function strength(pw: string) {
  if (!pw) return -1;
  if (pw.length < 12) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let s = 1;
  if (pw.length >= 16) s++;
  if (kinds >= 3) s++;
  if (pw.length >= 20 || (kinds === 4 && pw.length >= 14)) s++;
  return Math.min(3, s);
}
const S_COLORS = ['#d03b3b', '#eb6834', '#eda100', '#1baf7a'];
const S_LABELS = ['Te kort', 'Matig', 'Goed', 'Sterk'];

const PasswordCard: React.FC<{ status: Status | null; onChange: () => void }> = ({ status, onChange }) => {
  const [cur, setCur] = useState('');
  const [n1, setN1] = useState('');
  const [n2, setN2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const s = strength(n1);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (n1.length < 12) return setMsg({ ok: false, text: 'Kies minstens 12 tekens.' });
    if (n1 !== n2) return setMsg({ ok: false, text: 'De twee nieuwe wachtwoorden zijn niet hetzelfde.' });
    setBusy(true);
    try {
      await post('change-password', { current: cur, next: n1 });
      setMsg({ ok: true, text: 'Je nieuwe wachtwoord is opgeslagen.' });
      setCur('');
      setN1('');
      setN2('');
      onChange();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
    setBusy(false);
  };

  const field = 'w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-[16px] sm:text-sm text-[rgb(var(--text-primary))] focus:outline-none focus:border-[rgb(var(--series-1))]';
  return (
    <Card
      title="Wachtwoord wijzigen"
      subtitle={status?.passwordChangedAt ? `Laatst gewijzigd op ${dateOf(status.passwordChangedAt)}` : 'Nu nog het wachtwoord uit Vercel'}
      action={<KeyRound className="w-5 h-5 text-[rgb(var(--text-muted))]" aria-hidden="true" />}
    >
      <form onSubmit={submit} className="space-y-3">
        <input type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Huidig wachtwoord" value={cur} onChange={(e) => setCur(e.target.value)} className={field} aria-label="Huidig wachtwoord" />
        <input type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Nieuw wachtwoord (min. 12 tekens)" value={n1} onChange={(e) => setN1(e.target.value)} className={field} aria-label="Nieuw wachtwoord" />
        <div className="grid grid-cols-4 gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-1 rounded-full" style={{ background: s >= 0 && i <= s ? S_COLORS[s] : 'rgb(var(--border))' }} />
          ))}
        </div>
        {s >= 0 && <p className="text-xs text-[rgb(var(--text-muted))] -mt-1">{n1.length < 12 ? `Nog ${12 - n1.length} tekens` : S_LABELS[s]}</p>}
        <input type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Herhaal nieuw wachtwoord" value={n2} onChange={(e) => setN2(e.target.value)} className={field} aria-label="Herhaal nieuw wachtwoord" />
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--text-muted))]">
            {show ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />} {show ? 'Verberg' : 'Toon'}
          </button>
          <button type="submit" disabled={busy || !cur || !n1} className="rounded-xl bg-[rgb(var(--text-primary))] text-[rgb(var(--surface))] px-4 py-2.5 text-sm font-bold disabled:opacity-40">
            {busy ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>{msg.text}</p>}
      </form>
    </Card>
  );
};

/* ---------- Mail & meldingen ---------- */

const AlertsCard: React.FC<{ status: Status | null; onChange: () => void }> = ({ status, onChange }) => {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!status) return <Card title="Mail en meldingen"><p className="text-sm text-[rgb(var(--text-muted))]">Laden…</p></Card>;

  return (
    <Card title="Mail en meldingen" subtitle="Voor je resetlink en een seintje bij elke nieuwe login." action={<Bell className="w-5 h-5 text-[rgb(var(--text-muted))]" aria-hidden="true" />}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="w-4 h-4 text-[rgb(var(--text-muted))] shrink-0" aria-hidden="true" />
            <span className="text-sm truncate">{status.email ?? 'Geen mailadres ingesteld'}</span>
          </div>
          {status.mail ? <Pill tone="good">Mail werkt</Pill> : <Pill tone="bad">Nog niet ingesteld</Pill>}
        </div>

        {!status.mail && (
          <div className="rounded-xl border border-[rgb(var(--banner-border))] bg-[rgb(var(--banner-bg))] p-3 text-xs text-[rgb(var(--banner-text))] space-y-1">
            <p className="font-bold">Zo zet je mail aan (2 minuten):</p>
            <p>1. Maak een gratis account op resend.com met je eigen Gmail-adres.</p>
            <p>2. Maak daar een API key aan.</p>
            <p>3. Zet in Vercel: <code>RESEND_API_KEY</code> = die sleutel, <code>ALERT_EMAIL</code> = je Gmail-adres. Daarna Redeploy.</p>
          </div>
        )}

        <label className={`flex items-center justify-between gap-3 ${status.mail ? '' : 'opacity-50'}`}>
          <span>
            <span className="block text-sm font-semibold text-[rgb(var(--text-primary))]">Mail bij een nieuwe login</span>
            <span className="block text-xs text-[rgb(var(--text-muted))]">Met tijd, apparaat en plek, zodat je meteen ziet als iemand anders inlogt.</span>
          </span>
          <input
            type="checkbox"
            className="w-5 h-5 accent-[#2a78d6] shrink-0"
            disabled={!status.mail}
            checked={status.loginAlerts}
            onChange={async (e) => {
              await post('settings', { loginAlerts: e.target.checked }).catch(() => undefined);
              onChange();
            }}
          />
        </label>

        <button
          type="button"
          disabled={!status.mail || busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await post('test-mail');
              setMsg({ ok: true, text: 'Verstuurd! Check je inbox.' });
            } catch (e) {
              setMsg({ ok: false, text: (e as Error).message });
            }
            setBusy(false);
          }}
          className="rounded-xl border border-[rgb(var(--border))] px-3 py-2 text-xs font-semibold hover:bg-[rgb(var(--surface-sunken))] disabled:opacity-40"
        >
          {busy ? 'Versturen…' : 'Stuur een testmail'}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>{msg.text}</p>}
      </div>
    </Card>
  );
};
