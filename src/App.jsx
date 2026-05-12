import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FREQ_DAYS,
  FREQ_LABELS,
  FREQ_ORDER,
  ROOM_ORDER,
  ROOM_ICONS,
  BIN_STYLES
} from './constants.js';
import { hasToken, setToken, clearToken, loadState, saveState } from './github.js';

// ---------- date helpers ----------
const MS_PER_DAY = 86400000;

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00').getTime();
  const b = new Date(toISO + 'T00:00:00').getTime();
  return Math.floor((b - a) / MS_PER_DAY);
}

function formatLongDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function formatMonthYear(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatDayMonth(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---------- task helpers ----------
// A task displays as "done" only while its next cycle is still in the future.
// Once the due date arrives, the visual reverts to not-done so the user can
// re-tick it for the next cycle without having to manually un-tick.
function isDone(task, refISO) {
  if (!task.done) return false;
  if (task.freq === 'any') return task.last_completed === refISO;
  return daysBetween(refISO, task.due_date) > 0;
}

function renderTaskName(text) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return parts.map((part, i) => {
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function bucketOf(task, refISO) {
  if (task.freq === 'any') return 'urgent';
  const d = daysBetween(refISO, task.due_date);
  if (d <= 3) return 'urgent';
  if (d <= 7) return 'week';
  return 'later';
}

function dueBadge(task, refISO) {
  if (task.freq === 'any') {
    return { label: 'As needed', cls: 'badge-amber' };
  }
  const d = daysBetween(refISO, task.due_date);
  if (d < 0) return { label: `${-d}d overdue`, cls: 'badge-red' };
  if (d === 0) return { label: 'Today', cls: 'badge-amber' };
  if (d <= 3) return { label: `${d}d`, cls: 'badge-yellow' };
  if (d <= 7) return { label: `${d}d`, cls: 'badge-green' };
  return { label: `${d}d`, cls: 'badge-blue' };
}

function sortTasksForRoom(list, refISO) {
  return [...list].sort((a, b) => {
    const aDone = isDone(a, refISO);
    const bDone = isDone(b, refISO);
    if (aDone !== bDone) return aDone ? 1 : -1;
    const da = a.freq === 'any' ? 0 : daysBetween(refISO, a.due_date);
    const db = b.freq === 'any' ? 0 : daysBetween(refISO, b.due_date);
    if (da !== db) return da - db;
    return a.task.localeCompare(b.task);
  });
}

// ---------- day-shift parsing for Task List ----------
const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

function parseDayShift(text, refISO) {
  const t = text.toLowerCase();
  // Order matters: check longer phrases first.
  if (t.includes('day after tomorrow') || t.includes('day after')) return 2;
  if (t.includes('tomorrow')) return 1;
  const inN = t.match(/in (\d+)\s*days?/);
  if (inN) {
    const n = parseInt(inN[1], 10);
    if (n > 0 && n <= 30) return n;
  }
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(t)) {
      const todayWd = new Date(refISO + 'T00:00:00').getDay();
      let diff = i - todayWd;
      if (diff <= 0) diff += 7;
      return diff;
    }
  }
  return 0;
}

// ---------- Task List generation ----------
// Task list includes every task due within today + 3 days, regardless of done state.
function generateTaskListText(state, refISO, shiftDays) {
  const lines = [];
  lines.push('🏠 Task List');
  lines.push(formatLongDate(refISO) + (shiftDays > 0 ? ' (planned ahead)' : ''));
  lines.push('');

  const urgent = state.tasks.filter(
    (t) => bucketOf(t, refISO) === 'urgent'
  );
  const pickedIds = new Set();

  const softener = urgent.find((t) => t.task === 'Regenerate softener');
  const cook = urgent.find((t) => t.room === 'Kitchen' && t.task === 'Cook food');

  const section = (title, bullets) => {
    if (!bullets.length) return;
    lines.push(title);
    lines.push('──────────────');
    for (const b of bullets) lines.push(b);
    lines.push('');
  };

  const taskBullet = (t) => {
    const out = [`  • ${t.task}`];
    if (t.note && t.note.trim()) out.push(`      ↳ ${t.note.trim()}`);
    return out;
  };

  if (softener) {
    section('⏱️ Start first', taskBullet(softener));
    pickedIds.add(softener.id);
  }
  if (cook) {
    section('🍳 Kitchen', taskBullet(cook));
    pickedIds.add(cook.id);
  }

  // Bins section: next future collection whose date is 1–3 days after refISO.
  const futureBins = state.bins
    .filter((b) => daysBetween(refISO, b.date) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (futureBins.length) {
    const nextBin = futureBins[0];
    const daysAway = daysBetween(refISO, nextBin.date);
    if (daysAway >= 1 && daysAway <= 3) {
      const when =
        daysAway === 1 ? 'tomorrow' : daysAway === 2 ? 'in 2 days' : 'in 3 days';
      const joined = nextBin.bins.join(' & ');
      section(`🗑️ Bins — collection ${when}`, [`  • Put ${joined} outside`]);
    }
  }

  // Remaining urgent tasks grouped by room.
  for (const room of ROOM_ORDER) {
    if (room === 'Laundry' || room === 'Kitchen') {
      // Already handled dedicated priority items — still include OTHER urgent tasks from these rooms.
    }
    const items = urgent.filter((t) => t.room === room && !pickedIds.has(t.id));
    if (!items.length) continue;
    const bullets = items.flatMap(taskBullet);
    section(`${ROOM_ICONS[room]} ${room}`, bullets);
  }

  // Trim trailing blank line.
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

// ---------- small UI bits ----------
function SaveStatus({ status, error }) {
  if (status === 'saving') return <span className="save-status saving">💾 saving…</span>;
  if (status === 'saved') return <span className="save-status saved">✓ saved</span>;
  if (status === 'error') {
    return (
      <span
        className="save-status error"
        title={error || ''}
        onClick={() => error && alert(error)}
      >
        ⚠️ tap for error
      </span>
    );
  }
  return null;
}

// ---------- Token gate ----------
function TokenPrompt({ onSaved }) {
  const [value, setValue] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setToken(value);
    onSaved();
  };
  return (
    <div className="gate">
      <div className="gate-card">
        <h1>Connect to GitHub</h1>
        <p>
          Home Manager stores its data in <code>data/state.json</code> in your GitHub
          repo. Paste a fine-grained Personal Access Token with{' '}
          <strong>Contents: Read and write</strong> on <code>home_management</code>.
        </p>
        <p>
          <a
            href="https://github.com/settings/tokens?type=beta"
            target="_blank"
            rel="noreferrer"
          >
            Create a fine-grained PAT →
          </a>
        </p>
        <form onSubmit={submit}>
          <input
            type="password"
            placeholder="github_pat_…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-primary">
            Save &amp; continue
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- Tasks tab ----------
function TasksTab({ state, setState, refISO }) {
  const [subtab, setSubtab] = useState('all');
  const [collapsed, setCollapsed] = useState({});

  const counts = useMemo(() => {
    const c = { urgent: 0, week: 0, later: 0 };
    for (const t of state.tasks) {
      c[bucketOf(t, refISO)]++;
    }
    return c;
  }, [state.tasks, refISO]);

  const filtered = useMemo(() => {
    if (subtab === 'all') return state.tasks;
    return state.tasks.filter((t) => bucketOf(t, refISO) === subtab);
  }, [state.tasks, subtab, refISO]);

  const byRoom = useMemo(() => {
    const map = {};
    for (const t of filtered) {
      if (!map[t.room]) map[t.room] = [];
      map[t.room].push(t);
    }
    for (const r of Object.keys(map)) map[r] = sortTasksForRoom(map[r], refISO);
    return map;
  }, [filtered, refISO]);

  const toggleRoom = (room) =>
    setCollapsed((c) => ({ ...c, [room]: !c[room] }));

  const tick = (task, onDate = refISO) => {
    const eff = isDone(task, refISO);
    const updates = eff
      ? { done: false }
      : {
          done: true,
          last_completed: onDate,
          due_date: task.freq === 'any' ? onDate : addDays(onDate, FREQ_DAYS[task.freq])
        };
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, ...updates } : t))
    }));
  };

  const shift = (task, arrow) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => {
        if (t.id !== task.id) return t;
        const newDate =
          typeof arrow.delta === 'number'
            ? addDays(t.due_date, arrow.delta)
            : addDays(refISO, arrow.days);
        return { ...t, due_date: newDate };
      })
    }));
  };

  const subtabs = [
    ['all', 'All', null],
    ['urgent', '⚡ 3 Days', counts.urgent],
    ['week', '📅 This Week', counts.week],
    ['later', '🌿 Later', counts.later]
  ];

  return (
    <>
      <div className="subtabs">
        {subtabs.map(([key, label, count]) => (
          <button
            key={key}
            className={subtab === key ? 'subtab active' : 'subtab'}
            onClick={() => setSubtab(key)}
          >
            {label}
            {count != null && <span className="pill">{count}</span>}
          </button>
        ))}
      </div>

      {ROOM_ORDER.filter((r) => byRoom[r]?.length).map((room) => {
        const items = byRoom[room];
        const isCollapsed = !!collapsed[room];
        return (
          <section key={room} className="room">
            <button className="room-head" onClick={() => toggleRoom(room)}>
              <span className="room-title">
                {ROOM_ICONS[room]} {room}
              </span>
              <span className="room-count">
                {items.length}
                <span className={isCollapsed ? 'chev collapsed' : 'chev'}>▾</span>
              </span>
            </button>
            {!isCollapsed && (
              <ul className="task-list">
                {items.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    refISO={refISO}
                    onTick={(date) => tick(t, date)}
                    onShift={(a) => shift(t, a)}
                    subtab={subtab}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {!ROOM_ORDER.some((r) => byRoom[r]?.length) && (
        <p className="empty">Nothing here.</p>
      )}
    </>
  );
}

function TaskRow({ task, refISO, onTick, onShift, subtab }) {
  const badge = dueBadge(task, refISO);
  const b = bucketOf(task, refISO);
  // Tasks are always shown as actionable: the recurring "done" state
  // is reflected by the next-due bucket, not by struck-through styling.
  const done = false;
  const [showMore, setShowMore] = useState(false);
  const [pickDate, setPickDate] = useState(refISO);

  // Bucket-shift arrows — only when not done and only in bucket-specific subtabs.
  const arrows = [];
  if (!done) {
    arrows.push({ label: '← 4 day', delta: -4 });
    if (b === 'urgent' && subtab !== 'all') {
      arrows.push({ label: '→ Week', days: 7 });
    } else if (b === 'week') {
      arrows.push({ label: '← 3 Days', days: 2 });
      arrows.push({ label: '→ Later', days: 21 });
    } else if (b === 'later') {
      arrows.push({ label: '← Week', days: 7 });
    }
    arrows.push({ label: '→ 4 day', delta: 4 });
  }

  return (
    <li className={done ? 'task done' : 'task'}>
      <label className="check">
        <input
          type="checkbox"
          checked={done}
          onChange={() => onTick()}
        />
        <span className="box" />
      </label>
      <div className="task-main">
        <div className="task-name">{renderTaskName(task.task)}</div>
        {task.note && <div className="task-note">{task.note}</div>}
        <div className="task-sub">every {FREQ_LABELS[task.freq]}</div>
        {arrows.length > 0 && (
          <div className="shift-row">
            {arrows.map((a) => (
              <button key={a.label} className="shift" onClick={() => onShift(a)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        {!done && (
          <div className="shift-row">
            {[1, 2].map((n) => (
              <button
                key={n}
                className="shift shift-done"
                onClick={() => onTick(addDays(refISO, -n))}
              >
                ✓ {n} day
              </button>
            ))}
            <button
              className="shift shift-done"
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? 'Cancel' : '✓ on…'}
            </button>
          </div>
        )}
        {showMore && (
          <div className="shift-row">
            {[3, 4, 5, 6].map((n) => (
              <button
                key={n}
                className="shift shift-done"
                onClick={() => {
                  onTick(addDays(refISO, -n));
                  setShowMore(false);
                }}
              >
                ✓ {n} day
              </button>
            ))}
            <button
              className="shift shift-done"
              onClick={() => {
                onTick(addDays(refISO, -7));
                setShowMore(false);
              }}
            >
              ✓ 1 week
            </button>
            <input
              type="date"
              className="input input-inline"
              value={pickDate}
              max={refISO}
              onChange={(e) => setPickDate(e.target.value)}
            />
            <button
              className="shift shift-done"
              onClick={() => {
                onTick(pickDate);
                setShowMore(false);
              }}
            >
              ✓ on {pickDate}
            </button>
          </div>
        )}
      </div>
      <span className={`badge ${badge.cls}`}>{badge.label}</span>
    </li>
  );
}

// ---------- Frequencies tab ----------
function FrequenciesTab({ state, setState }) {
  const byRoom = useMemo(() => {
    const map = {};
    for (const t of state.tasks) {
      if (!map[t.room]) map[t.room] = [];
      map[t.room].push(t);
    }
    for (const r of Object.keys(map)) {
      map[r].sort((a, b) => a.task.localeCompare(b.task));
    }
    return map;
  }, [state.tasks]);

  const setFreq = (taskId, freq) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, freq } : t))
    }));
  };

  return (
    <>
      {ROOM_ORDER.filter((r) => byRoom[r]?.length).map((room) => (
        <section key={room} className="room">
          <div className="room-head static">
            <span className="room-title">
              {ROOM_ICONS[room]} {room}
            </span>
          </div>
          <ul className="freq-list">
            {byRoom[room].map((t) => (
              <li key={t.id} className="freq-row">
                <div className="freq-task">{renderTaskName(t.task)}</div>
                <div className="chip-row">
                  {FREQ_ORDER.map((f) => (
                    <button
                      key={f}
                      className={t.freq === f ? 'chip active' : 'chip'}
                      onClick={() => setFreq(t.id, f)}
                    >
                      {FREQ_LABELS[f]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// ---------- Task List tab ----------
function TaskListTab({ state, refISO }) {
  const [notes, setNotes] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = () => {
    const shift = parseDayShift(notes, refISO);
    const target = shift === 0 ? refISO : addDays(refISO, shift);
    setOutput(generateTaskListText(state, target, shift));
    setCopied(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fall back: nothing fancy — user can long-press to select.
    }
  };

  return (
    <>
      <section className="card">
        <h2 className="card-title">🏠 Task List</h2>
        <p className="muted">
          Day-shift hints: type <em>tomorrow</em>, <em>day after</em>,{' '}
          <em>in N days</em>, or a weekday like <em>on tuesday</em> (next one).
        </p>
        <textarea
          className="notes"
          placeholder="Optional notes (not saved, not included in output)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
        <button className="btn-primary" onClick={generate}>
          Generate Task List
        </button>
      </section>

      {output && (
        <section className="card">
          <pre className="output">{output}</pre>
          <button className="btn-secondary" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy to clipboard'}
          </button>
        </section>
      )}
    </>
  );
}

// ---------- Bins tab ----------
function BinsTab({ state, setState, refISO }) {
  const [date, setDate] = useState('');
  const [picked, setPicked] = useState([]);

  const sorted = useMemo(
    () => [...state.bins].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [state.bins]
  );

  const futureOrToday = sorted.filter((b) => daysBetween(refISO, b.date) >= 0);
  const allPast = sorted.length > 0 && futureOrToday.length === 0;
  const fewLeft = futureOrToday.length > 0 && futureOrToday.length <= 2;

  // Group by month, preserving chronological order.
  const groups = useMemo(() => {
    const g = [];
    let cur = null;
    for (const b of sorted) {
      const key = b.date.slice(0, 7);
      if (!cur || cur.key !== key) {
        cur = { key, label: formatMonthYear(b.date), items: [] };
        g.push(cur);
      }
      cur.items.push(b);
    }
    return g;
  }, [sorted]);

  const nextDate = futureOrToday[0]?.date;

  const togglePick = (bin) =>
    setPicked((p) => (p.includes(bin) ? p.filter((x) => x !== bin) : [...p, bin]));

  const add = () => {
    if (!date || picked.length === 0) return;
    setState((s) => ({
      ...s,
      bins: [...s.bins.filter((b) => b.date !== date), { date, bins: picked }]
    }));
    setDate('');
    setPicked([]);
  };

  return (
    <>
      {allPast && (
        <div className="banner banner-error">
          All bin collections are in the past — add upcoming dates below.
        </div>
      )}
      {fewLeft && (
        <div className="banner banner-warn">
          Only {futureOrToday.length} future collection
          {futureOrToday.length === 1 ? '' : 's'} left — add more below.
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} className="room">
          <div className="room-head static">
            <span className="room-title">{g.label}</span>
          </div>
          <ul className="bin-list">
            {g.items.map((b) => {
              const days = daysBetween(refISO, b.date);
              const past = days < 0;
              const isNext = b.date === nextDate;
              const badge =
                days === 0
                  ? 'Today'
                  : days === 1
                  ? 'Tomorrow'
                  : days > 1
                  ? `in ${days}d`
                  : null;
              return (
                <li
                  key={b.date}
                  className={`bin-row${past ? ' past' : ''}${isNext ? ' next' : ''}`}
                >
                  <div className="bin-date">
                    {formatDayMonth(b.date)}
                    {isNext && badge && <span className="bin-next">{badge}</span>}
                  </div>
                  <div className="bin-chips">
                    {b.bins.map((name) => {
                      const style = BIN_STYLES[name] || {
                        bg: '#666',
                        fg: '#fff'
                      };
                      return (
                        <span
                          key={name}
                          className="bin-chip"
                          style={{ background: style.bg, color: style.fg }}
                        >
                          {name}
                        </span>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="card">
        <h2 className="card-title">Add collection</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input"
        />
        <div className="chip-row">
          {['Black bin', 'Blue bin', 'Green bin'].map((b) => {
            const style = BIN_STYLES[b];
            const active = picked.includes(b);
            return (
              <button
                key={b}
                onClick={() => togglePick(b)}
                className="chip"
                style={
                  active
                    ? { background: style.bg, color: style.fg, borderColor: style.bg }
                    : undefined
                }
              >
                {b}
              </button>
            );
          })}
        </div>
        <button
          className="btn-primary"
          onClick={add}
          disabled={!date || picked.length === 0}
        >
          Add
        </button>
      </section>
    </>
  );
}

// ---------- App shell ----------
export default function App() {
  const [tokenReady, setTokenReady] = useState(hasToken());
  const [state, _setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState(null);
  const [tab, setTab] = useState('tasks');
  const [refISO, setRefISO] = useState(todayISO());

  useEffect(() => {
    const update = () => setRefISO(todayISO());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    const interval = setInterval(update, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      clearInterval(interval);
    };
  }, []);

  // Initial load.
  useEffect(() => {
    if (!tokenReady) return;
    let cancelled = false;
    loadState()
      .then((s) => {
        if (cancelled) return;
        // Ensure required arrays exist.
        _setState({ tasks: [], bins: [], version: 1, ...s });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message);
        if (err.status === 401 || err.status === 403) {
          clearToken();
          setTokenReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tokenReady]);

  // Debounced save — 500ms after last change.
  const saveTimer = useRef(null);
  const latestState = useRef(null);
  latestState.current = state;

  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await saveState(latestState.current);
        setSaveStatus('saved');
        setSaveError(null);
        setTimeout(
          () => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)),
          1500
        );
      } catch (e) {
        console.error(e);
        setSaveError(e.message || String(e));
        setSaveStatus('error');
      }
    }, 500);
  };

  // Wrap setState so every mutation triggers a save.
  const setState = (updater) => {
    _setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return next;
    });
    // Defer save to after the render commits `latestState.current`.
    queueMicrotask(scheduleSave);
  };

  if (!tokenReady) {
    return <TokenPrompt onSaved={() => setTokenReady(true)} />;
  }
  if (loadError && !state) {
    return (
      <div className="gate">
        <div className="gate-card">
          <h1>Couldn't load state</h1>
          <p className="muted">{loadError}</p>
          <button
            className="btn-secondary"
            onClick={() => {
              clearToken();
              setTokenReady(false);
              setLoadError(null);
            }}
          >
            Reset token
          </button>
        </div>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="gate">
        <div className="gate-card">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  const tabs = [
    ['tasks', 'Tasks'],
    ['freq', 'Frequencies'],
    ['list', 'Task List'],
    ['bins', '🗑️ Bins']
  ];

  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-row">
          <h1>Home Manager</h1>
          <div className="hdr-meta">
            <span className="hdr-date">{formatDayMonth(refISO)}</span>
            <SaveStatus status={saveStatus} error={saveError} />
          </div>
        </div>
        <nav className="tabs">
          {tabs.map(([k, l]) => (
            <button
              key={k}
              className={tab === k ? 'tab active' : 'tab'}
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
        </nav>
      </header>
      <main className="main">
        {tab === 'tasks' && (
          <TasksTab state={state} setState={setState} refISO={refISO} />
        )}
        {tab === 'freq' && <FrequenciesTab state={state} setState={setState} />}
        {tab === 'list' && <TaskListTab state={state} refISO={refISO} />}
        {tab === 'bins' && (
          <BinsTab state={state} setState={setState} refISO={refISO} />
        )}
      </main>
    </div>
  );
}
