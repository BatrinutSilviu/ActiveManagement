import { useEffect, useMemo, useRef, useState } from 'react';
import { fold } from '../util.js';
import { t } from '../i18n/index.js';

/**
 * A name, typed: someone from People is suggested as you type, but any name can be kept — nobody is added
 * to People (it's only the team). The server links the name to a person when it matches one.
 */
export default function NameInput({ people, value, onChange, exclude, required, placeholder, className = '', autoFocus, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);

  const q = fold(value.trim());
  const matches = useMemo(() => {
    if (!q) return [];
    return (people || []).filter((p) => p.active && fold(p.name).includes(q) && fold(p.name) !== q && !exclude?.(p))
      .sort((a, b) => fold(a.name).indexOf(q) - fold(b.name).indexOf(q) || a.name.localeCompare(b.name)).slice(0, 8);
  }, [people, q, exclude]);

  useEffect(() => {
    const outside = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  const choose = (p) => { onChange(p.name); setOpen(false); };
  const onKey = (e) => {
    if (!open || !matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  return (
    <div className="person-picker" ref={box}>
      <input className={className} value={value} placeholder={placeholder ?? t('Name')} autoFocus={autoFocus} autoComplete="off" required={required}
        aria-label={ariaLabel} role="combobox" aria-expanded={open && matches.length > 0} aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
      {open && matches.length > 0 && (
        <div className="select-pop person-pop" role="listbox">
          <div className="select-list">
            {matches.map((p, i) => (
              <div key={p.id} role="option" aria-selected={i === active} data-active={i === active} className="select-option"
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                <span>{p.name}{p.is_founder ? <span className="muted"> · {t('founder')}</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
