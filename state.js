'use strict';
/* CueSense — état partagé + utilitaires (chargé en premier) */

const S = {
  samples: [],          // {t, ax..az (g), gx..gz (°/s), r,p,y (°)}
  live: false, fs: 200, fsMeasured: 0,
  strokes: [], sel: -1,
  device: null, chW: null, recording: [], recordingActive: false,
  lastTrig: -1e9, pendTrig: -1,
  overview: null,       // {mag:[], fs, marks} pour session importée
  liveCue: null,
  battery: null, batteryV: null, battTimer: null,
  player: { name: '', level: 'Intermédiaire' },
  flow: { player: false, conn: false, calib: false, exo: false },
  exo: { type: null, point: 0, target: 5, targetDist: 30, count: 0, active: false, done: [] },
  calib: { running: false, ok: null, msg: '' },
  view: 'joueur',
  enabledMetrics: {
    accel: true, vitesse: true, lat: true, pause: true, dist: true, back: true,
    ax: false, ay: false, az: false, gx: false, gy: false, gz: false, roll: false, pitch: false, yaw: false,
  },
};

const $ = id => document.getElementById(id);
const G = 9.80665;

const SCORE_CONFIG = {
  lateralPenalty: 4, backDeliveryRatio: 2, ratioPenalty: 20, angularPenalty: 12,
  epsilonDuration: .001, epsilonAverage: .01,
  straightness: .35, fluidity: .25, stability: .20, regularity: .20 // rectitude prioritaire, poids normalisés = 1,0
};

const CSV_HEADERS = ['Temps','AccX','AccY','AccZ','GyroX','GyroY','GyroZ','Roll','Pitch','Yaw'];
const CSV_FIELDS  = ['timestamp','ax','ay','az','gx','gy','gz','r','p','y'];

const SVC = '0000ffe5-0000-1000-8000-00805f9a34fb',
      CHN = '0000ffe4-0000-1000-8000-00805f9a34fb',
      CHW = '0000ffe9-0000-1000-8000-00805f9a34fb';

const EXOS = {
  points: { name: 'Alignement bille blanche', sub: 'Bille blanche au point marron · distance de votre choix, toujours identique' },
  speed:  { name: 'Vitesse du geste',         sub: 'Vitesse et régularité de la délivrance' },
  repeat: { name: 'Répétabilité',             sub: 'Constance des coups dans le temps' },
};

const fmt = (x, d = 2) => isFinite(x) ? x.toFixed(d) : '—';
const mu = x => x.reduce((p, c) => p + c, 0) / x.length;
const sd = x => { const m = mu(x); return Math.sqrt(mu(x.map(v => (v - m) ** 2))); };
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
