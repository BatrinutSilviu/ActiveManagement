import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Pick a person by typing: suggestions appear as you type (no long list), and a name that isn't in
 * People can be added on the spot. `value` is the person's id; onChange(id) also gets the new id.
 */
export default function PersonPicker({ people, value, onChange, onCreated, required, placeholder = 'Type a name…', className = '', autoFocus, allowCreate = true }) {
  const current = people?.find((p) => String(p.id) === String(value));
  const [text, setText] = useState(current?.name || '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const box = useRef(null);

  useEffect(() => { if (current) setText(current.name); }, [current?.name]); // follows outside changes (and a new person once loaded)

  const q = fold(text.trim());
  const matches = useMemo(() => {
    if (!q || (current && fold(current.name) === q)) return [];
    const list = (people || []).filter((p) => (p.active || String(p.id) === String(value)) && fold(p.name).includes(q));
    return list.sort((a, b) => fold(a.name).indexOf(q) - fold(b.name).indexOf(q) || a.name.localeCompare(b.name)).slice(0, 8);
  }, [people, q, value, current]);
  const exact = (people || []).some((p) => fold(p.name) === q);
  const canCreate = allowCreate && q && !exact;
  const options = [...matches.map((p) => ({ person: p })), ...(canCreate ? [{ create: text.trim() }] : [])];

  const choose = async (o) => {
    if (!o) return;
    setError(null);
    if (o.person) { onChange(o.person.id); setText(o.person.name); setOpen(false); return; }
    setBusy(true);
    try {
      const { id } = await api.post('/people', { name: o.create });
      await onCreated?.(id);
      onChange(id);
      setText(o.create);
      setOpen(false);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  useEffect(() => {
    const outside = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  const onKey = (e) => {
    if (!open || !options.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + options.length) % options.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(options[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  return (
    <div className="person-picker" ref={box}>
      <input className={className} value={text} placeholder={placeholder} autoFocus={autoFocus} disabled={busy} autoComplete="off"
        role="combobox" aria-expanded={open && options.length > 0} aria-autocomplete="list"
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); if (value) onChange(''); }}
        onFocus={() => setOpen(true)} onKeyDown={onKey} />
      {required && <input className="select-required" tabIndex={-1} aria-hidden="true" value={value || ''} required onChange={() => {}} />}
      {open && options.length > 0 && (
        <div className="select-pop person-pop" role="listbox">
          <div className="select-list">
            {options.map((o, i) => (
              <div key={o.person ? o.person.id : 'new'} role="option" aria-selected={i === active} data-active={i === active}
                className={`select-option ${o.create ? 'is-create' : ''}`} onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
                {o.person ? <span>{o.person.name}{!o.person.active && <span className="muted"> · inactive</span>}</span>
                  : <span>+ Add “{o.create}” as a new person</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <span className="hint neg">{error}</span>}
    </div>
  );
}
