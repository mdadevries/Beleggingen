# Beleggingen

Persoonlijk overzicht van een beleggingsportefeuille: waarde, verdeling per
aandeel, waardeverloop en transacties. React + Vite + TypeScript + Tailwind,
met een Vercel-backend (API + Redis) en een n8n-workflow die DEGIRO-orders
automatisch uit Gmail haalt.

## Starten

```bash
npm install
npm run dev
```

## Wat er nu in zit (v2 — automatische import)

- **Overzicht**: KPI-rij, verdeling per aandeel (gestapelde balk i.p.v.
  donut — zie toelichting hieronder), waardeverloop, laatste 5 transacties.
- **Transacties**: volledige tabel met zoeken, filteren per aandeel en
  sorteren op datum. Kopen = groen, verkopen = rood (met icoon).
- **Echte data via n8n + Gmail**: zodra er transacties binnenkomen via
  `/api/transactions`, toont de site die automatisch i.p.v. de demodata (zie
  "Automatische import" hieronder). Zolang er nog niets binnen is, blijft de
  site demodata tonen met een duidelijke banner.
- **Login**: de hele site zit achter één wachtwoord (Vercel Edge Middleware),
  want er staat straks eigen financiële data in. `/api/*` loopt er niet
  doorheen — die heeft eigen auth.
- Rustige, moderne stijl, mobile-first, WCAG 2.2 AA contrast.

### Waarom een gestapelde balk i.p.v. een donutgrafiek?

Voor "waar zit mijn geld" is een donut lastiger nauwkeurig af te lezen dan een
gestapelde balk (vooral op een klein scherm). De legenda eronder toont de
exacte percentages.

## Automatische import (n8n + Gmail)

`n8n/beleggingen-degiro-import.json` is een kant-en-klare, importeerbare
n8n-workflow:

1. **Gmail Trigger** — pollt elke 5 minuten op mails van
   `notificaties@degiro.nl` met "Transactiebevestiging" in het onderwerp.
2. **Code-node ("Mail parsen")** — leest OrderID, transactiedatum, Opdracht
   (Koop/Verkoop), Aantal en Waarde (altijd EUR, dus betrouwbaarder dan
   "Koers" die in vreemde valuta kan staan) uit de mailtekst. De naam van het
   aandeel komt uit de subject-regel. De ticker wordt er automatisch uit
   afgeleid (geen officiële ticker — een leesbare afkorting; dat kun je later
   handmatig verfijnen als je dat wilt).
3. **IF-node ("Order herkend?")** — splitst herkende orders van niet-herkende
   mails (bv. een stortingsmail), zodat een onbekende mail nooit de flow
   breekt.
4. **HTTP Request** — stuurt een herkende order naar `/api/transactions` op
   je site, met een geheime sleutel in de header (zodat alleen n8n mag
   schrijven).
5. **Gmail ("Melding bij fout")** — stuurt jezelf een mailtje als een mail
   niet herkend werd, met reden, zodat je het kunt nachecken.

**Dedup zit server-side**: `/api/transactions` gebruikt de DEGIRO OrderID als
sleutel, dus zelfs als n8n een mail per ongeluk twee keer verwerkt, komt hij
maar één keer als transactie op de site.

### Parser los getest tegen echte mails

De parse-logica in de Code-node is 1-op-1 overgenomen uit een los testscript
dat ik tegen drie echte DEGIRO-mails uit je Gmail heb gedraaid (twee
orderbevestigingen met verschillende valuta, plus een stortingsmail als
"niet-herkend"-geval) — alle vier de checks slaagden. De node zelf kon ik
niet in een draaiende n8n-instantie testen; zie "Importeren" hieronder voor
hoe je 'm zelf controleert.

### Importeren in n8n

1. Open n8n lokaal (`npx n8n` of de desktop-app) → **Workflows → Import from
   File** → kies `n8n/beleggingen-degiro-import.json`.
2. Koppel credentials (niet meegeëxporteerd, dat hoort zo — zo staan er geen
   sleutels in dit bestand):
   - **Gmail account** (OAuth2) op de Gmail Trigger-node én de "Melding bij
     fout"-node — zelfde account, jouw Gmail.
   - **DEGIRO webhook key** (Header Auth) op de "Naar website sturen"-node:
     naam `x-api-key`, waarde = de `N8N_API_SECRET` die je in Vercel hebt
     gezet (zie hieronder).
3. Zet in de "Naar website sturen"-node de URL goed:
   `https://<jouw-vercel-domein>/api/transactions`.
4. Test: klik rechtsboven "Execute workflow" terwijl er minstens 1 testmail
   in je inbox staat die aan het filter voldoet (of trigger 'm handmatig met
   een losse testrun op een bestaande mail). Controleer daarna in de
   execution-log of de HTTP Request een 200 teruggeeft.
5. Zet de workflow op **Active** zodra het een paar keer goed is gegaan.

## Backend (Vercel) — wat je zelf moet instellen

Net als bij Portfolio: **Vercel → Storage → Upstash Redis** toevoegen aan dit
project (genereert automatisch `KV_REST_API_URL` en `KV_REST_API_TOKEN`).

Daarnaast deze environment variables toevoegen in **Vercel → Settings →
Environment Variables** (Production + Preview):

| Variabele | Waarde |
| --- | --- |
| `SITE_PASSWORD` | een wachtwoord dat jij zelf kiest, om in te loggen |
| `SESSION_SECRET` | een lange willekeurige string (zelf genereren, bv. `openssl rand -hex 32`) |
| `N8N_API_SECRET` | een lange willekeurige string (zelf genereren) |

**Zet hier nooit de echte waarden in dit bestand** — dit project staat op een
publieke GitHub-repo, dus alles hierin is voor iedereen leesbaar. Bewaar je
eigen gegenereerde waarden alleen in Vercel (Environment Variables) en in de
n8n-credential, nergens anders. Na het toevoegen in Vercel: **Redeploy**,
anders zijn ze niet actief.

`N8N_API_SECRET` is dezelfde waarde die je als "DEGIRO webhook key" in n8n
invult (stap 2 hierboven) — die twee moeten exact overeenkomen.

## Nog niet gebouwd (bewust, voor latere versie)

- Pagina per aandeel (gemiddelde koers, winst/verlies, eigen transacties)
- Beleggingsdagboek (notitie per transactie)
- Chatbot voor vragen over transacties
- Live koersen — `currentPrice` per aandeel wordt nu bijgewerkt naar de
  laatst bekende transactieprijs, geen actuele marktkoers

## Structuur

```
src/
  data/        types.ts, demoData.ts
  hooks/       usePortfolioData.ts (haalt echte data op, valt terug op demo)
  utils/       portfolio.ts (berekeningen), colors.ts
  components/  KpiRow, AllocationBar, ValueChart, RecentTransactions,
               TransactionsTable, TransactionBadge, Nav
api/
  transactions.ts   GET (lijst) / POST (nieuwe order, x-api-key)
  login.ts          wachtwoord -> auth-cookie
  logout.ts         cookie wissen
middleware.ts       Edge Middleware: wachtwoord-check voor de hele site
n8n/
  beleggingen-degiro-import.json   importeerbare n8n-workflow
```
