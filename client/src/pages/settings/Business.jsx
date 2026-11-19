// Settings: the business this copy of the app is for — name, look, currency, and which parts of the app it uses.
import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks.js';
import { LANGUAGES, t } from '../../i18n/index.js';
import Select from '../../components/Select.jsx';

export function Business() {
  const { data, reload } = useApi('/business');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!data?.business) return null;
  const v = f || data.business;
  const set = (k) => (e) => setF({ ...v, [k]: e.target.value });
  const toggle = (k) => setF({ ...v, features: { ...v.features, [k]: !v.features[k] } });
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put('/business', v);
      setMsg({ ok: true, text: t('Saved.') }); setF(null); reload();
      window.dispatchEvent(new Event('am:business')); // the menu, colours and money format follow
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{t('Business')}</h2>
        <p>{t(data.types[v.type])} · {t('its name and look, the currency, and which parts of the app it uses.')}</p></div></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form onSubmit={save} className="stack" style={{ gap: 14 }}>
        <div className="form-grid">
          <label className="field">{t('Name')}<input value={v.name} onChange={set('name')} required maxLength={60} /></label>
          <label className="field">{t('Subtitle')}<input value={v.tagline} onChange={set('tagline')} maxLength={60} placeholder={t('under the name in the menu')} /></label>
          <label className="field">{t('Colour')}<input type="color" value={v.color} onChange={set('color')} /></label>
          <label className="field">{t('Website')}<input type="url" value={v.website} onChange={set('website')} placeholder="https://…" /></label>
          <label className="field">{t('Currency')}<input value={v.currency} onChange={set('currency')} required maxLength={3} placeholder="RON" /></label>
          <label className="field">{t('Language')}
            <Select value={v.language || 'en'} onChange={set('language')}>
              {Object.entries(LANGUAGES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
          </label>
          <label className="field">{t('Number format')}<input value={v.locale} onChange={set('locale')} required placeholder="ro-RO" /></label>
          {v.features.practice && <Locations list={v.locations || []} onChange={(locations) => setF({ ...v, locations })} />}
          {v.features.practice && (
            <label className="field full">{t('Legal entities')} <span className="hint">— {t('one per line; each patient is treated through one of them')}</span>
              <textarea rows={3} value={Array.isArray(v.entities) ? v.entities.join('\n') : v.entities || ''}
                onChange={(e) => setF({ ...v, entities: e.target.value })} />
            </label>
          )}
        </div>
        <div>
          <div className="kpi-label" style={{ marginBottom: 6 }}>{t('Parts of the app')}</div>
          <div className="form-grid">
            {Object.entries(data.features).map(([k, label]) => (
              <label key={k} className="check"><input type="checkbox" checked={!!v.features[k]} onChange={() => toggle(k)} /> {t(label)}</label>
            ))}
          </div>
        </div>
        <div><button className="btn btn-primary" disabled={!f}>{t('Save')}</button></div>
      </form>
    </div>
  );
}

/** The practice's locations: where sessions "at the practice" happen, each a name and an address. */
function Locations({ list, onChange }) {
  const change = (i, k) => (e) => onChange(list.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));
  return (
    <div className="field full">{t('Practice locations')} <span className="hint">— {t('where sessions “at the practice” happen')}</span>
      <div className="stack" style={{ gap: 6 }}>
        {list.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={l.name} onChange={change(i, 'name')} placeholder={t('Name, e.g. Sânandrei')} maxLength={60} required style={{ flex: '1 1 140px' }} />
            <input value={l.address} onChange={change(i, 'address')} placeholder={t('Address')} maxLength={300} style={{ flex: '3 1 240px' }} />
            <button type="button" className="btn btn-sm" onClick={() => onChange(list.filter((_, j) => j !== i))}>{t('Remove')}</button>
          </div>
        ))}
        <div><button type="button" className="btn btn-sm" onClick={() => onChange([...list, { name: '', address: '' }])}>{t('Add location')}</button></div>
      </div>
    </div>
  );
}
