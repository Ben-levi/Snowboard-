import { useState } from 'react';
import { t } from '../i18n/he.js';

// Small form driven by field definitions (src/data/infoFields.js). Saves trimmed strings.
export default function FieldsForm({ fields, values, onSave, onCancel, submitLabel = t.save, className = '' }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(fields.map((f) => [f.id, values?.[f.id] ?? ''])));
  const [busy, setBusy] = useState(false);
  const set = (id, value) => setDraft((d) => ({ ...d, [id]: value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, String(v ?? '').trim()])));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`fields-form ${className}`} onSubmit={submit}>
      <div className="fields-grid">
        {fields.map((f) => (
          <label key={f.id} className={`field${f.half ? ' half' : ''}`}>
            <span>{f.label}</span>
            {f.type === 'textarea' ? (
              <textarea rows={3} maxLength={500} value={draft[f.id]} onChange={(e) => set(f.id, e.target.value)} />
            ) : f.type === 'select' ? (
              <select value={draft[f.id]} onChange={(e) => set(f.id, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input type={f.type} maxLength={120} value={draft[f.id]} onChange={(e) => set(f.id, e.target.value)} />
            )}
          </label>
        ))}
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>{t.cancel}</button>
        )}
        <button className="btn btn-primary" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}

export const groupField = (groups) => ({
  id: 'groupId',
  type: 'select',
  label: t.fields.group,
  options: [{ value: '', label: t.home.noGroup }, ...groups.map((g) => ({ value: g.id, label: `${g.emoji} ${g.name}` }))],
});
