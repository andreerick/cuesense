'use strict';
/* CueSense — interface : navigation, écrans, exercices, résultats */

/* ============ navigation ============ */
const VIEWS = { joueur: 'viewJoueur', conn: 'viewConn', calib: 'viewCalib', exo: 'viewExo', res: 'viewRes' };
function nav(key){
  S.view = key;
  for (const [k, id] of Object.entries(VIEWS)) $(id).classList.toggle('hidden', k !== key);
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.nav === key));
  renderSteppers();
  if (key === 'conn') renderConn();
  if (key === 'res') renderStrokes();
  if (key === 'exo'){ if (S.exo.active) showExoScreen('run'); else selectExo('points'); }
  scrollTo(0, 0);
  schedulePersist();
}
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => nav(b.dataset.nav));

function renderSteppers(){
  const done = [S.flow.player, S.flow.conn, S.flow.calib, S.flow.exo];
  const current = { joueur: 1, conn: 2, calib: 3, exo: 4 }[S.view] || 0;
  document.querySelectorAll('.stepper').forEach(el => {
    let h = '';
    for (let i = 1; i <= 4; i++){
      if (i > 1) h += `<span class="bar ${done[i-2] ? 'done' : ''}"></span>`;
      h += `<span class="dot ${i === current ? 'now' : done[i-1] ? 'done' : ''}"></span>`;
    }
    el.innerHTML = h;
  });
}

/* ============ splash ============ */
(function(){
  const sp = $('splash');
  const bye = () => { sp.classList.add('bye'); setTimeout(() => sp.remove(), 500); };
  sp.onclick = bye;
  setTimeout(bye, 1700);
})();

/* ============ joueur ============ */
function loadPlayer(){
  try{
    const p = JSON.parse(localStorage.getItem('cuesense-player') || 'null');
    if (p){ S.player = p; S.flow.player = !!p.name; }
  }catch(e){}
  $('playerName').value = S.player.name;
  $('playerLevel').value = S.player.level;
}
function savePlayer(){ localStorage.setItem('cuesense-player', JSON.stringify(S.player)); }
$('btnPlayerGo').onclick = () => {
  S.player.name = $('playerName').value.trim() || 'Joueur';
  S.player.level = $('playerLevel').value;
  $('playerName').value = S.player.name;
  S.flow.player = true; savePlayer();
  nav('conn');
};
$('btnPlayerReset').onclick = () => {
  S.player = { name: '', level: 'Intermédiaire' };
  localStorage.removeItem('cuesense-player');
  S.flow.player = false;
  $('playerName').value = ''; $('playerLevel').value = 'Intermédiaire';
  renderSteppers(); $('playerName').focus();
};

/* ============ session locale (survit au rafraîchissement et à la fermeture) ============ */
const SESSION_KEY = 'cuesense-session';
let persistT = null;
function saveSession(){
  // pas de coups = pas de session : on efface le stockage (bouton « Effacer »)
  if (!S.strokes.length){ try{ localStorage.removeItem(SESSION_KEY); }catch(e){} return; }
  let data = {
    v: 1,
    strokes: S.strokes,
    sel: S.sel,
    overview: S.overview,
    exo: { ...S.exo, active: false },
    liveCue: S.liveCue,
    settings: { thr: $('thr').value, axis: $('axSel').value, fsIn: $('fsIn').value, rate: $('selRate').value, metrics: S.enabledMetrics },
    view: S.view,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (e) {
    // quota dépassé (gros import) : on sacrifie l'aperçu, le plus gros tableau, puis on réessaie
    try {
      data = { ...data, overview: null };
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e2) { console.warn('Session non sauvegardée (quota localStorage dépassé).', e2); }
  }
}
function schedulePersist(){ clearTimeout(persistT); persistT = setTimeout(saveSession, 400); }
function loadSession(){
  let data;
  try { data = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch (e){ return false; }
  if (!data || !Array.isArray(data.strokes) || !data.strokes.length) return false;
  S.strokes = data.strokes;
  S.sel = Number.isInteger(data.sel) && data.sel < S.strokes.length ? data.sel : S.strokes.length - 1;
  S.overview = (data.overview && data.overview.mag && data.overview.mag.length) ? data.overview : null;
  S.liveCue = data.liveCue || null;
  if (data.exo) S.exo = Object.assign(S.exo, data.exo, { active: false });
  if (S.strokes.some(s => s.exo)) S.flow.exo = true;
  const set = data.settings || {};
  if (set.thr){ $('thr').value = set.thr; $('thrV').textContent = set.thr + ' g'; }
  if (set.axis) $('axSel').value = set.axis;
  if (set.fsIn) $('fsIn').value = set.fsIn;
  if (set.rate) $('selRate').value = set.rate;
  if (set.metrics){
    S.enabledMetrics = Object.assign(S.enabledMetrics, set.metrics);
    document.querySelectorAll('.metricChk').forEach(chk => { chk.checked = !!S.enabledMetrics[chk.dataset.key]; });
  }
  setTarget(S.exo.target || 5);
  $('targetDistIn').value = S.exo.targetDist || 30;
  setAxisLabel($('axSel').value === 'auto'
    ? (S.liveCue ? S.liveCue.slice(1).toUpperCase() + ' (auto)' : '—')
    : $('axSel').value.slice(1).toUpperCase());
  updateScores();
  if (S.overview) $('overviewP').classList.remove('hidden');
  nav(data.view && VIEWS[data.view] ? data.view : 'res');
  return true;
}
// filet de sécurité : sauvegarde immédiate quand l'onglet passe en arrière-plan / se ferme
addEventListener('pagehide', saveSession);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSession(); });

/* ============ connexion ============ */
function renderConn(){
  const live = S.live && S.device?.gatt?.connected;
  $('connName').textContent = S.device?.name ? 'Capteur ' + S.device.name : 'Capteur WT9011DCL';
  if (live) $('connSub').textContent = S.fsMeasured ? S.fsMeasured + ' Hz mesurés' : 'Connecté';
  else if (!S.device) $('connSub').textContent = 'Aucun capteur connecté';
  else $('connSub').textContent = 'Déconnecté';

  const st = $('connState');
  st.className = 'state ' + (live ? 'ok' : 'err');
  $('connStateTxt').textContent = live ? 'Connecté' : 'Déconnecté';
  $('connStateSub').textContent = live ? (S.device?.name || 'capteur') + ' · notifications actives'
                                       : 'Connectez le capteur pour commencer';
  // batterie
  const bs = $('battState'), pct = S.battery;
  if (pct != null){
    $('battPct').textContent = pct + ' %';
    bs.className = 'state ' + (pct <= 20 ? 'warn' : '');
    $('battSub').textContent = pct <= 20 ? 'Batterie faible — pensez à recharger'
      : (S.batteryV ? S.batteryV.toFixed(2) + ' V' : 'Niveau lu depuis le capteur');
    $('battPip').style.opacity = pct <= 20 ? 1 : 0;
    const f = $('battFill');
    f.setAttribute('width', (13 * pct / 100).toFixed(1));
    f.setAttribute('fill', pct <= 10 ? css('--red') : pct <= 20 ? css('--yellow') : css('--green-hi'));
  } else {
    $('battPct').textContent = '—';
    bs.className = 'state';
    $('battSub').textContent = 'Niveau lu depuis le capteur';
    $('battPip').style.opacity = 0;
    $('battFill').setAttribute('width', 0);
  }
  $('btnConnect').classList.toggle('hidden', live);
  $('btnConnGo').classList.toggle('hidden', !live);
  $('btnDisc').disabled = !live;
  $('connPip').classList.toggle('on', !!live);
  renderSteppers();
}
$('btnConnect').onclick = connectSensor;
$('btnDisc').onclick = () => { S.device?.gatt?.disconnect(); };
$('btnConnGo').onclick = () => { S.flow.conn = true; nav('calib'); };
$('selRate').onchange = async () => { schedulePersist(); if (S.chW && S.device?.gatt?.connected) await applyRate(); };
$('fsIn').onchange = schedulePersist;
if (!navigator.bluetooth){ $('noBle').classList.remove('hidden'); $('btnConnect').disabled = true; }

/* ============ calibrage ============ */
function liveCueAxis(win){
  const sel = $('axSel').value; if (sel !== 'auto') return sel;
  const vars = {};
  for (const k of ['ax','ay','az']){ let m = 0; for (const s of win) m += s[k]; m /= win.length;
    let v = 0; for (const s of win) v += (s[k] - m) ** 2; vars[k] = v; }
  const best = Object.keys(vars).sort((a, b) => vars[b] - vars[a])[0];
  if (S.liveCue && vars[S.liveCue] * 1.5 > vars[best]) return S.liveCue; // hystérésis : on ne change pas d'axe pour rien
  S.liveCue = best; return best;
}
function inclinationDeg(win){
  if (!win.length) return NaN;
  const cue = $('axSel').value !== 'auto' ? $('axSel').value : (S.liveCue || 'ax');
  let mc = 0, mm = 0;
  for (const s of win){ mc += s[cue]; mm += Math.hypot(s.ax, s.ay, s.az); }
  mc /= win.length; mm /= win.length;
  if (mm < 1e-6) return NaN;
  return Math.asin(Math.max(-1, Math.min(1, Math.abs(mc) / mm))) * 180 / Math.PI;
}
$('btnVerify').onclick = () => {
  if (!S.live || !S.samples.length){ alert('Connectez d’abord le capteur (onglet Connexion).'); return; }
  if (S.calib.running) return;
  S.calib.running = true;
  const start = S.samples.length, t0 = performance.now(), DUR = 3000;
  $('calResult').innerHTML = ''; $('btnVerify').disabled = true;
  const tick = () => {
    const el = Math.min(1, (performance.now() - t0) / DUR);
    $('calProg').style.width = (el * 100) + '%';
    if (el < 1){ requestAnimationFrame(tick); return; }
    S.calib.running = false; $('btnVerify').disabled = false;
    setTimeout(() => $('calProg').style.width = '0%', 800);
    const win = S.samples.slice(start);
    if (win.length < 30){
      calResult(false, 'Pas assez de données', 'Vérifiez que le capteur envoie bien des mesures.'); return;
    }
    const incl = inclinationDeg(win);
    const mags = win.map(s => Math.hypot(s.ax, s.ay, s.az) - 1);
    const still = sd(mags);
    if (incl <= 5 && still <= 0.05){
      S.calib.ok = true; S.flow.calib = true;
      calResult(true, 'Calibrage OK', 'Le capteur est correctement calibré.');
    } else if (still > 0.05){
      S.calib.ok = false;
      calResult(false, 'Trop de mouvement', 'Restez immobile pendant les 3 secondes puis recommencez.');
    } else {
      S.calib.ok = false;
      calResult(false, 'Queue inclinée (' + fmt(incl, 1) + '°)', 'Placez la queue à l’horizontale puis recommencez.');
    }
    renderSteppers();
  };
  requestAnimationFrame(tick);
};
function calResult(ok, title, sub){
  $('calResult').innerHTML =
    `<div class="state ${ok ? 'ok' : 'err'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${
        ok ? '<path d="M4.5 12.5l5 5 10-11"/>' : '<path d="M6 6l12 12M18 6L6 18"/>'}</svg>
      <div class="tx"><b>${title}</b><span>${sub}</span></div><i class="pip"></i>
    </div>`;
}
$('btnCal').onclick = () => {
  if (!S.samples.length){ alert('Connectez le capteur d’abord.'); return; }
  const start = S.samples.length, btn = $('btnCal');
  btn.disabled = true; btn.textContent = 'Limage en cours… faites des allers-retours';
  setTimeout(() => {
    const win = S.samples.slice(start);
    btn.disabled = false; btn.textContent = 'Calibrer l’axe — limage 2 s';
    if (win.length < 20){ alert('Pas assez de données pendant la calibration.'); return; }
    const vars = {};
    for (const k of ['ax','ay','az']){ let m = 0; for (const s of win) m += s[k]; m /= win.length;
      let v = 0; for (const s of win) v += (s[k] - m) ** 2; vars[k] = v; }
    const best = Object.keys(vars).sort((a, b) => vars[b] - vars[a])[0];
    $('axSel').value = best; S.liveCue = best;
    $('axSel').onchange();
    setAxisLabel(best.slice(1).toUpperCase() + ' (calibré)');
  }, 2500);
};
function setAxisLabel(txt){ $('cueAxLbl').textContent = txt; $('cueAxLbl2').textContent = txt; }
$('thr').oninput = () => { $('thrV').textContent = $('thr').value + ' g'; schedulePersist(); };
$('axSel').onchange = () => {
  S.strokes = S.strokes.map(s => { const r = analyze(s.win, s.fs); r.t = s.t; r.id = s.id; r.dist = s.dist; r.exo = s.exo; return r; });
  updateScores(); renderStrokes();
  setAxisLabel($('axSel').value === 'auto' ? (S.liveCue ? S.liveCue.slice(1).toUpperCase() + ' (auto)' : '—')
                                           : $('axSel').value.slice(1).toUpperCase());
};
$('btnCalibGo').onclick = () => { S.flow.calib = true; nav('exo'); };

/* ============ exercices ============ */
function showExoScreen(which){
  $('exoChoose').classList.toggle('hidden', which !== 'choose');
  $('exoConfig').classList.toggle('hidden', which !== 'config');
  $('exoRun').classList.toggle('hidden', which !== 'run');
}
function selectExo(type){
  S.exo.type = type;
  $('pointBlock').classList.toggle('hidden', S.exo.type !== 'points');
  $('setupCard').classList.toggle('hidden', S.exo.type !== 'points');
  $('contactCard').classList.toggle('hidden', S.exo.type !== 'points');
  $('targetDistIn').value = S.exo.targetDist || 30;
  renderSeg();
  showExoScreen('config');
}
document.querySelectorAll('.exo-card').forEach(c => c.onclick = () => selectExo(c.dataset.exo));
$('targetDistIn').onchange = () => {
  const v = parseFloat($('targetDistIn').value);
  S.exo.targetDist = isFinite(v) && v > 0 ? v : 30;
  schedulePersist();
};
function renderSeg(){
  document.querySelectorAll('#segPoint button').forEach(b => {
    b.classList.toggle('sel', +b.dataset.p === S.exo.point);
    b.classList.toggle('done', S.exo.done.includes(b.dataset.p));
  });
}
document.querySelectorAll('#segPoint button').forEach(b => b.onclick = () => { S.exo.point = +b.dataset.p; renderSeg(); });
$('cntMinus').onclick = () => setTarget(S.exo.target - 1);
$('cntPlus').onclick  = () => setTarget(S.exo.target + 1);
function setTarget(n){
  S.exo.target = Math.max(1, Math.min(50, n));
  $('cntVal').textContent = S.exo.target;
  $('cntDefault').textContent = S.exo.target === 5 ? 'Par défaut' : 'Défaut : 5';
}
$('btnStart').onclick = () => {
  if (!S.live){ alert('Capteur non connecté — connectez-le (onglet Connexion) ou utilisez la démo dans Résultats.'); return; }
  S.exo.count = 0; S.exo.active = true;
  $('exoDone').innerHTML = '';
  $('exoRunTitle').textContent = 'Exercice : ' + EXOS[S.exo.type].name;
  updateRunSub(); updateRun();
  showExoScreen('run');
  schedulePersist();
};
function updateRunSub(){
  $('exoRunSub').textContent = EXOS[S.exo.type].sub;
}
function updateRun(){
  $('exoCount').textContent = S.exo.count + ' / ' + S.exo.target;
  $('exoProg').style.width = Math.min(100, S.exo.count / S.exo.target * 100) + '%';
}
function exoStroke(s){
  S.exo.count++;
  updateRun();
  $('lastStroke').innerHTML = RESULT_METRICS
    .filter(m => S.enabledMetrics[m.key])
    .map(m => { const v = m.get(s); return st(m.label, (isFinite(v) ? fmt(v, m.decimals) : '—') + ' ' + m.unit); })
    .join('');
  if (S.exo.count >= S.exo.target) finishSeries();
}
function finishSeries(){
  S.exo.active = false; S.flow.exo = true;
  $('exoDone').innerHTML =
    `<div class="state ok">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>
      <div class="tx"><b>Série terminée</b><span>${S.exo.count} coup${S.exo.count > 1 ? 's' : ''} enregistré${S.exo.count > 1 ? 's' : ''}.</span></div>
      <i class="pip"></i>
    </div>
    <button class="btn btn-valider" id="btnSeeRes">Voir les résultats</button>`;
  renderSteppers(); renderSeg(); schedulePersist();
  $('btnSeeRes').onclick = () => nav('res');
}
$('btnFinish').onclick = () => { S.exo.active = false; nav('res'); };
$('btnAbort').onclick  = () => { S.exo.active = false; $('exoDone').innerHTML = ''; showExoScreen('config'); };

/* enregistrement CSV */
function setRecording(active){
  S.recordingActive = active;
  $('btnRecord').textContent = active ? '⏹ Arrêter l’enregistrement' : '⏺ Enregistrer CSV';
  $('btnCsv').disabled = active || !S.recording.length;
}
$('btnRecord').onclick = () => {
  if (!S.recordingActive && !S.device?.gatt?.connected){ alert('Veuillez connecter le capteur avant d’enregistrer.'); return; }
  if (!S.recordingActive) S.recording = [];
  setRecording(!S.recordingActive);
};
$('btnCsv').onclick = exportCsv;

/* ============ boucle temps réel ============ */
let rafOn = false;
function startLiveLoop(){ if (!rafOn){ rafOn = true; requestAnimationFrame(liveLoop); } }
function liveLoop(){
  if (!S.live){ rafOn = false; return; }
  const now = S.samples.length ? S.samples[S.samples.length - 1].t : 0;
  const win = S.samples.filter(s => s.t > now - 4);
  const runVisible = S.view === 'exo' && !$('exoRun').classList.contains('hidden');
  if (runVisible && win.length > 1){
    const cue = liveCueAxis(win), off = ['ax','ay','az'].filter(a => a !== cue);
    if ($('axSel').value === 'auto') setAxisLabel(cue.slice(1).toUpperCase() + ' (auto)');
    const m = {}; for (const k of ['ax','ay','az']){ let x = 0; for (const s of win) x += s[k]; m[k] = x / win.length; }
    plot($('cCue'), [
      { data: win.map(s => Math.hypot(s[off[0]] - m[off[0]], s[off[1]] - m[off[1]])), color: css('--green-hi') },
      { data: win.map(s => s[cue] - m[cue]), color: css('--white'), w: 1.4 },
    ]);
    if ($('chk3ax').checked){
      const c = css('--white'), c2 = css('--green-hi'), c3 = css('--yellow');
      plot($('cAcc'), [{ data: win.map(s => s.ax), color: c }, { data: win.map(s => s.ay), color: c2 }, { data: win.map(s => s.az), color: c3 }]);
      plot($('cGyr'), [{ data: win.map(s => s.gx), color: c }, { data: win.map(s => s.gy), color: c2 }, { data: win.map(s => s.gz), color: c3 }]);
      plot($('cAng'), [{ data: win.map(s => s.r), color: c }, { data: win.map(s => s.p), color: c2 }, { data: win.map(s => s.y), color: c3 }]);
      const L = win[win.length - 1];
      $('vR').textContent = L.r.toFixed(1) + '°'; $('vP').textContent = L.p.toFixed(1) + '°'; $('vY').textContent = L.y.toFixed(1) + '°';
    }
  }
  if (S.view === 'calib' && win.length > 1){
    const incl = inclinationDeg(win.filter(s => s.t > now - 0.4));
    $('inclNum').textContent = isFinite(incl) ? fmt(incl, 1) + '°' : '—';
  }
  requestAnimationFrame(liveLoop);
}
$('chk3ax').onchange = () => $('threeAx').classList.toggle('hidden', !$('chk3ax').checked);

/* ============ résultats ============ */
function st(k, v){ return `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

function renderStrokes(){
  schedulePersist();
  $('nStrokes').textContent = S.strokes.length ? '· ' + S.strokes.length : '';
  $('resPlayer').textContent = S.player.name ? S.player.name + ' · ' + S.player.level : '';
  const w = $('tblWrap');
  if (!S.strokes.length){
    w.innerHTML = '<div class="empty">Aucun coup. Connectez le capteur et lancez un exercice, importez un enregistrement, ou lancez la démo.</div>';
    return;
  }
  const cols = RESULT_METRICS.filter(m => S.enabledMetrics[m.key]);
  let h = '<table><tr><th>#</th>' + cols.map(m => `<th>${m.short}<br>${m.unit}</th>`).join('') + '</tr>';
  S.strokes.forEach((s, i) => {
    h += `<tr class="${i === S.sel ? 'sel' : ''}" data-i="${i}"><td>${s.id}</td>`;
    cols.forEach(m => {
      h += m.key === 'dist'
        ? `<td><input class="distIn" type="number" inputmode="decimal" data-d="${i}" value="${s.dist ?? ''}" placeholder="—"></td>`
        : `<td>${fmt(m.get(s), m.decimals)}</td>`;
    });
    h += '</tr>';
  });
  w.innerHTML = h + '</table>';
  w.querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => { S.sel = +tr.dataset.i; renderStrokes(); });
  w.querySelectorAll('.distIn').forEach(inp => {
    inp.onclick = e => e.stopPropagation();
    inp.onchange = () => { const v = parseFloat(inp.value); S.strokes[+inp.dataset.d].dist = isFinite(v) && v > 0 ? v : undefined; if (S.overview) drawOverview(); schedulePersist(); };
  });
  if (S.overview) drawOverview();
}

/* peak absolu (accél./gyro, oscillent autour de 0) ou plage max-min (angles, valeurs absolues) sur la fenêtre du coup */
const peakAbsOf = (win, k) => win.length ? Math.max(...win.map(w => Math.abs(w[k]))) : NaN;
const rangeOf = (win, k) => { if (!win.length) return NaN; let mn = 1e9, mx = -1e9; for (const w of win){ if (w[k] < mn) mn = w[k]; if (w[k] > mx) mx = w[k]; } return mx - mn; };
/* distance de recul de la queue (backswing) : intégrale de la vitesse (axe queue) sur la phase [bs,ps] */
const backswingDist = s => { if (s.ps <= s.bs) return 0; let d = 0; for (let i = s.bs; i < s.ps; i++) d += Math.abs(s.vel[i]) / s.fs; return d * 100; };

/* 5 résultats d'analyse retenus pour l'instant, + tous les axes bruts du capteur (décochés par défaut).
   activables/désactivables via les cases à cocher du panneau "Options du capteur" (S.enabledMetrics). */
const RESULT_METRICS = [
  { key: 'accel',   short: 'accél.',   label: 'Accélération (pic)', unit: 'g',   decimals: 1, get: s => s.magPeak },
  { key: 'vitesse', short: 'vitesse',  label: 'Vitesse',            unit: 'm/s', decimals: 2, get: s => s.speed },
  { key: 'lat',     short: 'dév.lat.', label: 'Déviation latérale', unit: '%',   decimals: 0, get: s => s.latPct },
  { key: 'pause',   short: 'pause',    label: 'Pause',              unit: 'ms',  decimals: 0, get: s => s.pause * 1000 },
  { key: 'dist',    short: 'dist.',    label: 'Distance parcourue par la bille blanche', unit: 'cm',  decimals: 0, get: s => s.dist },
  { key: 'back',    short: 'recul',    label: 'Recul de la queue (backswing)', unit: 'cm', decimals: 1, get: backswingDist },
  { key: 'ax',      short: 'accél.X',  label: 'Accélération X (pic)', unit: 'g',   decimals: 2, get: s => peakAbsOf(s.win, 'ax') },
  { key: 'ay',      short: 'accél.Y',  label: 'Accélération Y (pic)', unit: 'g',   decimals: 2, get: s => peakAbsOf(s.win, 'ay') },
  { key: 'az',      short: 'accél.Z',  label: 'Accélération Z (pic)', unit: 'g',   decimals: 2, get: s => peakAbsOf(s.win, 'az') },
  { key: 'gx',      short: 'gyro X',   label: 'Vitesse angulaire X (pic)', unit: '°/s', decimals: 0, get: s => peakAbsOf(s.win, 'gx') },
  { key: 'gy',      short: 'gyro Y',   label: 'Vitesse angulaire Y (pic)', unit: '°/s', decimals: 0, get: s => peakAbsOf(s.win, 'gy') },
  { key: 'gz',      short: 'gyro Z',   label: 'Vitesse angulaire Z (pic)', unit: '°/s', decimals: 0, get: s => peakAbsOf(s.win, 'gz') },
  { key: 'roll',    short: 'roll',     label: 'Roll (plage)',  unit: '°', decimals: 1, get: s => rangeOf(s.win, 'r') },
  { key: 'pitch',   short: 'pitch',    label: 'Pitch (plage)', unit: '°', decimals: 1, get: s => rangeOf(s.win, 'p') },
  { key: 'yaw',     short: 'yaw',      label: 'Yaw (plage)',   unit: '°', decimals: 1, get: s => rangeOf(s.win, 'y') },
];

/* un graphique en barres par paramètre gardé (accél/vitesse/latérale/pause/distance).
   chaque barre part de 0 et monte jusqu'à sa valeur en % du coup 1 pour ce paramètre ;
   étiquette = écart avec le coup PRÉCÉDENT (rien sur le coup 1, pas de comparaison possible).
   un seul paramètre (choisi via le sélecteur) est mis en avant ; les autres restent dessous. */
let overviewParamKey = 'accel';

function paramChartHTML(metric){
  const W = 800, H = 130, leftM = 34, rightM = 26, topM = 20, baseY = H - 26, usableH = baseY - topM;
  const n = S.strokes.length;
  const usableW = W - leftM - rightM;
  const step = n > 1 ? usableW / (n - 1) : 0;
  const barW = Math.max(6, (step > 0 ? step * 0.92 : usableW * 0.6) / 2);

  const ref = metric.get(S.strokes[0]);
  if (!isFinite(ref) || !ref) return ''; // pas de coup 1 valide pour ce paramètre -> pas de graphique
  const pcts = S.strokes.map(s => { const v = metric.get(s); return isFinite(v) ? (v / ref) * 100 : NaN; });
  const finitePcts = pcts.filter(isFinite);
  const maxPct = Math.max(...finitePcts, 100) * 1.08;
  const yFor = pct => baseY - Math.max(0, pct) / maxPct * usableH;

  let svg = '';
  S.strokes.forEach((s, i) => {
    const x = leftM + (n > 1 ? i * step : usableW / 2);
    svg += `<text class="num-label" x="${x.toFixed(1)}" y="${H - 8}">${s.id}</text>`;
    if (!isFinite(pcts[i])) return; // paramètre non renseigné pour ce coup (ex. distance) -> pas de barre
    const y = yFor(pcts[i]);
    const cls = i === S.sel ? 'sel' : '';
    svg += `<rect class="bar ${cls}" data-i="${i}" x="${(x - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, baseY - y).toFixed(1)}" rx="3"/>`;
    if (i > 0 && isFinite(pcts[i - 1])){
      const seqDelta = pcts[i] - pcts[i - 1];
      const label = `${seqDelta >= 0 ? '+' : ''}${fmt(seqDelta, 0)} %`;
      svg += `<text class="pct-label ${seqDelta >= 0 ? 'pos' : 'neg'}" x="${x.toFixed(1)}" y="${(y - 9).toFixed(1)}">${label}</text>`;
    }
  });

  return `<div class="param-chart">` +
           `<div class="param-chart-title">${metric.label}</div>` +
           `<svg class="arc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${svg}</svg>` +
         `</div>`;
}

function drawOverview(){
  if (!S.overview || !S.strokes.length) return;
  const enabled = RESULT_METRICS.filter(m => S.enabledMetrics[m.key]);
  const sel = $('selOverviewParam');
  if (!enabled.length){
    sel.innerHTML = '';
    $('cOverMain').innerHTML = '<div class="empty">Aucun paramètre coché dans « Options du capteur ».</div>';
    return;
  }
  sel.innerHTML = enabled.map(m => `<option value="${m.key}">${m.label}</option>`).join('');
  if (!enabled.some(m => m.key === overviewParamKey)) overviewParamKey = enabled[0].key;
  sel.value = overviewParamKey;

  $('cOverMain').innerHTML = paramChartHTML(enabled.find(m => m.key === overviewParamKey));
  $('overviewP').querySelectorAll('[data-i]').forEach(el => el.onclick = () => { S.sel = +el.dataset.i; renderStrokes(); });
}
$('selOverviewParam').onchange = () => { overviewParamKey = $('selOverviewParam').value; drawOverview(); };
document.querySelectorAll('.metricChk').forEach(chk => {
  chk.onchange = () => {
    S.enabledMetrics[chk.dataset.key] = chk.checked;
    renderStrokes();
    schedulePersist();
  };
});

$('btnClear').onclick = () => {
  S.strokes = []; S.sel = -1; S.overview = null; S.exo.done = [];
  $('overviewP').classList.add('hidden');
  renderStrokes(); renderSeg();
};
$('btnJson').onclick = exportJson;
$('btnDemo').onclick = runDemo;
$('fileIn').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try{ importText(rd.result); }catch(err){ alert('Import impossible : ' + err.message); } };
  rd.readAsText(f);
};

addEventListener('resize', () => { if (S.strokes.length && S.view === 'res' && S.overview) drawOverview(); });

/* ============ démarrage ============ */
loadPlayer();
const restored = loadSession();   // restaure la dernière session locale si elle existe
renderConn();
renderSteppers();
if (!restored) setTarget(5);
