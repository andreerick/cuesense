'use strict';
/* CueSense — capteur WitMotion (Web Bluetooth) : trames, batterie, flux d'échantillons */

let bleBuf = new Uint8Array(0);
let rateCount = 0, rateT = 0;

function onNotify(e){
  const v = new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength);
  const b = new Uint8Array(bleBuf.length + v.length); b.set(bleBuf); b.set(v, bleBuf.length);
  let i = 0;
  while (i + 20 <= b.length){
    if (b[i] === 0x55 && b[i+1] === 0x61){
      const dv = new DataView(b.buffer, i + 2, 18), g = k => dv.getInt16(k, true);
      pushSample({ ax: g(0)/32768*16,  ay: g(2)/32768*16,  az: g(4)/32768*16,
                   gx: g(6)/32768*2000, gy: g(8)/32768*2000, gz: g(10)/32768*2000,
                   r:  g(12)/32768*180, p:  g(14)/32768*180, y:  g(16)/32768*180 });
      i += 20;
    } else if (b[i] === 0x55 && b[i+1] === 0x71){
      // réponse lecture registre : 55 71 regL regH d0L d0H …
      const dv = new DataView(b.buffer, i + 2, 18);
      const reg = dv.getUint16(0, true);
      if (reg === 0x64){ // tension batterie
        const raw = dv.getUint16(2, true);
        const volts = raw > 1000 ? raw / 1000 : raw / 100;
        S.batteryV = volts; S.battery = battPct(volts);
        renderConn();
      }
      i += 20;
    } else i++;
  }
  bleBuf = b.slice(i);
}

/* tension LiPo → pourcentage approximatif (doc WitMotion) */
function battPct(v){
  const t = [[3.96,100],[3.93,90],[3.87,75],[3.82,60],[3.79,50],[3.77,40],[3.73,30],[3.70,20],[3.68,15],[3.50,10],[3.40,5]];
  for (const [volt, p] of t) if (v >= volt) return p;
  return 0;
}

async function writeCmd(bytes){
  try{ await S.chW.writeValue(new Uint8Array(bytes)); }catch(e){ console.warn('write', e); }
  await sleep(120);
}
async function applyRate(){
  await writeCmd([0xFF,0xAA,0x69,0x88,0xB5]);                          // déverrouille
  await writeCmd([0xFF,0xAA,0x03,parseInt($('selRate').value,16),0x00]); // fréquence
  await writeCmd([0xFF,0xAA,0x00,0x00,0x00]);                          // sauvegarde
}
async function readBattery(){
  if (S.chW && S.device?.gatt?.connected) await writeCmd([0xFF,0xAA,0x27,0x64,0x00]);
}

async function connectSensor(){
  try{
    $('connSub').textContent = 'Recherche en cours…';
    let dev;
    try{ dev = await navigator.bluetooth.requestDevice({ filters:[{namePrefix:'WT'},{namePrefix:'BWT'},{namePrefix:'HC'}], optionalServices:[SVC] }); }
    catch(e){ if (e.name === 'NotFoundError' && !e.message.includes('cancel')) dev = await navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices:[SVC] }); else throw e; }
    S.device = dev;
    dev.addEventListener('gattserverdisconnected', () => {
      S.live = false; S.battery = null; S.batteryV = null;
      clearInterval(S.battTimer);
      if (S.recordingActive) setRecording(false);
      renderConn();
    });
    $('connSub').textContent = 'Connexion…';
    const srv = await dev.gatt.connect();
    const svc = await srv.getPrimaryService(SVC);
    const chN = await svc.getCharacteristic(CHN);
    S.chW = await svc.getCharacteristic(CHW);
    await chN.startNotifications();
    chN.addEventListener('characteristicvaluechanged', onNotify);
    await applyRate();
    await readBattery();
    clearInterval(S.battTimer);
    S.battTimer = setInterval(readBattery, 60000);
    S.live = true; S.flow.conn = true;
    renderConn(); startLiveLoop();
    if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  }catch(e){
    if (e.name !== 'NotFoundError'){ $('connSub').textContent = 'Erreur : ' + e.message; }
    else renderConn();
  }
}

/* ============ flux échantillons (live) ============ */
function pushSample(s){
  s.t = performance.now() / 1000;
  S.samples.push(s);
  if (S.recordingActive) S.recording.push({ ...s, timestamp: Date.now() });
  if (S.samples.length > S.fs * 40) S.samples = S.samples.slice(-S.fs * 30);
  // mesure de fréquence (rateT s'initialise au premier échantillon pour ne pas
  // fausser la fenêtre de détection pendant la première seconde)
  if (!rateT) rateT = s.t;
  rateCount++;
  if (s.t - rateT >= 1){ S.fsMeasured = Math.round(rateCount / (s.t - rateT)); rateCount = 0; rateT = s.t; renderConn(); }
  // détection live
  const mag = Math.abs(Math.hypot(s.ax, s.ay, s.az) - 1), thr = +$('thr').value;
  const i = S.samples.length - 1, fs = S.fsMeasured || S.fs;
  if (S.pendTrig < 0 && mag > thr && s.t - S.lastTrig > 2){ S.pendTrig = i; S.lastTrig = s.t; }
  if (S.pendTrig >= 0 && i - S.pendTrig >= Math.round(0.6 * fs)){
    const a = Math.max(0, S.pendTrig - Math.round(1.5 * fs)), b = Math.min(S.samples.length, S.pendTrig + Math.round(0.6 * fs));
    addStroke(S.samples.slice(a, b), fs, s.t);
    S.pendTrig = -1;
  }
}
