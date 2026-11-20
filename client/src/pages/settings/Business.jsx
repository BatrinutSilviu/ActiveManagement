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
      const { locations, conditions, therapists, entities, ...rest } = v; // edited in their own cards (venues, illness categories, therapists, legal entities)
      await api.put('/business', rest);
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

