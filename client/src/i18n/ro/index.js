// The Romanian dictionary, one file per part of the app. Keys are the English text exactly as written in the code.
// When two files translate the same text, the later one wins: practice last, since the practice copy is the one in
// Romanian (e.g. "Paid" on its invoices is money received: "Încasat").
import common from './common.js';
import events from './events.js';
import money from './money.js';
import stock from './stock.js';
import practice from './practice.js';

export default { ...common, ...events, ...money, ...stock, ...practice };
