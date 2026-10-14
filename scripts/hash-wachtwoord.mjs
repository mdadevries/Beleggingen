#!/usr/bin/env node
// Maakt een scrypt-hash van je wachtwoord, voor de variabele SITE_PASSWORD_HASH in Vercel.
// Gebruik:  node scripts/hash-wachtwoord.mjs
// Het wachtwoord zelf wordt nergens opgeslagen. Zet de hash alleen
// in Vercel (Environment Variables), niet in de repo.
import crypto from 'node:crypto';
import readline from 'node:readline';

const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MIN_LENGTH = 12;

// Eén regel-lezer voor beide vragen, zodat het ook met ingeplakte/doorgegeven invoer werkt.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text); // wat je typt blijft onzichtbaar
};
const queue = [];
const waiting = [];
rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : queue.push(line)));
rl.on('close', () => waiting.splice(0).forEach((done) => done('')));

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    muted = true;
    const done = (line) => {
      muted = false;
      process.stdout.write('\n');
      resolve(line);
    };
    if (queue.length) done(queue.shift());
    else waiting.push(done);
  });
}

const first = await askHidden('Kies je wachtwoord: ');
if (first.length < MIN_LENGTH) {
  console.error(`Te kort: gebruik minimaal ${MIN_LENGTH} tekens (liefst een zin van een paar woorden).`);
  process.exit(1);
}
const second = await askHidden('Nog een keer ter controle: ');
rl.close();
if (first !== second) {
  console.error('De twee wachtwoorden zijn niet gelijk.');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(first.normalize('NFKC'), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 256 * N * R });
console.log('\nZet dit als SITE_PASSWORD_HASH in Vercel:\n');
console.log(['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join(':'));
console.log('\nDaarna mag SITE_PASSWORD weg uit Vercel.');
