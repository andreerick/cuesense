'use strict';
/* CueSense — tracés canvas (aucune dépendance) */

function fit(cv){
  const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * d)){ cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return [g, r.width, r.height];
}

function plot(cv, series, opts = {}){
  const [g, W, H] = fit(cv);
  g.clearRect(0, 0, W, H);
  let mn = Infinity, mx = -Infinity;
  for (const s of series) for (const v of s.data){ if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!isFinite(mn)){ mn = -1; mx = 1; }
  if (mx - mn < 1e-6){ mx += 1; mn -= 1; }
  const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
  const Y = v => H - (v - mn) / (mx - mn) * H;
  // grille + zéro
  g.strokeStyle = css('--line'); g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, Y(0) + .5); g.lineTo(W, Y(0) + .5); g.stroke();
  g.fillStyle = css('--muted'); g.font = '10px ' + css('--sans');
  g.fillText(mx.toFixed(1), 4, 10); g.fillText(mn.toFixed(1), 4, H - 4);
  const n = series[0].data.length; if (n < 2) return { Y, mn, mx, W, H, g };
  const X = i => i / (n - 1) * W;
  if (opts.shade) for (const sh of opts.shade){
    g.fillStyle = sh.color; g.fillRect(X(sh.a), 0, X(sh.b) - X(sh.a), H);
  }
  for (const s of series){
    g.strokeStyle = s.color; g.lineWidth = s.w || 1.2; g.beginPath();
    for (let i = 0; i < n; i++){ const y = Y(s.data[i]); i ? g.lineTo(X(i), y) : g.moveTo(X(i), y); }
    g.stroke();
  }
  if (opts.vlines) for (const vl of opts.vlines){
    g.strokeStyle = vl.color; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(X(vl.i) + .5, 0); g.lineTo(X(vl.i) + .5, H); g.stroke(); g.setLineDash([]);
    if (vl.label){ g.fillStyle = vl.color; g.fillText(vl.label, Math.min(X(vl.i) + 4, W - 40), 10); }
  }
  return { X, Y, W, H, g };
}
