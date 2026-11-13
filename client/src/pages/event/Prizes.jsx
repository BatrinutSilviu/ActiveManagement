// What's given away at an event: vouchers, the prizes we offer, and prizes from partners.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, usePermissions } from '../../hooks.js';
import { money0 } from '../../format.js';
import { IconPlus } from '../../components/Icons.jsx';
import { VoucherForm, VoucherTable } from '../Vouchers.jsx';
import { NOT_COUNTED, PrizeForm, PrizeTable } from '../Partners.jsx';

/** Vouchers won at this event (e.g. padel court time); their cost is paid from the sport's fund when used. */
export function EventVouchers({ e }) {
  const { data, reload } = useApi(`/vouchers?event_id=${e.id}`);
  const [form, setForm] = useState(null);
  const { canEdit } = usePermissions();
  if (!data) return null;
  if (!data.length && !canEdit) return null;
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Vouchers given</h2><p>Won here, used later — paid from the {e.is_sport ? `${e.type_name} fund` : 'general fund'} when used, not from this event. <Link to="/vouchers">All vouchers →</Link></p></div>
        {canEdit && <button className="btn btn-sm" onClick={() => setForm({})}><IconPlus width="14" />Give a voucher</button>}
      </div>
      {data.length > 0 && <VoucherTable list={data} reload={reload} showEvent={false} setForm={setForm} />}
      {form && <VoucherForm voucher={form.voucher} event={e} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}

/** The prizes we offer at this event, as advertised by the app it came from (the padel app). Their cost is
 *  entered like any other: vouchers, stock or an expense. Partner prizes are listed under Partner prizes. */
export function OurPrizes({ e }) {
  let prizes = [];
  try { prizes = JSON.parse(e.prizes || '[]'); } catch { /* not a list */ }
  const ours = prizes.filter((p) => !p.partner);
  if (!ours.length) return null;
  const place = (n) => `${n}${['st', 'nd', 'rd'][n - 1] || 'th'}`;
  return (
    <div className="card">
      <div className="card-pad">
        <div className="card-head"><div><h2>Our prizes</h2><p>Offered by us, as advertised in the {e.source} app. Add their cost as vouchers, stock or an expense.</p></div></div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {ours.map((p) => <li key={p.place}><strong>{p.label || place(p.place)}:</strong> {p.prize}</li>)}
        </ul>
      </div>
    </div>
  );
}

/** Prizes partners gave at this event: a record only, not counted in the event's money. */
export function PartnerPrizes({ e }) {
  const { data, reload } = useApi(`/partner-prizes?event_id=${e.id}`);
  const [form, setForm] = useState(null);
  const { canEdit } = usePermissions();
  if (!data) return null;
  if (!data.length && !canEdit) return null;
  const value = data.reduce((a, p) => a + (p.value || 0), 0);
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Partner prizes</h2><p>{NOT_COUNTED}. <Link to="/partners">All partners →</Link></p></div>
        {canEdit ? <button className="btn btn-sm" onClick={() => setForm({})}><IconPlus width="14" />Partner prize</button>
          : value > 0 && <span className="muted">≈ {money0(value)}</span>}
      </div>
      {data.length > 0 && <PrizeTable list={data} reload={reload} showEvent={false} setForm={setForm} />}
      {form && <PrizeForm prize={form.prize} event={e} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
