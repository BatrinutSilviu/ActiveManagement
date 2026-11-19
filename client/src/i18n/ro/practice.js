// The practice pages (pages/practice: patients, sessions, packages, invoices and receipts, the dashboard, services)
// and the practice server's error messages (server/routes/practice.js).
export default {
  // statuses and document kinds (common.jsx)
  Scheduled: 'Programată', Done: 'Efectuată', Cancelled: 'Anulată',
  Invoice: 'Factură', Receipt: 'Chitanță', Invoices: 'Facturi', Receipts: 'Chitanțe',
  'Edit invoice': 'Editează factura', 'Edit receipt': 'Editează chitanța',
  package: 'pachet', paid: 'încasat', 'not paid': 'neîncasat', 'Not billed': 'Nefacturat',
  'paid {date}': 'încasat {date}', 'Paid on {date}': 'Încasat pe {date}',

  // patients list
  'Contact details, notes, sessions, packages and what each one still owes.': 'Date de contact, notițe, ședințe, pachete și cât mai are de plătit fiecare.',
  'New patient': 'Pacient nou', 'Edit patient': 'Editează pacientul',
  'Search name, tutor, phone, address…': 'Caută nume, tutore, telefon, adresă…',
  'Legal entity': 'Entitate juridică', 'All legal entities': 'Toate entitățile juridice',
  Association: 'Asociație', 'All associations': 'Toate asociațiile',
  'Show archived ({n})': 'Arată arhivații ({n})',
  'Last session': 'Ultima ședință', Next: 'Următoarea', Owes: 'De plată',
  archived: 'arhivat', Tutor: 'Tutore', 'next {date}': 'următoarea {date}',
  'Nobody matches.': 'Niciun rezultat.', 'No patients yet.': 'Niciun pacient încă.',

  // one patient
  '{name}, with their notes, sessions and packages': '{name}, cu notițele, ședințele și pachetele sale',
  '{n} year old': '{n} an', '{n} years old': '{n} ani',
  'New session': 'Ședință nouă', 'Edit session': 'Editează ședința',
  'Bill {amount}': 'Facturează {amount}', Bill: 'Facturează',
  About: 'Despre', 'Not billed yet': 'Nefacturat încă', 'Billed, not paid': 'Facturat, neîncasat',
  'What was done, how it went, what to do next time…': 'Ce s-a lucrat, cum a mers, ce e de făcut data viitoare…',
  'Save note': 'Salvează notița', 'Private: only accounts in this app can read them': 'Private: doar conturile din această aplicație le pot citi',
  'Edit note': 'Editează notița', 'Delete note': 'Șterge notița', 'this note': 'această notiță', 'No notes yet.': 'Nicio notiță încă.',
  '{n} done': '{n} efectuate', Status: 'Stare', Price: 'Preț', 'Mark done': 'Marchează ca efectuată',
  'No sessions yet.': 'Nicio ședință încă.',
  Packages: 'Pachete', Package: 'Pachet',
  '{used} done · {booked} booked · {left} left of {total} sessions': '{used} efectuate · {booked} programate · {left} rămase din {total} ședințe',
  'until {date}': 'până la {date}', 'package “{name}”': 'pachetul „{name}”', 'No packages.': 'Niciun pachet.',
  'Invoices & receipts': 'Facturi și chitanțe', New: 'Nou', 'Not paid yet': 'Neîncasat încă', Paid: 'Încasat', 'None yet.': 'Niciuna încă.',

  // patient and package forms
  'First name': 'Prenume', Surname: 'Nume de familie', 'Where the home visits are': 'Unde au loc vizitele la domiciliu',
  'Birth date': 'Data nașterii', '— who they are treated through': '— prin cine este tratat',
  'Choose…': 'Alege…', '— the sponsor they belong to, if any': '— asociația (sponsorul) de care aparține, dacă e cazul',
  '— the parent or guardian': '— părintele sau tutorele legal', Relation: 'Relație',
  'Mother, father, grandparent…': 'Mamă, tată, bunic…',
  '— what to keep in mind: condition, history, what works…': '— de reținut: afecțiune, istoric, ce funcționează…',
  Archived: 'Arhivat', '— no longer coming; hidden from the lists, nothing is deleted': '— nu mai vine; ascuns din liste, nu se șterge nimic',
  '10 sessions': '10 ședințe', 'Edit package': 'Editează pachetul', 'New package': 'Pachet nou',
  'A number of sessions paid for together. Sessions booked with it have no price of their own; bill the package itself with an invoice or receipt.':
    'Un număr de ședințe plătite împreună. Ședințele programate din pachet nu au preț propriu; se facturează pachetul, cu o factură sau o chitanță.',
  'Number of sessions': 'Număr de ședințe', 'Price ({currency})': 'Preț ({currency})', 'Bought on': 'Cumpărat pe',
  'Valid until': 'Valabil până la', '(optional)': '(opțional)',

  // schedule
  '{n} session': '{n} ședință', '{n} sessions': '{n} ședințe',
  'Previous week': 'Săptămâna trecută', 'This week': 'Săptămâna aceasta', 'Next week': 'Săptămâna viitoare',
  'Go to week': 'Mergi la săptămâna', 'Hide cancelled': 'Ascunde anulatele', 'New session on {date}': 'Ședință nouă pe {date}',
  'No time set': 'Fără oră', map: 'hartă',

  // session form
  'First name and surname of the new patient:': 'Prenumele și numele noului pacient:',
  '— choose —': '— alege —', From: 'De la', To: 'Până la',
  '{address} (their address)': '{address} (adresa pacientului)', 'Where the session is': 'Unde are loc ședința',
  'Paid with': 'Plătită cu', 'Its own price': 'Preț propriu', '{n} left': '{n} rămase',
  '— about this session (notes about the patient are on their page)': '— despre această ședință (notițele despre pacient sunt pe pagina lui)',

  // services
  'What you offer, and the price a new session of each starts with': 'Ce oferi și prețul cu care pornește o ședință nouă din fiecare',
  '{name} price': 'Preț {name}', Rename: 'Redenumește', 'New service, e.g. Manual therapy': 'Serviciu nou, de ex. Terapie manuală',

  // invoices
  '{doc} (its sessions and packages become “not billed” again)': '{doc} (ședințele și pachetele de pe ea redevin „nefacturate”)',
  'What you issued, and whether it’s paid. Ticking “paid” adds the money on the day it was paid.':
    'Ce ai emis și dacă e încasat. Bifa „încasat” adaugă banii în ziua în care au fost încasați.',
  'New invoice or receipt': 'Factură sau chitanță nouă', Year: 'An', 'All years': 'Toți anii',
  'Paid and not paid': 'Încasate și neîncasate', 'Not paid': 'Neîncasat', Kind: 'Tip',
  'Invoices and receipts': 'Facturi și chitanțe', Issued: 'Emise', '{n} document': '{n} document', '{n} documents': '{n} documente',
  Document: 'Document', Covers: 'Acoperă', '{doc} paid': '{doc} încasată', 'None match these filters.': 'Nimic nu corespunde acestor filtre.',

  // invoice form
  '{name} (package, {date})': '{name} (pachet, {date})', Number: 'Număr', 'e.g. KA-0001': 'de ex. KA-0001',
  '— none —': '— niciunul —', 'What it covers': 'Ce acoperă',
  'Nothing to bill for this patient: sessions done outside a package and packages show up here.':
    'Nimic de facturat pentru acest pacient: aici apar ședințele efectuate în afara unui pachet și pachetele.',
  'Amount ({currency})': 'Sumă ({currency})', 'The ticked items come to {amount}': 'Elementele bifate însumează {amount}',
  'use that': 'folosește suma', Description: 'Descriere', optional: 'opțional',
  '— its money counts on the day it was paid': '— banii se socotesc în ziua încasării',
  'Paid on': 'Încasat pe', 'Payment method': 'Metodă de plată',

  // dashboard
  Dashboard: 'Panou', 'Money received, what’s still owed, and the sessions to see to.': 'Banii încasați, ce mai e de plătit și ședințele de care trebuie să te ocupi.',
  Received: 'Încasat', 'paid invoices, receipts and other income': 'facturi și chitanțe încasate și alte venituri',
  Expenses: 'Cheltuieli', Profit: 'Profit', 'Sessions done': 'Ședințe efectuate',
  'Invoices and receipts without the paid tick': 'Facturi și chitanțe fără bifa de încasat',
  'Tick when it’s paid (today)': 'Bifează când e încasat (azi)', 'Everything billed is paid.': 'Tot ce s-a facturat e încasat.',
  'Sessions done outside a package, and packages, with no invoice or receipt': 'Ședințe efectuate în afara unui pachet, și pachete, fără factură sau chitanță',
  '{n} item': '{n} element', '{n} items': '{n} elemente', 'Nothing waiting to be billed.': 'Nimic de facturat.',
  'Next 7 days': 'Următoarele 7 zile', '{n} session booked': '{n} ședință programată', '{n} sessions booked': '{n} ședințe programate',
  Schedule: 'Program', 'Nothing booked.': 'Nimic programat.',
  'Did these happen?': 'Au avut loc?', 'Past sessions still marked scheduled: mark them done or cancelled': 'Ședințe trecute marcate încă drept programate: marchează-le efectuate sau anulate',
  'Packages nearly used up': 'Pachete aproape consumate', 'Time to offer a new one': 'E momentul să oferi unul nou',
  '{left} left to book · {n} not done': '{left} de programat · {n} neefectuate',
  '{year} month by month': '{year} lună cu lună',
  'Received {income} · expenses {expenses} · profit {profit} · {n} sessions done': 'Încasat {income} · cheltuieli {expenses} · profit {profit} · {n} ședințe efectuate',
  Month: 'Lună', 'Nothing in {year} yet.': 'Nimic în {year} încă.',

  // server/routes/practice.js
  'This patient no longer exists': 'Acest pacient nu mai există',
  'Unknown legal entity': 'Entitate juridică necunoscută',
  'The first name is required': 'Prenumele este obligatoriu',
  'The surname is required': 'Numele de familie este obligatoriu',
  'This patient has invoices or receipts, which have to stay: archive them instead': 'Acest pacient are facturi sau chitanțe, care trebuie păstrate: arhivează-l în schimb',
  'A valid date is required': 'Este necesară o dată validă',
  'The note is empty': 'Notița este goală',
  'This note no longer exists': 'Această notiță nu mai există',
  'Give the package a name, e.g. 10 sessions': 'Dă-i pachetului un nume, de ex. 10 ședințe',
  'The number of sessions must be a whole number above 0': 'Numărul de ședințe trebuie să fie un număr întreg mai mare decât 0',
  'This package no longer exists': 'Acest pachet nu mai există',
  'Sessions use this package: take them out of it (or delete them) first': 'Unele ședințe folosesc acest pachet: scoate-le din el (sau șterge-le) mai întâi',
  'Times must look like 14:30': 'Orele trebuie să arate ca 14:30',
  'The session must end after it starts': 'Ședința trebuie să se termine după ce începe',
  'Unknown status': 'Stare necunoscută',
  'Unknown service': 'Serviciu necunoscut',
  'That package belongs to someone else': 'Pachetul acela aparține altcuiva',
  'This session no longer exists': 'Această ședință nu mai există',
  'Choose invoice or receipt': 'Alege factură sau chitanță',
  'The amount must be more than 0': 'Suma trebuie să fie mai mare decât 0',
  'This invoice no longer exists': 'Această factură nu mai există',
  // …and the fixed values its template messages take
  "The birth date isn't a valid date": 'Data nașterii nu este o dată validă',
  "The expiry date isn't a valid date": 'Data expirării nu este o dată validă',
  "The payment date isn't a valid date": 'Data încasării nu este o dată validă',
  "The price can't be negative": 'Prețul nu poate fi negativ',
  'A session on it no longer exists': 'O ședință de pe ea nu mai există',
  'A package on it no longer exists': 'Un pachet de pe ea nu mai există',
  'A session on it belongs to another patient': 'O ședință de pe ea aparține altui pacient',
  'A package on it belongs to another patient': 'Un pachet de pe ea aparține altui pacient',
  'A session on it is already on another invoice or receipt': 'O ședință de pe ea este deja pe altă factură sau chitanță',
  'A package on it is already on another invoice or receipt': 'Un pachet de pe ea este deja pe altă factură sau chitanță',
};
