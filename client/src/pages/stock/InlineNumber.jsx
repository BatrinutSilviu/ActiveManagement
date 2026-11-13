import { useEffect, useState } from 'react';
import { usePermissions } from '../../hooks.js';
import { number } from '../../format.js';

// Inline number editor that saves on blur / Enter (plain text for viewers).
export function InlineNumber({ value, onSave, step = 'any', prefix, width = 84, format = number }) {
  const [v, setV] = useState(String(value));
  const { canEdit } = usePermissions();
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { if (Number(v) !== Number(value) && v !== '') onSave(Number(v)); };
  if (!canEdit) return <span className="inline-num">{prefix}{format(value)}</span>;
  return (
    <span className="inline-num">
      {prefix}
      <input className="select-sm num-input" type="number" min="0" step={step} value={v} style={{ width }}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </span>
  );
}
