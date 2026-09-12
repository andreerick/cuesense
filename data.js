'use strict';
/* CueSense — import de fichier (export app WITMOTION), exports CSV/JSON, démo */

function importText(txt){
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 10) throw new Error('fichier trop court');
  const delim = [['\t',(lines[1].match(/\t/g)||[]).length],[',',(lines[1].match(/,/g)||[]).length],[';',(lines[1].match(/;/g)||[]).length]].sort((a,b)=>b[1]-a[1])[0][0];
  const hasHeader = /[a-zà-ÿ]/i.test(lines[0].replace(/[\d\s.:\-+eE,;\t]/g,'')||'') || /[a-z]{2,}/i.test(lines[0]);
  let cols = {}, start = 0;
  if (hasHeader){
    start = 1;
    const hs = lines[0].split(delim).map(h => h.toLowerCase().replace(/[^a-z0-9]/g,''));
    hs.forEach((h,i) => {
      const axis = /z(?!.*[xy])/.test(h) ? 'z' : /y(?!.*[xz])/.test(h) ? 'y' : /x(?!.*[yz])/.test(h) ? 'x' : null;
      if (/time|temps|chip/.test(h)) cols.t = i;
      else if (/angle|roll|pitch|yaw/.test(h)){
        if (/roll/.test(h)) cols.r = i; else if (/pitch/.test(h)) cols.p = i; else if (/yaw/.test(h)) cols.y = i;
        else if (axis) cols[{x:'r',y:'p',z:'y'}[axis]] = i;
      }
      else if (/^(w|as|gyro|angular)/.test(h) || /degs|dps/.test(h)){ if (axis) cols['g'+axis] = i; }
      else if (/^(a|acc)/.test(h) || /\bg\b/.test(h)){ if (axis) cols['a'+axis] = i; }
    });
  }
  if (cols.ax === undefined){ // pas d'entêtes exploitables : ordre WitMotion par défaut
    const nc = lines[start].split(delim).length;
    const o = nc >= 10 ? 1 : 0; if (nc >= 10) cols.t = 0;
    ['ax','ay','az','gx','gy','gz','r','p','y'].forEach((k,i) => cols[k] = i + o);
  }
  const parseT = v => {
    if (/:/.test(v)){ const m = v.trim().split(/\s+/).pop().split(':');
      return (+m[0])*3600 + (+m[1])*60 + parseFloat(m[2]); }
    const x = parseFloat(v); return x > 1e10 ? x/1000 : x; // ms epoch → s
  };
  const raw = [];
  for (let i = start; i < lines.length; i++){
    const c = lines[i].split(delim); if (c.length < 3) continue;
    const s = {};
    for (const k of ['ax','ay','az','gx','gy','gz','r','p','y']) s[k] = cols[k] !== undefined ? parseFloat(c[cols[k]]) || 0 : 0;
    if (cols.t !== undefined) s.t = parseT(c[cols.t]);
    raw.push(s);
  }
  if (raw.length < 20) throw new Error('pas assez d’échantillons lisibles');
  let fs;
  if (cols.t !== undefined && isFinite(raw[0].t) && raw[raw.length-1].t > raw[0].t)
    fs = (raw.length - 1) / (raw[raw.length-1].t - raw[0].t);
  else fs = +$('fsIn').value || 200;
  detectOffline(raw, fs);
  nav('res');
  if (!S.strokes.length) alert('Aucun coup au-dessus du seuil (' + $('thr').value + ' g) — baisse le seuil (onglet Calibrage) puis réimporte.');
}

function exportJson(){
  const out = S.strokes.map(s => ({ id: s.id, score: s.score,
    exercice: s.exo?.type ? EXOS[s.exo.type].name : null, point_impact: s.exo?.point ?? null,
    speed_ms: +fmt(s.speed), peak_g: +fmt(s.magPeak,1),
    back_ms: Math.round(s.back*1000), pause_ms: Math.round(s.pause*1000), deliv_ms: Math.round(s.deliv*1000),
    lateral_pct: +fmt(s.latPct,0), angular_deg: +fmt(s.angDrift,1), axis: s.cue, dist_cm: s.dist ?? null }));
  const b = new Blob([JSON.stringify({ joueur: S.player, coups: out }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'cuesense-coups.json'; a.click();
}

function exportCsv(){
  const delimiter = ';';
  const rows = [CSV_HEADERS.join(delimiter)];
  S.recording.forEach(s => rows.push(CSV_FIELDS.map(k => s[k]).join(delimiter)));
  const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = 'cuesense-session.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============ démo synthétique ============ */
function runDemo(){
  const fs = 200, raw = [], N = fs * 24, rnd = () => (Math.random() - .5);
  let r = 0.3, p = -1.2, y = 45;
  const strokesAt = [3, 7.5, 12, 16.5, 21];
  for (let i = 0; i < N; i++){
    const t = i / fs; let ax = 0, ay = 0, az = 1;
    for (const st of strokesAt){
      const d = t - st, k = 1 + 0.15 * rnd();
      if (d > -0.8 && d < -0.35) ax += -0.25 * k * Math.sin((d + 0.8) / 0.45 * Math.PI);      // backswing
      if (d > -0.15 && d < 0)    ax +=  1.8 * k * Math.sin((d + 0.15) / 0.15 * Math.PI);      // délivrance
      if (d >= 0 && d < 0.08)  { ax += (2.5 + k) * Math.exp(-d*90) * Math.cos(d*260);         // impact + ringing
                                 ay += 0.35 * k * Math.exp(-d*80) * Math.sin(d*300); }
      if (d > -0.15 && d < 0)    ay += 0.06 * k * rnd() * 4;                                  // bruit latéral pendant délivrance
    }
    ax += 0.012*rnd(); ay += 0.012*rnd(); az += 0.012*rnd();
    r += 0.02*rnd(); p += 0.02*rnd(); y += 0.03*rnd();
    raw.push({ t, ax, ay, az, gx: 60*ax + 5*rnd(), gy: 8*rnd(), gz: 6*rnd(), r, p, y });
  }
  detectOffline(raw, fs);
  nav('res');
}
