import assert from 'node:assert/strict';
import { parseQuotedPaste } from '../src/app/components/session/chatPaste.ts';

// Formato prodotto dalla copia di un messaggio con citazione.
assert.deepEqual(
  parseQuotedPaste('> Alfonso Test: \u{1F92A}\n\nfbdfb'),
  { senderName: 'Alfonso Test', content: '\u{1F92A}', body: 'fbdfb' },
);

// Citazione multi-riga: ogni riga marcata, corpo separato da riga vuota.
assert.deepEqual(
  parseQuotedPaste('> Nome: riga uno\n> riga due\n\ncorpo'),
  { senderName: 'Nome', content: 'riga uno\nriga due', body: 'corpo' },
);

// Split del nome sul PRIMO ": " (un nome puo' contenere due punti).
assert.deepEqual(
  parseQuotedPaste('> Mago: Eldrin: ciao\n\nvia'),
  { senderName: 'Mago', content: 'Eldrin: ciao', body: 'via' },
);

// Corpo vuoto (messaggio di solo testo citato): ammesso.
assert.deepEqual(
  parseQuotedPaste('> Nome: x\n\n'),
  { senderName: 'Nome', content: 'x', body: '' },
);

// Appunti Windows con CRLF: normalizzati prima del parsing.
assert.deepEqual(
  parseQuotedPaste('> Nome: riga uno\r\n> riga due\r\n\r\ncorpo'),
  { senderName: 'Nome', content: 'riga uno\nriga due', body: 'corpo' },
);

// Testo senza marker blockquote: incollo di default.
assert.equal(parseQuotedPaste('Alfonso Test: x\n\ny'), null);
// Marker senza riga vuota di separazione.
assert.equal(parseQuotedPaste('> Nome: x\ny'), null);
// Prima riga citata ma corpo non separato/successiva riga non marcata.
assert.equal(parseQuotedPaste('> Nome: x\nnon-marcati\n\ny'), null);
// Nessun ": " nel primo riga citata.
assert.equal(parseQuotedPaste('> Nome solo\n\ny'), null);
// Stringa vuota.
assert.equal(parseQuotedPaste(''), null);

console.log('Chat paste (block quote clipboard) verification: PASS');
