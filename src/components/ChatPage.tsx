import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, Trash2, Lock, Unlock } from 'lucide-react';
import { StockPosition } from '../data/types.ts';
import { PageHeader } from './ui.tsx';
import { shortName } from '../utils/names.ts';
import { formatPercent } from '../utils/portfolio.ts';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
}

interface Props {
  isDemo: boolean;
  positions: StockPosition[];
}

export const CHAT_PREFILL_KEY = 'beleggingen_chat_prefill';
/** Seintje dat er een nieuwe klaargezette vraag is (als de chat al open staat). */
export const CHAT_ASK_EVENT = 'beleggingen:chat-ask';
const HISTORY_KEY = 'beleggingen_chat';
const SHARE_KEY = 'beleggingen_chat_amounts';

const SUGGESTIONS = [
  'Wat was mijn beste koop tot nu toe?',
  'Hoe gespreid ben ik eigenlijk?',
  'Welk aandeel heeft het meeste risico?',
  'Leg mijn grootste positie uit alsof ik 15 ben',
  'Wat zijn de zwakke plekken van mijn portefeuille?',
  'Welke vragen zou ik mezelf moeten stellen voor ik bijkoop?',
];

function readJson<T>(key: string, store: Storage, fallback: T): T {
  try {
    const v = store.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const ChatPage: React.FC<Props> = ({ isDemo, positions }) => {
  const [messages, setMessages] = useState<Msg[]>(() => readJson<Msg[]>(HISTORY_KEY, sessionStorage, []));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<boolean>(() => readJson<boolean>(SHARE_KEY, localStorage, false));
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* negeren */
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  useEffect(() => {
    try {
      localStorage.setItem(SHARE_KEY, JSON.stringify(share));
    } catch {
      /* negeren */
    }
  }, [share]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages.filter((m) => !m.error), { role: 'user', text: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      if (isDemo) {
        await new Promise((r) => setTimeout(r, 700));
        setMessages([...next, { role: 'assistant', text: demoAnswer(q, positions) }]);
        return;
      }
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, text: m.text })), shareAmounts: share }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.text) throw new Error(data.error || 'Er ging iets mis.');
      setMessages([...next, { role: 'assistant', text: data.text }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', text: e instanceof Error ? e.message : 'Er ging iets mis.', error: true }]);
    } finally {
      setBusy(false);
    }
  };

  // Vraag klaargezet vanaf een andere pagina (bijvoorbeeld "Vraag de AI over TSMC").
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const takePrefill = () => {
      try {
        const pre = sessionStorage.getItem(CHAT_PREFILL_KEY);
        if (pre) {
          sessionStorage.removeItem(CHAT_PREFILL_KEY);
          sendRef.current(pre);
        }
      } catch {
        /* negeren */
      }
    };
    if (!started.current) {
      started.current = true;
      takePrefill();
    }
    window.addEventListener(CHAT_ASK_EVENT, takePrefill);
    return () => window.removeEventListener(CHAT_ASK_EVENT, takePrefill);
  }, []);

  return (
    <>
      <PageHeader
        emoji="💬"
        title="Vraag het je portefeuille"
        subtitle="Een AI die je posities en transacties kent. Stel gewoon je vraag, in je eigen woorden."
        action={
          messages.length > 0 ? (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-semibold hover:bg-[rgb(var(--surface-sunken))]"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Nieuw gesprek
            </button>
          ) : undefined
        }
      />

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] flex flex-col min-h-[60vh]">
        <div className="flex-1 p-4 sm:p-6 space-y-4 overflow-y-auto" aria-live="polite">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2a78d6] to-[#8b5cf6] flex items-center justify-center text-white shadow-lg">
                <Bot className="w-7 h-7" aria-hidden="true" />
              </div>
              <p className="mt-3 font-bold text-[rgb(var(--text-primary))]">Waar ben je benieuwd naar?</p>
              <p className="text-sm text-[rgb(var(--text-muted))] mt-1">Een paar ideeën om mee te beginnen:</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium hover:bg-[rgb(var(--surface-sunken))] text-[rgb(var(--text-secondary))]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[rgb(var(--series-1))] text-white rounded-br-md'
                    : m.error
                      ? 'bg-red-500/10 text-[rgb(var(--status-critical))] rounded-bl-md'
                      : 'bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] text-[rgb(var(--text-secondary))] rounded-bl-md'
                }`}
              >
                {m.role === 'user' ? m.text : <Markdown text={m.text} />}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] px-4 py-3 flex gap-1" aria-label="De AI denkt na">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="typing-dot w-1.5 h-1.5 rounded-full bg-[rgb(var(--text-muted))]" style={{ animationDelay: `${k * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="border-t border-[rgb(var(--border))] p-3 sm:p-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Vraag iets over je beleggingen…"
              className="flex-1 resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-[16px] sm:text-sm text-[rgb(var(--text-primary))] focus:outline-none focus:border-[rgb(var(--series-1))] max-h-40"
              aria-label="Je vraag"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 w-11 h-11 rounded-xl bg-[rgb(var(--series-1))] text-white flex items-center justify-center disabled:opacity-40"
              aria-label="Verstuur"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-[rgb(var(--text-muted))] cursor-pointer select-none">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="w-3.5 h-3.5 accent-[#2a78d6]" />
            {share ? <Unlock className="w-3.5 h-3.5" aria-hidden="true" /> : <Lock className="w-3.5 h-3.5" aria-hidden="true" />}
            {share ? 'De AI ziet ook je bedragen en aantallen' : 'Bedragen blijven privé: de AI ziet alleen percentages en koersen'}
          </label>
        </form>
      </section>
      <p className="text-xs text-[rgb(var(--text-muted))] px-1">
        {isDemo ? 'Demo: voorbeeldantwoorden zonder echte AI. ' : 'Antwoorden van Google Gemini. '}De AI kan zich vergissen en geeft geen koop- of verkoopadvies.
      </p>
    </>
  );
};

/** Antwoorden in de demo, uitgerekend op de demodata (geen echte AI nodig). */
function demoAnswer(q: string, positions: StockPosition[]): string {
  const ranked = positions.filter((p) => p.invested > 0).sort((a, b) => b.profitLossPct - a.profitLossPct);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const biggest = [...positions].sort((a, b) => b.allocation - a.allocation)[0];
  if (/beste|winst|top/i.test(q) && best) {
    return `Je beste positie is **${shortName(best.stock.name)}** met **${formatPercent(best.profitLossPct)}** sinds je instapte.\n\n- Slechtste: ${shortName(worst.stock.name)} (${formatPercent(worst.profitLossPct)})\n- Let op: één goede positie zegt weinig over de toekomst.\n\n_(Demo-antwoord. In je echte account antwoordt de AI op al je vragen.)_`;
  }
  if (/gespreid|spreiding|risico|zwak/i.test(q) && biggest) {
    return `### Spreiding in het kort\n- Grootste positie: **${shortName(biggest.stock.name)}** met ${Math.round(biggest.allocation * 100)}% van alles.\n- Je hebt ${positions.length} posities.\n- Kijk op de pagina **Inzicht** voor je volledige score en verdeling per regio en sector.\n\n_(Demo-antwoord.)_`;
  }
  return `Goede vraag! In de demo antwoord ik alleen op een paar voorbeeldvragen (bijvoorbeeld "wat was mijn beste koop?").\n\nIn je echte account kent de AI al je posities en transacties en kun je alles vragen.`;
}

/** Heel kleine markdown-weergave (vet, cursief, lijstjes, kopjes) zonder HTML in te voegen. */
const Markdown: React.FC<{ text: string }> = ({ text }) => {
  const inline = (s: string, key: string) => {
    const out: React.ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*|`[^`]+`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const t = m[0];
      if (t.startsWith('**')) out.push(<strong key={`${key}-${k++}`} className="text-[rgb(var(--text-primary))]">{t.slice(2, -2)}</strong>);
      else if (t.startsWith('`')) out.push(<code key={`${key}-${k++}`} className="px-1 rounded bg-[rgb(var(--border))]/60 text-[13px]">{t.slice(1, -1)}</code>);
      else out.push(<em key={`${key}-${k++}`}>{t.slice(1, -1)}</em>);
      last = m.index + t.length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };

  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = (i: number) => {
    if (!list) return;
    const items = list.items.map((it, j) => <li key={j}>{inline(it, `l${i}-${j}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={`ol${i}`} className="list-decimal pl-5 space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={`ul${i}`} className="list-disc pl-5 space-y-1">
          {items}
        </ul>
      )
    );
    list = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flush(i);
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
      return;
    }
    flush(i);
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) blocks.push(<p key={i} className="font-bold text-[rgb(var(--text-primary))] mt-1">{inline(h[1], `h${i}`)}</p>);
    else if (line.trim()) blocks.push(<p key={i}>{inline(line, `p${i}`)}</p>);
  });
  flush(lines.length);
  return <div className="space-y-2">{blocks}</div>;
};
