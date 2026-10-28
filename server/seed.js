// Fills the database with realistic demo data so the dashboards have something to show.
// Run with `npm run seed` (add --reset to wipe events, money, people and stock first).
import { db, SPORTS, toBani, tx } from './db.js';
import { hashPassword } from './auth.js';

const reset = process.argv.includes('--reset');

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const between = (a, b) => Math.round(a + rand() * (b - a));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pad = (n) => String(n).padStart(2, '0');

const sportId = (name) => db.prepare('SELECT id FROM event_types WHERE name = ?').get(name).id;
const cat = (name, kind) => db.prepare('SELECT id FROM categories WHERE name = ? AND kind = ?').get(name, kind).id;

// Per sport: [participants range, fee options, venue cost range, typical location]
const PROFILE = {
  Football: [[14, 22], [25, 30], [200, 350], 'Baza Sportivă Gheorgheni'],
  Volleyball: [[12, 18], [25, 30], [150, 250], 'Sala Polivalentă'],
  Basketball: [[10, 16], [25, 30], [180, 280], 'Sala Polivalentă'],
  Handball: [[14, 20], [25], [200, 300], 'Liceul Sportiv'],
  Padel: [[8, 16], [60, 70], [240, 480], 'Padel Arena'],
  Running: [[20, 45], [20, 30], [0, 80], 'Parcul Central'],
  Hiking: [[12, 28], [40, 60], [100, 400], 'Munții Apuseni'],
  Biking: [[10, 22], [35, 50], [50, 200], 'Pădurea Hoia'],
  Tennis: [[6, 10], [60, 80], [160, 300], 'Tenis Club'],
  'Foot tennis': [[8, 14], [25], [120, 200], 'Baza Sportivă Gheorgheni'],
  Hyrox: [[10, 20], [50, 70], [250, 450], 'Hyrox Box'],
};

tx(() => {
  if (reset) {
    db.exec(`DELETE FROM event_stock; DELETE FROM event_people; DELETE FROM contributions; DELETE FROM month_splits;
      DELETE FROM transactions; DELETE FROM events; DELETE FROM imports; DELETE FROM stock_holdings; DELETE FROM stock_items;
      DELETE FROM people;`);
    db.exec(`DELETE FROM event_types WHERE name IN ('Sport', 'Tournament')`);
  }
  const ins = db.prepare('INSERT OR IGNORE INTO event_types (name) VALUES (?)');
  for (const s of SPORTS) ins.run(s);

  let admin = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  if (!admin) {
    db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run('Demo Admin', 'admin@active.local', hashPassword('active123'));
    admin = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
    console.log('Created demo admin: admin@active.local / active123');
  }

  // The three founders are, for now, also the only organisers.
  const insPerson = db.prepare('INSERT OR IGNORE INTO people (name, is_founder) VALUES (?, ?)');
  for (const n of ['Dani', 'Silviu', 'Andreea']) insPerson.run(n, 1);
  const people = db.prepare('SELECT id, name, is_founder FROM people').all();
  const founders = people.filter((p) => p.is_founder);

  // Stock, held by different people.
  const items = [
    ['Water 0.5L', 'bottles', 2.5, 600], ['Bananas', 'kg', 7, 80], ['Energy bars', 'pcs', 6, 300],
    ['Isotonic drink', 'bottles', 6.5, 200], ['Football', 'pcs', 140, 8], ['Volleyball', 'pcs', 180, 6],
    ['Padel balls (tube)', 'tubes', 38, 40], ['Medals', 'pcs', 14, 120], ['Bibs', 'pcs', 15, 30],
  ];
  const insItem = db.prepare('INSERT OR IGNORE INTO stock_items (name, unit, unit_price) VALUES (?, ?, ?)');
  const setHold = db.prepare(`INSERT INTO stock_holdings (item_id, person_id, qty) VALUES (?, ?, ?)
    ON CONFLICT(item_id, person_id) DO UPDATE SET qty = qty + excluded.qty`);
  for (const [name, unit, price, qty] of items) {
    insItem.run(name, unit, toBani(price));
    const id = db.prepare('SELECT id FROM stock_items WHERE name = ?').get(name).id;
    const holders = [pick(people), pick(people)];
    setHold.run(id, holders[0].id, Math.ceil(qty * 0.6));
    setHold.run(id, holders[1].id, Math.floor(qty * 0.4));
  }
  const stock = db.prepare(`SELECT i.id, i.name, i.unit_price FROM stock_items i`).all();
  const item = (name) => stock.find((s) => s.name === name);
  const useStock = (eventId, name, qty) => {
    const it = item(name);
    const holder = db.prepare('SELECT person_id, qty FROM stock_holdings WHERE item_id = ? AND qty >= ? ORDER BY qty DESC LIMIT 1').get(it.id, qty);
    if (!holder) return;
    db.prepare('UPDATE stock_holdings SET qty = qty - ? WHERE item_id = ? AND person_id = ?').run(qty, it.id, holder.person_id);
    db.prepare('INSERT INTO event_stock (event_id, item_id, person_id, qty, unit_price) VALUES (?, ?, ?, ?, ?)')
      .run(eventId, it.id, holder.person_id, qty, it.unit_price);
  };

  const insEvent = db.prepare(`INSERT INTO events (name, type_id, activity_id, date, location, status, participants, participation_fee, budget, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const activity = (name) => db.prepare('SELECT * FROM activities WHERE name = ?').get(name);
  const activityFor = (sport, special) => {
    if (sport === 'Padel' && special) return activity(pick(['Padel — 3–4 hours', 'Padel — 2 days']));
    if (sport === 'Hiking' && special) return activity(pick(['Weekend at a cabin + hike', 'Via ferrata']));
    return db.prepare('SELECT a.* FROM activities a JOIN event_types et ON et.id = a.sport_id WHERE et.name = ?').get(sport);
  };
  const insContribution = db.prepare('INSERT INTO contributions (person_id, activity_id, date, points, note, created_by) VALUES (?, ?, ?, ?, ?, ?)');
  const insTx = db.prepare(`INSERT INTO transactions (event_id, kind, category_id, amount, date, description, payment_method, fund_sport_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const add = (eventId, kind, category, amount, date, description, fund = null) =>
    insTx.run(eventId, kind, cat(category, kind), toBani(amount), date, description, pick(['Card', 'Bank transfer', 'Cash']), fund, admin.id);
  const insOrg = db.prepare('INSERT INTO event_people (event_id, person_id, role, points) VALUES (?, ?, ?, ?)');

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const months = [];
  for (let y = 2025; y <= 2026; y++) for (let m = 1; m <= 12; m++) months.push(`${y}-${pad(m)}`);

  for (const ym of months) {
    const count = between(4, 7);
    for (let i = 0; i < count; i++) {
      const sport = pick(SPORTS);
      const [[pmin, pmax], fees, [vmin, vmax], location] = PROFILE[sport];
      const date = `${ym}-${pad(between(1, 28))}`;
      if (ym > thisMonth) continue;
      const past = date < today;
      // Most past events are finalized; a few in the current month are still live.
      const status = !past || (ym === thisMonth && rand() < 0.5) ? 'planned' : rand() < 0.04 ? 'cancelled' : 'completed';
      const people_ = between(pmin, pmax);
      const fee = pick(fees);
      const special = rand() < 0.15;
      const name = special ? `${sport} ${pick(['Cup', 'Challenge', 'Open'])} ${ym.slice(0, 4)}` : `${sport} ${pick(['session', 'meetup', 'training'])}`;
      const act = activityFor(sport, special);
      const id = Number(insEvent.run(name, sportId(sport), act?.id ?? null, date, location, status, special ? people_ * 2 : people_,
        toBani(special ? fee * 1.5 : fee), toBani(between(vmin, vmax) * (special ? 2 : 1) + 150), admin.id).lastInsertRowid);
      if (status === 'cancelled') continue;

      // Organizers and their points.
      const org = pick(people);
      insOrg.run(id, org.id, 'organizer', act ? act.organizer_points : 2);
      const co = pick(people.filter((p) => p.id !== org.id));
      if (rand() < 0.6) insOrg.run(id, co.id, 'co-organizer', act ? act.co_points : 1);

      if (!past && status === 'planned' && ym !== thisMonth) continue;
      // Organizing costs.
      const venue = between(vmin, vmax) * (special ? 2 : 1);
      if (venue) add(id, 'expense', ['Hiking', 'Biking'].includes(sport) ? 'Transport' : 'Venue rental', venue, date,
        ['Hiking', 'Biking'].includes(sport) ? 'Minibus' : 'Court / field rental');
      if (['Hyrox', 'Tennis', 'Padel'].includes(sport) && rand() < 0.6) add(id, 'expense', 'Trainers', between(100, 250), date, 'Coach fee');
      if (special) add(id, 'expense', 'Referees', between(150, 300), date, 'Referee fees');
      if (special && rand() < 0.5) add(id, 'income', 'Sponsorship', between(300, 1500), date, `${pick(['Local gym', 'Sports shop', 'Café partner'])} sponsorship`);
      // Benefits offered, mostly from stock.
      useStock(id, 'Water 0.5L', Math.ceil(people_ * 0.8));
      if (rand() < 0.6) useStock(id, 'Bananas', between(1, 3));
      if (['Running', 'Hiking', 'Biking', 'Hyrox'].includes(sport)) useStock(id, rand() < 0.5 ? 'Energy bars' : 'Isotonic drink', Math.ceil(people_ / 2));
      if (special) useStock(id, 'Medals', 3);
      if (rand() < 0.2) add(id, 'expense', 'Food & drinks', between(60, 250), date, 'Pizza after the game');
    }

    // Points earned outside events.
    if (rand() < 0.3) {
      const a = activity('Concrete partnership secured');
      insContribution.run(pick(people).id, a.id, `${ym}-${pad(between(1, 28))}`, a.organizer_points, pick(['Partnership with Padel Arena', 'Sports shop discount deal', 'Gym partnership']), admin.id);
    }
    if (rand() < 0.2) {
      const a = activity('Free event with a sports club or partner');
      insContribution.run(pick(people).id, a.id, `${ym}-${pad(between(1, 28))}`, between(3, 5), 'Free run with a partner club', admin.id);
    }
    if (rand() < 0.12) {
      const a = activity('Major promotional event');
      insContribution.run(pick(people).id, a.id, `${ym}-${pad(between(1, 28))}`, a.organizer_points, 'Stand at the city sports fair', admin.id);
    }
    if (ym >= thisMonth) continue;
    // Monthly fund movements: reinvestments from sport funds and the general fund.
    const d = `${ym}-${pad(between(10, 25))}`;
    if (rand() < 0.55) {
      const s = pick(['Football', 'Volleyball', 'Padel', 'Running', 'Hyrox', 'Basketball']);
      add(null, 'expense', 'Equipment', between(80, 300), d, `New equipment for ${s.toLowerCase()}`, sportId(s));
    }
    add(null, 'expense', 'Other expenses', 120, `${ym}-05`, 'Booking app subscription');
    if (ym.endsWith('-01')) add(null, 'expense', 'Insurance', 1800, `${ym}-15`, 'Annual liability insurance');
    if (ym.endsWith('-04')) add(null, 'income', 'Donations', between(800, 1600), `${ym}-20`, '3.5% tax redirection');
  }
  // Restock so current holdings look realistic.
  for (const s of stock) for (const f of founders.slice(0, 1)) setHold.run(s.id, f.id, s.name.includes('ball') || s.name === 'Football' || s.name === 'Volleyball' ? 2 : 40);
});

console.log('Demo data inserted.');
