#!/usr/bin/env node
import { CFG, CATALOGUE, TACTIQUES } from './moteur.mjs';
import { duel } from './run2.mjs';

const baseCible = { ...CFG.productionCible };
const baseCat = JSON.parse(JSON.stringify(CATALOGUE));
function appliquer(v) {
  Object.assign(CFG.productionCible, baseCible);
  for (const [k, c] of Object.entries(baseCat)) { for (const p of Object.keys(CATALOGUE[k])) delete CATALOGUE[k][p]; Object.assign(CATALOGUE[k], c); }
  CFG.gelDefensif = v.gelDefensif ?? true;
  if (v.echelleA) for (const k of Object.keys(CFG.productionCible)) CFG.productionCible[k] = baseCible[k] * v.echelleA;
  if (v.sansElimFrappe) for (const c of Object.values(CATALOGUE)) if (c.produit === 'frappe') c.elimine = 0;
  if (v.sansElimTotal) for (const c of Object.values(CATALOGUE)) c.elimine = 0;
  if (v.coutFrappe) for (const c of Object.values(CATALOGUE)) if (c.produit === 'frappe') c.coef = Math.round(c.coef * v.coutFrappe * 100) / 100;
  if (v.dureeCentre) for (const c of Object.values(CATALOGUE)) if (c.produit === 'centre') c.duree = v.dureeCentre;
  if (v.blocsParAction) for (const [k, c] of Object.entries(CATALOGUE)) if (c.produit === 'blocArret' || c.produit === 'blocContre') c.n = (baseCat[k].n || 1) * v.blocsParAction;
}
const V = [
  { nom: 'A. référence (doc)', v: {} },
  { nom: 'J. sans élim. sur frappes', v: { sansElimFrappe: true } },
  { nom: 'K. aucune élimination', v: { sansElimTotal: true } },
  { nom: 'L. J + blocs sans gel', v: { sansElimFrappe: true, gelDefensif: false } },
  { nom: 'M. L + A divisé par 2', v: { sansElimFrappe: true, gelDefensif: false, echelleA: 0.5 } },
  { nom: 'N. M + centres 5 h', v: { sansElimFrappe: true, gelDefensif: false, echelleA: 0.5, dureeCentre: 5 } },
  { nom: 'O. N + frappes +25 %', v: { sansElimFrappe: true, gelDefensif: false, echelleA: 0.5, dureeCentre: 5, coutFrappe: 1.25 } },
  { nom: 'P. N + A divisé par 3', v: { sansElimFrappe: true, gelDefensif: false, echelleA: 1 / 3, dureeCentre: 5 } },
];
console.log('Variante'.padEnd(28) + 'buts/match'.padStart(12) + 'buts/j/eq'.padStart(11) + 'frappes'.padStart(9) + 'bloquees'.padStart(10) + 'act/j/joueur'.padStart(14) + 'plage tactiques'.padStart(17));
for (const { nom, v } of V) {
  appliquer(v);
  const duels = [['equilibree', 'equilibree'], ['offensive', 'defensive'], ['centres', 'equilibree'], ['passes', 'seconds'], ['defensive', 'defensive'], ['offensive', 'offensive'], ['seconds', 'centres']];
  const rs = duels.map(([a, b]) => duel(a, b, 4));
  const eq = rs[0], totaux = rs.map(r => r.bA + r.bB);
  console.log(nom.padEnd(28) + totaux[0].toFixed(1).padStart(12) + ((eq.bA + eq.bB) / 14).toFixed(2).padStart(11) +
    eq.fr.toFixed(0).padStart(9) + `${(eq.blPct * 100).toFixed(0)}%`.padStart(10) + (eq.dec / 22 / 7).toFixed(2).padStart(14) +
    `${Math.min(...totaux).toFixed(0)} a ${Math.max(...totaux).toFixed(0)}`.padStart(17));
}

console.log('\n===== DETAIL DE LA VARIANTE RETENUE (N) =====');
appliquer(V.find(x => x.nom.startsWith('N')).v);
const noms = Object.keys(TACTIQUES);
const tot = [];
console.log('duel'.padEnd(26) + 'score'.padStart(11) + 'buts/j/eq'.padStart(11) + 'bloq.'.padStart(7) + 'echec cond'.padStart(11) + 'centres exp'.padStart(12) + '2e ballons'.padStart(11));
for (const a of noms) for (const b of noms) {
  if (noms.indexOf(b) < noms.indexOf(a)) continue;
  const r = duel(a, b, 5); tot.push(r.bA + r.bB);
  console.log(`${a} vs ${b}`.padEnd(26) + `${r.bA.toFixed(1)}-${r.bB.toFixed(1)}`.padStart(11) + ((r.bA + r.bB) / 14).toFixed(2).padStart(11) +
    `${(r.blPct * 100).toFixed(0)}%`.padStart(7) + `${(r.ecPct * 100).toFixed(0)}%`.padStart(11) + `${(r.cexPct * 100).toFixed(0)}%`.padStart(12) + `${r.sec.toFixed(0)}/${(r.secPct * 100).toFixed(0)}%`.padStart(11));
}
const tri = [...tot].sort((a, b) => a - b);
console.log(`\nButs par match : min ${tri[0].toFixed(1)} | median ${tri[tri.length >> 1].toFixed(1)} | max ${tri.at(-1).toFixed(1)}`);
const perf = noms.map(t => { let m = 0, e = 0; for (const o of noms) { const r = duel(t, o, 3); m += r.bA; e += r.bB; } return { t, m: m / noms.length, e: e / noms.length }; }).sort((x, y) => (y.m - y.e) - (x.m - x.e));
console.log('\nEquilibre entre tactiques :');
for (const p of perf) console.log(`  ${p.t.padEnd(12)} marque ${p.m.toFixed(1).padStart(5)} | encaisse ${p.e.toFixed(1).padStart(5)} | difference ${((p.m - p.e) >= 0 ? '+' : '') + (p.m - p.e).toFixed(1)}`);
console.log('\nPar taille de gare (variante N) :');
for (const [lib, f] of [['grandes N>=150', s => s.N >= 150], ['moyennes 40-150', s => s.N >= 40 && s.N < 150], ['petites N<40', s => s.N < 40], ['tres petites N<15', s => s.N < 15]]) {
  const r = duel('equilibree', 'equilibree', 4, f);
  console.log(`  ${lib.padEnd(18)} : ${(r.bA + r.bB).toFixed(1)} buts/match | ${(r.dec / 22 / 7).toFixed(2)} actions/joueur/jour | ${r.fr.toFixed(0)} frappes`);
}
