// What's given away at an event: vouchers, the prizes we offer, and prizes from partners.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, usePermissions } from '../../hooks.js';
import { money0 } from '../../format.js';
import { IconPlus } from '../../components/Icons.jsx';
import { VoucherForm, VoucherTable } from '../Vouchers.jsx';
import { NOT_COUNTED, PrizeForm, PrizeTable } from '../Partners.jsx';
import { t } from '../../i18n/index.js';

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
        <div><h2>{t('Vouchers given')}</h2><p>{e.is_sport ? t('Won here, used later — paid from the {sport} fund when used, not from this event.', { sport: e.type_name }) : t('Won here, used later — paid from the general fund when used, not from this event.')} <Link to="/vouchers">{t('All vouchers →')}</Link></p></div>
        {canEdit && <button className="btn btn-sm" onClick={() => setForm({})}><IconPlus width="14" />{t('Give a voucher')}</button>}
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
  const place = (n) => t(['{n}st', '{n}nd', '{n}rd'][n - 1] || '{n}th', { n });
  return (
    <div className="card">
      <div className="card-pad">
        <div className="card-head"><div><h2>{t('Our prizes')}</h2><p>{t('Offered by us, as advertised in the {app} app. Add their cost as vouchers, stock or an expense.', { app: e.source })}</p></div></div>
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
        <div><h2>{t('Partner prizes')}</h2><p>{t(NOT_COUNTED)}. <Link to="/partners">{t('All partners →')}</Link></p></div>
        {canEdit ? <button className="btn btn-sm" onClick={() => setForm({})}><IconPlus width="14" />{t('Partner prize')}</button>
          : value > 0 && <span className="muted">≈ {money0(value)}</span>}
      </div>
      {data.length > 0 && <PrizeTable list={data} reload={reload} showEvent={false} setForm={setForm} />}
      {form && <PrizeForm prize={form.prize} event={e} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
