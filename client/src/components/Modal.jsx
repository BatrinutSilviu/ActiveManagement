import { useEffect } from 'react';
import { IconX } from './Icons.jsx';

export default function Modal({ title, onClose, children, footer, onSubmit }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Body = onSubmit ? 'form' : 'div';
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Body className="modal card" role="dialog" aria-modal="true" aria-label={title}
        onSubmit={onSubmit ? (e) => { e.preventDefault(); onSubmit(); } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </Body>
    </div>
  );
}

export function confirmDelete(what) {
  return window.confirm(`Delete ${what}? This cannot be undone.`);
}
