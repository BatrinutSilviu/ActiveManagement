import Select from '../../components/Select.jsx';
import { t } from '../../i18n/index.js';

/** Category picker: the big categories, each followed by its subcategories. */
export function CategorySelect({ cats, value, onChange, placeholder, ...props }) {
  const top = cats.filter((c) => !c.parent_id);
  return (
    <Select value={value || ''} onChange={onChange} required {...props}>
      <option value="">{placeholder ?? t('Choose…')}</option>
      {top.map((c) => (
        <optgroup key={c.id} label={c.name}>
          <option value={c.id}>{c.name}</option>
          {cats.filter((x) => x.parent_id === c.id).map((x) => <option key={x.id} value={x.id}>{c.name} › {x.name}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}
