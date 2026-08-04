#!/usr/bin/env node
// Bilan de la campagne en cours : volume, gares distinctes, qualité du signal.
// Déduplique par (trip, gare) car les sources sans fenêtre republient chaque
// arrêt à chaque capture.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const BASE = process.argv[2] || '..';
const DATA = join(BASE, 'data');
const PAYS = {
  fr_sncf: 'France', fr_idfm: 'France IdF', nl_ovapi: 'Pays-Bas', de_gtfsde: 'Allemagne',
  no_entur: 'Norvege', fi_digitraffic: 'Finlande', ie_nta: 'Irlande',
  us_mta_lirr: 'Etats-Unis', us_mta_mnr: 'Etats-Unis', au_translink_seq: 'Australie',
};
const JOURS = process.argv.slice(3).length ? process.argv.slice(3) : ['2026-08-02', '2026-08-03', '2026-08-04'];
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

const parSource = {};
for (const net of readdirSync(DATA)) {
  if (net === '_slots' || !PAYS[net]) continue;
  const mouvements = new Map();     // trip|gare -> dernier retard
  let lignes = 0, creneaux = 0;
  for (const j of JOURS) {
    const d = join(DATA, net, j);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      creneaux++;
      for (const l of gunzipSync(readFileSync(join(d, f))).toString().split('\n')) {
        if (!l) continue;
        lignes++;
        const o = JSON.parse(l);
        const r = o.rd ?? o.ra;
        mouvements.set(`${o.trip}|${o.gare}`, { gare: o.gare, r, rel: o.rel, jour: j });
      }
    }
  }
  const gares = new Map();
  const retards = [];
  for (const m of mouvements.values()) {
    if (!gares.has(m.gare)) gares.set(m.gare, { n: 0, jours: new Set() });
    const g = gares.get(m.gare); g.n++; g.jours.add(m.jour);
    if (m.r != null && Math.abs(m.r) < 7200) retards.push(m.r);
  }
  parSource[net] = { lignes, creneaux, mouvements: mouvements.size, gares, retards };
}

console.log('=== BILAN DE LA CAMPAGNE, ' + JOURS.join(' a ') + ' ===\n');
console.log('source'.padEnd(18) + 'pays'.padEnd(13) + 'creneaux'.padStart(9) + 'mouvements'.padStart(12) + 'gares'.padStart(7) + 'ponct.300s'.padStart(11) + 'retards>5min'.padStart(13) + 'valeurs'.padStart(9));
let totGares = 0, totMvt = 0;
for (const [net, s] of Object.entries(parSource).sort((a, b) => b[1].gares.size - a[1].gares.size)) {
  const p = s.retards.length ? s.retards.filter(r => r <= 300).length / s.retards.length : 0;
  const p5 = s.retards.length ? s.retards.filter(r => r > 300).length / s.retards.length : 0;
  totGares += s.gares.size; totMvt += s.mouvements;
  console.log(net.padEnd(18) + PAYS[net].padEnd(13) + String(s.creneaux).padStart(9) + String(s.mouvements).padStart(12) +
    String(s.gares.size).padStart(7) + (s.retards.length ? (p * 100).toFixed(1) + '%' : '-').padStart(11) +
    (s.retards.length ? (p5 * 100).toFixed(1) + '%' : '-').padStart(13) + String(new Set(s.retards).size).padStart(9));
}
console.log('TOTAL'.padEnd(31) + ''.padStart(9) + String(totMvt).padStart(12) + String(totGares).padStart(7));

console.log('\n=== GARES PAR PAYS, TOUS RESEAUX CONFONDUS ===');
const gp = {};
for (const [net, s] of Object.entries(parSource)) (gp[PAYS[net]] ??= new Set()).forEach;
for (const [net, s] of Object.entries(parSource)) { gp[PAYS[net]] ??= new Set(); for (const g of s.gares.keys()) gp[PAYS[net]].add(net + '|' + g); }
for (const [p, set] of Object.entries(gp).sort((a, b) => b[1].size - a[1].size)) console.log('  ' + p.padEnd(14) + String(set.size).padStart(6) + ' gares');

console.log('\n=== VOLUME PAR GARE, ce qui conditionne le seuil des 15 mouvements par jour ===');
const nbJours = JOURS.length;
for (const [net, s] of Object.entries(parSource).sort((a, b) => b[1].gares.size - a[1].gares.size)) {
  const parJour = [...s.gares.values()].map(g => g.n / nbJours);
  const q15 = parJour.filter(x => x >= 15).length;
  console.log('  ' + net.padEnd(18) + 'median ' + String(Math.round(med(parJour) || 0)).padStart(4) + ' mvt/j | ' +
    String(q15).padStart(5) + ' gares au-dessus de 15 mvt/j');
}

console.log('\n=== IDENTITE RESOLUE ===');
for (const [net, s] of Object.entries(parSource)) {
  const ex = [...s.gares.keys()].slice(0, 2);
  const nommees = [...s.gares.keys()].filter(g => /[a-z]{3}/.test(g) && !/^\d+$/.test(g)).length;
  console.log('  ' + net.padEnd(18) + (nommees / s.gares.size * 100).toFixed(0) + '% d identifiants lisibles | ex : ' + ex.map(x => x.slice(0, 34)).join(' , '));
}
