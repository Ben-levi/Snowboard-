import { t } from './he.js';
import { requestTilt } from './TouchControls.jsx';

const KEY = 'ride:settings';

export function loadSettings(touchDevice) {
  const defaults = { mode: 'sides', assist: touchDevice };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

// Phone control scheme, steering assist and fullscreen.
export default function Settings({ settings, onChange, onClose, touchDevice }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  return (
    <div className="ride-screen" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ride-card settings-card">
        <div className="menu-head">
          <h1>⚙️ {t.settings}</h1>
          <button className="ride-chip" onClick={onClose}>
            {t.close}
          </button>
        </div>
        {touchDevice && (
          <>
            <h2>{t.controlMode}</h2>
            <div className="menu-tabs" role="radiogroup">
              {['sides', 'tilt', 'stick'].map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={settings.mode === m}
                  className={settings.mode === m ? 'on' : ''}
                  onClick={async () => {
                    if (m === 'tilt' && !(await requestTilt())) return;
                    set({ mode: m });
                  }}
                >
                  {t.modes[m]}
                </button>
              ))}
            </div>
          </>
        )}
        <label className="settings-row">
          <input type="checkbox" checked={settings.assist} onChange={(e) => set({ assist: e.target.checked })} />
          <span>
            <b>{t.assist}</b>
            <small>{t.assistHint}</small>
          </span>
        </label>
        {document.fullscreenEnabled && (
          <button
            className="ride-chip settings-full"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
          >
            ⛶ {t.fullscreen}
          </button>
        )}
      </div>
    </div>
  );
}
