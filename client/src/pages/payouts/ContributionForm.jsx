import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks.js';
import { number } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import { scales } from '../../points.js';
import Select from '../../components/Select.jsx';
import { t } from '../../i18n/index.js';

function pointsLabel(a) {
  const [lo, hi] = [a.organizer_points, a.organizer_max];
  if (scales(a)) return hi ? `${number(lo)}–${number(hi)}` : `${number(lo)}+`;
  return hi ? `${number(lo)}–${number(hi)}` : number(lo);
}

export function ContributionForm({ month, item, onClose, onSaved }) {
  const { data: people } = useApi('/people');
  const { data: activities } = useApi('/activities');
  const [f, setF] = useState(() => ({
    person_id: '', activity_id: '', points: '', note: '',
    date: month === new Date().toISOString().slice(0, 7) ? new Date().toISOString().slice(0, 10) : `${month}-01`, ...(item || {}),
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pickActivity = (e) => {
    const a = activities.find((x) => String(x.id) === e.target.value);
    setF({ ...f, activity_id: e.target.value, points: a ? a.organizer_points : f.points });
  };
  const save = async () => {
    try {
      if (item) await api.put(`/contributions/${item.id}`, f);
      else await api.post('/contributions', f);
      onSaved();
    } catch (e) { setError(e.message); }
  };
  const act = activities?.find((x) => String(x.id) === String(f.activity_id));
  return (
    <Modal title={item ? t('Edit contribution') : t('Add points')} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Save')}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>{t('For work that isn’t an event in the app — a partnership, a promo event, a free event with a partner club. People get points for event tasks on the event page.')}</p>
      <div className="form-grid">
        <label className="field">{t('Person')}
          <Select value={f.person_id} onChange={set('person_id')} required>
            <option value="">{t('Choose…')}</option>
            {people?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label className="field">{t('Date')}<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field full">{t('Activity')}
          <Select value={f.activity_id || ''} onChange={pickActivity}>
            <option value="">{t('— other —')}</option>
            {activities?.map((a) => <option key={a.id} value={a.id}>{a.name} · {t('{n} pts', { n: pointsLabel(a) })}</option>)}
          </Select>
        </label>
        <label className="field">{t('Points')}
          <input type="number" min="0" step="0.5" value={f.points} onChange={set('points')} required />
          {act?.organizer_max && <span className="hint">{t('Between {min} and {max} depending on complexity', { min: number(act.organizer_points), max: number(act.organizer_max) })}</span>}
        </label>
        <label className="field">{t('Note')}<input value={f.note || ''} onChange={set('note')} placeholder={t('e.g. Partnership with Padel Arena')} /></label>
      </div>
    </Modal>
  );
}
