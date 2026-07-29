#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CFG, CATALOGUE, TACTIQUES, composer, simuler } from './moteur.mjs';

const RACINE = 'mercator';
const stations = JSON.parse(gunzipSync(readFileSync(`${RACINE}/../stations.json.gz`)).toString());
const timelines = JSON.parse(gunzipSync(readFileSync(`${RACINE}/../timelines.json.gz`)).toString());
const JOURS = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];
const avecTl = stations.filter(s => timelines[s.cle]);

// ================= 9.1 Échantillon =================
console.log('===== 9.1 ECHANTILLON DE GARES =====');
const tri = [...avecTl].sort((a, b) => b.N - a.N);
const ech = [tri[0], tri[3], tri[Math.floor(tri.length * 0.05)], tri[Math.floor(tri.length * 0.25)],
  tri[Math.floor(tri.length * 0.5)], tri[Math.floor(tri.length * 0.75)], tri.at(-3)];
console.log('gare'.padEnd(26) + 'reseau'.padEnd(10) + 'N/j'.padStart(7) + 'obs/j'.padStart(7) + 'manq.'.padStart(7) + 'p60'.padStart(7) + 'p300'.padStart(7) + 'annul'.padStart(7) + '  amplitude horaire');
for (const s of ech) {
  const hMax = Math.max(...s.heures), heures = s.heures.filter(h => h > 0.5).length;
  console.log(`${(s.nom || s.cle).slice(0, 24).padEnd(26)}${s.net.padEnd(10)}${s.N.toFixed(0).padStart(7)}${s.Nfrais.toFixed(0).padStart(7)}` +
    `${(s.manquant * 100).toFixed(0).padStart(6)}%${(s.ponct[60] * 100).toFixed(0).padStart(6)}%${(s.ponct[300] * 100).toFixed(0).padStart(6)}%${s.annul.toFixed(1).padStart(7)}  ` +
    `${heures} h actives, pointe ${hMax.toFixed(0)} trains/h`);
}
// Variation ouvré / week-end (25-26 juillet 2026 = samedi-dimanche)
const WE = ['2026-07-25', '2026-07-26'];
let ouvre = 0, weekend = 0, nO = 0, nW = 0;
for (const s of avecTl) for (const [j, v] of Object.entries(s.parJour)) { if (WE.includes(j)) { weekend += v.n; nW++; } else { ouvre += v.n; nO++; } }
console.log(`\nVolume moyen par gare : jour ouvré ${(ouvre / nO).toFixed(1)} trains, week-end ${(weekend / nW).toFixed(1)} trains ` +
  `(${((weekend / nW) / (ouvre / nO) * 100 - 100).toFixed(0)} %)`);

// ================= 9.2 Valeurs de K et temps de charge =================
console.log('\n===== 9.2 VALEURS DE K ET TEMPS DE CHARGE =====');
const STATUTS = Object.keys(CFG.productionCible);
const coefRef = 2 * CFG.ponctualiteReference - 1;
console.log('Formule K = plafond(0,8 x N / A). Temps de charge theorique = 24 x coef / A heures (independant de N).');
console.log('\nstatut'.padEnd(12) + 'A'.padStart(5) + '  K pour N=' + [724, 300, 100, 40, 12].join(' / '));
for (const st of STATUTS) {
  const A = CFG.productionCible[st];
  console.log(st.padEnd(12) + String(A).padStart(5) + '  ' + [724, 300, 100, 40, 12].map(N => Math.ceil(coefRef * N / A)).join(' / '));
}
console.log('\nTemps theorique pour charger une action (heures), a 90 % de ponctualite :');
console.log('coef'.padEnd(8) + STATUTS.map(s => s.slice(0, 9).padStart(11)).join(''));
for (const coef of [0.3, 0.5, 0.6, 0.7, 0.8, 1.0]) {
  console.log(String(coef).padEnd(8) + STATUTS.map(s => (24 * coef / CFG.productionCible[s]).toFixed(1).padStart(11)).join(''));
}
// Rythme reel = charge + duree active (gel)
console.log('\nActions par jour en tenant compte du gel pendant la duree active (statut titulaire, A=2) :');
const lignes = [];
for (const [nom, c] of Object.entries(CATALOGUE)) {
  const charge = 24 * c.coef / 2;
  const cycle = charge + (c.duree || 0);
  lignes.push([nom, c.poste, c.coef, c.duree || 0, charge, 24 / cycle, (24 / charge)]);
}
lignes.sort((a, b) => b[5] - a[5]);
console.log('consigne'.padEnd(20) + 'poste'.padStart(6) + 'coef'.padStart(6) + 'duree'.padStart(7) + 'charge h'.padStart(10) + 'act/j reel'.padStart(12) + 'act/j sans gel'.padStart(15));
for (const l of lignes) console.log(l[0].padEnd(20) + l[1].padStart(6) + String(l[2]).padStart(6) + (l[3] + ' h').padStart(7) + l[4].toFixed(1).padStart(10) + l[5].toFixed(2).padStart(12) + l[6].toFixed(2).padStart(15));

// Temps de charge REEL par rejeu (tient compte des creux nocturnes)
console.log('\nTemps de charge reel par rejeu des evenements (mediane sur les gares, statut titulaire) :');
function rejeuCharge(s, coef, A) {
  const K = Math.ceil(coefRef * s.N / A), cout = Math.max(1, Math.ceil(coef * K));
  const evts = [];
  for (let d = 0; d < 6; d++) for (const [min, ret, frais] of timelines[s.cle][JOURS[d]] || []) evts.push([d * 1440 + min, (frais ? ret <= CFG.seuilRetardS : Math.random() < s.ponct[300]) ? 1 : -1]);
  evts.sort((a, b) => a[0] - b[0]);
  let jauge = 0, debut = 0, durees = [];
  for (const [t, delta] of evts) { jauge = Math.max(0, jauge + delta); if (jauge >= cout) { durees.push((t - debut) / 60); jauge = 0; debut = t; } }
  return durees;
}
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const gros = avecTl.filter(s => s.N >= 150).slice(0, 60), moyen = avecTl.filter(s => s.N >= 40 && s.N < 150).slice(0, 60), petit = avecTl.filter(s => s.N < 25).slice(0, 60);
console.log('coef'.padEnd(8) + 'grandes gares'.padStart(16) + 'moyennes'.padStart(14) + 'petites'.padStart(14) + '   (theorique)');
for (const coef of [0.3, 0.5, 0.6, 0.8, 1.0]) {
  const f = arr => { const t = arr.flatMap(s => rejeuCharge(s, coef, 2)); return med(t); };
  console.log(String(coef).padEnd(8) + (f(gros)?.toFixed(1) + ' h').padStart(16) + (f(moyen)?.toFixed(1) + ' h').padStart(14) + (f(petit)?.toFixed(1) + ' h').padStart(14) + `   ${(24 * coef / 2).toFixed(1)} h`);
}

// ================= 9.3 Simulation de matchs =================
console.log('\n===== 9.3 SIMULATION DE MATCHS (7 jours) =====');
const noms = Object.keys(TACTIQUES);
const resultats = [];
console.log('domicile vs exterieur'.padEnd(28) + 'score'.padStart(9) + 'frappes'.padStart(10) + 'bloquees'.padStart(10) + 'buts/j/eq'.padStart(11) + 'echecs cond.'.padStart(14));
for (const a of noms) for (const b of noms) {
  let bA = 0, bB = 0, fr = 0, bl = 0, ec = 0, dec = 0, sec = 0, secU = 0, pex = 0, pcr = 0, cex = 0, ccr = 0, iex = 0, dex = 0, blocs = 0, n = 0;
  for (let graine = 1; graine <= 6; graine++) {
    const eqA = composer(TACTIQUES[a], graine * 17), eqB = composer(TACTIQUES[b], graine * 31 + 7);
    eqB.forEach(j => j.equipe = 1);
    const S = simuler(eqA, eqB, graine * 101);
    bA += S.buts[0]; bB += S.buts[1]; fr += S.frappes[0] + S.frappes[1]; bl += S.bloquees[0] + S.bloquees[1];
    ec += S.echecsConditionnels[0] + S.echecsConditionnels[1]; dec += S.declenchements[0] + S.declenchements[1];
    sec += S.seconds[0] + S.seconds[1]; secU += S.secondsUtilises[0] + S.secondsUtilises[1];
    pex += S.passesExpirees[0] + S.passesExpirees[1]; pcr += S.passesCreees[0] + S.passesCreees[1];
    cex += S.centresExpires[0] + S.centresExpires[1]; ccr += S.centresCrees[0] + S.centresCrees[1];
    iex += S.interceptionsExpirees[0] + S.interceptionsExpirees[1]; dex += S.dominationsExpirees[0] + S.dominationsExpirees[1];
    blocs += S.blocsActifs.reduce((x, y) => x + y, 0) / Math.max(1, S.blocsActifs.length); n++;
  }
  resultats.push({ a, b, bA: bA / n, bB: bB / n, fr: fr / n, bl: bl / n, ec: ec / n, dec: dec / n, sec: sec / n, secU: secU / n, pex, pcr, cex, ccr, iex, dex, blocs: blocs / n });
  if (a === b || a === 'equilibree' || b === 'equilibree')
    console.log(`${a} vs ${b}`.padEnd(28) + `${(bA / n).toFixed(1)}-${(bB / n).toFixed(1)}`.padStart(9) + (fr / n).toFixed(0).padStart(10) +
      `${(bl / Math.max(1, fr) * 100).toFixed(0)}%`.padStart(10) + ((bA + bB) / n / 14).toFixed(2).padStart(11) + `${(ec / Math.max(1, dec) * 100).toFixed(0)}%`.padStart(14));
}
const tousButs = resultats.map(r => r.bA + r.bB);
console.log(`\nTotal de buts par match (7 jours, 2 equipes) : min ${Math.min(...tousButs).toFixed(1)} | median ${med(tousButs).toFixed(1)} | max ${Math.max(...tousButs).toFixed(1)}`);
console.log(`Buts par equipe et par jour : median ${(med(tousButs) / 14).toFixed(2)}`);
const r0 = resultats.find(r => r.a === 'equilibree' && r.b === 'equilibree');
console.log(`Blocs actifs en moyenne (equilibree vs equilibree) : ${r0.blocs.toFixed(1)}`);
console.log(`Seconds ballons : produits ${r0.sec.toFixed(0)}, exploites ${r0.secU.toFixed(0)} (${(r0.secU / Math.max(1, r0.sec) * 100).toFixed(0)} %)`);
console.log(`Passes : creees ${(r0.pcr / 6).toFixed(0)}, expirees sans usage ${(r0.pex / 6).toFixed(0)} | Centres : crees ${(r0.ccr / 6).toFixed(0)}, expires ${(r0.cex / 6).toFixed(0)}`);
console.log(`Interceptions expirees sans cible ${(r0.iex / 6).toFixed(0)} | dominations expirees ${(r0.dex / 6).toFixed(0)}`);

// Classement des tactiques
console.log('\nEfficacite des tactiques (buts marques / encaisses en moyenne sur tous les adversaires) :');
const perf = noms.map(t => {
  const m = resultats.filter(r => r.a === t).reduce((s, r) => s + r.bA, 0) / noms.length;
  const e = resultats.filter(r => r.b === t).reduce((s, r) => s + r.bB, 0) / noms.length;
  return { t, m, e, diff: m - e };
}).sort((x, y) => y.diff - x.diff);
for (const p of perf) console.log(`  ${p.t.padEnd(12)} marque ${p.m.toFixed(1).padStart(5)} | encaisse ${p.e.toFixed(1).padStart(5)} | difference ${(p.diff >= 0 ? '+' : '') + p.diff.toFixed(1)}`);

// ================= Avantage superstar =================
console.log('\n===== AVANTAGE DES GRANDES GARES =====');
for (const [lib, filtre] of [['toutes gares', () => true], ['grandes seulement (N>=150)', s => s.N >= 150], ['petites seulement (N<40)', s => s.N < 40]]) {
  let buts = 0, dec = 0;
  for (let g = 1; g <= 6; g++) {
    const eqA = composer(TACTIQUES.equilibree, g * 17, filtre), eqB = composer(TACTIQUES.equilibree, g * 31 + 7, filtre);
    eqB.forEach(j => j.equipe = 1);
    const S = simuler(eqA, eqB, g * 101);
    buts += S.buts[0] + S.buts[1]; dec += S.declenchements[0] + S.declenchements[1];
  }
  console.log(`  ${lib.padEnd(28)} : ${(buts / 6).toFixed(1)} buts / match, ${(dec / 6 / 22 / 7).toFixed(2)} actions par joueur et par jour`);
}
