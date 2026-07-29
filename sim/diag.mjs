#!/usr/bin/env node
// Diagnostics décisifs : biais observé/prédit, persistance des gares, A3.
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const RACINE = process.argv[2];
const BASCULE = 3 * 3600;
const jourM = s => new Date((s - BASCULE) * 1000).toISOString().slice(0, 10);
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const SOURCES = readdirSync(join(RACINE, 'data'));
const COMPLETS = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];

// Distribution des retards : observés vs prédits
const bucket = { obs: [], predit: [] };
// Paires arrivée+départ pour A3
let paires = 0, sansPaire = 0;
const ajoutes = [], recups = [];
// Persistance : gare -> Set(jours) avec >=5 mouvements observés
const garesJours = new Map();

for (const net of SOURCES) {
  const dossier = join(RACINE, 'data', net);
  const jours = readdirSync(dossier).filter(d => /^\d{4}-/.test(d)).sort();
  const ev = new Map();
  for (const j of jours) {
    for (const f of readdirSync(join(dossier, j)).filter(x => x.startsWith('obs-')).sort()) {
      for (const ligne of gunzipSync(readFileSync(join(dossier, j, f))).toString().split('\n')) {
        if (!ligne) continue;
        const o = JSON.parse(ligne);
        if (o.rel === 'CANCELED' && o.stop === undefined) continue;
        const t = Date.parse(o.t) / 1000;
        const cle = `${o.trip}|${o.stop}|${o.seq}`;
        const e = ev.get(cle);
        if (e) { e[0] = t; e[1] = o.rel; e[2] = o.ad; e[3] = o.dd; e[4] = o.as; e[5] = o.ds; }
        else ev.set(cle, [t, o.rel, o.ad, o.dd, o.as, o.ds, o.stop]);
      }
    }
  }
  const compteur = new Map();  // jour|gare -> [nObs, nTot]
  for (const [, e] of ev) {
    const [tLast, rel, ad, dd, as, ds, stop] = e;
    const tEvt = ds ?? as;
    if (!tEvt) continue;
    const lead = tEvt - tLast;
    const retard = dd ?? ad;
    if (retard != null && Math.abs(retard) < 7200) {
      (lead <= 120 ? bucket.obs : lead > 1800 ? bucket.predit : []).push(retard);
    }
    if (ad != null && dd != null) { paires++; ajoutes.push(Math.max(0, dd - ad)); recups.push(Math.max(0, ad - dd)); }
    else sansPaire++;
    const j = jourM(tEvt);
    const cle = `${j}|${net}|${stop}`;
    const c = compteur.get(cle) ?? [0, 0];
    c[1]++; if (lead <= 120) c[0]++;
    compteur.set(cle, c);
  }
  for (const [cle, [nObs]] of compteur) {
    if (nObs < 5) continue;
    const [j, n, s] = cle.split('|');
    if (!COMPLETS.includes(j)) continue;
    const g = `${n}|${s}`;
    (garesJours.get(g) ?? garesJours.set(g, new Set()).get(g)).add(j);
  }
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.floor(s.length * p)]); };
for (const [nom, arr] of Object.entries(bucket)) {
  if (!arr.length) continue;
  const enRetard5 = arr.filter(d => d > 300).length / arr.length * 100;
  const aLheure = arr.filter(d => Math.abs(d) <= 60).length / arr.length * 100;
  console.log(`${nom.padEnd(7)} n=${String(arr.length).padStart(8)} | médiane ${String(med(arr)).padStart(5)} s | p90 ${String(pct(arr, .9)).padStart(5)} s | ` +
    `retard>5min : ${enRetard5.toFixed(1)} % | quasi à l'heure (|d|<=60s) : ${aLheure.toFixed(1)} %`);
}

console.log(`\nA3 · paires arrivée+départ : ${paires} (${(paires / (paires + sansPaire) * 100).toFixed(1)} % des événements)`);
console.log(`  retard ajouté   : médiane ${med(ajoutes)} s | p90 ${pct(ajoutes, .9)} s | > 0 dans ${(ajoutes.filter(x => x > 0).length / ajoutes.length * 100).toFixed(1)} % des cas`);
console.log(`  retard récupéré : médiane ${med(recups)} s | p90 ${pct(recups, .9)} s | > 0 dans ${(recups.filter(x => x > 0).length / recups.length * 100).toFixed(1)} % des cas`);

const parNb = {};
for (const [, jours] of garesJours) parNb[jours.size] = (parNb[jours.size] || 0) + 1;
console.log(`\nA7 · persistance sur les 6 journées complètes (>=5 mouvements observés) :`);
let cumul = 0;
for (let n = 6; n >= 1; n--) { cumul += parNb[n] || 0; console.log(`  présentes ${n} jour(s) sur 6 : ${parNb[n] || 0}  (cumul >= ${n} jours : ${cumul})`); }
const parPays = {};
for (const [g, jours] of garesJours) { if (jours.size >= 5) { const net = g.split('|')[0]; parPays[net] = (parPays[net] || 0) + 1; } }
console.log(`  Réparties par source (>=5 jours sur 6) :`, JSON.stringify(parPays));
