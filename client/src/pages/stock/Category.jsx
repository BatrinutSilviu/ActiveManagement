import { api } from '../../api.js';
import { usePermissions } from '../../hooks.js';
import { money, money0, number } from '../../format.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconChevronRight, IconEdit, IconPlus, IconTrash } from '../../components/Icons.jsx';
import { InlineNumber } from './InlineNumber.jsx';
import { t, tn } from '../../i18n/index.js';

/** Products of one category: price, who holds how much, total and value. */
function ItemsTable({ items, run, setForm, selected, setSelected }) {
  const { canEdit } = usePermissions();
  const allOn = items.every((i) => selected.has(i.id));
  const pick = (ids, on) => { const next = new Set(selected); ids.forEach((id) => (on ? next.add(id) : next.delete(id))); setSelected(next); };
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{canEdit && <th className="pick-col"><input type="checkbox" checked={allOn} onChange={(e) => pick(items.map((i) => i.id), e.target.checked)} aria-label={t('Select all products here')} /></th>}<th>{t('Product')}</th><th className="r hide-sm">{t('Price / unit')}</th><th className="r hide-sm">{t('Sells for')}</th><th className="hide-sm">{t('Who has it')}</th><th className="r">{t('Total')}</th><th className="r hide-sm">{t('Value')}</th><th className="r hide-sm">{t('Used at events')}</th>{canEdit && <th />}</tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className={selected.has(i.id) ? 'row-picked' : ''}>
              {canEdit && <td className="pick-col"><input type="checkbox" checked={selected.has(i.id)} onChange={(e) => pick([i.id], e.target.checked)} aria-label={t('Select {name}', { name: i.name })} /></td>}
              <td className="cell-wrap">
                <div className="row-title">{i.name}</div>
                <div className="row-sub">{i.unit}{i.prepaid ? ` · ${t('already paid')}` : ''}<span className="show-sm"> · {money(i.unit_price)} · {t('worth {value}', { value: money0(i.value) })}</span></div>
                <div className="row-sub show-sm">
                  {i.holdings.map((h) => `${h.name} ${number(h.qty)}`).join(' · ') || t('Nobody holds it')}
                  {canEdit && <> · <button className="link-btn" onClick={() => setForm({ move: i, mode: 'add' })}>{t('Add')}</button></>}
                  {canEdit && i.holdings.length > 0 && <> · <button className="link-btn" onClick={() => setForm({ move: i, mode: 'move' })}>{t('Move')}</button></>}
                  {canEdit && i.holdings.length > 0 && <> · <button className="link-btn" onClick={() => setForm({ sell: i })}>{t('Sell')}</button></>}
                </div>
              </td>
              <td className="r hide-sm">
                <InlineNumber value={i.unit_price} step="0.01" width={90} format={money}
                  onSave={(v) => run(() => api.put(`/stock/items/${i.id}`, { ...i, unit_price: v }))} />
              </td>
              <td className="r hide-sm">
                {i.sell_price > 0 ? <>{money(i.sell_price)}<div className={`row-sub ${i.sell_price < i.unit_price ? 'neg' : ''}`}>{t('{profit} profit each', { profit: money(i.sell_price - i.unit_price) })}</div></> : <span className="muted">—</span>}
              </td>
              <td className="hide-sm holders-cell">
                <div className="holder-list">
                  {i.holdings.map((h) => (
                    <div className="holder-row" key={h.person_id}>
                      <span className="holder-name">{h.name}</span>
                      <InlineNumber value={h.qty} width={90}
                        onSave={(v) => run(() => api.put('/stock/holdings', { item_id: i.id, person_id: h.person_id, qty: v }))} />
                    </div>
                  ))}
                  {!i.holdings.length && <span className="muted">{t('Nobody holds it')}</span>}
                  {canEdit && (
                    <div className="holder-actions">
                      <button className="link-btn" onClick={() => setForm({ move: i, mode: 'add' })}>+ {t('Add')}</button>
                      {i.holdings.length > 0 && <button className="link-btn" onClick={() => setForm({ move: i, mode: 'move' })}>{t('Move')}</button>}
                      {i.holdings.length > 0 && <button className="link-btn" onClick={() => setForm({ sell: i })}>{t('Sell')}</button>}
                    </div>
                  )}
                </div>
              </td>
              <td className={`r ${i.qty <= 5 ? 'neg' : ''}`}><strong>{number(i.qty)}</strong> <span className="muted">{i.unit}</span></td>
              <td className="r hide-sm">{money(i.value)}</td>
              <td className="r secondary hide-sm">{number(i.used)}</td>
              {canEdit && (
                <td className="r actions">
                  <button className="icon-btn" aria-label={t('Edit')} onClick={() => setForm({ item: i })}><IconEdit /></button>
                  <button className="icon-btn" aria-label={t('Delete')} onClick={() => confirmDelete(i.name) && run(() => api.del(`/stock/items/${i.id}`))}><IconTrash /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const sumUp = (list) => ({ count: list.length, value: list.reduce((a, i) => a + i.value, 0), low: list.filter((i) => i.qty <= 5).length });

/** A category, collapsed to one line; opening it shows its products and subcategories. */
export function Category({ cat, cats, items, open, toggle, run, setForm, selected, setSelected }) {
  const { canEdit } = usePermissions();
  const subs = cats.filter((c) => c.parent_id === cat.id);
  const own = items.filter((i) => i.category_id === cat.id);
  const all = items.filter((i) => i.category_id === cat.id || subs.some((sc) => sc.id === i.category_id));
  const sum = sumUp(all);
  const isOpen = open.includes(cat.id);
  const sub = !!cat.parent_id;
  const addSub = () => {
    const name = window.prompt(t('New subcategory of {name}', { name: cat.name }));
    if (name?.trim()) run(() => api.post('/stock/categories', { name, parent_id: cat.id }));
  };
  const rename = () => {
    const name = window.prompt(t('Rename subcategory'), cat.name);
    if (name?.trim() && name !== cat.name) run(() => api.put(`/stock/categories/${cat.id}`, { name }));
  };
  const remove = () => window.confirm(t('Delete the subcategory {name}? Its products move to the category above.', { name: cat.name }))
    && run(() => api.del(`/stock/categories/${cat.id}`));
  return (
    <div className={sub ? 'stock-sub' : `card stock-cat ${sum.count ? '' : 'is-empty'}`}>
      <div className="cat-head">
        <button className="cat-toggle" onClick={() => toggle(cat.id)} aria-expanded={isOpen}>
          <IconChevronRight width="16" className={`chev ${isOpen ? 'open' : ''}`} />
          <span className="cat-name">{cat.name}</span>
          <span className="muted">{sum.count ? `${tn(sum.count, '{n} product', '{n} products')} · ${money0(sum.value)}` : t('No products')}</span>
          {sum.low > 0 && <span className="badge low-badge">{t('{n} running low', { n: sum.low })}</span>}
        </button>
        {canEdit && isOpen && (
          <div className="cat-actions">
            <button className="btn btn-sm btn-ghost" onClick={() => setForm({ category: cat.id })}><IconPlus width="13" />{t('Product')}</button>
            {!sub && <button className="btn btn-sm btn-ghost" onClick={addSub}><IconPlus width="13" />{t('Subcategory')}</button>}
            {sub && <button className="icon-btn" aria-label={t('Rename {name}', { name: cat.name })} onClick={rename}><IconEdit /></button>}
            {sub && <button className="icon-btn" aria-label={t('Delete {name}', { name: cat.name })} onClick={remove}><IconTrash /></button>}
          </div>
        )}
      </div>
      {isOpen && (
        <div className="cat-body">
          {own.length > 0 && <ItemsTable items={own} run={run} setForm={setForm} selected={selected} setSelected={setSelected} />}
          {subs.map((c) => <Category key={c.id} cat={c} cats={cats} items={items} open={open} toggle={toggle} run={run} setForm={setForm} selected={selected} setSelected={setSelected} />)}
          {!own.length && !subs.length && <div className="empty">{t('No products here yet.')}</div>}
        </div>
      )}
    </div>
  );
}
