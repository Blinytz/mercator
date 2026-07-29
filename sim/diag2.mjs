#!/usr/bin/env node
// H1 : le taux d'observation dépend-il seulement de la densité de capture ?
// H2 : les identifiants de gare sont-ils stables d'un jour à l'autre ?
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const RACINE = process.argv[2];
const SOURCES = readdirSync(join(RACINE, 'data'));

// Fenêtres de collecte dense : plages continues où l'écart entre captures <= 6 min
const runs = readFileSync(join(RACINE, 'logs', 'runs.ndjson'), 'utf8').trim().split('\n')
  .map(l => JSON.parse(l)).filter(r => r.type === 'run');
const caps = [];
for (const r of runs) for (const c of r.detailCycles || []) caps.push(Date.parse(c.t) / 1000);
caps.sort((a, b) => a - b);
const plages = [];
let debut = caps[0], prec = caps[0];
for (const t of caps.slice(1)) {
  if (t - prec > 400) { if (prec - debut >= 1200) plages.push([debut, prec]); debut = t; }
  prec = t;
}
if (prec - debut >= 1200) plages.push([debut, prec]);
const dansPlage = t => plages.some(([a, b]) => t >= a + 300 && t <= b - 300);
console.log(`Plages de collecte dense (>=20 min continues, écart <=6 min) : ${plages.length}`);
console.log(`Durée totale dense : ${Math.round(plages.reduce((s, [a, b]) => s + b - a, 0) / 3600)} h sur ${Math.round((caps.at(-1) - caps[0]) / 3600)} h`);

let dedansTot = 0, dedansObs = 0, dehorsTot = 0, dehorsObs = 0;
const garesParJour = {};   // net -> jour -> Set(stop)

for (const net of SOURCES) {
  const dossier = join(RACINE, 'data', net);
  const ev = new Map();
  for (const j of readdirSync(dossier).filter(d => /^\d{4}-/.test(d)).sort()) {
    for (const f of readdirSync(join(dossier, j)).filter(x => x.startsWith('obs-')).sort()) {
      for (const ligne of gunzipSync(readFileSync(join(dossier, j, f))).toString().split('\n')) {
        if (!ligne) continue;
        const o = JSON.parse(ligne);
        if (o.rel === 'CANCELED' && o.stop === undefined) continue;
        const t = Date.parse(o.t) / 1000;
        const cle = `${o.trip}|${o.stop}|${o.seq}`;
        const e = ev.get(cle);
        if (e) { e[0] = t; e[1] = o.as; e[2] = o.ds; }
        else ev.set(cle, [t, o.as, o.ds, o.stop]);
      }
    }
  }
  for (const [, [tLast, as, ds, stop]] of ev) {
    const tEvt = ds ?? as;
    if (!tEvt) continue;
    const obs = (tEvt - tLast) <= 120;
    if (dansPlage(tEvt)) { dedansTot++; if (obs) dedansObs++; }
    else { dehorsTot++; if (obs) dehorsObs++; }
    if (obs) {
      const jour = new Date((tEvt - 3 * 3600) * 1000).toISOString().slice(0, 10);
      ((garesParJour[net] ??= {})[jour] ??= new Set()).add(stop);
    }
  }
}

console.log(`\nH1 · taux d'événements réellement observés :`);
console.log(`  événements DANS une plage dense : ${dedansTot} dont observés ${dedansObs} = ${(dedansObs / dedansTot * 100).toFixed(1)} %`);
console.log(`  événements HORS plage dense     : ${dehorsTot} dont observés ${dehorsObs} = ${(dehorsObs / dehorsTot * 100).toFixed(1)} %`);

console.log(`\nH2 · stabilité des identifiants de gare (gares observées, jours complets) :`);
const COMPLETS = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];
for (const [net, parJour] of Object.entries(garesParJour)) {
  const jours = COMPLETS.filter(j => parJour[j]);
  if (jours.length < 2) { console.log(`  ${net.padEnd(18)} : moins de 2 jours exploitables`); continue; }
  const a = parJour[jours[0]], b = parJour[jours.at(-1)];
  const commun = [...a].filter(x => b.has(x)).length;
  const tailles = jours.map(j => parJour[j].size);
  console.log(`  ${net.padEnd(18)} : gares/jour ${tailles.join(',')} | recouvrement ${jours[0]} vs ${jours.at(-1)} : ` +
    `${commun}/${Math.min(a.size, b.size)} = ${(commun / Math.min(a.size, b.size) * 100).toFixed(0)} %`);
}
