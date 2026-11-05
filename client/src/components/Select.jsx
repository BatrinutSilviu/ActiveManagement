import { Children, Fragment, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A drop-in replacement for <select>: same children (<option>, <optgroup>), same value / onChange(e)
// with e.target.value, but its list looks the same in every browser. Long lists get a search box.

const textOf = (children) => Children.toArray(children).map((c) => (typeof c === 'string' || typeof c === 'number' ? c : isValidElement(c) ? textOf(c.props.children) : '')).join('');
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function flatten(children, group = null, out = []) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === Fragment) return flatten(c.props.children, group, out);
    if (c.type === 'optgroup') return flatten(c.props.children, c.props.label, out);
    if (c.type === 'option') {
      const label = textOf(c.props.children);
      out.push({ value: String(c.props.value ?? label), label, disabled: !!c.props.disabled, group });
    }
  });
  return out;
}

/** Where the list goes: under the field, or above it when there's no room below. */
function usePlacement(open, anchor) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      const up = below < 220 && above > below;
      const minWidth = Math.min(Math.max(r.width, 180), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - minWidth - 8));
      const maxWidth = Math.max(minWidth, Math.min(440, window.innerWidth - left - 8)); // long labels widen the list
      setPos({ left, minWidth, maxWidth, maxHeight: Math.min(340, up ? above : below), ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor]);
  return pos;
}

export default function Select({ value, onChange, children, className = '', style, disabled, required, autoFocus, searchable, ...rest }) {
  const items = useMemo(() => flatten(children), [children]);
  const current = String(value ?? '');
  const selected = items.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const btn = useRef(null), pop = useRef(null), list = useRef(null);
  const pos = usePlacement(open, btn);
  const withSearch = searchable ?? items.length > 8;

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? items.filter((o) => o.value !== '' && fold(o.label).includes(q)) : items;
  }, [items, query]);
  const enabled = (i) => shown[i] && !shown[i].disabled;

  const show = () => {
    if (disabled) return;
    setQuery('');
    setActive(Math.max(items.findIndex((o) => o.value === current), 0));
    setOpen(true);
  };
  const close = (focus = true) => { setOpen(false); if (focus) btn.current?.focus(); };
  const pick = (o) => {
    if (!o || o.disabled) return;
    close();
    if (o.value !== current) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } });
  };
  const move = (d) => {
    if (!shown.length) return;
    let i = active;
    for (let n = 0; n < shown.length; n++) {
      i = (i + d + shown.length) % shown.length;
      if (enabled(i)) break;
    }
    setActive(i);
  };

  useEffect(() => { if (open && query) setActive(shown.findIndex((o) => !o.disabled)); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) close(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open, pos]);
  useEffect(() => { if (open && !withSearch) pop.current?.focus(); }, [open, withSearch]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close(false);
  };
  const onButtonKey = (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
  };

  let lastGroup = null;
  return (
    <>
      <button type="button" ref={btn} className={`select ${open ? 'open' : ''} ${className}`} style={style} disabled={disabled} autoFocus={autoFocus}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close() : show())} onKeyDown={onButtonKey} {...rest}>
        <span className={`select-value ${!selected || selected.value === '' ? 'is-blank' : ''}`}>{selected?.label ?? ''}</span>
      </button>
      {required && (
        <input className="select-required" tabIndex={-1} aria-hidden="true" value={current} required onChange={() => {}}
          onFocus={() => btn.current?.focus()} />
      )}
      {open && pos && createPortal(
        <div ref={pop} className="select-pop" style={pos} tabIndex={-1} onKeyDown={onKey} role="presentation">
          {withSearch && (
            <input className="select-search" autoFocus placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the list" />
          )}
          <div ref={list} className="select-list" role="listbox">
            {shown.map((o, i) => {
              const head = o.group && o.group !== lastGroup ? <div className="select-group" key={`g-${o.group}`}>{o.group}</div> : null;
              lastGroup = o.group;
              return (
                <Fragment key={`${o.group}-${o.value}-${i}`}>
                  {head}
                  <div role="option" aria-selected={o.value === current} aria-disabled={o.disabled} data-active={i === active}
                    className={`select-option ${o.value === current ? 'is-selected' : ''} ${o.disabled ? 'is-disabled' : ''} ${o.value === '' ? 'is-blank' : ''}`}
                    onMouseEnter={() => !o.disabled && setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
                    <span>{o.label}</span>
                    {o.value === current && <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </div>
                </Fragment>
              );
            })}
            {!shown.length && <div className="select-none">Nothing matches “{query}”</div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
