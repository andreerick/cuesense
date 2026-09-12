'use strict';
/* CueSense — analyse d'un coup + score */

function analyze(win, fs){
  const n = win.length, axes = ['ax','ay','az'];
  const means = {}; for (const k of axes){ let m = 0; for (const w of win) m += w[k]; means[k] = m / n; }
  let cue = $('axSel').value;
  if (cue === 'auto'){ let bv = -1;
    for (const k of axes){ let v = 0; for (const w of win) v += (w[k] - means[k]) ** 2; if (v > bv){ bv = v; cue = k; } } }
  const off = axes.filter(a => a !== cue);
  const mag = win.map(w => Math.abs(Math.hypot(w.ax, w.ay, w.az) - 1));
  let ip = 0; for (let i = 1; i < n; i++) if (mag[i] > mag[ip]) ip = i;
  // vitesse axe queue, détendancée sur le début calme de la fenêtre
  const q = Math.max(5, Math.floor(n * 0.18)); let base = 0;
  for (let i = 0; i < q; i++) base += win[i][cue]; base /= q;
  const dt = 1 / fs, vel = new Array(n); let v = 0;
  for (let i = 0; i < n; i++){ v += (win[i][cue] - base) * G * dt; vel[i] = v; }
  const vImp = vel[ip], dir = Math.sign(vImp) || 1, vpk = Math.abs(vImp);
  const eps = Math.max(0.02, 0.08 * vpk);
  let ds = ip; while (ds > 0 && Math.sign(vel[ds-1]) === dir && Math.abs(vel[ds-1]) > eps) ds--;
  let ps = ds; while (ps > 0 && Math.abs(vel[ps-1]) <= eps) ps--;
  let bs = ps; while (bs > 0 && Math.sign(vel[bs-1]) === -dir && Math.abs(vel[bs-1]) > eps * 0.5) bs--;
  const rms = (k, a, b) => { let m = 0, s2 = 0, c = Math.max(1, b - a);
    for (let i = a; i < b; i++) m += win[i][k]; m /= c;
    for (let i = a; i < b; i++) s2 += (win[i][k] - m) ** 2; return Math.sqrt(s2 / c); };
  const on = rms(cue, ds, ip + 1), lat = Math.hypot(rms(off[0], ds, ip + 1), rms(off[1], ds, ip + 1));
  const rng = (k, a, b) => { let mn = 1e9, mx = -1e9; for (let i = a; i < b; i++){ const x = win[i][k]; if (x < mn) mn = x; if (x > mx) mx = x; } return mx - mn; };
  const rs = [rng('r', ds, ip + 1), rng('p', ds, ip + 1), rng('y', ds, ip + 1)].sort((a, b) => a - b);
  return {
    cue, ip, ds, ps, bs, vel,
    magPeak: mag[ip],
    speed: vpk,
    back: (ps - bs) * dt, pause: (ds - ps) * dt, deliv: (ip - ds) * dt,
    latPct: on > 1e-6 ? lat / on * 100 : 0,
    angDrift: Math.hypot(rs[0], rs[1]),
    win, fs
  };
}

function addStroke(win, fs, t){
  if (win.length < 10) return;
  const a = analyze(win, fs); a.t = t; a.id = S.strokes.length + 1;
  if (S.exo.active) a.exo = { type: S.exo.type, point: S.exo.type === 'points' ? S.exo.point : null };
  S.strokes.push(a); S.sel = S.strokes.length - 1;
  updateScores();
  renderStrokes();
  if (S.exo.active) exoStroke(a);
}

function clampScore(v){ return Math.max(0, Math.min(100, v)); }
function percentageDeviationFromAverage(value, average){
  return average < SCORE_CONFIG.epsilonAverage ? 0 : Math.abs(value - average) / average * 100;
}
function updateScores(){
  const a = S.strokes, mean = f => a.reduce((sum, s) => sum + f(s), 0) / a.length;
  const avgSpeed = mean(s => s.speed), avgDeliv = mean(s => s.deliv);
  a.forEach(s => {
    const straight = clampScore(100 - s.latPct * SCORE_CONFIG.lateralPenalty);
    const backDeliveryActual = s.back / Math.max(s.deliv, SCORE_CONFIG.epsilonDuration);
    const fluid = clampScore(100 - Math.abs(backDeliveryActual - SCORE_CONFIG.backDeliveryRatio) * SCORE_CONFIG.ratioPenalty);
    const stable = clampScore(100 - s.angDrift * SCORE_CONFIG.angularPenalty);
    const technical = SCORE_CONFIG.straightness * straight + SCORE_CONFIG.fluidity * fluid +
      SCORE_CONFIG.stability * stable;
    if (a.length < 2){ s.score = Math.round(technical / (1 - SCORE_CONFIG.regularity)); return; }
    const speedDeviation = percentageDeviationFromAverage(s.speed, avgSpeed);
    const deliveryDeviation = percentageDeviationFromAverage(s.deliv, avgDeliv);
    const regular =
      (clampScore(100 - speedDeviation) + clampScore(100 - deliveryDeviation)) / 2;
    s.score = Math.round(technical + SCORE_CONFIG.regularity * regular);
  });
}

/* détection hors-ligne partagée (import de fichier + démo) */
function detectOffline(raw, fs){
  S.strokes = []; S.sel = -1;
  const thr = +$('thr').value, refr = Math.round(2 * fs), pre = Math.round(1.5 * fs), post = Math.round(0.6 * fs);
  const mag = raw.map(w => Math.abs(Math.hypot(w.ax, w.ay, w.az) - 1));
  let last = -refr;
  for (let i = 0; i < raw.length; i++){
    if (mag[i] > thr && i - last > refr){
      addStroke(raw.slice(Math.max(0, i - pre), Math.min(raw.length, i + post)), fs, i / fs);
      last = i;
    }
  }
  S.overview = { mag, fs, marks: S.strokes.map(s => Math.round(s.t * fs)) };
  $('overviewP').classList.remove('hidden');
  drawOverview();
  return mag;
}
