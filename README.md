# Beleggingen

Persoonlijk overzicht van een beleggingsportefeuille: waarde, verdeling per
aandeel, waardeverloop en transacties. React + Vite + TypeScript + Tailwind.

## Starten

```bash
npm install
npm run dev
```

## Wat er nu in zit (v1)

- **Overzicht**: KPI-rij (totale waarde, resultaat, aantal aandelen, ingelegd
  bedrag), verdeling per aandeel (gestapelde balk i.p.v. donut — beter
  leesbaar en toegankelijk, zie toelichting hieronder), waardeverloop door de
  tijd, laatste 5 transacties.
- **Transacties**: volledige tabel met zoeken, filteren per aandeel en
  sorteren op datum. Kopen = groen, verkopen = rood (met icoon, niet alleen
  kleur).
- Rustige, moderne stijl (veel wit, weinig kleur), mobile-first, WCAG 2.2 AA
  contrast.
- **Demodata** — nog geen koppeling met een echte broker/bank. Zie
  `src/data/demoData.ts` om eigen transacties in te voeren, of vervang dat
  bestand later door een CSV-import.

### Waarom een gestapelde balk i.p.v. een donutgrafiek?

Voor "waar zit mijn geld" is een donut lastiger nauwkeurig af te lezen dan een
gestapelde balk (vooral op een klein scherm), en de balk blijft even
compact. De legenda eronder toont de exacte percentages. Wil je toch per se
een donut, dan is dat een kleine aanpassing in `AllocationBar.tsx`.

## Nog niet gebouwd (bewust, voor latere versie)

- Pagina per aandeel (gemiddelde koers, winst/verlies, eigen transacties)
- Beleggingsdagboek (notitie per transactie)
- Chatbot voor vragen over transacties
- Automatische import (mail/n8n) en login (nodig zodra er echte data bij komt)

## Structuur

```
src/
  data/        types.ts, demoData.ts
  utils/       portfolio.ts (berekeningen), colors.ts
  components/  KpiRow, AllocationBar, ValueChart, RecentTransactions,
               TransactionsTable, TransactionBadge, Nav
```
