import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Chat met je portefeuille (Gemini). Alleen voor de echte sessie; de demo antwoordt in de browser.
//
// Privacy, net als het weekrapport: de AI krijgt standaard ALLEEN tickers, namen, koersen,
// percentages en data. Aantallen stuks en bedragen gaan alleen mee als je in de chat zelf het
// vinkje "Bedragen delen" aanzet (shareAmounts: true). De portefeuille wordt hier op de server
// uit de database gelezen; de browser stuurt alleen je vragen mee.
//
// Instellen in Vercel: GEMINI_API_KEY (zelfde sleutel als in n8n, uit aistudio.google.com/apikey).
// Optioneel GEMINI_MODEL (standaard hetzelfde model als het weekrapport).
//
// Bewust zelfstandig (geen import uit een ander /api-bestand): Vercel compileert elk bestand los.
// Houd de auth-constanten gelijk aan middleware.ts en de andere /api-bestanden.

const AUTH_COOKIE = '__Host-beleggingen_session';
const SESSION_PREFIX = 'v2';
const CACHE_PREFIX = 'quote:v1:';
const USAGE_PREFIX = 'chat-usage:v1:';
const DEFAULT_MODEL = 'gemini-3.8-flash';
const MAX_PER_DAY = 200;
const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readSession(secret: string, token: string | null): 'real' | 'demo' | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== SESSION_PREFIX) return null;
  const [prefix, role, exp, nonce, sig] = parts;
  if (role !== 'real' && role !== 'demo') return null;
  if (!/^\d{1,12}$/.test(exp)) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${prefix}.${role}.${exp}.${nonce}`).digest('hex');
  if (!timingSafeEqual(sig, expected)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return role;
}

type Db = (path: string, init?: { method?: string; body?: unknown; prefer?: string }) => Promise<any>;

function getDb(): Db {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Database niet geconfigureerd.');
  const base = url.replace(/\/$/, '') + '/rest/v1';
  return async (path, init = {}) => {
    const r = await fetch(base + path, {
      method: init.method ?? 'GET',
      headers: {
        apikey: key,
        ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
        'Content-Type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => `${v >= 0 ? '+' : ''}${r1(v * 100)}%`;

function isEtfName(ticker: string, name: string): boolean {
  return /\betf\b|ucits|ishares|vanguard|spdr|xtrackers|amundi|lyxor|invesco|wisdomtree|vaneck|index ?fund|tracker|s&p ?500|msci|ftse|all-?world|stoxx/i.test(
    `${ticker} ${name}`
  );
}

/** Zet de portefeuille om in een compacte tekst voor de AI (zelfde rekenwijze als de site). */
async function buildContext(db: Db, shareAmounts: boolean): Promise<string> {
  const [stockRows, txRows, cacheRows] = await Promise.all([
    db('/stocks?select=ticker,name,current_price'),
    db('/transactions?select=date,ticker,type,quantity,price&order=date.asc,id.asc'),
    db(`/quote_cache?select=key,body&key=like.${encodeURIComponent(CACHE_PREFIX + '*')}`).catch(() => []),
  ]);
  const quotes: Record<string, any> = {};
  for (const r of cacheRows ?? []) if (typeof r?.key === 'string') quotes[r.key.slice(CACHE_PREFIX.length)] = r.body?.quote;

  const stocks = (stockRows ?? []).map((r: any) => {
    const q = quotes[r.ticker];
    return {
      ticker: String(r.ticker),
      name: String(r.name),
      price: typeof q?.price === 'number' ? q.price : Number(r.current_price),
      live: typeof q?.price === 'number',
      changePct: typeof q?.changePct === 'number' ? q.changePct : null,
      range52: q?.range52 ?? null,
      etf: isEtfName(String(r.ticker), String(r.name)),
    };
  });
  const txs = (txRows ?? []).map((r: any) => ({ date: String(r.date), ticker: String(r.ticker), type: String(r.type), quantity: Number(r.quantity), price: Number(r.price) }));

  const rows = stocks.map((s: any) => {
    let shares = 0;
    let cost = 0;
    let avg = 0;
    let realized = 0;
    let buys = 0;
    let first: string | null = null;
    for (const t of txs.filter((t: any) => t.ticker === s.ticker)) {
      if (t.type === 'Kopen') {
        cost += t.quantity * t.price;
        shares += t.quantity;
        avg = shares > 0 ? cost / shares : 0;
        buys++;
        first = first ?? t.date;
      } else {
        realized += t.quantity * (t.price - avg);
        shares -= t.quantity;
        cost = shares > 0 ? shares * avg : 0;
      }
    }
    return { ...s, shares, cost, avg, realized, value: Math.max(0, shares) * s.price, buys, first };
  });
  const held = rows.filter((r: any) => r.shares > 1e-9).sort((a: any, b: any) => b.value - a.value);
  const total = held.reduce((s: number, r: any) => s + r.value, 0);
  const invested = held.reduce((s: number, r: any) => s + r.cost, 0);
  const nameOf = (t: string) => stocks.find((s: any) => s.ticker === t)?.name ?? t;

  const lines: string[] = [];
  lines.push(`Vandaag: ${new Date().toISOString().slice(0, 10)}. Alle koersen in euro's.`);
  lines.push(`Totaal rendement op huidige posities: ${invested > 0 ? pct(total / invested - 1) : 'onbekend'}. Aantal posities: ${held.length}.`);
  if (shareAmounts) lines.push(`Totale waarde: €${Math.round(total)}. Ingelegd (kostenbasis): €${Math.round(invested)}. Resultaat: €${Math.round(total - invested)}.`);
  lines.push('');
  lines.push('POSITIES (grootste eerst):');
  for (const r of held) {
    const parts = [
      `${r.name} (${r.ticker}${r.etf ? ', ETF' : ''})`,
      `aandeel in portefeuille ${r1((r.value / Math.max(1, total)) * 100)}%`,
      `rendement ${r.cost > 0 ? pct(r.value / r.cost - 1) : 'onbekend'}`,
      `gem. aankoopkoers €${r2(r.avg)}`,
      `koers nu €${r2(r.price)}${r.live ? '' : ' (laatste transactieprijs, geen live koers)'}`,
    ];
    if (r.changePct !== null) parts.push(`vandaag ${pct(r.changePct)}`);
    if (r.range52?.low && r.range52?.high) parts.push(`52-weken €${r2(r.range52.low)}–€${r2(r.range52.high)}`);
    parts.push(`${r.buys}× gekocht, eerste keer ${r.first ?? '?'}`);
    if (shareAmounts) parts.push(`${r2(r.shares)} stuks, waarde €${Math.round(r.value)}, gerealiseerd €${Math.round(r.realized)}`);
    lines.push('- ' + parts.join('; '));
  }
  const sold = rows.filter((r: any) => r.shares <= 1e-9 && r.buys > 0);
  if (sold.length) {
    lines.push('');
    lines.push('HELEMAAL VERKOCHT: ' + sold.map((r: any) => `${r.name} (${r.ticker})`).join(', '));
  }
  lines.push('');
  lines.push(`TRANSACTIES (${txs.length}, oud naar nieuw):`);
  for (const t of txs.slice(-150)) {
    lines.push(
      `- ${t.date} ${t.type} ${nameOf(t.ticker)} (${t.ticker}) koers €${r2(t.price)}` + (shareAmounts ? `, ${r2(t.quantity)} stuks = €${Math.round(t.quantity * t.price)}` : '')
    );
  }
  if (txs.length > 150) lines.push(`(oudere ${txs.length - 150} transacties weggelaten)`);
  return lines.join('\n');
}

const SYSTEM = (context: string, shareAmounts: boolean) => `Je bent de assistent in iemands persoonlijke beleggingsdashboard. Je praat Nederlands, casual en direct, in gewone taal (geen jargon zonder uitleg). Kort waar het kan, uitgebreid als erom gevraagd wordt.

Regels:
- Gebruik voor uitspraken over de portefeuille ALLEEN de gegevens hieronder. Staat iets er niet in, zeg dat eerlijk.
- Geen persoonlijk koop- of verkoopadvies en geen koersvoorspellingen. Je mag wel uitleggen, vergelijken, risico's benoemen, vragen stellen om over na te denken en beschrijven wat bedrijven doen.
- Algemene kennis over bedrijven en beleggen mag, maar zeg erbij dat cijfers van na je kennisdatum kunnen afwijken.
- ${shareAmounts ? 'Je mag bedragen noemen.' : 'Je ziet geen bedragen of aantallen (de gebruiker deelt ze niet). Noem dus ook geen eurobedragen van de portefeuille; werk met percentages.'}
- Gebruik markdown: **vet**, lijstjes met "- ", korte kopjes met "### " als het helpt. Geen tabellen.

PORTEFEUILLE:
${context}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Methode niet toegestaan.' });
    return;
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret || readSession(secret, parseCookie(req.headers.cookie, AUTH_COOKIE)) !== 'real') {
    res.status(401).json({ error: 'Niet ingelogd.' });
    return;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(503).json({ error: 'De chat staat nog uit: zet GEMINI_API_KEY in Vercel (Settings → Environment Variables) en deploy opnieuw.', code: 'no-key' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) ?? {};
  const shareAmounts = body.shareAmounts === true;
  const raw: any[] = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const messages = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.text).slice(0, MAX_CHARS) }] }));
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    res.status(400).json({ error: 'Geen vraag ontvangen.' });
    return;
  }

  let db: Db;
  try {
    db = getDb();
  } catch {
    res.status(500).json({ error: 'Database niet geconfigureerd.' });
    return;
  }

  // Simpel daglimiet, zodat een vastgelopen pagina nooit je hele gratis tegoed opeet.
  const today = new Date().toISOString().slice(0, 10);
  const usageKey = USAGE_PREFIX + today;
  const usageRows: any[] = (await db(`/quote_cache?select=body&key=eq.${encodeURIComponent(usageKey)}`).catch(() => null)) ?? [];
  const used = Number(usageRows[0]?.body?.count ?? 0);
  if (used >= MAX_PER_DAY) {
    res.status(429).json({ error: `Daglimiet van ${MAX_PER_DAY} vragen bereikt. Morgen weer!` });
    return;
  }

  try {
    const context = await buildContext(db, shareAmounts);
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM(context, shareAmounts) }] },
        contents: messages,
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(50_000),
    });
    const data: any = await r.json().catch(() => null);
    await db('/quote_cache?on_conflict=key', {
      method: 'POST',
      body: [{ key: usageKey, body: { count: used + 1 }, expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString() }],
      prefer: 'resolution=merge-duplicates',
    }).catch(() => undefined);
    if (!r.ok) {
      console.log(`[chat] Gemini ${r.status}: ${JSON.stringify(data)?.slice(0, 300)}`);
      res.status(502).json({ error: r.status === 429 ? 'De AI is even druk (limiet van de gratis laag). Probeer het zo nog eens.' : 'De AI gaf een fout. Probeer het zo nog eens.' });
      return;
    }
    const text = ((data?.candidates?.[0]?.content?.parts ?? []) as any[])
      .filter((p) => typeof p?.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('')
      .trim();
    if (!text) {
      res.status(502).json({ error: 'De AI gaf geen antwoord. Probeer je vraag anders te stellen.' });
      return;
    }
    res.status(200).json({ text, model });
  } catch (e) {
    console.log(`[chat] fout: ${e instanceof Error ? e.message : 'onbekend'}`);
    res.status(500).json({ error: 'Er ging iets mis. Probeer het zo nog eens.' });
  }
}
