// sonnenteiler page: polls the service, draws the scene, the plan and the forecast
// and fills the tiles. plain script, no build step, nothing from outside
(function () {
  'use strict';

  const POLL_MS = 330;
  const PREVIEW_MS = 6000;
  const D2R = Math.PI / 180;
  const NA = 'k. A.';
  const HA = 10000;
  const FONT = '"Geist Serif", "Times New Roman", serif';
  const PLAN_COLS = ['offset', 'pan', 'tilt', 'p_mw', 'ppfd', 'dni', 'dhi', 'temp', 'price', 'elec_eur', 'stress'];
  const PATH_COLS = ['offset', 'pan', 'tilt', 'p_mw', 'ppfd', 'dni', 'dhi', 'temp', 'price', 'stress'];
  // reasons of a step: short word for the ribbon, phrase for sentences, colour token
  const WHY = {
    sun: { word: 'Strom', long: 'Strom', color: '--accent' },
    light: { word: 'Licht', long: 'Licht für die Pflanze, Pflicht', color: '--secondary' },
    price: { word: 'Preis', long: 'Strompreis unter null', color: '--neg' },
    stress: { word: 'Schutz', long: 'Schutz der Pflanze', color: '--error' },
    shade: { word: 'Schatten', long: 'Schatten auf Wunsch', color: '--shade' },
    power_hour: { word: 'Stromstunde', long: 'Stromstunde', color: '--warning' },
    night: { word: 'Nacht', long: 'Nacht', color: '--chart-neutral' }
  };
  const WHY_ORDER = ['sun', 'light', 'price', 'stress', 'shade', 'power_hour', 'night'];
  const USED = { model: 'Kurzfristvorhersage', shift: 'einfache Korrektur', raw: 'Wetterdienst' };
  // the strategies of the day balance and the evaluation
  const STRAT = {
    tracking: 'Nachführen',
    blind: 'ohne Preisblick',
    raw: 'nur Wetterdienst',
    plan: 'Sonnenteiler',
    sonnenteiler: 'Sonnenteiler',
    best: 'bester Plan'
  };
  const STRAT_TITLE = {
    tracking: 'Immer zur Sonne, die Pflanze wird nicht beachtet',
    blind: 'Pflanze zuerst ohne Preisblick: das Lichtziel mit möglichst viel Energie, alles im Voraus bekannt',
    raw: 'Sonnenteiler nur mit der Vorhersage des Wetterdienstes',
    plan: 'Sonnenteiler mit der Kurzfristvorhersage, alle 3 Stunden neu geplant',
    sonnenteiler: 'Sonnenteiler mit der Kurzfristvorhersage, alle 3 Stunden neu geplant',
    best: 'bester Plan im Nachhinein: dieselben Regeln mit dem echten Wetter'
  };
  // german names of the plants, the schema of the service wins
  const CROP_DE = {
    tomato: 'Tomate', potato: 'Kartoffel', onion: 'Zwiebel', 'green chilli': 'Grüne Chili', chilli: 'Chili',
    garlic: 'Knoblauch', peas: 'Erbsen', brinjal: 'Aubergine', okra: 'Okra', 'bhindi (ladies finger)': 'Okra',
    methi: 'Bockshornklee', 'elephant yam (suran)': 'Elefantenfuß Yams'
  };
  const DAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const DAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const COMPASS_DE = ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'];

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(motionQuery && motionQuery.matches);

  // value helpers, the service may send null or leave a field out
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const num = (v, d = null) => (isNum(v) ? v : d);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const list = (v) => (Array.isArray(v) ? v : []);
  const str = (v) => (typeof v === 'string' ? v : '');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, '0');

  // errors go to the console, with ?debug=1 also into a visible note
  const debugOn = params.has('debug');
  let debugBox = null;
  function report(e) {
    console.error(e);
    if (!debugOn) return;
    if (!debugBox) {
      debugBox = document.createElement('div');
      debugBox.className = 'debug';
      document.body.appendChild(debugBox);
    }
    const text = (e && (e.stack || e.message)) || String(e);
    debugBox.textContent = (debugBox.textContent + '\n' + text).trim().slice(-1500);
  }
  window.addEventListener('error', (ev) => report(ev.error || ev.message));
  window.addEventListener('unhandledrejection', (ev) => report(ev.reason));
  function safe(fn) {
    try {
      fn();
    } catch (e) {
      report(e);
    }
  }

  // numbers and times in german

  const nfCache = {};
  function fmt(v, d = 0) {
    if (!isNum(v)) return null;
    if (!nfCache[d]) nfCache[d] = new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
    let s = nfCache[d].format(v);
    if (/^-0(,0*)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  const withUnit = (v, d, u) => (isNum(v) ? fmt(v, d) + ' ' + u : NA);
  const signed = (s, v) => (isNum(v) && v > 0 && s !== null ? '+' + s : s);
  const deg = (v) => (isNum(v) ? fmt(v, 0) + '°' : NA);
  const celsius = (v) => withUnit(v, 1, '°C');
  const pct = (v, d) => (!isNum(v) ? NA : fmt(v * 100, d !== undefined ? d : Math.abs(v) < 0.1 ? 1 : 0) + ' %');
  const mw = (v) => withUnit(v, 0, 'mW');
  const mol = (v) => (isNum(v) ? fmt(v, Math.abs(v) < 10 ? 1 : 0) + ' mol/m²' : NA);
  const hours = (v) => (isNum(v) ? fmt(v, v > 0 && v < 10 ? 1 : 0) + ' h' : NA);
  const eurMwh = (v) => (isNum(v) ? fmt(v, Math.abs(v) < 10 ? 1 : 0) + ' €/MWh' : NA);
  const ppfd = (v) => (isNum(v) ? fmt(v, 0) + ' µmol/m²/s' : NA);
  const wm2 = (v) => (isNum(v) ? fmt(v, 0) + ' W/m²' : NA);

  // money: the service sends € per m² of ground, the page shows € per hectare
  function haDec(values) {
    let m = 0;
    for (const v of values) if (isNum(v)) m = Math.max(m, Math.abs(v * HA));
    return m >= 100 ? 0 : m >= 10 ? 1 : 2;
  }
  // one formatter for values read side by side
  function haIn(values) {
    const d = haDec(values);
    return (v) => (isNum(v) ? fmt(v * HA, d) : NA);
  }
  const ha = (v) => (isNum(v) ? haIn([v])(v) + ' €/ha' : NA);
  // a difference counts only when it shows in the digits on screen
  const shows = (v, values) => isNum(v) && Math.abs(v * HA) >= 0.5 * Math.pow(10, -haDec(values));

  function hhmm(t) {
    if (!isNum(t)) return '';
    const d = new Date((t + D.off * 3600) * 1000);
    return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }

  function compassName(az) {
    if (!isNum(az)) return '';
    return COMPASS_DE[Math.round((((az % 360) + 360) % 360) / 45) % 8];
  }

  function ymd(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''));
    return m ? [+m[1], +m[2], +m[3]] : null;
  }

  function dateLine(s) {
    let p = ymd(obj(s.day).date);
    if (!p && isNum(D.now)) {
      const d = new Date((D.now + D.off * 3600) * 1000);
      p = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    }
    if (!p) return '';
    const wd = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    return DAYS_DE[wd] + ', ' + p[2] + '. ' + MONTHS_DE[p[1] - 1] + ' ' + p[0];
  }

  function shortDate(text, withYear) {
    const p = ymd(text);
    if (!p) return String(text || '');
    return p[2] + '.' + p[1] + '.' + (withYear ? p[0] : '');
  }

  function weekday(text) {
    const p = ymd(text);
    return p ? DAYS_SHORT[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] : '';
  }

  const setName = (s) => (s === 'test' ? 'Testtag' : s === 'train' ? 'Trainingstag' : '');

  // tables from the columns of the service

  // rows with a number in t, sorted by t, every column as long as t
  function table(o, keys, skeys) {
    const src = obj(o);
    const raw = list(src.t);
    const idx = [];
    for (let i = 0; i < raw.length; i++) if (isNum(raw[i])) idx.push(i);
    let sorted = true;
    for (let j = 1; j < idx.length; j++) {
      if (raw[idx[j]] < raw[idx[j - 1]]) {
        sorted = false;
        break;
      }
    }
    if (!sorted) idx.sort((a, b) => raw[a] - raw[b]);
    const out = { t: idx.map((i) => raw[i]), n: idx.length };
    for (const k of keys) {
      const c = list(src[k]);
      out[k] = idx.map((i) => num(c[i]));
    }
    for (const k of skeys || []) {
      const c = list(src[k]);
      out[k] = idx.map((i) => (typeof c[i] === 'string' ? c[i] : null));
    }
    return out;
  }

  // index of the last row with t <= x, or -1
  function floorIdx(ts, x) {
    let lo = 0;
    let hi = ts.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= x) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  // linear between two rows, holds a little past the ends
  function interp(tab, key, x, maxGap) {
    if (!tab || !tab.n || !isNum(x)) return null;
    const ts = tab.t;
    const vs = tab[key];
    if (!vs) return null;
    const i = floorIdx(ts, x);
    if (i < 0) return x >= ts[0] - maxGap / 2 ? vs[0] : null;
    if (i === tab.n - 1) return x - ts[i] <= maxGap / 2 ? vs[i] : null;
    const a = vs[i];
    const b = vs[i + 1];
    const dt = ts[i + 1] - ts[i];
    if (dt > maxGap) return x - ts[i] <= maxGap / 2 ? a : null;
    if (a === null) return b !== null && ts[i + 1] - x < dt / 2 ? b : null;
    if (b === null) return x - ts[i] < dt / 2 ? a : null;
    return dt > 0 ? a + ((b - a) * (x - ts[i])) / dt : a;
  }

  // the step that holds at x, an action holds for a whole step
  function stepIdx(tab, x, step) {
    if (!tab || !tab.n || !isNum(x)) return -1;
    const i = floorIdx(tab.t, x);
    if (i < 0) return -1;
    const end = i + 1 < tab.n ? Math.min(tab.t[i + 1], tab.t[i] + step * 1.5) : tab.t[i] + step;
    return x < end ? i : -1;
  }

  // the planned row at x: binding block first, then the outlook
  function planAt(x) {
    let i = stepIdx(D.points, x, D.step);
    if (i >= 0) return { src: 'points', tab: D.points, i };
    i = stepIdx(D.outlook, x, D.step);
    if (i >= 0) return { src: 'outlook', tab: D.outlook, i };
    return null;
  }

  // the row at x: driven before now, planned after
  function rowAt(x) {
    if (isNum(D.now) && x <= D.now) {
      const i = stepIdx(D.path, x, D.step);
      if (i >= 0) return { src: 'path', tab: D.path, i };
    }
    return planAt(x);
  }

  // state

  let S = null;
  let D = { off: 2, now: null };
  let recvAt = 0;
  let shownClock = null;

  // 17, 17.5 or "17:30" as hours
  function hourNum(v) {
    if (isNum(v)) return v;
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(String(v === null || v === undefined ? '' : v));
    return m ? +m[1] + (m[2] ? +m[2] / 60 : 0) : null;
  }

  // hour windows of a recipe, [[17, 21]] or [{from, to}], key power_hours or shade_hours
  function powerHours(rec) {
    return hourWindows(rec, 'power_hours');
  }

  function hourWindows(rec, key) {
    const out = [];
    for (const w of list(obj(rec)[key])) {
      let a = null;
      let b = null;
      if (Array.isArray(w)) {
        a = num(w[0]);
        b = num(w[1]);
      } else if (w && typeof w === 'object') {
        a = hourNum(w.from);
        b = hourNum(w.to);
      }
      if (a !== null && b !== null && b > a) out.push([a, b]);
    }
    return out;
  }

  function derive(s) {
    const site = obj(s.site);
    const day = obj(s.day);
    const plan = obj(s.plan);
    const scene = obj(s.scene);
    const stepMin = num(plan.step_min, num(s.step_min, 5));
    const off = num(site.utc_offset_h, 2);
    const now = num(s.now);
    const pan = list(scene.pan_limits);
    const tilt = list(scene.tilt_limits);
    const park = list(scene.park);
    const d = {
      now,
      off,
      heading: num(site.heading, 180),
      sim: s.mode !== 'live',
      mode: typeof s.mode === 'string' ? s.mode : null,
      speed: num(s.speed),
      paused: s.paused === true,
      gcr: clamp(num(scene.gcr, 0.35), 0.05, 0.9),
      panLim: [num(pan[0], -88), num(pan[1], 88)],
      tiltLim: [num(tilt[0], 4), num(tilt[1], 176)],
      park: [num(park[0], 0), num(park[1], 90)],
      day,
      sun: obj(s.sun),
      pose: obj(s.pose),
      meas: obj(s.meas),
      recipe: obj(s.recipe),
      account: obj(s.account),
      plan,
      step: Math.max(60, stepMin * 60),
      blockH: num(s.block_h, 3),
      points: table(plan.points, PLAN_COLS, ['why']),
      outlook: table(plan.outlook, PLAN_COLS, ['why']),
      path: table(s.path_today, PATH_COLS, ['why']),
      sunpath: table(s.sunpath, ['az', 'el', 'az_rel']),
      dayPrices: table(s.day_prices, ['price']),
      fc: table(s.forecast, ['dni_lo', 'dni_mid', 'dni_hi', 'dhi_lo', 'dhi_mid', 'dhi_hi', 'temp']),
      service: table(s.service, ['dni', 'dhi', 'temp']),
      replay: s.replay && typeof s.replay === 'object' && !Array.isArray(s.replay) ? s.replay : null
    };
    d.best = table(d.replay && d.replay.best_path, ['offset']);
    d.powerHours = powerHours(d.recipe);
    d.shadeHours = hourWindows(d.recipe, 'shade_hours');

    // the running block, from the plan or from its steps
    const b = obj(plan.block);
    if (isNum(b.from) && isNum(b.to) && b.to > b.from) d.block = { from: b.from, to: b.to };
    else if (d.points.n) d.block = { from: d.points.t[0], to: d.points.t[d.points.n - 1] + d.step };
    else d.block = null;

    // local midnight of the shown day
    const p = ymd(day.date);
    if (isNum(day.start)) d.midnight = day.start;
    else if (p) d.midnight = Date.UTC(p[0], p[1] - 1, p[2]) / 1000 - off * 3600;
    else if (isNum(now)) d.midnight = Math.floor((now + off * 3600) / 86400) * 86400 - off * 3600;
    else d.midnight = null;
    d.dayEnd = isNum(day.end) ? day.end : isNum(d.midnight) ? d.midnight + 86400 : null;

    // the time axis: an hour before sunrise to an hour after sunset
    let rise = num(day.sunrise);
    let set = num(day.sunset);
    if (!(isNum(rise) && isNum(set) && set > rise) && d.sunpath.n > 1) {
      rise = d.sunpath.t[0];
      set = d.sunpath.t[d.sunpath.n - 1];
    }
    d.sunrise = rise;
    d.sunset = set;
    if (isNum(rise) && isNum(set) && set > rise && isNum(d.midnight)) {
      d.t0 = Math.max(d.midnight, d.midnight + (Math.floor((rise - d.midnight) / 3600) - 1) * 3600);
      d.t1 = Math.min(d.dayEnd, d.midnight + (Math.ceil((set - d.midnight) / 3600) + 1) * 3600);
      // power and shade hours outside the sun still belong on the axis
      for (const [s0, e] of d.powerHours.concat(d.shadeHours)) {
        d.t1 = Math.min(d.dayEnd, Math.max(d.t1, d.midnight + e * 3600));
        d.t0 = Math.max(d.midnight, Math.min(d.t0, d.midnight + s0 * 3600));
      }
    } else if (isNum(d.midnight)) {
      d.t0 = d.midnight + 4 * 3600;
      d.t1 = d.midnight + 22 * 3600;
    } else if (isNum(now)) {
      d.t0 = now - 8 * 3600;
      d.t1 = now + 8 * 3600;
    } else {
      d.t0 = 0;
      d.t1 = 0;
    }
    // at night the axis reaches to now, so the now line stays in view
    if (isNum(now) && isNum(d.midnight) && d.t1 > d.t0 && now >= d.midnight && now < d.dayEnd) {
      if (now < d.t0) d.t0 = d.midnight + Math.floor((now - d.midnight) / 3600) * 3600;
      if (now > d.t1) d.t1 = Math.min(d.dayEnd, d.midnight + Math.ceil((now - d.midnight) / 3600 + 0.01) * 3600);
    }
    return d;
  }

  // without up and elevation nothing is known about the sun, that is not night
  function sunKnown() {
    return typeof D.sun.up === 'boolean' || isNum(D.sun.el);
  }

  function sunUp() {
    if (typeof D.sun.up === 'boolean') return D.sun.up;
    const el = num(D.sun.el);
    return el === null ? false : el > 0;
  }

  function simNow() {
    if (!S || !isNum(D.now)) return null;
    if (D.paused || !isNum(D.speed) || !D.sim) return D.now;
    const dt = Math.min(1.2, (performance.now() - recvAt) / 1000);
    return D.now + dt * D.speed;
  }

  // colours from the tokens

  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    C = {
      surface: g('--bg-surface'),
      elevated: g('--bg-elevated'),
      border: g('--border'),
      grid: g('--chart-grid'),
      strong: g('--text-strong'),
      text: g('--text-primary'),
      sec: g('--text-secondary'),
      muted: g('--text-muted'),
      accent: g('--accent'),
      accentInk: g('--accent-ink'),
      teal: g('--secondary'),
      grey: g('--chart-3'),
      neutral: g('--chart-neutral'),
      neg: g('--neg'),
      sky: g('--sky'),
      shade: g('--shade'),
      warning: g('--warning'),
      error: g('--error'),
      success: g('--success'),
      soil: g('--soil'),
      soilShade: g('--soil-shade'),
      bowl: g('--bowl'),
      sun: g('--sun'),
      onColor: g('--on-accent')
    };
    C.why = {};
    for (const k of WHY_ORDER) C.why[k] = g(WHY[k].color);
  }

  const whyColor = (w) => (w && C.why[w]) || C.neutral;
  const whyLong = (w) => (w && WHY[w] ? WHY[w].long : w ? String(w) : NA);

  // canvas helpers

  function fit(cv) {
    const box = cv.parentElement;
    const w = Math.max(1, Math.round(box.clientWidth));
    const h = Math.max(1, Math.round(box.clientHeight));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function font(ctx, px) {
    ctx.font = px + 'px ' + FONT;
  }

  function polyline(ctx, ts, vs, X, Y, maxGap) {
    ctx.beginPath();
    let open = false;
    let lastT = 0;
    for (let i = 0; i < ts.length; i++) {
      const v = vs[i];
      if (v === null) {
        open = false;
        continue;
      }
      const x = X(ts[i]);
      const y = Y(v);
      if (open && ts[i] - lastT <= maxGap) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      open = true;
      lastT = ts[i];
    }
    ctx.stroke();
  }

  // a value holds for its step, so a plan reads as a staircase
  function stairs(ctx, ts, vs, step, X, Y) {
    ctx.beginPath();
    let lastEnd = null;
    for (let i = 0; i < ts.length; i++) {
      const v = vs[i];
      if (v === null) {
        lastEnd = null;
        continue;
      }
      const a = ts[i];
      const b = i + 1 < ts.length && ts[i + 1] - a <= step * 1.5 ? ts[i + 1] : a + step;
      const y = Y(v);
      if (lastEnd !== null && Math.abs(a - lastEnd) < 1) ctx.lineTo(X(a), y);
      else ctx.moveTo(X(a), y);
      ctx.lineTo(X(b), y);
      lastEnd = b;
    }
    ctx.stroke();
  }

  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }

  // ticks from lo to hi that include zero
  function niceRange(lo, hi, n) {
    if (!(hi > lo)) hi = lo + 1;
    const step = niceStep((hi - lo) / n);
    const a = Math.floor(lo / step - 1e-9) * step;
    const b = Math.ceil(hi / step - 1e-9) * step;
    const ticks = [];
    for (let v = a; v <= b + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return { lo: a, hi: b, step, ticks };
  }

  function maxOf(arrs, floor) {
    let m = floor;
    for (const a of arrs) for (const v of a) if (v !== null && v > m) m = v;
    return m;
  }

  // scene: the vertical plane through the sun, x towards the sun, z up
  // the panels have a chord of 1, the rows stand 1 / gcr apart

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

  // angle of the panel normal in the sun plane, from the pose and the sun
  function normalAngle(pan, tilt, azRel, el, offset) {
    if (isNum(pan) && isNum(tilt) && isNum(azRel)) {
      const p = pan * D2R;
      const t = tilt * D2R;
      const n = [Math.sin(p) * Math.cos(t), Math.cos(p) * Math.cos(t), Math.sin(t)];
      const hx = n[0] * Math.sin(azRel * D2R) + n[1] * Math.cos(azRel * D2R);
      return Math.atan2(n[2], hx) / D2R;
    }
    if (isNum(el) && isNum(offset)) return el + offset;
    return 90;
  }

  // cosine between panel normal and sun, the c of the scene model
  function incidenceCos(pan, tilt, azRel, el) {
    if (!isNum(pan) || !isNum(tilt) || !isNum(azRel) || !isNum(el) || el <= 0) return null;
    const p = pan * D2R;
    const t = tilt * D2R;
    const a = azRel * D2R;
    const e = el * D2R;
    const n = [Math.sin(p) * Math.cos(t), Math.cos(p) * Math.cos(t), Math.sin(t)];
    const s = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
    return n[0] * s[0] + n[1] * s[1] + n[2] * s[2];
  }

  function sceneLayout(w, h, compact) {
    const sp = 1 / D.gcr;
    const half = 1.5 * sp;
    const R = half + 0.45;
    const depth = 0.32;
    const top = compact ? 46 : 64;
    const bottom = compact ? 20 : 24;
    const side = compact ? 10 : 18;
    const k = Math.max(3, Math.min((w - 2 * side) / (2 * R), (h - top - bottom) / (R + depth)));
    const ox = w / 2;
    const spare = Math.max(0, h - top - bottom - (R + depth) * k);
    const oy = top + R * k + spare * 0.55;
    return { k, ox, oy, R, depth, sp, half, hp: 0.95, X: (x) => ox + x * k, Y: (z) => oy - z * k };
  }

  function panelEnds(L, xc, a) {
    const n = [Math.cos(a * D2R), Math.sin(a * D2R)];
    const u = [-n[1], n[0]];
    const c = [xc, L.hp];
    return { n, c, e1: [c[0] + u[0] * 0.5, c[1] + u[1] * 0.5], e2: [c[0] - u[0] * 0.5, c[1] - u[1] * 0.5] };
  }

  // first hit of a segment a..b by a ray o + l * dir, l > 0
  function segHit(o, dir, a, b) {
    const r = [b[0] - a[0], b[1] - a[1]];
    const q = [a[0] - o[0], a[1] - o[1]];
    const det = r[0] * dir[1] - dir[0] * r[1];
    if (Math.abs(det) < 1e-9) return null;
    const l = (r[0] * q[1] - q[0] * r[1]) / det;
    const m = (dir[0] * q[1] - q[0] * dir[1]) / det;
    return l > 0 && m >= 0 && m <= 1 ? l : null;
  }

  // the view the scene shows: live, eased, or a ghost

  const ease = { a: null, el: null };
  const target = { a: null, el: null };
  const ghostEase = { a: null };
  let preview = null;
  let hoverT = null;

  function approach(cur, tgt, dt, tau) {
    if (tgt === null) return null;
    if (cur === null || reduced()) return tgt;
    const d = tgt - cur;
    if (Math.abs(d) < 0.02) return tgt;
    return cur + d * (1 - Math.exp(-dt / tau));
  }

  function previewTime() {
    if (!preview) return null;
    const p = (performance.now() - preview.t0) / PREVIEW_MS;
    if (p >= 1) {
      stopPreview();
      return null;
    }
    let q = p;
    if (reduced()) {
      // no gliding, one step after the other
      const steps = Math.max(1, Math.round((preview.end - preview.start) / D.step));
      q = Math.floor(p * steps) / steps;
    }
    return preview.start + (preview.end - preview.start) * q;
  }

  function ghostAt(T) {
    const el = interp(D.sunpath, 'el', T, 1800);
    const azRel = interp(D.sunpath, 'az_rel', T, 1800);
    const az = interp(D.sunpath, 'az', T, 1800);
    const r = rowAt(T);
    const pick = (k) => (r && r.tab[k] ? r.tab[k][r.i] : null);
    const up = el !== null && el > 0;
    const pan = up ? pick('pan') : D.park[0];
    const tilt = up ? pick('tilt') : D.park[1];
    const offset = up ? pick('offset') : 0;
    const why = up ? pick('why') : 'night';
    return {
      ghost: true,
      T,
      el,
      az,
      azRel,
      up,
      known: el !== null,
      a: up ? normalAngle(pan, tilt, azRel, el, offset) : 90,
      pan,
      tilt,
      offset,
      why,
      row: r
    };
  }

  // the time the preview shows, the charts mark it too
  let previewAt = null;

  function currentView(dt) {
    const pt = previewTime();
    if (pt !== previewAt) chartsDirty = true;
    previewAt = pt;
    const T = hoverT !== null ? hoverT : pt;
    if (T !== null) {
      const g = ghostAt(T);
      if (hoverT === null) {
        ghostEase.a = approach(ghostEase.a, g.a, dt, 0.16);
        g.a = ghostEase.a;
      }
      g.hover = hoverT !== null;
      return g;
    }
    ghostEase.a = null;
    return {
      ghost: false,
      T: D.now,
      el: ease.el,
      az: num(D.sun.az),
      azRel: num(D.sun.az_rel),
      up: sunUp() && ease.el !== null,
      known: sunKnown(),
      a: ease.a === null ? 90 : ease.a,
      pan: num(D.pose.pan),
      tilt: num(D.pose.tilt),
      offset: num(D.pose.offset),
      why: str(D.pose.why) || (sunUp() ? null : 'night')
    };
  }

  // drawing the scene

  const sceneCv = $('sceneCv');

  function drawScene(v) {
    const { ctx, w, h } = fit(sceneCv);
    if (!S) return;
    const compact = w < 560;
    const L = sceneLayout(w, h, compact);
    const night = !v.up;
    const dim = night && v.known !== false;
    const el = night ? null : v.el;
    const xs = [-L.sp, 0, L.sp];
    const panels = xs.map((x) => panelEnds(L, x, night ? 90 : v.a));
    const s = isNum(el) ? [Math.cos(el * D2R), Math.sin(el * D2R)] : null;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dim) ctx.globalAlpha = 0.42;

    // sky arc and the two sides of the view
    const cx = L.X(0);
    const cy = L.Y(0);
    const r = L.R * L.k;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
    ctx.stroke();
    if (isNum(v.az) && !night) {
      font(ctx, compact ? 11 : 12);
      ctx.fillStyle = C.sec;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText(compassName(v.az), cx + r, cy + L.depth * L.k + 4);
      ctx.textAlign = 'left';
      ctx.fillText(compassName(v.az + 180), cx - r, cy + L.depth * L.k + 4);
    }

    // shadows of the rows on the bed
    const spans = [];
    if (s && s[1] > 0.01) {
      for (const P of panels) {
        const a = P.e1[0] - (P.e1[1] * s[0]) / s[1];
        const b = P.e2[0] - (P.e2[1] * s[0]) / s[1];
        spans.push(a < b ? [a, b] : [b, a]);
      }
      drawRays(ctx, L, panels, s);
    }

    // ground and bed
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(L.Y(-L.depth)) + 0.5);
    ctx.lineTo(w, Math.round(L.Y(-L.depth)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = C.soil;
    ctx.fillRect(L.X(-L.half), L.Y(0), 2 * L.half * L.k, L.depth * L.k);
    ctx.fillStyle = C.soilShade;
    for (const [a0, b0] of spans) {
      const a = clamp(a0, -L.half, L.half);
      const b = clamp(b0, -L.half, L.half);
      if (b > a) ctx.fillRect(L.X(a), L.Y(0), (b - a) * L.k, L.depth * L.k);
    }

    // plants, bright in the sun, dim in the shadow
    const step = 0.34;
    let j = 0;
    for (let x = -L.half + 0.17; x < L.half; x += step) {
      j++;
      if (xs.some((p) => Math.abs(x - p) < 0.09)) continue;
      const lit = !dim && !spans.some(([a, b]) => x > a && x < b);
      drawPlant(ctx, L, x, 0.17 + ((j * 7 + 3) % 5) * 0.022, lit, dim);
    }

    // posts and panels
    for (const P of panels) {
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = Math.max(1.2, 0.05 * L.k);
      ctx.beginPath();
      ctx.moveTo(L.X(P.c[0]), L.Y(0));
      ctx.lineTo(L.X(P.c[0]), L.Y(P.c[1]));
      ctx.stroke();
      ctx.strokeStyle = C.accent;
      ctx.lineCap = 'butt';
      ctx.lineWidth = Math.max(3, 0.07 * L.k);
      ctx.beginPath();
      ctx.moveTo(L.X(P.e1[0]), L.Y(P.e1[1]));
      ctx.lineTo(L.X(P.e2[0]), L.Y(P.e2[1]));
      ctx.stroke();
      ctx.lineCap = 'round';
      ctx.fillStyle = C.elevated;
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(L.X(P.c[0]), L.Y(P.c[1]), Math.max(2.5, 0.05 * L.k), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // the angle between sun and panel normal on the middle row
    if (s && isNum(v.a)) drawOffsetMark(ctx, L, panels[1], el, v, compact);

    // the sun
    if (s) {
      const sx = L.X(L.R * s[0]);
      const sy = L.Y(L.R * s[1]);
      const sr = compact ? 7 : 9;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = C.sun;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.surface;
      ctx.stroke();
      if (v.ghost) {
        font(ctx, compact ? 12 : 14);
        ctx.fillStyle = C.strong;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillText(hhmm(v.T), sx - sr - 8, sy + (sy < 30 ? 14 : 0));
      }
    }
    ctx.restore();
    drawInset(ctx, w, h, v, compact);
  }

  function drawRays(ctx, L, panels, s) {
    const back = [-s[0], -s[1]];
    const wv = [-s[1], s[0]];
    const ds = [];
    for (const P of panels) ds.push(dot(P.e1, wv), dot(P.e2, wv));
    ds.push(dot([-L.half, 0], wv), dot([L.half, 0], wv));
    const gap = 11 / L.k;
    const lo = Math.min.apply(null, ds) - gap;
    const hi = Math.max.apply(null, ds) + gap;
    ctx.lineWidth = 1;
    for (let j = Math.ceil(lo / gap); j <= Math.floor(hi / gap); j++) {
      const d = j * gap;
      if (Math.abs(d) >= L.R - 0.05) continue;
      const lam = Math.sqrt(L.R * L.R - d * d);
      const st = [d * wv[0] + lam * s[0], d * wv[1] + lam * s[1]];
      let best = Infinity;
      let kind = 'other';
      let inc = 0;
      for (const P of panels) {
        const hp = segHit(st, back, P.e1, P.e2);
        if (hp !== null && hp < best) {
          best = hp;
          inc = dot(P.n, s);
          kind = inc > 0 ? 'panel' : 'other';
        }
      }
      const hs = st[1] / s[1];
      const xg = st[0] - hs * s[0];
      if (Math.abs(xg) <= L.half && hs < best) {
        best = hs;
        kind = 'plant';
      } else if (Math.abs(xg) > L.half) {
        const hg = (st[1] + L.depth) / s[1];
        if (hg < best) {
          best = hg;
          kind = 'other';
        }
      }
      if (!isFinite(best) || best > 2 * lam) continue;
      if (kind === 'panel') {
        ctx.strokeStyle = C.accent;
        ctx.globalAlpha = 0.2 + 0.5 * inc;
      } else if (kind === 'plant') {
        ctx.strokeStyle = C.teal;
        ctx.globalAlpha = 0.55;
      } else {
        ctx.strokeStyle = C.muted;
        ctx.globalAlpha = 0.18;
      }
      ctx.beginPath();
      ctx.moveTo(L.X(st[0]), L.Y(st[1]));
      ctx.lineTo(L.X(st[0] + back[0] * best), L.Y(st[1] + back[1] * best));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlant(ctx, L, x, hgt, lit, dim) {
    const k = L.k;
    const X = L.X(x);
    const y0 = L.Y(0);
    const top = y0 - hgt * k;
    ctx.save();
    ctx.globalAlpha = (dim ? 0.42 : 1) * (lit ? 1 : 0.32);
    ctx.strokeStyle = C.teal;
    ctx.fillStyle = C.teal;
    ctx.lineWidth = Math.max(1, 0.012 * k);
    ctx.beginPath();
    ctx.moveTo(X, y0);
    ctx.lineTo(X, top + 0.03 * k);
    ctx.stroke();
    const leaf = (lx, ly, rx, ry, rot) => {
      ctx.beginPath();
      ctx.ellipse(lx, ly, Math.max(0.6, rx), Math.max(0.4, ry), rot, 0, Math.PI * 2);
      ctx.fill();
    };
    const lw = 0.065 * k;
    const lh = 0.026 * k;
    leaf(X - 0.05 * k, y0 - hgt * 0.42 * k, lw, lh, 0.42);
    leaf(X + 0.05 * k, y0 - hgt * 0.42 * k, lw, lh, -0.42);
    leaf(X - 0.04 * k, y0 - hgt * 0.74 * k, lw * 0.82, lh * 0.9, 0.62);
    leaf(X + 0.04 * k, y0 - hgt * 0.74 * k, lw * 0.82, lh * 0.9, -0.62);
    leaf(X, top + 0.02 * k, lh * 1.05, lw * 0.6, 0);
    ctx.restore();
  }

  // the panel normal and the sun direction on the middle row, with the angle between
  function drawOffsetMark(ctx, L, P, el, v, compact) {
    const cx = L.X(P.c[0]);
    const cy = L.Y(P.c[1]);
    const len = 0.78 * L.k;
    const a = v.a;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.sun;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + len * Math.cos(el * D2R), cy - len * Math.sin(el * D2R));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = C.strong;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + len * Math.cos(a * D2R), cy - len * Math.sin(a * D2R));
    ctx.stroke();
    const diff = a - el;
    if (Math.abs(diff) >= 2.5) {
      const rr = len * 0.62;
      ctx.strokeStyle = whyColor(v.why);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, -Math.max(a, el) * D2R, -Math.min(a, el) * D2R);
      ctx.stroke();
      const m = ((a + el) / 2) * D2R;
      font(ctx, compact ? 11 : 12.5);
      ctx.fillStyle = C.strong;
      ctx.textAlign = Math.cos(m) >= 0 ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const lr = rr + 9;
      ctx.fillText(deg(isNum(v.offset) ? v.offset : Math.abs(diff)), cx + lr * Math.cos(m), cy - lr * Math.sin(m));
    }
    ctx.restore();
  }

  // top view, north up: the sun azimuth and where the panel normal points
  function drawInset(ctx, w, h, v, compact) {
    if (!isNum(v.az) && !isNum(v.pan)) return;
    const r = compact ? 20 : 27;
    const cx = w - r - (compact ? 14 : 22);
    const cy = (compact ? 50 : 78) + r;
    if (cy + r + 16 > h * 0.6) return;
    const pt = (az, rr) => [cx + rr * Math.sin(az * D2R), cy - rr * Math.cos(az * D2R)];
    ctx.save();
    if (!v.up && v.known !== false) ctx.globalAlpha = 0.5;
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    font(ctx, 10);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', cx, cy - r - 2);
    ctx.textBaseline = 'top';
    ctx.fillText('Draufsicht', cx, cy + r + 4);
    // where the device front points
    const [fx, fy] = pt(D.heading, r);
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    if (isNum(v.pan) && isNum(v.tilt)) {
      const ct = Math.cos(v.tilt * D2R);
      const dir = D.heading + v.pan + (ct < 0 ? 180 : 0);
      const len = Math.abs(ct) * r * 0.9;
      const [ax, ay] = pt(dir, len);
      const [b1x, b1y] = pt(dir + 90, r * 0.42);
      const [b2x, b2y] = pt(dir - 90, r * 0.42);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 3;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(b1x, b1y);
      ctx.lineTo(b2x, b2y);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ax, ay);
      ctx.stroke();
    }
    if (v.up && isNum(v.az)) {
      const [sx, sy] = pt(v.az, r);
      ctx.fillStyle = C.sun;
      ctx.strokeStyle = C.surface;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // the dom around the scene: corner texts, readouts, night note
  let lastSceneDom = '';
  function turnText(v) {
    if (!v.up) return v.known === false ? '' : 'Flach geparkt';
    const o = v.offset;
    if (!isNum(o)) return 'Weg von der Sonne: ' + NA;
    if (o < 0.5) return 'Zur Sonne gedreht';
    return deg(o) + ' von der Sonne weggedreht';
  }

  function sceneDom(v) {
    const title = !v.ghost ? 'Blick quer zur Sonne' : v.hover ? 'Stand um ' + hhmm(v.T) : 'Vorschau, ' + hhmm(v.T);
    const night = !v.up && v.known !== false && !!S;
    let nightSub = '';
    if (night && !v.ghost) {
      let rise = D.sunrise;
      if (isNum(rise) && isNum(D.now) && D.now > rise) rise = null;
      nightSub = isNum(rise) ? 'Sonnenaufgang um ' + hhmm(rise) : 'Der Tag ist vorbei';
    }
    const why = v.up ? v.why : 'night';
    const whyText = S && (v.up || v.known !== false) ? 'Grund: ' + whyLong(why) : '';
    const sig = [turnText(v), whyText, why, deg(v.el), title, v.ghost, night && !v.ghost, nightSub].join('|');
    if (sig !== lastSceneDom) {
      lastSceneDom = sig;
      $('cTurn').textContent = S ? turnText(v) : '';
      const cw = $('cWhy');
      cw.textContent = whyText;
      cw.style.setProperty('--c', whyColor(why));
      $('cSun').textContent = S ? (v.up ? deg(v.el) : v.known === false ? NA : 'unter dem Horizont') : '';
      $('sceneTitle').textContent = title;
      $('view').classList.toggle('ghost', !!v.ghost);
      $('night').hidden = !(night && !v.ghost);
      $('nightSub').textContent = nightSub;
    }
    renderReadout(v);
  }

  // live values, or the planned values of the step a ghost shows
  let lastReadout = '';
  function renderReadout(v) {
    const m = D.meas;
    const rec = D.recipe;
    let p = num(m.p_mw);
    let pm2 = num(m.power_wm2);
    let light = num(m.ppfd);
    let open = num(m.open_ppfd);
    let shade = num(m.shade);
    let price = num(m.price);
    let leaf = num(m.leaf_temp);
    let air = num(m.temp);
    let stress = typeof m.stress === 'boolean' ? m.stress : null;
    let inc = num(D.pose.incidence);
    const ghost = !!v.ghost;
    if (ghost) {
      const r = v.row;
      const g = (k) => (r && r.tab[k] ? r.tab[k][r.i] : null);
      p = g('p_mw');
      pm2 = p !== null && isNum(obj(S.scene).wm2_per_mw) ? p * S.scene.wm2_per_mw : null;
      light = g('ppfd');
      open = null;
      // shade of the planned pose from the scene model, min(1, gcr |c| / sin el)
      const c = incidenceCos(g('pan'), g('tilt'), v.azRel, v.el);
      shade = c !== null ? Math.min(1, (D.gcr * Math.abs(c)) / Math.sin(v.el * D2R)) : null;
      air = g('temp');
      leaf = air !== null && light !== null ? air + 0.003 * light : null;
      price = g('price');
      if (price === null) price = interp(D.dayPrices, 'price', v.T, D.step * 1.5);
      const sv = g('stress');
      stress = sv === null ? null : sv > 0;
      inc = c !== null ? Math.acos(clamp(c, -1, 1)) / D2R : null;
    }
    if (p === null && pm2 === null && light === null && price === null && !S) return;
    const fixed = isNum(rec.elec_price_eur_mwh);
    // value and unit apart, the unit is set smaller
    const vu = (v, d, u) => (isNum(v) ? [fmt(v, d), u] : [NA, '']);
    const vals = [
      vu(p, 0, 'mW'), pm2 !== null ? fmt(pm2, pm2 < 10 ? 1 : 0) + ' W/m² Boden' : '',
      vu(light, 0, 'µmol/m²/s'), open !== null ? 'Freiland ' + fmt(open, 0) : '',
      shade !== null ? vu(shade * 100, 0, '%') : [ghost ? '' : NA, ''], inc !== null ? 'Einfall ' + deg(inc) : '',
      vu(price, price !== null && Math.abs(price) < 10 ? 1 : 0, '€/MWh'), price !== null && price < 0 ? 'unter null' : fixed ? 'fester Preis' : 'Marktpreis',
      vu(leaf, 1, '°C'), air !== null ? 'Luft ' + celsius(air) : '',
      [stress === null ? NA : stress ? 'ja' : 'nein', ''],
      'bis ' + (isNum(rec.max_ppfd) ? fmt(rec.max_ppfd, 0) + ' µmol' : NA) + ', ' + (isNum(rec.tmax_c) ? fmt(rec.tmax_c, 0) + ' °C' : NA)
    ];
    const sig = JSON.stringify([vals, ghost, stress]);
    if (sig === lastReadout) return;
    lastReadout = sig;
    const ids = ['rPower', 'rPowerM2', 'rPpfd', 'rOpen', 'rShade', 'rInc', 'rPrice', 'rPriceSub', 'rLeaf', 'rAir', 'rStress', 'rStressSub'];
    ids.forEach((id, i) => {
      const node = $(id);
      const v = vals[i];
      if (Array.isArray(v)) {
        node.textContent = v[0];
        if (v[1]) node.appendChild(el('small', '', ' ' + v[1]));
      } else node.textContent = v;
    });
    $('readout').classList.toggle('ghost', ghost);
    $('rStress').classList.toggle('bad', stress === true);
    $('rPrice').classList.toggle('neg', price !== null && price < 0);
  }

  // charts

  const charts = {
    plan: { box: $('cvPlan') },
    sky: { box: $('cvSky') }
  };
  for (const key of Object.keys(charts)) charts[key].cv = charts[key].box.querySelector('canvas');

  function chartFrame(w, h, top) {
    return { l: 46, r: w - 14, t: top || 10, b: h - 20 };
  }

  function xMap(f) {
    const span = D.t1 - D.t0;
    return (t) => f.l + ((t - D.t0) / span) * (f.r - f.l);
  }

  function band(ctx, X, a, b, top, bottom, color, alpha) {
    const x0 = Math.max(X(a), X(D.t0));
    const x1 = Math.min(X(b), X(D.t1));
    if (!(x1 > x0)) return null;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(x0, top, x1 - x0, bottom - top);
    ctx.globalAlpha = 1;
    return [x0, x1];
  }

  // block band, power hours, hour grid and labels, shared by every chart
  function timeBase(ctx, f, X, withLabel) {
    if (D.block) {
      const lift = withLabel ? 20 : 6;
      const span = band(ctx, X, D.block.from, D.block.to, f.t - lift, f.b, C.accent, 0.08);
      if (span && withLabel) {
        font(ctx, 11);
        ctx.fillStyle = C.sec;
        ctx.textBaseline = 'top';
        const text = 'Block ' + hhmm(D.block.from) + ' bis ' + hhmm(D.block.to);
        const tw = ctx.measureText(text).width;
        let x = span[0] + 5;
        ctx.textAlign = 'left';
        if (x + tw > f.r) {
          x = span[1] - 5;
          ctx.textAlign = 'right';
        }
        ctx.fillText(text, x, f.t - 18);
      }
    }
    if (!isNum(D.midnight)) return;
    const perHour = (f.r - f.l) / ((D.t1 - D.t0) / 3600);
    const every = perHour > 62 ? 1 : perHour > 30 ? 2 : 3;
    font(ctx, 11);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 1;
    const first = Math.ceil((D.t0 - D.midnight) / 3600);
    const last = Math.floor((D.t1 - D.midnight) / 3600);
    for (let hr = first; hr <= last; hr++) {
      if (hr % every) continue;
      const x = Math.round(X(D.midnight + hr * 3600)) + 0.5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(x, f.t);
      ctx.lineTo(x, f.b);
      ctx.stroke();
      ctx.fillStyle = C.muted;
      // the labels at both ends stay inside, clear of the axis labels
      const text = pad2(hr % 24) + ':00';
      const tw = ctx.measureText(text).width;
      ctx.textAlign = x - tw / 2 < f.l + 2 ? 'left' : x + tw / 2 > f.r + 12 ? 'right' : 'center';
      ctx.fillText(text, x, f.b + 5);
    }
  }

  function powerBands(ctx, X, top, bottom, label) {
    hourBands(ctx, X, top, bottom, D.powerHours, C.warning, label ? 'Stromstunden' : '');
  }

  function shadeBands(ctx, X, top, bottom, label) {
    hourBands(ctx, X, top, bottom, D.shadeHours, C.shade, label ? 'Schatten auf Wunsch' : '');
  }

  // quiet bands for hour windows of the recipe, with a word where it fits
  function hourBands(ctx, X, top, bottom, windows, color, label) {
    if (!isNum(D.midnight)) return;
    for (const [a, b] of windows) {
      const span = band(ctx, X, D.midnight + a * 3600, D.midnight + b * 3600, top, bottom, color, 0.08);
      if (span && label) {
        font(ctx, 10.5);
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (span[1] - span[0] > ctx.measureText(label).width + 8) ctx.fillText(label, span[0] + 4, top + 3);
      }
    }
  }

  function yGrid(ctx, f, Y, ticks, label) {
    font(ctx, 11);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    for (const v of ticks) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(f.l, y);
      ctx.lineTo(f.r, y);
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillText(label(v), f.l - 6, y);
    }
  }

  function nowLine(ctx, top, bottom, X, label) {
    if (!isNum(D.now) || D.now < D.t0 || D.now > D.t1) return;
    const x = Math.round(X(D.now)) + 0.5;
    ctx.strokeStyle = C.sec;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    if (label) {
      font(ctx, 11);
      ctx.fillStyle = C.sec;
      ctx.textBaseline = 'top';
      const right = x + 40 < X(D.t1);
      ctx.textAlign = right ? 'left' : 'right';
      ctx.fillText('jetzt', x + (right ? 4 : -4), top + 2);
    }
  }

  function crossLine(ctx, top, bottom, X) {
    const T = hoverT !== null ? hoverT : previewAt;
    if (T === null) return;
    const x = Math.round(X(T)) + 0.5;
    ctx.strokeStyle = C.strong;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function marker(ctx, x, y, color) {
    if (!isNum(y)) return;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.surface;
    ctx.stroke();
  }

  function clipTo(ctx, f) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.l, f.t - 4, f.r - f.l, f.b - f.t + 6);
    ctx.clip();
  }

  function emptyNote(ctx, f, text) {
    font(ctx, 12.5);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, (f.l + f.r) / 2, (f.t + f.b) / 2);
  }

  // the plan chart: offset as a staircase, a ribbon with the reasons, the price below
  function planFrames(w, h) {
    const full = chartFrame(w, h, 26);
    const H = full.b - full.t;
    const ribbon = 14;
    const gapA = 7;
    const gapB = 22;
    const offH = Math.max(40, (H - ribbon - gapA - gapB) * 0.6);
    const fo = Object.assign({}, full, { b: full.t + offH });
    const rb = { t: fo.b + gapA, b: fo.b + gapA + ribbon };
    const fp = Object.assign({}, full, { t: rb.b + gapB });
    return { full, fo, rb, fp };
  }

  function drawPlanChart() {
    const c = charts.plan;
    const { ctx, w, h } = fit(c.cv);
    if (!S || !(D.t1 > D.t0)) return;
    const { full, fo, rb, fp } = planFrames(w, h);
    const X = xMap(full);
    const Y = (v) => fo.b - (clamp(v, 0, 90) / 90) * (fo.b - fo.t);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    timeBase(ctx, full, X, true);
    powerBands(ctx, X, fo.t, fo.b, false);
    powerBands(ctx, X, fp.t, fp.b, true);
    shadeBands(ctx, X, fo.t, fo.b, false);
    shadeBands(ctx, X, fp.t, fp.b, true);
    yGrid(ctx, fo, Y, [0, 30, 60, 90], (v) => fmt(v, 0) + '°');
    font(ctx, 10.5);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    // the now label takes the corner when now is at the right end
    if (!(isNum(D.now) && X(D.now) > fo.r - 90 && D.now <= D.t1)) ctx.fillText('hochkant', fo.r - 3, Y(90) + 3);
    ctx.textBaseline = 'bottom';
    ctx.fillText('zur Sonne, wie Nachführen', fo.r - 3, Y(0) - 2);

    const any = D.path.n || D.points.n || D.outlook.n;
    clipTo(ctx, fo);
    if (D.best.n) {
      ctx.strokeStyle = C.accentInk;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([1, 4]);
      stairs(ctx, D.best.t, D.best.offset, D.step, X, Y);
      ctx.setLineDash([]);
    }
    if (D.outlook.n) {
      ctx.strokeStyle = C.accent;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      stairs(ctx, D.outlook.t, D.outlook.offset, D.step, X, Y);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (D.points.n) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 3;
      stairs(ctx, D.points.t, D.points.offset, D.step, X, Y);
    }
    if (D.path.n) {
      ctx.strokeStyle = C.strong;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      stairs(ctx, D.path.t, D.path.offset, D.step, X, Y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (!any) emptyNote(ctx, fo, sunKnown() && !sunUp() ? 'Nachts kein Plan, die Module stehen flach' : 'Noch kein Plan');

    drawRibbon(ctx, X, rb, full);
    drawPrices(ctx, X, fp);

    nowLine(ctx, full.t - 6, full.b, X, true);
    crossLine(ctx, full.t - 6, full.b, X);
    if (hoverT !== null) {
      const r = rowAt(hoverT);
      if (r && r.tab.offset[r.i] !== null) marker(ctx, X(hoverT), Y(r.tab.offset[r.i]), r.src === 'path' ? C.strong : C.accent);
      const pr = interp(D.dayPrices, 'price', hoverT, D.step * 1.5);
      if (pr !== null && fp.Y) marker(ctx, X(hoverT), fp.Y(pr), pr < 0 ? C.neg : C.sec);
    }
  }

  // one coloured cell per step: driven before now, then the block, then the outlook paler
  function drawRibbon(ctx, X, rb, full) {
    const cells = [];
    const until = D.path.n ? D.path.t[D.path.n - 1] + D.step : -Infinity;
    for (let i = 0; i < D.path.n; i++) cells.push([D.path.t[i], D.path.why[i], 1]);
    for (const [tab, alpha] of [[D.points, 0.95], [D.outlook, 0.5]]) {
      for (let i = 0; i < tab.n; i++) if (tab.t[i] >= until - 1) cells.push([tab.t[i], tab.why[i], alpha]);
    }
    ctx.fillStyle = C.grid;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(full.l, rb.t, full.r - full.l, rb.b - rb.t);
    ctx.globalAlpha = 1;
    if (!cells.length) return;
    cells.sort((a, b) => a[0] - b[0]);
    // runs of the same reason and the same paleness
    const runs = [];
    for (const [t, why, alpha] of cells) {
      const last = runs[runs.length - 1];
      if (last && last.why === why && last.alpha === alpha && Math.abs(t - last.to) < D.step * 1.5) last.to = t + D.step;
      else runs.push({ from: t, to: t + D.step, why, alpha });
    }
    for (const r of runs) {
      const x0 = Math.max(full.l, X(r.from));
      const x1 = Math.min(full.r, X(r.to));
      if (!(x1 > x0)) continue;
      ctx.fillStyle = whyColor(r.why);
      ctx.globalAlpha = r.alpha;
      ctx.fillRect(x0, rb.t, x1 - x0, rb.b - rb.t);
      ctx.globalAlpha = 1;
    }
    // words where they fit, runs with the same reason across the paleness join
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last.why === r.why && Math.abs(r.from - last.to) < D.step * 1.5) last.to = r.to;
      else merged.push({ from: r.from, to: r.to, why: r.why });
    }
    font(ctx, 10.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of merged) {
      const x0 = Math.max(full.l, X(r.from));
      const x1 = Math.min(full.r, X(r.to));
      const word = r.why && WHY[r.why] ? WHY[r.why].word : '';
      if (!word || x1 - x0 < ctx.measureText(word).width + 8) continue;
      ctx.fillStyle = r.why === 'night' ? C.strong : C.onColor;
      ctx.fillText(word, (x0 + x1) / 2, (rb.t + rb.b) / 2 + 0.5);
    }
  }

  function drawPrices(ctx, X, fp) {
    const P = D.dayPrices;
    font(ctx, 10.5);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const fixed = num(D.recipe.elec_price_eur_mwh);
    ctx.fillText('Strompreis in €/MWh' + (fixed !== null ? ', gerechnet wird mit festem Preis' : ''), fp.l, fp.t - 4);
    if (!P.n) {
      emptyNote(ctx, fp, 'Keine Strompreise für diesen Tag');
      return;
    }
    let lo = 0;
    let hi = 10;
    for (let i = 0; i < P.n; i++) {
      const v = P.price[i];
      if (v === null || P.t[i] + D.step < D.t0 || P.t[i] > D.t1) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    if (fixed !== null) {
      lo = Math.min(lo, fixed);
      hi = Math.max(hi, fixed);
    }
    const rg = niceRange(lo, hi, clamp(Math.floor((fp.b - fp.t) / 36), 2, 5));
    const Y = (v) => fp.b - ((v - rg.lo) / (rg.hi - rg.lo)) * (fp.b - fp.t);
    fp.Y = Y;
    yGrid(ctx, fp, Y, rg.ticks, (v) => fmt(v, 0));
    clipTo(ctx, fp);
    // below zero: filled, the reason a plan turns away
    const y0 = Y(0);
    let negH = 0;
    ctx.fillStyle = C.neg;
    ctx.globalAlpha = 0.42;
    for (let i = 0; i < P.n; i++) {
      const v = P.price[i];
      if (v === null || v >= 0) continue;
      const a = P.t[i];
      const b = i + 1 < P.n && P.t[i + 1] - a <= D.step * 1.5 ? P.t[i + 1] : a + D.step;
      ctx.fillRect(X(a), y0, X(b) - X(a), Y(v) - y0);
      negH += (b - a) / 3600;
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.sec;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fp.l, Math.round(y0) + 0.5);
    ctx.lineTo(fp.r, Math.round(y0) + 0.5);
    ctx.stroke();
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 1.5;
    stairs(ctx, P.t, P.price, D.step, X, Y);
    if (fixed !== null) {
      ctx.strokeStyle = C.accent;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(fp.l, Y(fixed));
      ctx.lineTo(fp.r, Y(fixed));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    font(ctx, 10.5);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = negH > 0 ? C.neg : C.muted;
    ctx.fillText(negH > 0 ? fmt(negH, negH < 10 ? 1 : 0) + ' h unter null' : 'heute kein Preis unter null', fp.r, fp.t - 4);
  }

  // the forecast chart, direct or diffuse light
  let skyKey = 'dni';

  function drawSkyChart() {
    const c = charts.sky;
    const { ctx, w, h } = fit(c.cv);
    if (!S || !(D.t1 > D.t0)) return;
    const f = chartFrame(w, h, 14);
    const X = xMap(f);
    const k = skyKey;
    const lo = D.fc[k + '_lo'];
    const mid = D.fc[k + '_mid'];
    const hi = D.fc[k + '_hi'];
    const meas = D.path[k];
    const serv = D.service[k];
    const top = niceRange(0, Math.max(k === 'dni' ? 200 : 100, maxOf([hi, mid, meas, serv], 0)) * 1.04, 3);
    const Y = (v) => f.b - (v / top.hi) * (f.b - f.t);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    timeBase(ctx, f, X, false);
    yGrid(ctx, f, Y, top.ticks, (v) => fmt(v, 0));
    font(ctx, 10.5);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText((k === 'dni' ? 'Direktlicht' : 'Streulicht') + ' in W/m²', f.l + 4, f.t);

    clipTo(ctx, f);
    if (D.service.n) {
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      polyline(ctx, D.service.t, serv, X, Y, D.step * 2.5);
      ctx.setLineDash([]);
    }
    const fc = D.fc;
    if (fc.n) {
      ctx.fillStyle = C.sky;
      ctx.globalAlpha = 0.22;
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          ctx.beginPath();
          run.forEach((i, j) => (j ? ctx.lineTo(X(fc.t[i]), Y(hi[i])) : ctx.moveTo(X(fc.t[i]), Y(hi[i]))));
          for (let j = run.length - 1; j >= 0; j--) ctx.lineTo(X(fc.t[run[j]]), Y(lo[run[j]]));
          ctx.closePath();
          ctx.fill();
        }
        run = [];
      };
      for (let i = 0; i < fc.n; i++) {
        if (lo[i] === null || hi[i] === null || (run.length && fc.t[i] - fc.t[run[run.length - 1]] > D.step * 2.5)) flush();
        if (lo[i] !== null && hi[i] !== null) run.push(i);
      }
      flush();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.sky;
      ctx.lineWidth = 1.75;
      polyline(ctx, fc.t, mid, X, Y, D.step * 2.5);
    }
    ctx.strokeStyle = C.strong;
    ctx.lineWidth = 1.75;
    polyline(ctx, D.path.t, meas, X, Y, D.step * 2.5);
    ctx.restore();
    if (!fc.n && !D.path.n && !D.service.n) emptyNote(ctx, f, 'Keine Wetterdaten');
    else if (!fc.n && sunKnown() && !sunUp()) {
      font(ctx, 11.5);
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('nachts keine Kurzfristvorhersage', f.r - 4, f.t);
    }

    nowLine(ctx, f.t - 6, f.b, X, false);
    crossLine(ctx, f.t - 6, f.b, X);
    if (hoverT !== null) {
      const past = isNum(D.now) && hoverT <= D.now;
      const m = past ? interp(D.path, k, hoverT, D.step * 2) : interp(D.fc, k + '_mid', hoverT, D.step * 2);
      marker(ctx, X(hoverT), m !== null ? Y(m) : null, past ? C.strong : C.sky);
    }
  }

  // hover and tooltip

  const tip = $('tip');
  const chartsPanel = $('charts');

  function setHover(T, px, py) {
    hoverT = T;
    chartsDirty = true;
    sceneDirty = true;
    if (T === null) {
      tip.hidden = true;
      return;
    }
    fillTip(T);
    tip.hidden = false;
    const pr = chartsPanel.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let x = px - pr.left + 16;
    if (x + tw > pr.width - 6) x = px - pr.left - tw - 16;
    let y = py - pr.top + 14;
    if (y + th > pr.height - 6) y = py - pr.top - th - 14;
    tip.style.left = Math.max(4, x) + 'px';
    tip.style.top = Math.max(4, y) + 'px';
  }

  function tipRow(color, value, label, style) {
    const row = document.createElement('div');
    row.className = 'row';
    const key = document.createElement('i');
    if (style) key.className = style;
    key.style.setProperty('--c', color);
    const b = document.createElement('b');
    b.textContent = value;
    const s = document.createElement('span');
    s.textContent = label;
    row.append(key, b, s);
    return row;
  }

  function fillTip(T) {
    tip.textContent = '';
    const at = document.createElement('div');
    at.className = 'at';
    at.textContent = hhmm(T);
    tip.appendChild(at);
    const r = rowAt(T);
    const g = (k) => (r && r.tab[k] ? r.tab[k][r.i] : null);
    if (r) {
      const name = r.src === 'path' ? 'gefahren' : r.src === 'points' ? 'Plan im Block' : 'Ausblick';
      const o = g('offset');
      if (o !== null) tip.appendChild(tipRow(r.src === 'path' ? C.strong : C.accent, deg(o), name, r.src === 'outlook' ? 'dash' : ''));
      const why = g('why');
      if (why) tip.appendChild(tipRow(whyColor(why), whyLong(why), 'Grund', 'band'));
    }
    const bi = stepIdx(D.best, T, D.step);
    if (bi >= 0 && D.best.offset[bi] !== null) tip.appendChild(tipRow(C.accentInk, deg(D.best.offset[bi]), 'bester Plan im Nachhinein', 'dot'));
    const pr = r && g('price') !== null ? g('price') : interp(D.dayPrices, 'price', T, D.step * 1.5);
    if (pr !== null) tip.appendChild(tipRow(pr < 0 ? C.neg : C.text, eurMwh(pr), 'Strompreis'));
    const word = r && r.src === 'path' ? 'gemessen' : 'erwartet';
    if (g('p_mw') !== null) tip.appendChild(tipRow(C.accent, mw(g('p_mw')), 'Strom ' + word, r.src === 'path' ? '' : 'dash'));
    if (g('ppfd') !== null) tip.appendChild(tipRow(C.teal, ppfd(g('ppfd')), 'Licht an der Pflanze', r.src === 'path' ? '' : 'dash'));
    const past = isNum(D.now) && T <= D.now;
    const k = skyKey;
    const name = k === 'dni' ? 'Direktlicht' : 'Streulicht';
    if (past) {
      const m = interp(D.path, k, T, D.step * 2);
      if (m !== null) tip.appendChild(tipRow(C.strong, wm2(m), name + ' gemessen'));
    } else {
      const m = interp(D.fc, k + '_mid', T, D.step * 2);
      const lo = interp(D.fc, k + '_lo', T, D.step * 2);
      const hi = interp(D.fc, k + '_hi', T, D.step * 2);
      if (m !== null) tip.appendChild(tipRow(C.sky, wm2(m), name + (isNum(lo) && isNum(hi) ? ', ' + fmt(lo, 0) + ' bis ' + fmt(hi, 0) : '')));
    }
    const sv = interp(D.service, k, T, D.step * 2);
    if (sv !== null) tip.appendChild(tipRow(C.muted, wm2(sv), 'Wetterdienst', 'dash thin'));
  }

  function hoverFromEvent(e, box) {
    if (!S || !(D.t1 > D.t0)) return;
    const r = box.getBoundingClientRect();
    const f = chartFrame(r.width, r.height);
    const x = e.clientX - r.left;
    if (x < f.l - 4 || x > f.r + 4) {
      setHover(null);
      return;
    }
    const T = D.t0 + ((clamp(x, f.l, f.r) - f.l) / (f.r - f.l)) * (D.t1 - D.t0);
    setHover(T, e.clientX, e.clientY);
  }

  for (const key of Object.keys(charts)) {
    const box = charts[key].box;
    box.addEventListener('pointermove', (e) => hoverFromEvent(e, box));
    box.addEventListener('pointerdown', (e) => hoverFromEvent(e, box));
    box.addEventListener('pointerleave', () => setHover(null));
    box.addEventListener('blur', () => setHover(null));
    box.addEventListener('keydown', (e) => {
      if (!S || !(D.t1 > D.t0)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Escape') return;
      e.preventDefault();
      if (e.key === 'Escape') {
        setHover(null);
        return;
      }
      const base = hoverT !== null ? hoverT : isNum(D.now) ? clamp(D.now, D.t0, D.t1) : D.t0;
      const T = clamp(base + (e.key === 'ArrowRight' ? 1 : -1) * D.step, D.t0, D.t1);
      const r = box.getBoundingClientRect();
      const f = chartFrame(r.width, r.height);
      const x = r.left + f.l + ((T - D.t0) / (D.t1 - D.t0)) * (f.r - f.l);
      setHover(T, x, r.top + r.height / 2);
    });
  }

  // legends of the plan chart
  let lastKeys = '';
  function renderPlanKeys() {
    const items = [
      ['var(--text-strong)', '', 'gefahren'],
      ['var(--accent)', 'thick', 'Plan im Block'],
      ['var(--accent)', 'dash', 'Ausblick']
    ];
    if (D.best.n) items.push(['var(--accent-ink)', 'dot', 'bester Plan im Nachhinein']);
    if (D.dayPrices.price.some((p) => p !== null && p < 0)) items.push(['var(--neg)', 'band', 'Preis unter null']);
    if (D.powerHours.length) items.push(['var(--warning)', 'band', 'Stromstunden']);
    if (D.shadeHours.length) items.push(['var(--shade)', 'band', 'Schatten auf Wunsch']);
    const sig = items.map((i) => i[2]).join('|');
    if (sig !== lastKeys) {
      lastKeys = sig;
      const box = $('keysPlan');
      box.textContent = '';
      for (const [color, style, label] of items) {
        const k = el('span', 'key');
        const i = el('i', style);
        i.style.setProperty('--c', color);
        k.append(i, document.createTextNode(label));
        box.appendChild(k);
      }
    }
    if (!$('whyKeys').childNodes.length) {
      const box = $('whyKeys');
      box.appendChild(el('span', 'lead', 'Grund:'));
      for (const k of WHY_ORDER) {
        const s = el('span', 'key');
        const i = el('i', 'band');
        i.style.setProperty('--c', 'var(' + WHY[k].color + ')');
        s.append(i, document.createTextNode(WHY[k].long));
        box.appendChild(s);
      }
    }
  }

  // header

  const speedButtons = Array.from(document.querySelectorAll('[data-speed]'));

  function renderHeader() {
    // in the simulation the speed buttons say enough, live gets a label
    $('mode').textContent = D.mode === 'live' ? 'Live' : '';
    $('simControls').hidden = !D.sim || !D.mode;
    for (const b of speedButtons) b.setAttribute('aria-pressed', String(!D.paused && Number(b.dataset.speed) === D.speed));
    const pause = $('pause');
    pause.setAttribute('aria-pressed', String(D.paused));
    pause.textContent = D.paused ? 'Weiter' : 'Pause';
    // the day chooser names test or training day, without it the date line does
    const withSet = $('dayPick').hidden && setName(D.day.set);
    $('date').textContent = dateLine(S) + (withSet ? ', ' + setName(D.day.set) : '');
    $('touched').hidden = D.day.touched !== true;
    const canPreview = !!(D.block && isNum(D.now) && D.block.to > D.now + 60 && sunUp() && D.points.n);
    $('preview').disabled = !canPreview && !preview;
    $('planSub').textContent = planSub();
  }

  function planSub() {
    const p = D.plan;
    if (!D.points.n && !D.outlook.n) return '';
    const bits = [];
    if (isNum(p.made_at)) bits.push('gerechnet um ' + hhmm(p.made_at));
    if (p.first_guess === true) bits.push('erste Schätzung');
    return bits.join(', ');
  }

  function updateClock() {
    let t = simNow();
    if (t === null) return;
    if (shownClock !== null && t < shownClock && shownClock - t < 120 + (D.speed || 0)) t = shownClock;
    shownClock = t;
    const text = hhmm(t);
    const node = $('clock');
    if (node.textContent !== text) node.textContent = text;
  }

  // the day chooser from /api/days, fetched again when the day or the recipe changes

  let daysList = null;
  let daysSig = '';
  let daysRetry = 0;

  async function loadDays() {
    try {
      const j = await request('api/days');
      const arr = Array.isArray(j) ? j : list(obj(j).days);
      daysList = arr.filter((d) => d && typeof d === 'object' && typeof d.date === 'string');
    } catch (e) {
      daysList = null;
      daysRetry = performance.now() + 30000;
    }
    sigs.daysel = null;
    safe(renderDayPick);
  }

  function dayHint(d) {
    let text = shortDate(d.date, true);
    if (setName(d.set)) text += ' ' + setName(d.set);
    const bits = [text];
    if (isNum(d.neg_price_h) && d.neg_price_h > 0) bits.push(fmt(d.neg_price_h, d.neg_price_h % 1 ? 1 : 0) + ' h unter null');
    else if (isNum(d.price_min)) bits.push('Preis ab ' + eurMwh(d.price_min));
    return bits.join(', ');
  }

  function renderDayPick() {
    const date = str(D.day.date);
    if (!changed('daysel', [daysList, date])) return;
    const pick = $('dayPick');
    const sel = $('daySel');
    if (!daysList || !daysList.length) {
      pick.hidden = true;
      return;
    }
    pick.hidden = false;
    sel.textContent = '';
    let found = false;
    for (const d of daysList) {
      const o = el('option', '', dayHint(d));
      o.value = d.date;
      const title = [];
      if (isNum(d.dni_mean)) title.push('Direktlicht im Mittel ' + wm2(d.dni_mean));
      if (isNum(d.price_min) && isNum(d.price_max)) title.push('Strompreis ' + fmt(d.price_min, 1) + ' bis ' + eurMwh(d.price_max));
      if (isNum(d.temp_max)) title.push('bis ' + celsius(d.temp_max));
      if (isNum(d.tracking_eur)) title.push('Nachführen ' + ha(d.tracking_eur));
      if (isNum(d.blind_eur)) title.push('Pflanze zuerst ohne Preisblick ' + ha(d.blind_eur));
      o.title = title.join(', ');
      if (d.date === date) {
        o.selected = true;
        found = true;
      }
      sel.appendChild(o);
    }
    if (!found) {
      const o = el('option', '', date ? shortDate(date, true) : 'Tag wählen');
      o.value = date;
      o.selected = true;
      sel.insertBefore(o, sel.firstChild);
    }
  }

  // tiles

  const sigs = {};
  function changed(key, val) {
    const s = JSON.stringify(val);
    if (sigs[key] === s) return false;
    sigs[key] = s;
    return true;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function place(node, left, width) {
    if (!isNum(left)) {
      node.style.display = 'none';
      return;
    }
    node.style.display = 'block';
    node.style.left = clamp(left, 0, 100) + '%';
    if (width !== undefined) node.style.width = clamp(width, 0, 100 - clamp(left, 0, 100)) + '%';
  }

  function triple(v) {
    const a = list(v).map((x) => num(x));
    return [a[0] !== undefined ? a[0] : null, a[1] !== undefined ? a[1] : null, a[2] !== undefined ? a[2] : null];
  }

  function renderAccount() {
    const a = D.account;
    const exp = obj(obj(D.plan.expect).day_end);
    if (!changed('acc', [a, exp.stress_h])) return;
    const dli = num(a.dli);
    const goal = num(a.dli_target, num(D.recipe.dli_target));
    const [lo, mid, hi] = triple(a.dli_end);
    let share = num(a.dli_share);
    if (share === null && dli !== null && goal) share = dli / goal;
    $('accShare').textContent = share !== null ? pct(share, 0) + ' geschafft' : '';
    const top = Math.max(goal || 0, dli || 0, lo || 0, mid || 0, hi || 0) * 1.06 || 1;
    const at = (v) => (v === null ? null : (v / top) * 100);
    $('accFill').style.width = dli !== null ? clamp(at(dli), 0, 100) + '%' : '0';
    place($('accGoal'), at(goal));
    if (lo !== null && hi !== null) place($('accRange'), at(lo), at(hi) - at(lo));
    else place($('accRange'), null);
    place($('accMid'), at(mid));
    $('accNow').textContent = dli !== null ? fmt(dli, 1) + ' von ' + (goal !== null ? mol(goal) : NA) : '';
    $('accTarget').textContent = lo !== null && hi !== null ? 'am Abend ' + fmt(lo, 0) + ' bis ' + mol(hi) : '';
    // the light target is a duty: reached, on course, or the plant comes first all day
    let say = dli === null && goal === null ? 'Noch keine Werte.' : '';
    let tone = '';
    if (dli !== null && goal !== null && dli >= goal) {
      say = 'Pflicht erfüllt. Ab jetzt zählt nur noch der Strom.';
      tone = 'ok';
    } else if (a.reachable === false) {
      say = 'Heute nicht erreichbar. Die Pflanze geht den ganzen Tag vor und bekommt jede Stunde so viel Licht wie möglich.';
      tone = 'bad';
    } else if (lo !== null && goal !== null && lo >= goal) say = 'Auf Kurs, die Pflicht wird auch bei trübem Himmel erfüllt.';
    else if (mid !== null && goal !== null && mid >= goal) say = 'Auf Kurs, bei trübem Himmel wird es knapp.';
    else if (a.reachable === true) say = 'Knapp, der Plan dreht weiter für das Licht weg.';
    const sayNode = $('accSay');
    sayNode.textContent = say;
    sayNode.className = 'say' + (tone ? ' ' + tone : '');
    const sh = num(a.stress_h);
    const shEnd = num(exp.stress_h);
    let st = sh !== null ? 'Stressstunden heute ' + hours(sh) : '';
    if (shEnd !== null) st += (st ? ', ' : 'Stressstunden ') + 'bis zum Abend erwartet ' + hours(shEnd);
    $('accStress').textContent = st;
  }

  // what the plant's light costs in revenue against pure tracking, in words
  function plantCostWords(cost, trk, when) {
    if (!isNum(cost)) return '';
    if (!shows(cost, [cost])) return 'Das Licht der Pflanze kostet ' + when + ' nichts.';
    const amount = ha(Math.abs(cost));
    const rel = isNum(trk) && Math.abs(trk) > 1e-12 ? ', ' + pct(Math.abs(cost) / Math.abs(trk)) + ' vom Nachführen' : '';
    if (cost > 0) return 'Das Licht der Pflanze kostet ' + when + ' ' + amount + rel + '.';
    return 'Das Licht der Pflanze kostet ' + when + ' nichts, es bringt sogar ' + amount + ' mehr als Nachführen, weil der Strompreis unter null war.';
  }

  function renderMoney() {
    const bal = obj(S.balance);
    const so = obj(bal.sonnenteiler);
    const tr = obj(bal.tracking);
    const a = D.account;
    const end = obj(a.end);
    const cost = obj(D.plan.cost);
    if (!changed('money', [so.elec_eur, tr.elec_eur, bal.plant_cost_eur, a.elec_eur, end.elec_eur, cost])) return;
    const box = $('moneyBody');
    box.textContent = '';
    // today so far, the account is the fallback for the own value
    const own = num(so.elec_eur, num(a.elec_eur));
    const trk = num(tr.elec_eur);
    if (own === null && trk === null) {
      box.appendChild(el('p', 'empty', 'Noch kein Erlös für heute.'));
    } else {
      const f = haIn([own, trk]);
      const top = Math.max(Math.abs(own || 0), Math.abs(trk || 0)) || 1;
      const grid = el('div', 'cmp');
      for (const [name, v, color] of [['Sonnenteiler', own, '--accent'], ['Nachführen', trk, '--chart-3']]) {
        grid.appendChild(el('span', 'name', name));
        const bar = el('div', 'bar');
        const fill = el('span');
        fill.style.setProperty('--c', 'var(' + color + ')');
        fill.style.width = isNum(v) && v > 0 ? (v / top) * 100 + '%' : '0';
        bar.appendChild(fill);
        grid.appendChild(bar);
        grid.appendChild(el('span', 'val' + (isNum(v) && v < 0 ? ' down' : ''), f(v)));
      }
      box.appendChild(grid);
      let pc = num(bal.plant_cost_eur);
      if (pc === null && own !== null && trk !== null) pc = trk - own;
      const words = plantCostWords(pc, trk, 'heute bisher');
      if (words) box.appendChild(el('p', 'say', words));
    }
    const [lo, mid, hi] = triple(end.elec_eur);
    const bits = [];
    if (mid !== null || lo !== null) {
      const fe = haIn([lo, mid, hi]);
      bits.push('Bis zum Abend erwartet ' + (lo !== null && hi !== null ? fe(lo) + ' bis ' + fe(hi) + ' €/ha' + (mid !== null ? ', Mitte ' + fe(mid) : '') : fe(mid) + ' €/ha'));
    }
    const ce = num(cost.elec_eur);
    if (ce !== null && num(cost.dli) > 0.005) bits.push('das Licht kostet bis dahin noch ' + ha(ce));
    if (bits.length) box.appendChild(el('p', 'fine', bits.join(', ') + '.'));
  }

  function cropName(c) {
    const s = str(c);
    if (!s) return NA;
    const fromSchema = schemaDe[s];
    if (fromSchema) return fromSchema;
    return CROP_DE[s.toLowerCase()] || s;
  }

  function renderReplay() {
    const r = D.replay;
    if (!changed('rep', r)) return;
    const box = $('repBody');
    box.textContent = '';
    const blk = obj(r && r.block);
    $('repBlock').textContent = isNum(blk.from) && isNum(blk.to) ? 'Block ' + hhmm(blk.from) + ' bis ' + hhmm(blk.to) : '';
    if (!r) {
      box.appendChild(el('p', 'empty', 'Der Rückblick kommt nach dem ersten fertigen Block mit Sonne.'));
      return;
    }
    const rows = [['Gefahren', obj(r.driven)], ['Versprochen', obj(r.expected)], ['Bester Plan im Nachhinein', obj(r.best)]];
    const fe = haIn(rows.map(([, o]) => num(o.elec_eur)));
    const t = el('table', 'tab');
    const head = el('tr');
    head.append(el('th', '', ''), el('th', '', 'Licht'), el('th', '', 'Erlös €/ha'));
    t.appendChild(head);
    for (const [name, o] of rows) {
      const tr = el('tr');
      tr.append(el('td', '', name), el('td', '', mol(num(o.dli))), el('td', 'strong', fe(num(o.elec_eur))));
      t.appendChild(tr);
    }
    box.appendChild(el('div', 'scrollx')).appendChild(t);
    const g = num(r.gain_share);
    if (g !== null) {
      box.appendChild(el('p', 'say', g < 0.0005 ? 'Im Nachhinein war kaum mehr drin, der Plan lag richtig.' : 'Im Nachhinein wären ' + pct(g) + ' mehr möglich gewesen.'));
    }
    const fe2 = obj(r.forecast_err);
    if (isNum(fe2.dni) || isNum(fe2.dhi)) box.appendChild(el('p', 'fine', 'Fehler der Vorhersage im Block: Direktlicht ' + wm2(num(fe2.dni)) + ', Streulicht ' + wm2(num(fe2.dhi)) + '.'));
  }

  // a money cell: a gain green, a loss red, nothing when it rounds to zero.
  // a gain column carries a plus, a cost column not
  function moneyTd(v, f, values, goodWhenPositive) {
    if (!isNum(v)) return el('td', '', NA);
    const on = shows(v, values);
    const td = el('td', '', on ? (goodWhenPositive ? signed(f(v), v) : f(v)) : f(0));
    if (on) td.classList.add((v > 0) === goodWhenPositive ? 'up' : 'down');
    return td;
  }

  // the duty: met, or the share of the light the plant got
  function dutyTd(met) {
    if (!isNum(met)) return el('td', '', NA);
    if (met >= 0.98) return el('td', 'up', 'erfüllt');
    return el('td', 'down', pct(met, 0));
  }

  // columns a phone leaves out, the two numbers at the end carry the story
  const OPT = new Set(['raw', 'best', 'blind']);

  function stratHead(row, keys) {
    for (const k of keys) {
      const th = el('th', OPT.has(k) ? 'opt' : '', STRAT[k]);
      th.title = STRAT_TITLE[k];
      row.appendChild(th);
    }
  }

  function renderDays() {
    const days = list(S.days).filter((d) => d && typeof d === 'object');
    if (!changed('days', days)) return;
    const box = $('daysBody');
    box.textContent = '';
    if (!days.length) {
      box.appendChild(el('p', 'empty', 'Noch kein fertiger Tag. Ein Tag zählt, wenn er bis Mitternacht gelaufen ist.'));
      return;
    }
    const strats = ['sonnenteiler', 'tracking', 'blind', 'best'];
    const vals = [];
    for (const d of days) {
      for (const k of strats) vals.push(num(obj(d[k]).elec_eur));
      vals.push(num(d.plant_cost_eur), num(d.price_gain_eur));
    }
    const f = haIn(vals);
    const t = el('table', 'tab days wide');
    const head = el('tr');
    head.appendChild(el('th', '', 'Tag'));
    stratHead(head, strats);
    head.append(el('th', 'opt', 'Licht'), el('th', '', 'Pflicht'), el('th', '', 'Licht kostet'), el('th', '', 'Preisblick bringt'));
    t.appendChild(head);
    for (const d of days.slice().reverse()) {
      const so = obj(d.sonnenteiler);
      const row = el('tr');
      const day = el('td', '', weekday(d.date) + ' ' + shortDate(d.date));
      if (d.set === 'test') day.appendChild(el('small', '', ' Test'));
      if (d.touched === true) day.appendChild(el('small', '', ' Wolke'));
      day.title = (setName(d.set) || '') + (d.touched === true ? ', durch eine Wolke verändert' : '');
      row.appendChild(day);
      for (const k of strats) {
        const td = el('td', (k === 'sonnenteiler' ? 'strong' : '') + (OPT.has(k) ? ' opt' : ''), f(num(obj(d[k]).elec_eur)));
        if (k === 'blind' && d.reference && typeof d.reference === 'object') {
          td.title = 'days.csv: Pflanze zuerst ' + f(num(obj(d.reference.oracle).elec_eur)) + ', Nachführen ' + f(num(obj(d.reference.tracking).elec_eur)) + ' €/ha';
        }
        row.appendChild(td);
      }
      const dp = num(so.dli_pct);
      row.appendChild(el('td', 'opt', dp !== null ? fmt(dp, 0) + ' %' : NA));
      row.appendChild(dutyTd(num(so.light_met)));
      // an older service has no cost number, tracking minus sonnenteiler gives it
      let pc = num(d.plant_cost_eur);
      const sv = num(so.elec_eur);
      const tv = num(obj(d.tracking).elec_eur);
      if (pc === null && sv !== null && tv !== null) pc = tv - sv;
      row.appendChild(moneyTd(pc, f, vals, false));
      row.appendChild(moneyTd(num(d.price_gain_eur), f, vals, true));
      t.appendChild(row);
    }
    box.appendChild(el('div', 'scrollx')).appendChild(t);
    box.appendChild(el('p', 'fine', 'Erlös aus Strom pro Tag. Ohne Preisblick heißt: die Pflanze zuerst, aber blind für den Strompreis. ' +
      'Pflicht erfüllt heißt Lichtziel erreicht, oder alles Licht bekommen, das der Tag hergab. Licht kostet: Nachführen minus Sonnenteiler. ' +
      'Preisblick bringt: Sonnenteiler minus ohne Preisblick.'));
  }

  function renderEval() {
    const ev = S.eval && typeof S.eval === 'object' && !Array.isArray(S.eval) ? S.eval : null;
    const nc = obj(obj(S.model).nowcast);
    const md = obj(obj(S.model).data);
    const sc = obj(obj(S.model).scene_check);
    if (!changed('eval', [ev, nc, md, sc, schemaDe])) return;
    const box = $('evalBody');
    box.textContent = '';
    const nDays = ev ? num(ev.days) : null;
    $('evalAside').textContent = nDays !== null ? 'Mittel pro Tag über ' + fmt(nDays, 0) + (nDays === 1 ? ' Testtag' : ' Testtage') : '';
    const wrap = el('div', 'evalwrap');
    const left = el('div');
    // one row per recipe, an older service sent two
    const rows = [];
    const seen = new Set();
    for (const r of ev ? list(ev.rows) : []) {
      if (!r || typeof r !== 'object' || seen.has(str(r.recipe))) continue;
      seen.add(str(r.recipe));
      rows.push(r);
    }
    const anyElec = rows.some((r) => ['tracking', 'blind', 'raw', 'plan', 'best'].some((k) => isNum(obj(r[k]).elec_eur)));
    if (!ev) left.appendChild(el('p', 'empty', 'Die Auswertung fehlt noch, sie entsteht beim Training.'));
    else if (!rows.length) left.appendChild(el('p', 'empty', 'Keine Zeilen in der Auswertung.'));
    else if (!anyElec) left.appendChild(el('p', 'empty', 'Die Auswertung des Dienstes hat noch die alte Form ohne Erlös aus Strom.'));
    else {
      const strats = ['tracking', 'blind', 'raw', 'plan', 'best'];
      const vals = [];
      for (const r of rows) {
        for (const k of strats) vals.push(num(obj(r[k]).elec_eur));
        vals.push(num(r.plant_cost_eur), num(r.price_gain_eur));
      }
      const f = haIn(vals);
      const t = el('table', 'tab wide');
      const head = el('tr');
      head.appendChild(el('th', '', 'Pflanze'));
      stratHead(head, strats);
      head.append(el('th', '', 'Pflicht'), el('th', '', 'Licht kostet'), el('th', '', 'Preisblick bringt'));
      head.lastChild.previousSibling.previousSibling.title = 'Tage mit erfüllter Lichtpflicht, Sonnenteiler';
      t.appendChild(head);
      for (const r of rows) {
        const tr = el('tr');
        const name = str(r.recipe);
        tr.appendChild(el('td', '', cropName(recipeCrop(name)) || name));
        for (const k of strats) tr.appendChild(el('td', (k === 'plan' ? 'strong' : '') + (OPT.has(k) ? ' opt' : ''), f(num(obj(r[k]).elec_eur))));
        const met = num(obj(r.plan).days_met);
        const metTd = el('td', '', met !== null ? fmt(met, 0) + (nDays !== null ? ' von ' + fmt(nDays, 0) : '') : NA);
        if (met !== null && nDays !== null) metTd.classList.add(met >= nDays ? 'up' : 'down');
        tr.appendChild(metTd);
        let pc = num(r.plant_cost_eur);
        const pv = num(obj(r.plan).elec_eur);
        const tv = num(obj(r.tracking).elec_eur);
        if (pc === null && pv !== null && tv !== null) pc = tv - pv;
        tr.appendChild(moneyTd(pc, f, vals, false));
        tr.appendChild(moneyTd(num(r.price_gain_eur), f, vals, true));
        t.appendChild(tr);
      }
      left.appendChild(el('div', 'scrollx')).appendChild(t);
      const lq = num(ev.light_quantile);
      left.appendChild(el('p', 'fine', 'Erlös aus Strom in €/ha pro Tag. Pflicht: Tage, an denen Sonnenteiler das Lichtziel erfüllt hat.' +
        (lq !== null ? ' Das Licht wird vorsichtig geplant, mit dem Quantil ' + fmt(lq, 2) + ' der Vorhersage.' : '')));
    }
    wrap.appendChild(left);

    // forecast error per lead time
    const right = el('div');
    const bl = obj(nc.by_lead);
    const leads = list(bl.lead_min);
    const series = [['raw', 'Wetterdienst', '--chart-3'], ['shift', 'einfache Korrektur', '--chart-neutral'], ['model', 'Kurzfristvorhersage', '--sky']];
    const used = str(nc.used);
    right.appendChild(el('p', 'grp', 'Mittlerer Fehler beim Direktlicht nach Vorlauf, W/m²'));
    if (!leads.length) right.appendChild(el('p', 'empty', 'Noch keine Fehlerwerte.'));
    else {
      let top = 1;
      for (const [k] of series) for (const v of list(bl[k])) if (isNum(v)) top = Math.max(top, v);
      const t = el('table', 'tab errtab');
      const head = el('tr');
      head.appendChild(el('th', '', 'Vorlauf'));
      for (const lead of leads) head.appendChild(el('th', '', isNum(lead) ? fmt(lead, 0) + ' min' : NA));
      t.appendChild(head);
      for (const [k, name, color] of series) {
        const tr = el('tr', k === used ? 'used' : '');
        const nameTd = el('td', '', name);
        if (k === used) nameTd.title = 'in Gebrauch';
        tr.appendChild(nameTd);
        leads.forEach((lead, i) => {
          const v = num(list(bl[k])[i]);
          const td = el('td', k === used ? 'strong' : '', v !== null ? fmt(v, 0) : NA);
          const bar = el('span', 'mini');
          bar.style.setProperty('--c', 'var(' + color + ')');
          bar.style.width = v !== null ? clamp((v / top) * 100, 0, 100) + '%' : '0';
          td.appendChild(bar);
          tr.appendChild(td);
        });
        t.appendChild(tr);
      }
      right.appendChild(el('div', 'scrollx')).appendChild(t);
    }
    const md2 = obj(nc.mae_dni);
    const mh = obj(nc.mae_dhi);
    const line = [];
    if (used) line.push('In Gebrauch: ' + (USED[used] || used));
    const three = (o) => [o.raw, o.shift, o.model].map((v) => (isNum(v) ? fmt(v, 0) : NA)).join(', ');
    if (isNum(md2.raw) || isNum(md2.model)) line.push('über alle Vorläufe Direktlicht ' + three(md2) + ' W/m²');
    if (isNum(mh.raw) || isNum(mh.model)) line.push('Streulicht ' + three(mh) + ' W/m²');
    if (line.length) right.appendChild(el('p', 'fine', line.join(', ') + ' (in der Reihenfolge der Tabelle).'));
    const data = [];
    if (isNum(md.days)) data.push(fmt(md.days, 0) + ' Tage' + (isNum(md.train_days) && isNum(md.test_days) ? ' (' + fmt(md.train_days, 0) + ' Training, ' + fmt(md.test_days, 0) + ' Test)' : ''));
    if (md.from && md.to) data.push(shortDate(md.from, true) + ' bis ' + shortDate(md.to, true));
    if (isNum(sc.rows)) data.push('Formeln gegen ' + fmt(sc.rows, 0) + ' Zeilen geprüft, Abweichung höchstens ' + fmt(num(sc.max_err_p_mw), 3) + ' mW');
    if (data.length) right.appendChild(el('p', 'fine', 'Daten: ' + data.join(', ') + '.'));
    wrap.appendChild(right);
    box.appendChild(wrap);
  }

  function renderLog() {
    const items = list(S.log).filter((it) => it && it.text !== undefined && it.text !== null && it.text !== '');
    if (!changed('log', items)) return;
    const ul = $('logList');
    ul.textContent = '';
    if (!items.length) {
      const li = el('li', 'empty', 'Noch nichts passiert.');
      li.style.display = 'block';
      ul.appendChild(li);
      return;
    }
    for (const it of items.slice().reverse()) {
      const o = obj(it);
      const li = el('li');
      li.append(el('time', '', hhmm(num(o.t))), el('span', '', String(o.text)));
      ul.appendChild(li);
    }
  }

  // recipe: the active one, the form, the chatbot box

  let schema = null;
  let schemaDe = {};
  let schemaSig = '';

  function recipeCrop(name) {
    for (const c of schemaCrops()) if (c.recipe === name) return c.crop;
    const r = D.recipe;
    if (r && r.name === name) return r.crop;
    return name;
  }

  // the plants of the schema, a list of names or objects, or a map
  function schemaCrops() {
    const out = [];
    const raw = obj(schema).crops;
    const deOf = (o) => str(o.de) || str(o.german) || str(o.name_de);
    if (Array.isArray(raw)) {
      for (const c of raw) {
        if (typeof c === 'string') out.push({ crop: c });
        else if (c && typeof c === 'object') {
          const name = str(c.crop) || str(c.name) || str(c.key) || str(c.column);
          if (name) out.push({ crop: name, de: deOf(c), recipe: str(c.recipe) });
        }
      }
    } else if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === 'object') out.push({ crop: k, de: deOf(v), recipe: str(v.recipe) });
        else out.push({ crop: k });
      }
    }
    return out;
  }

  async function loadSchema() {
    try {
      schema = await request('api/recipe/schema');
    } catch (e) {
      schema = null;
    }
    schemaDe = {};
    // german names: a map german to column, or the de field of a crop
    const g = obj(obj(schema).german);
    for (const [de, en] of Object.entries(g)) if (typeof en === 'string') schemaDe[en] = de;
    for (const c of schemaCrops()) if (c.de) schemaDe[c.crop] = c.de;
    sigs.rec = null;
    sigs.crops = null;
    safe(renderRecipe);
  }

  function hoursText(ph) {
    return ph.map(([a, b]) => hourStr(a) + '-' + hourStr(b)).join(', ');
  }

  function hoursWords(ph) {
    return ph.length ? ph.map(([a, b]) => hourStr(a) + ' bis ' + hourStr(b) + ' Uhr').join(', ') : 'keine';
  }

  function hourStr(h) {
    const m = Math.round((h % 1) * 60);
    return m ? Math.floor(h) + ':' + pad2(m) : String(Math.floor(h));
  }

  function numIn(v) {
    return isNum(v) ? fmt(v, v % 1 ? (Math.abs(v) < 1 ? 3 : 1) : 0).replace(/\./g, '') : '';
  }

  let formDirty = false;
  const touched = new Set();

  function renderRecipe() {
    const r = D.recipe;
    const crops = schemaCrops();
    if (changed('crops', [crops, r.crop])) fillCrops(crops, str(r.crop));
    if (!changed('rec', [r, schemaDe])) return;
    $('recName').textContent = r.crop ? cropName(r.crop) + (r.name && str(r.name).toLowerCase() !== str(r.crop).toLowerCase() ? ', Rezept ' + r.name : '') : '';
    const dl = $('recList');
    dl.textContent = '';
    const rows = [
      ['Lichtziel', isNum(r.dli_target) ? mol(r.dli_target) + ' am Tag' : NA],
      ['Licht höchstens', ppfd(num(r.max_ppfd))],
      ['Blatt höchstens', celsius(num(r.tmax_c))],
      ['Stromstunden', hoursWords(powerHours(r))],
      ['Schatten', hoursWords(hourWindows(r, 'shade_hours'))],
      ['Strompreis', isNum(r.elec_price_eur_mwh) ? eurMwh(r.elec_price_eur_mwh) + ' fest' : 'Marktpreis']
    ];
    if (r.note) rows.push(['Notiz', String(r.note), 'span']);
    // the chatbot's own keys are expected under extra, the rest is unknown
    const extra = obj(r.extra);
    const unknown = Object.keys(extra).filter((k) => ['names', 'source', 'v'].indexOf(k) < 0);
    if (typeof extra.source === 'string') rows.push(['Herkunft', 'Pflanzentabelle des Chatbots', 'span', extra.source]);
    if (unknown.length) rows.push(['Unbekannt', unknown.join(', '), 'span']);
    for (const [k, v, cls, title] of rows) {
      const dd = el('dd', cls || '', v);
      if (title) dd.title = title;
      dl.append(el('dt', cls ? 'spank' : '', k), dd);
    }
    if (!formDirty) fillForm(r);
  }

  function fillCrops(crops, current) {
    const sel = $('fCrop');
    const keep = formDirty ? sel.value : current;
    sel.textContent = '';
    const seen = new Set();
    for (const c of crops) {
      if (seen.has(c.crop)) continue;
      seen.add(c.crop);
      const o = el('option', '', cropName(c.crop));
      o.value = c.crop;
      sel.appendChild(o);
    }
    for (const c of [current, keep]) {
      if (c && !seen.has(c)) {
        seen.add(c);
        const o = el('option', '', cropName(c));
        o.value = c;
        sel.appendChild(o);
      }
    }
    sel.value = keep || current;
  }

  function fillForm(r) {
    if (r.crop) $('fCrop').value = r.crop;
    $('fDli').value = numIn(r.dli_target);
    $('fPpfd').value = numIn(r.max_ppfd);
    $('fTmax').value = numIn(r.tmax_c);
    $('fHours').value = hoursText(powerHours(r));
    $('fShade').value = hoursText(hourWindows(r, 'shade_hours'));
    $('fElecPrice').value = numIn(r.elec_price_eur_mwh);
    touched.clear();
  }

  function parseDe(text) {
    const t = String(text || '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace('−', '-');
    if (!t) return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : NaN;
  }

  // "17-21, 6-8", "17 bis 21" or "17:30-21" to [[17, 21], [6, 8]]
  function parseHours(text, label) {
    const out = [];
    const t = String(text || '').trim();
    if (!t) return out;
    for (const part of t.split(/[,;]+/)) {
      const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(?:-|bis)\s*(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?\s*$/i.exec(part);
      if (!m) throw new Error(label + ' bitte wie 17-21 schreiben, mehrere mit Komma.');
      const a = +m[1] + (m[2] ? +m[2] / 60 : 0);
      const b = +m[3] + (m[4] ? +m[4] / 60 : 0);
      if (!(a >= 0 && b <= 24 && b > a)) throw new Error(label + ' müssen im Tag liegen, Ende nach Anfang.');
      out.push([a, b]);
    }
    return out;
  }

  // the canonical recipe from the form, a new crop takes its own defaults from the service
  function buildRecipe() {
    const r = D.recipe;
    const crop = $('fCrop').value || str(r.crop);
    const newCrop = crop && crop !== r.crop;
    const fields = {
      dli_target: ['fDli', 'Lichtziel'],
      max_ppfd: ['fPpfd', 'Licht höchstens'],
      tmax_c: ['fTmax', 'Blatt höchstens'],
      elec_price_eur_mwh: ['fElecPrice', 'Strompreis']
    };
    const out = { crop };
    if (!newCrop && r.name) out.name = r.name;
    for (const [key, [id, label]] of Object.entries(fields)) {
      if (newCrop && !touched.has(id)) continue;
      const v = parseDe($(id).value);
      if (Number.isNaN(v)) throw new Error(label + ': bitte eine Zahl eintragen.');
      if (v === null) {
        // an empty tariff means the market price
        if (key === 'elec_price_eur_mwh') out[key] = null;
        continue;
      }
      out[key] = v;
    }
    if (!newCrop || touched.has('fHours')) out.power_hours = parseHours($('fHours').value, 'Stromstunden');
    if (!newCrop || touched.has('fShade')) out.shade_hours = parseHours($('fShade').value, 'Schattenstunden');
    if (!newCrop && r.note) out.note = r.note;
    return out;
  }

  // the answer of /api/recipe and /api/whatif in words, with the report
  function renderAnswer(box, j, kind, sent) {
    box.textContent = '';
    box.classList.remove('bad');
    const o = obj(j);
    if (kind === 'whatif') {
      const end = obj(obj(o.expect).day_end);
      const [plo, pmid, phi] = triple(end.elec_eur);
      const [dlo, dmid] = triple(end.dli);
      const cur = triple(obj(obj(D.plan.expect).day_end).elec_eur)[1];
      const fe = haIn([plo, pmid, phi, cur]);
      let text = '';
      if (pmid !== null) {
        text = 'Erlös bis zum Abend ' + (plo !== null && phi !== null ? fe(plo) + ' bis ' + fe(phi) + ' €/ha, Mitte ' + fe(pmid) : fe(pmid) + ' €/ha');
        if (cur !== null) {
          const diff = pmid - cur;
          text += '. Mit dem aktiven Rezept ' + fe(cur) + ' €/ha';
          if (shows(diff, [plo, pmid, phi, cur])) text += ', also ' + signed(fe(diff), diff) + ' €/ha';
        }
        text += '.';
      } else text = 'Keine Zahl zum Erlös bekommen.';
      box.appendChild(el('p', 'say', text));
      const bits = [];
      if (dmid !== null) bits.push('Licht am Abend etwa ' + mol(dmid) + (dlo !== null ? ', bei trübem Himmel ' + mol(dlo) : ''));
      if (o.reachable === true) bits.push('die Lichtpflicht ist erreichbar');
      else if (o.reachable === false) bits.push('die Lichtpflicht ist so nicht erreichbar, die Pflanze ginge den ganzen Tag vor');
      const cost = obj(o.cost);
      if (num(cost.dli) > 0.005) bits.push('das Licht kostet ' + ha(num(cost.elec_eur)) + ' Erlös');
      if (isNum(end.stress_h)) bits.push('Stress bis zum Abend ' + hours(end.stress_h));
      if (o.first_guess === true) bits.push('erste Schätzung');
      if (bits.length) box.appendChild(el('p', 'line', bits.join(', ') + '.'));
      box.appendChild(el('p', 'fine', 'Nur gerechnet, am laufenden Plan ändert sich nichts.'));
    } else {
      box.appendChild(el('p', 'say', 'Übernommen, ein neuer Plan ist gerechnet.'));
    }
    renderReport(box, obj(o.report), o.recipe, sent);
  }

  function renderReport(box, rep, recipe, sent) {
    const any = Object.keys(rep).length;
    if (!any && !recipe) return;
    const dl = el('dl', 'report');
    const keys = (v) => {
      const a = list(v).map((x) => String(x));
      return a.length ? a.join(', ') : 'nichts';
    };
    if (any) {
      dl.append(el('dt', '', 'verstanden'), el('dd', '', keys(rep.understood)));
      dl.append(el('dt', '', 'ergänzt'), el('dd', '', keys(rep.defaulted)));
      const ign = el('dd', list(rep.ignored).length ? 'warn' : '', keys(rep.ignored));
      dl.append(el('dt', '', 'ignoriert'), ign);
      const w = list(rep.warnings).map((x) => String(x));
      const wd = el('dd', w.length ? 'warn' : '');
      if (w.length) for (const s of w) wd.appendChild(el('span', 'wl', s));
      else wd.textContent = 'keine';
      dl.append(el('dt', '', 'Hinweise'), wd);
    }
    box.appendChild(dl);
    if (recipe && typeof recipe === 'object') {
      const det = el('details', 'json');
      det.appendChild(el('summary', '', 'Rezept, wie der Dienst es verstanden hat'));
      det.appendChild(el('pre', '', JSON.stringify(recipe, null, 1)));
      box.appendChild(det);
    }
    if (sent) {
      const det = el('details', 'json');
      det.appendChild(el('summary', '', 'Gesendet'));
      det.appendChild(el('pre', '', sent));
      box.appendChild(det);
    }
  }

  function showError(box, e) {
    box.textContent = '';
    box.classList.add('bad');
    const missing = e && e.status === 404;
    box.appendChild(el('p', '', missing ? 'Der Dienst kennt diesen Weg noch nicht (alte Version).' : e && e.name === 'AbortError' ? 'Keine Antwort vom Dienst.' : String((e && e.message) || e)));
  }

  async function sendRecipe(button, path, body, box, raw) {
    button.disabled = true;
    box.classList.remove('bad');
    box.textContent = '';
    box.appendChild(el('p', 'fine', 'Rechnet ...'));
    try {
      const j = await request(path, body, raw);
      renderAnswer(box, j, path === 'api/whatif' ? 'whatif' : 'apply', raw !== undefined ? raw : null);
      if (path === 'api/recipe') {
        formDirty = false;
        touched.clear();
        sigs.rec = null;
        sigs.crops = null;
        pollSoon();
      }
    } catch (e) {
      showError(box, e);
    } finally {
      button.disabled = false;
    }
  }

  function formSend(button, path) {
    const box = $('fAnswer');
    let rec;
    try {
      rec = buildRecipe();
    } catch (err) {
      box.textContent = '';
      box.classList.add('bad');
      box.appendChild(el('p', '', err.message));
      return;
    }
    sendRecipe(button, path, rec, box);
  }

  // whatever was pasted goes out as it is, only text around a json block is cut away
  function pasteSend(button, path) {
    const box = $('pAnswer');
    const text = $('fPaste').value.trim();
    if (!text) {
      box.textContent = '';
      box.classList.add('bad');
      box.appendChild(el('p', '', 'Erst die Ausgabe des Chatbots einfügen.'));
      return;
    }
    let raw = text;
    let ok = true;
    try {
      JSON.parse(text);
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      const a = text.search(/[[{]/);
      const b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
      let inner = null;
      if (a >= 0 && b > a) {
        try {
          JSON.parse(text.slice(a, b + 1));
          inner = text.slice(a, b + 1);
        } catch (e) {
          inner = null;
        }
      }
      // no json inside: send it as a json string, the service decides
      raw = inner !== null ? inner : JSON.stringify(text);
    }
    sendRecipe(button, path, undefined, box, raw);
  }

  // the farmer's wish: words go to /api/ask, the chatbot makes the recipe

  // the service waits up to chatbot.timeout_s (120 s) for the model, the page a bit longer
  const ASK_WAIT_MS = 150000;
  const ASK_ERR = {
    off: 'Kein Chatbot eingestellt. Das Rezept lässt sich unten von Hand ändern.',
    bad: 'Der Chatbot hat diese Worte nicht angenommen. Bitte etwas anders beschreiben.',
    llm: 'Das Sprachmodell konnte daraus kein Rezept machen. Bitte noch einmal, gern mit anderen Worten.',
    timeout: 'Das Sprachmodell hat zu lange gebraucht. Gleich noch einmal versuchen, beim zweiten Mal geht es meist schneller.',
    unreachable: 'Der Chatbot antwortet gerade nicht. Läuft er, und stimmt seine Adresse?'
  };
  const ask = { pending: false, prompt: '', started: 0, timer: 0, plant: null };
  let lastChatT;

  // on, off, or none when the service has no chatbot at all (old version)
  function chatAvail() {
    if (!S || !S.chatbot || typeof S.chatbot !== 'object') return 'none';
    return S.chatbot.on === true ? 'on' : 'off';
  }

  function wallClock(t) {
    if (!isNum(t)) return '';
    const d = new Date(t * 1000);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function updateWishControls() {
    const avail = chatAvail();
    const ta = $('aPrompt');
    ta.disabled = avail !== 'on' && !ask.pending;
    ta.readOnly = ask.pending;
    const send = $('aSend');
    send.disabled = ask.pending || avail !== 'on' || !ta.value.trim();
    send.textContent = ask.pending ? 'Liest ...' : 'Rezept erstellen';
    for (const b of document.querySelectorAll('#aAnswer .chip')) b.disabled = ask.pending || avail !== 'on';
  }

  function renderChatbot() {
    const c = S && S.chatbot && typeof S.chatbot === 'object' ? S.chatbot : null;
    const avail = chatAvail();
    if (!changed('chatbot', [avail, c])) return;
    const st = $('cbStat');
    let text = 'kein Chatbot';
    let cls = 'off';
    if (avail === 'off') text = 'Chatbot aus';
    else if (avail === 'on' && c.ok === true) {
      text = 'Chatbot verbunden' + (typeof c.model === 'string' && c.model ? ', ' + c.model : '');
      cls = 'ok';
    } else if (avail === 'on' && c.ok === false) {
      text = 'Chatbot nicht erreichbar';
      cls = 'bad';
    } else if (avail === 'on') {
      text = 'Chatbot eingestellt';
      cls = 'wait';
    }
    st.textContent = text;
    st.className = 'cbstat ' + cls;
    let note = 'Strg Enter schickt ab. Ein Sprachmodell liest die Worte, die Zahlen der Pflanze kommen aus einer Tabelle.';
    if (avail === 'none') note = 'Dieser Dienst kennt noch keinen Chatbot. Das Rezept lässt sich unten von Hand ändern.';
    else if (avail === 'off') note = 'Kein Chatbot eingestellt. Das Rezept lässt sich unten von Hand ändern.';
    else if (c.ok === false) note = 'Der Chatbot hat zuletzt nicht geantwortet. Senden geht trotzdem, vielleicht ist er gleich wieder da.';
    const last = c && c.last && typeof c.last === 'object' ? c.last : null;
    if (avail === 'on' && last && (last.plant || isNum(last.t))) {
      note += ' Zuletzt vom Chatbot: ' + (last.plant ? cropName(last.plant) : 'ein Rezept') + (isNum(last.t) ? ' um ' + wallClock(last.t) : '') +
        (last.via === 'poll' ? ', von der Trackerseite.' : last.via === 'ask' ? ', über dieses Feld.' : '.');
    }
    $('aNote').textContent = note;
    updateWishControls();
  }

  // a recipe that came in through the chatbot, also from the tracker page, refills the form
  function followChatbot() {
    const last = S && S.chatbot && typeof S.chatbot === 'object' ? obj(S.chatbot.last) : {};
    const t = num(last.t);
    if (lastChatT !== undefined && t !== lastChatT) {
      formDirty = false;
      touched.clear();
      sigs.rec = null;
      sigs.crops = null;
    }
    lastChatT = t;
  }

  function waitText() {
    const secs = Math.max(0, Math.round((performance.now() - ask.started) / 1000));
    return (ask.plant ? 'Das Sprachmodell liest die Worte noch einmal, jetzt mit ' + cropName(ask.plant) : 'Das Sprachmodell liest die Worte') +
      (secs >= 1 ? ', seit ' + secs + ' s.' : '.');
  }

  function showWaiting() {
    const box = $('aAnswer');
    box.textContent = '';
    box.classList.remove('bad');
    box.appendChild(el('p', 'say', waitText())).id = 'aWait';
    box.appendChild(el('div', 'busy'));
    box.appendChild(el('p', 'fine', 'Die erste Anfrage nach einer Pause kann bis zu einer Minute dauern, weil das Modell erst geladen wird. Die Seite läuft weiter.'));
  }

  function tickWaiting() {
    const p = $('aWait');
    if (p) p.textContent = waitText();
  }

  function renderAsk(a) {
    const box = $('aAnswer');
    box.textContent = '';
    const plant = typeof a.plant === 'string' && a.plant ? a.plant : null;
    box.appendChild(el('p', 'say', plant ? plant + ' kennt der Chatbot nicht, er rät auch nicht. Welche dieser Pflanzen kommt am nächsten?' :
      'Der Chatbot hat keine Pflanze erkannt. Welche wächst unter dem Tracker?'));
    const chips = el('div', 'chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Bekannte Pflanzen');
    for (const k of list(a.known)) {
      const o = obj(k);
      const name = str(o.name);
      if (!name) continue;
      const names = obj(o.names);
      const b = el('button', 'chip', str(names.de) || str(names.en) || name);
      b.type = 'button';
      b.title = name;
      b.addEventListener('click', () => sendWish(name));
      chips.appendChild(b);
    }
    if (chips.childNodes.length) {
      box.appendChild(chips);
      box.appendChild(el('p', 'fine', 'Ein Klick schickt dieselben Worte noch einmal, mit der gewählten Pflanze.'));
    } else box.appendChild(el('p', 'fine', 'Der Chatbot hat keine Liste bekannter Pflanzen mitgeschickt.'));
  }

  function renderWishRecipe(o) {
    const box = $('aAnswer');
    box.textContent = '';
    const rec = obj(o.recipe);
    const cb = obj(o.chatbot);
    const shade = hourWindows(rec, 'shade_hours');
    const power = powerHours(rec);
    const parts = [str(obj(cb.names).de) || cropName(rec.crop)];
    if (isNum(rec.dli_target)) parts.push('Lichtziel ' + mol(rec.dli_target) + ' am Tag');
    if (isNum(rec.tmax_c)) parts.push('höchstens ' + celsius(rec.tmax_c));
    parts.push(shade.length ? 'Schatten ' + hoursWords(shade) : 'kein Schatten gewünscht');
    parts.push(power.length ? 'Strom zuerst ' + hoursWords(power) : 'keine Stromstunden');
    box.appendChild(el('p', 'say', 'Verstanden: ' + parts.join(', ') + '.'));
    box.appendChild(el('p', 'line', 'Das Rezept ist aktiv, ein neuer Plan ist gerechnet.'));
    renderReport(box, obj(o.report), o.recipe, null);
    if (o.chatbot && typeof o.chatbot === 'object') {
      const det = el('details', 'json');
      det.appendChild(el('summary', '', 'Rezept, wie der Chatbot es geschickt hat'));
      det.appendChild(el('pre', '', JSON.stringify(o.chatbot, null, 1)));
      box.appendChild(det);
    }
  }

  function renderWishError(e) {
    const box = $('aAnswer');
    box.textContent = '';
    const code = e && e.code;
    let text;
    if (code && ASK_ERR[code]) text = ASK_ERR[code];
    else if (e && e.status === 404) text = 'Diese Version des Dienstes kennt den Chatbot noch nicht. Das Rezept lässt sich unten von Hand ändern.';
    else if (e && e.name === 'AbortError') text = 'Nach zweieinhalb Minuten kam keine Antwort. Bitte noch einmal versuchen.';
    else text = (e && e.message) || 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
    // one calm sentence, the service's own words stay in the tooltip
    const p = box.appendChild(el('p', 'calm', text));
    if (e && e.message && e.message !== text) p.title = 'Der Dienst sagt: ' + e.message;
  }

  async function sendWish(plant) {
    if (ask.pending || chatAvail() !== 'on') return;
    const words = plant ? ask.prompt : $('aPrompt').value.trim();
    if (!words) return;
    ask.pending = true;
    ask.prompt = words;
    ask.plant = plant || null;
    ask.started = performance.now();
    showWaiting();
    clearInterval(ask.timer);
    ask.timer = setInterval(tickWaiting, 1000);
    updateWishControls();
    const body = { prompt: words.slice(0, 1000), lang: 'de' };
    if (plant) body.plant = plant;
    try {
      const o = obj(await request('api/ask', body, undefined, ASK_WAIT_MS));
      if (o.ask && typeof o.ask === 'object') renderAsk(o.ask);
      else if (o.recipe && typeof o.recipe === 'object') {
        renderWishRecipe(o);
        formDirty = false;
        touched.clear();
        sigs.rec = null;
        sigs.crops = null;
        pollSoon();
      } else renderWishError({ message: 'Der Dienst hat weder ein Rezept noch eine Rückfrage geschickt.' });
    } catch (e) {
      renderWishError(e);
    } finally {
      ask.pending = false;
      clearInterval(ask.timer);
      updateWishControls();
    }
  }

  $('aSend').addEventListener('click', () => sendWish(null));
  $('aPrompt').addEventListener('input', updateWishControls);
  $('aPrompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendWish(null);
    }
  });

  // talking to the service

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      // python can write NaN or Infinity, the browser cannot read them
      return JSON.parse(text.replace(/-?\bInfinity\b|\bNaN\b/g, 'null'));
    }
  }

  async function request(path, body, raw, waitMs) {
    const ctrl = new AbortController();
    const post = body !== undefined || raw !== undefined;
    const timer = setTimeout(() => ctrl.abort(), waitMs || (post ? 20000 : 4000));
    try {
      const opts = { cache: 'no-store', signal: ctrl.signal };
      if (post) {
        opts.method = 'POST';
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = raw !== undefined ? raw : JSON.stringify(body);
      }
      const r = await fetch(path, opts);
      const text = await r.text();
      let j = null;
      try {
        j = text ? parseJson(text) : null;
      } catch (e) {
        j = null;
      }
      if (!r.ok || (j && j.ok === false)) {
        const err = new Error((j && j.error) || 'Antwort ' + r.status);
        err.status = r.status;
        err.code = j && typeof j.code === 'string' ? j.code : null;
        throw err;
      }
      return j;
    } finally {
      clearTimeout(timer);
    }
  }

  let fails = 0;
  let lastOk = 0;
  let inflight = false;
  let pollTimer = 0;

  async function poll() {
    if (inflight) return;
    inflight = true;
    clearTimeout(pollTimer);
    try {
      const s = await request('api/state');
      if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('leere Antwort');
      fails = 0;
      lastOk = performance.now();
      onState(s);
    } catch (e) {
      fails++;
    }
    inflight = false;
    updateNet();
    pollTimer = setTimeout(poll, fails ? Math.min(3000, 500 * fails) : POLL_MS);
  }

  function pollSoon() {
    clearTimeout(pollTimer);
    if (!inflight) pollTimer = setTimeout(poll, 50);
  }

  let offline = false;
  function updateNet() {
    const off = fails >= 2 || performance.now() - lastOk > 3000;
    if (off === offline) return;
    offline = off;
    $('net').hidden = !off;
    document.body.classList.toggle('offline', off && !!S);
  }

  let msgTimer = 0;
  function say(text, bad) {
    const m = $('msg');
    m.textContent = text;
    m.classList.toggle('bad', !!bad);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => (m.textContent = ''), 5000);
  }

  async function act(button, path, body, done) {
    if (button) button.disabled = true;
    try {
      const j = await request(path, body);
      if (done) done(j);
      pollSoon();
    } catch (e) {
      say(e.status === 404 ? 'Der Dienst kennt diesen Weg noch nicht.' : e.name === 'AbortError' ? 'Keine Antwort vom Dienst.' : String(e.message || e), true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function onState(s) {
    S = s;
    recvAt = performance.now();
    $('wait').hidden = true;
    D = derive(s);
    const up = sunUp();
    const el0 = num(D.sun.el);
    target.el = up && el0 !== null ? el0 : null;
    target.a = up ? normalAngle(num(D.pose.pan), num(D.pose.tilt), num(D.sun.az_rel), el0, num(D.pose.offset)) : 90;
    if (shownClock !== null && isNum(D.now) && Math.abs(D.now - shownClock) > 4 * 3600) shownClock = null;
    if (preview && (!D.block || D.block.to !== preview.end)) stopPreview();
    // the day list and the schema follow the day and the recipe
    const ds = JSON.stringify([D.day.date, D.recipe]);
    if (ds !== daysSig || (!daysList && daysRetry && performance.now() > daysRetry)) {
      daysSig = ds;
      daysRetry = 0;
      loadDays();
    }
    const ss = String(D.day.date || '');
    if (ss !== schemaSig) {
      schemaSig = ss;
      loadSchema();
    }
    safe(renderHeader);
    safe(renderDayPick);
    safe(renderPlanKeys);
    safe(renderSkyNote);
    safe(renderAccount);
    safe(renderMoney);
    safe(renderReplay);
    safe(renderDays);
    safe(renderEval);
    safe(followChatbot);
    safe(renderRecipe);
    safe(renderChatbot);
    safe(renderLog);
    if (hoverT !== null && !tip.hidden) safe(() => fillTip(hoverT));
    sceneDirty = true;
    chartsDirty = true;
  }

  function renderSkyNote() {
    const nc = obj(obj(S.model).nowcast);
    if (!changed('skynote', [nc.used, nc.mae_dni, nc.mae_dhi, skyKey, D.fc.n])) return;
    const used = str(nc.used);
    const mae = obj(skyKey === 'dni' ? nc.mae_dni : nc.mae_dhi);
    const name = skyKey === 'dni' ? 'Direktlicht' : 'Streulicht';
    let text = used ? 'In Gebrauch: ' + (USED[used] || used) + '.' : 'Welche Vorhersage in Gebrauch ist, sagt der Dienst nicht.';
    const parts = [];
    if (isNum(mae.model)) parts.push('Kurzfristvorhersage ' + wm2(mae.model));
    if (isNum(mae.shift)) parts.push('einfache Korrektur ' + wm2(mae.shift));
    if (isNum(mae.raw)) parts.push('Wetterdienst ' + wm2(mae.raw));
    if (parts.length) text += ' Mittlerer Fehler beim ' + name + ' auf den Testtagen: ' + parts.join(', ') + '.';
    $('skyNote').textContent = text;
    const key = document.querySelector('.chart-sky .keys .key:nth-child(3)');
    if (key) key.lastChild.textContent = USED[used] || 'Kurzfristvorhersage';
  }

  // controls

  for (const b of speedButtons) {
    b.addEventListener('click', async () => {
      const speed = Number(b.dataset.speed);
      if (D.paused) await act(null, 'api/speed', { paused: false });
      act(b, 'api/speed', { speed });
    });
  }
  $('pause').addEventListener('click', (e) => act(e.currentTarget, 'api/speed', { paused: !D.paused }));
  $('cloud').addEventListener('click', (e) => act(e.currentTarget, 'api/cloud', { minutes: 90, factor: 0.15 }, () => say('Wolke für 90 Minuten.')));
  $('reset').addEventListener('click', (e) => act(e.currentTarget, 'api/reset', {}, () => say('Der Tag beginnt neu.')));
  $('daySel').addEventListener('change', (e) => {
    const date = e.currentTarget.value;
    if (!date || date === D.day.date) return;
    act(e.currentTarget, 'api/day', { date }, () => say('Springe zum ' + shortDate(date, true) + '.'));
  });
  for (const b of document.querySelectorAll('[data-sky]')) {
    b.addEventListener('click', () => {
      skyKey = b.dataset.sky;
      for (const x of document.querySelectorAll('[data-sky]')) x.setAttribute('aria-pressed', String(x === b));
      chartsDirty = true;
      safe(renderSkyNote);
    });
  }

  function stopPreview() {
    preview = null;
    $('preview').textContent = 'Vorschau';
    $('preview').setAttribute('aria-pressed', 'false');
    sceneDirty = true;
    chartsDirty = true;
  }

  $('preview').addEventListener('click', () => {
    if (preview) {
      stopPreview();
      return;
    }
    if (!S || !D.block || !isNum(D.now)) return;
    const start = D.now;
    const end = D.block.to;
    if (!(end > start + 60)) return;
    preview = { start, end, t0: performance.now() };
    ghostEase.a = null;
    $('preview').textContent = 'Stopp';
    $('preview').setAttribute('aria-pressed', 'true');
  });

  const form = $('recForm');
  form.addEventListener('input', (e) => {
    formDirty = true;
    if (e.target && e.target.id) touched.add(e.target.id);
  });
  form.addEventListener('change', (e) => {
    formDirty = true;
    if (e.target && e.target.id) touched.add(e.target.id);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  $('fWhatif').addEventListener('click', (e) => formSend(e.currentTarget, 'api/whatif'));
  $('fApply').addEventListener('click', (e) => formSend(e.currentTarget, 'api/recipe'));
  $('fUndo').addEventListener('click', () => {
    formDirty = false;
    sigs.crops = null;
    safe(() => {
      fillCrops(schemaCrops(), str(D.recipe.crop));
      fillForm(D.recipe);
    });
    $('fAnswer').textContent = '';
  });
  $('pWhatif').addEventListener('click', (e) => pasteSend(e.currentTarget, 'api/whatif'));
  $('pApply').addEventListener('click', (e) => pasteSend(e.currentTarget, 'api/recipe'));

  // theme

  function setTheme(t, keep) {
    document.documentElement.setAttribute('data-theme', t);
    $('theme').textContent = t === 'light' ? 'Dunkel' : 'Hell';
    if (keep) {
      try {
        localStorage.setItem('sonnenteiler.theme', t);
      } catch (e) {
        // private windows may refuse, the switch still works for now
      }
    }
    readColors();
    sceneDirty = true;
    chartsDirty = true;
  }

  let stored = null;
  try {
    stored = localStorage.getItem('sonnenteiler.theme');
  } catch (e) {
    stored = null;
  }
  const wanted = params.get('theme') || stored;
  $('theme').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true));

  // the frame loop

  let sceneDirty = true;
  let chartsDirty = true;
  let lastFrame = performance.now();

  function frame(ts) {
    const dt = Math.min(0.1, Math.max(0, (ts - lastFrame) / 1000));
    lastFrame = ts;
    let moving = false;
    for (const k of ['a', 'el']) {
      const next = approach(ease[k], target[k], dt, k === 'el' ? 0.3 : 0.22);
      if (next !== ease[k]) moving = true;
      ease[k] = next;
    }
    if (S && (sceneDirty || moving || preview)) {
      sceneDirty = false;
      safe(() => {
        const v = currentView(dt);
        drawScene(v);
        sceneDom(v);
      });
    }
    if (S && chartsDirty) {
      chartsDirty = false;
      safe(drawPlanChart);
      safe(drawSkyChart);
    }
    safe(updateClock);
    updateNet();
    requestAnimationFrame(frame);
  }

  const ro = new ResizeObserver(() => {
    sceneDirty = true;
    chartsDirty = true;
  });
  ro.observe($('stage'));
  for (const key of Object.keys(charts)) ro.observe(charts[key].box);

  setTheme(wanted === 'light' ? 'light' : 'dark', false);
  if (document.fonts && document.fonts.load) {
    document.fonts.load('12px "Geist Serif"').then(() => {
      sceneDirty = true;
      chartsDirty = true;
    }, () => {});
  }
  requestAnimationFrame(frame);
  poll();
})();
