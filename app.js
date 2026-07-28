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
  if (key === 'exo' && S.exo.active) showExoScreen('run');
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
    settings: { thr: $('thr').value, axis: $('axSel').value, fsIn: $('fsIn').value, rate: $('selRate').value },
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
  setTarget(S.exo.target || 10);
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
document.querySelectorAll('.exo-card').forEach(c => c.onclick = () => {
  S.exo.type = c.dataset.exo;
  $('exoCfgTitle').textContent = 'Exercice : ' + EXOS[S.exo.type].name;
  $('pointBlock').classList.toggle('hidden', S.exo.type !== 'points');
  $('posCard').classList.toggle('hidden', S.exo.type !== 'points');
  renderSeg();
  showExoScreen('config');
});
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
  $('cntDefault').textContent = S.exo.target === 10 ? 'Par défaut' : 'Défaut : 10';
}
$('btnCfgBack').onclick = () => showExoScreen('choose');
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
  $('lastStroke').innerHTML =
    st('score', s.score + ' /100') +
    st('vitesse', fmt(s.speed) + ' m/s') +
    st('dév. latérale', fmt(s.latPct, 0) + ' %');
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
    $('detStats').innerHTML = ''; $('sumStats').innerHTML = '<div class="empty" style="grid-column:1/-1">—</div>';
    fit($('cDet'))[0].clearRect(0, 0, 9999, 9999); return;
  }
  const hasExo = S.strokes.some(s => s.exo?.point != null);
  let h = '<table><tr><th>#</th><th>score<br>/100</th>' + (hasExo ? '<th>point</th>' : '') +
    '<th>vitesse<br>m/s</th><th>pic<br>g</th><th>backswing<br>ms</th><th>pause<br>ms</th><th>délivr.<br>ms</th><th>dév.lat.<br>%</th><th>dist.<br>cm</th></tr>';
  S.strokes.forEach((s, i) => {
    h += `<tr class="${i === S.sel ? 'sel' : ''}" data-i="${i}"><td>${s.id}</td><td>${s.score}</td>` +
      (hasExo ? `<td>${s.exo?.point != null ? fmtPoint(s.exo.point) : '—'}</td>` : '') +
      `<td>${fmt(s.speed)}</td><td>${fmt(s.magPeak, 1)}</td><td>${Math.round(s.back*1000)}</td><td>${Math.round(s.pause*1000)}</td><td>${Math.round(s.deliv*1000)}</td><td>${fmt(s.latPct, 0)}</td>` +
      `<td><input class="distIn" type="number" inputmode="decimal" data-d="${i}" value="${s.dist ?? ''}" placeholder="—"></td></tr>`;
  });
  w.innerHTML = h + '</table>';
  w.querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => { S.sel = +tr.dataset.i; renderStrokes(); });
  w.querySelectorAll('.distIn').forEach(inp => {
    inp.onclick = e => e.stopPropagation();
    inp.onchange = () => { const v = parseFloat(inp.value); S.strokes[+inp.dataset.d].dist = isFinite(v) && v > 0 ? v : undefined; renderSummary(); drawScatter(); schedulePersist(); };
  });
  renderDetail(); renderSummary(); drawScatter();
  if (S.overview) drawOverview();
}

function renderDetail(){
  const s = S.strokes[S.sel]; if (!s) return;
  const cueD = s.win.map(w => w[s.cue]);
  const m = { ax: 0, ay: 0, az: 0 }; // moyenne pour recentrer l'affichage
  for (const k in m){ let x = 0; for (const w of s.win) x += w[k]; m[k] = x / s.win.length; }
  const off = ['ax','ay','az'].filter(a => a !== s.cue);
  const latD = s.win.map(w => Math.hypot(w[off[0]] - m[off[0]], w[off[1]] - m[off[1]]));
  const vmax = Math.max(...s.vel.map(Math.abs)) || 1;
  const amax = Math.max(...cueD.map(x => Math.abs(x - m[s.cue]))) || 1;
  const velScaled = s.vel.map(v => v / vmax * amax); // vitesse remise à l'échelle de l'accél pour superposition
  plot($('cDet'), [
    { data: latD, color: css('--muted') },
    { data: cueD.map(x => x - m[s.cue]), color: css('--white'), w: 1.4 },
    { data: velScaled, color: css('--green-hi'), w: 1.4 },
  ], {
    shade: [
      { a: s.bs, b: s.ps, color: 'rgba(241,196,15,.10)' },
      { a: s.ps, b: s.ds, color: 'rgba(155,163,158,.08)' },
      { a: s.ds, b: s.ip, color: 'rgba(39,174,96,.14)' },
    ],
    vlines: [{ i: s.ip, color: css('--red'), label: 'impact' }]
  });
  $('detStats').innerHTML =
    st('vitesse impact', fmt(s.speed) + ' m/s') +
    st('pic accél', fmt(s.magPeak, 1) + ' g') +
    st('tempo B·P·D', Math.round(s.back*1000) + '·' + Math.round(s.pause*1000) + '·' + Math.round(s.deliv*1000) + ' ms') +
    st('ratio back/délivr.', fmt(s.deliv > 0 ? s.back / s.deliv : NaN, 1)) +
    st('déviation latérale', fmt(s.latPct, 0) + ' %') +
    st('dérive angulaire', fmt(s.angDrift, 1) + ' °') +
    (s.exo?.point != null ? st('point d’impact', fmtPoint(s.exo.point)) : '') +
    st('axe queue', s.cue.slice(1).toUpperCase() + ($('axSel').value === 'auto' ? ' (auto)' : ''));
}

function renderSummary(){
  const a = S.strokes; if (!a.length) return;
  const col = f => a.map(f).filter(isFinite);
  const ms = (f, d = 2, u = '') => { const x = col(f); return fmt(mu(x), d) + ' ± ' + fmt(sd(x), d) + u; };
  const cv = f => { const x = col(f); const m = mu(x); return m ? fmt(sd(x) / m * 100, 1) + ' %' : '—'; };
  let h =
    st('coups', a.length) +
    st('score CueSense', ms(s => s.score, 0, ' /100')) +
    st('vitesse', ms(s => s.speed, 2, ' m/s')) +
    st('CV vitesse', cv(s => s.speed)) +
    st('ratio back/délivr.', ms(s => s.deliv > 0 ? s.back / s.deliv : NaN, 1)) +
    st('pause', ms(s => s.pause * 1000, 0, ' ms')) +
    st('dév. latérale', ms(s => s.latPct, 0, ' %')) +
    st('dérive angulaire', ms(s => s.angDrift, 1, ' °'));
  const dists = a.filter(s => isFinite(s.dist));
  if (dists.length >= 3){
    h += st('distance', ms(s => s.dist, 0, ' cm')) + st('CV distance', cv(s => s.dist));
    const x = dists.map(s => s.speed ** 2), y = dists.map(s => s.dist);
    const mx = mu(x), my = mu(y);
    let sxy = 0, sx = 0, sy = 0;
    for (let i = 0; i < x.length; i++){ sxy += (x[i]-mx)*(y[i]-my); sx += (x[i]-mx)**2; sy += (y[i]-my)**2; }
    const r = (sx && sy) ? sxy / Math.sqrt(sx * sy) : NaN;
    h += st('corr v² ↔ dist', fmt(r, 2));
  }
  $('sumStats').innerHTML = h;
}

function drawScatter(){
  const pts = S.strokes.filter(s => isFinite(s.dist) && s.dist > 0);
  const P = $('scatterP');
  if (pts.length < 3){ P.classList.add('hidden'); return; }
  P.classList.remove('hidden');
  const cv2 = $('cScat'), [g, W, H] = fit(cv2);
  g.clearRect(0, 0, W, H);
  const xs = pts.map(p => p.speed), ys = pts.map(p => p.dist);
  let xmn = Math.min(...xs), xmx = Math.max(...xs), ymn = Math.min(...ys), ymx = Math.max(...ys);
  const px = (xmx - xmn) || xmx * .2 || 1, py = (ymx - ymn) || ymx * .2 || 1;
  xmn -= px * .2; xmx += px * .2; ymn -= py * .2; ymx += py * .2; if (ymn < 0) ymn = 0;
  const ML = 40, MB = 20, MT = 8, MR = 8;
  const X = v => ML + (v - xmn) / (xmx - xmn) * (W - ML - MR), Y = v => H - MB - (v - ymn) / (ymx - ymn) * (H - MT - MB);
  g.strokeStyle = css('--line'); g.lineWidth = 1;
  g.beginPath(); g.moveTo(ML + .5, MT); g.lineTo(ML + .5, H - MB + .5); g.lineTo(W - MR, H - MB + .5); g.stroke();
  g.fillStyle = css('--muted'); g.font = '10px ' + css('--sans');
  g.fillText(fmt(ymx, 0) + ' cm', 2, MT + 8); g.fillText(fmt(ymn, 0), 2, H - MB);
  g.fillText(fmt(xmn, 2), ML, H - 6); g.fillText(fmt(xmx, 2) + ' m/s', W - MR - 52, H - 6);
  // ajustement d ≈ k·v² (moindres carrés par l'origine)
  let n1 = 0, n2 = 0; for (const p of pts){ n1 += p.dist * p.speed ** 2; n2 += p.speed ** 4; }
  const k = n2 ? n1 / n2 : 0;
  if (k > 0){ g.strokeStyle = css('--muted'); g.setLineDash([3, 3]); g.beginPath();
    for (let i = 0; i <= 40; i++){ const vx = xmn + (xmx - xmn) * i / 40, vy = k * vx * vx;
      if (vy < ymn || vy > ymx){ if (i === 0) continue; }
      const cx = X(vx), cy = Y(Math.min(Math.max(vy, ymn), ymx));
      i === 0 ? g.moveTo(cx, cy) : g.lineTo(cx, cy); }
    g.stroke(); g.setLineDash([]); }
  for (const p of pts){
    g.fillStyle = css('--green-hi');
    g.beginPath(); g.arc(X(p.speed), Y(p.dist), 3.5, 0, 7); g.fill();
    g.fillStyle = css('--muted'); g.fillText('#' + p.id, X(p.speed) + 6, Y(p.dist) + 3);
  }
  $('scatLeg').textContent = 'n=' + pts.length + ' · ajustement d ≈ ' + fmt(k, 1) + '·v² (pointillés) — les points loin de la courbe = contact irrégulier';
}

function drawOverview(){
  if (!S.overview) return;
  const { mag, marks } = S.overview;
  const step = Math.max(1, Math.floor(mag.length / 1200));
  const ds = []; for (let i = 0; i < mag.length; i += step){ let m = 0; for (let j = i; j < Math.min(i + step, mag.length); j++) m = Math.max(m, mag[j]); ds.push(m); }
  plot($('cOver'), [{ data: ds, color: css('--muted') }],
    { vlines: marks.map(m => ({ i: m / step, color: css('--red') })) });
  $('cOver').onclick = ev => {
    const r = $('cOver').getBoundingClientRect(), x = (ev.clientX - r.left) / r.width;
    const idx = x * mag.length; let best = 0, bd = 1e18;
    S.overview.marks.forEach((m, i) => { const d = Math.abs(m - idx); if (d < bd){ bd = d; best = i; } });
    S.sel = best; renderStrokes();
  };
}

$('btnClear').onclick = () => {
  S.strokes = []; S.sel = -1; S.overview = null; S.exo.done = [];
  $('overviewP').classList.add('hidden'); $('scatterP').classList.add('hidden');
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

addEventListener('resize', () => { if (S.strokes.length && S.view === 'res'){ drawOverview(); renderDetail(); drawScatter(); } });

/* ============ démarrage ============ */
loadPlayer();
const restored = loadSession();   // restaure la dernière session locale si elle existe
renderConn();
renderSteppers();
if (!restored) setTarget(10);
