import { t } from '../i18n/he.js';
import { gearFor, SECTIONS } from '../data/gearCatalog.js';
import { addTodo, checklistProgress, gearToBuy, removeTodo, suggestionsFor, todoList, toggleTodo, tripChecklist } from '../lib/todo.js';
import { itemOf, store } from '../lib/store/index.js';
import Checklist from './Checklist.jsx';

const COVERED = new Set(['own', 'borrowed', 'skip']);

function Progress({ done, total, ratio }) {
  return (
    <div className="home-progress">
      <span className="progress">
        <span style={{ width: `${ratio * 100}%`, background: 'var(--brand)' }} />
      </span>
      <span className="muted small">{t.list.ready(done, total)}</span>
    </div>
  );
}

// "To buy": my own entries plus catalog gear marked buy. Ticking a catalog item marks it as owned.
function BuySection({ tripCode, me }) {
  const mine = todoList(me, 'buy');
  const fromGear = gearToBuy(me);
  const save = (list) => store.setTodo(tripCode, me.id, 'buy', list);
  const rows = [
    ...fromGear.map((g) => ({ id: `gear:${g.id}`, text: `${g.emoji} ${g.label}`, done: false, tag: t.list.buyFromGear, fixed: true })),
    ...mine,
  ];
  return (
    <section className="card list-card" data-list="buy">
      <h2>{t.list.buyTitle}</h2>
      <Checklist
        items={rows}
        placeholder={t.list.buyPlaceholder}
        empty={t.list.buyEmpty}
        onAdd={(text) => save(addTodo(mine, text))}
        onToggle={(id) => {
          if (id.startsWith('gear:')) {
            const gid = id.slice(5);
            store.setItem(tripCode, me.id, gid, { ...itemOf(me, gid), status: 'own' });
          } else save(toggleTodo(mine, id));
        }}
        onRemove={(id) => save(removeTodo(mine, id))}
      />
    </section>
  );
}

function RememberSection({ tripCode, me, trip }) {
  const mine = todoList(me, 'remember');
  const shared = tripChecklist(trip).map((x) => ({
    id: `trip:${x.id}`,
    text: x.text,
    done: Boolean(me.todo?.shared?.[x.id]),
    tag: t.list.tripTitle,
    fixed: true,
  }));
  const save = (list) => store.setTodo(tripCode, me.id, 'remember', list);
  return (
    <section className="card list-card" data-list="remember">
      <h2>{t.list.rememberTitle}</h2>
      <Checklist
        items={[...shared, ...mine]}
        placeholder={t.list.rememberPlaceholder}
        empty={t.list.rememberEmpty}
        suggestions={suggestionsFor(mine, t.starterRemember)}
        onAdd={(text) => save(addTodo(mine, text))}
        onToggle={(id) => {
          if (id.startsWith('trip:')) {
            const key = id.slice(5);
            store.setTodo(tripCode, me.id, 'shared', { ...me.todo?.shared, [key]: !me.todo?.shared?.[key] });
          } else save(toggleTodo(mine, id));
        }}
        onRemove={(id) => save(removeTodo(mine, id))}
      />
    </section>
  );
}

// The catalog as a flat packing list: tick = I have it, 🛒 = I need to buy it.
function PackSection({ tripCode, me, onGoGear }) {
  const gear = gearFor(me.rider);
  const set = (g, status) => store.setItem(tripCode, me.id, g.id, { ...itemOf(me, g.id), status });
  return (
    <section className="card list-card" data-list="pack">
      <div className="card-head">
        <h2>{t.list.packTitle}</h2>
        <button className="btn btn-small" onClick={onGoGear}>{t.list.all3d}</button>
      </div>
      <p className="muted small">{t.list.packHint}</p>
      {SECTIONS.map((sec) => {
        const items = gear.filter((g) => g.section === sec.id);
        if (!items.length) return null;
        return (
          <details key={sec.id} className="pack-section" open={items.some((g) => !itemOf(me, g.id).status)}>
            <summary>
              <span>{sec.emoji} {sec.label}</span>
              <span className="muted small">
                {items.filter((g) => COVERED.has(itemOf(me, g.id).status)).length}/{items.length}
              </span>
            </summary>
            <ul className="check-list">
              {items.map((g) => {
                const status = itemOf(me, g.id).status;
                const have = COVERED.has(status);
                return (
                  <li key={g.id} className={`check-row${have ? ' done' : ''}`}>
                    <label>
                      <input type="checkbox" checked={have} onChange={() => set(g, have ? null : 'own')} />
                      <span>{g.emoji} {g.label}</span>
                    </label>
                    <button
                      type="button"
                      className={`icon-btn${status === 'buy' ? ' on' : ''}`}
                      aria-pressed={status === 'buy'}
                      aria-label={t.list.buyIt}
                      title={t.list.buyIt}
                      onClick={() => set(g, status === 'buy' ? null : 'buy')}
                    >
                      🛒
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

// My own lists (background page): what to buy, what not to forget, and packing from the gear catalog.
export default function MyListsView({ tripCode, trip, me, onShow3d }) {
  const progress = checklistProgress(me, trip);
  return (
    <div className="my-lists">
      <section className="card">
        <h2>{t.list.mineTitle}</h2>
        <Progress {...progress} />
      </section>
      <BuySection tripCode={tripCode} me={me} />
      <RememberSection tripCode={tripCode} me={me} trip={trip} />
      <PackSection tripCode={tripCode} me={me} onGoGear={onShow3d} />
    </div>
  );
}
