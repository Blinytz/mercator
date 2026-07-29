#!/usr/bin/env node
// Recherche d'un équilibrage : on fait varier les leviers un par un puis combinés.
import { CFG, CATALOGUE, TACTIQUES } from './moteur.mjs';
import { duel } from './run2.mjs';

const DEFENSIFS = new Set(['blocArret', 'blocContre', 'blocContre+passe', 'interception', 'domination']);
const baseCible = { ...CFG.productionCible };
const baseCat = JSON.parse(JSON.stringify(CATALOGUE));

function appliquer(v) {
  // remise à l'état initial
  Object.assign(CFG.productionCible, baseCible);
  for (const [k, c] of Object.entries(baseCat)) Object.assign(CATALOGUE[k], c);
  CFG.gelDefensif = v.gelDefensif ?? true;
  if (v.echelleA) for (const k of Object.keys(CFG.productionCible)) CFG.productionCible[k] = baseCible[k] * v.echelleA;
  if (v.blocsParAction) for (const c of Object.values(CATALOGUE)) if (c.produit === 'blocArret' || c.produit === 'blocContre') c.n = (baseCat[Object.keys(CATALOGUE).find(k => CATALOGUE[k] === c)]?.n || 1) * v.blocsParAction;
  if (v.coutFrappe) for (const c of Object.values(CATALOGUE)) if (c.produit === 'frappe') c.coef = Math.round(c.coef * v.coutFrappe * 100) / 100;
  if (v.dureeCentre) for (const c of Object.values(CATALOGUE)) if (c.produit === 'centre') c.duree = v.dureeCentre;
  if (v.dureePasse) for (const c of Object.values(CATALOGUE)) if (c.produit === 'passe') c.duree = v.dureePasse;
}

const VARIANTES = [
  { nom: 'A. référence (doc)', v: {} },
  { nom: 'B. blocs sans gel', v: { gelDefensif: false } },
  { nom: 'C. 2 blocs par action', v: { blocsParAction: 2 } },
  { nom: 'D. frappes +60 % de coût', v: { coutFrappe: 1.6 } },
  { nom: 'E. rythme A divisé par 2', v: { echelleA: 0.5 } },
  { nom: 'F. B + E', v: { gelDefensif: false, echelleA: 0.5 } },
  { nom: 'G. B + E + centres 5 h', v: { gelDefensif: false, echelleA: 0.5, dureeCentre: 5 } },
  { nom: 'H. B + E + frappes +25 %', v: { gelDefensif: false, echelleA: 0.5, coutFrappe: 1.25, dureeCentre: 5 } },
  { nom: 'I. C + E', v: { blocsParAction: 2, echelleA: 0.5 } },
];

console.log('Variante'.padEnd(26) + 'buts/match'.padStart(12) + 'buts/j/eq'.padStart(11) + 'frappes'.padStart(9) + 'bloquees'.padStart(10) + 'act/j/joueur'.padStart(14) + 'ecart tactiques'.padStart(17));
for (const { nom, v } of VARIANTES) {
  appliquer(v);
  const duels = [['equilibree', 'equilibree'], ['offensive', 'defensive'], ['centres', 'equilibree'], ['passes', 'seconds'], ['defensive', 'defensive'], ['offensive', 'offensive']];
  const rs = duels.map(([a, b]) => duel(a, b, 4));
  const eq = rs[0];
  const totaux = rs.map(r => r.bA + r.bB);
  console.log(nom.padEnd(26) + `${totaux[0].toFixed(1)}`.padStart(12) + ((eq.bA + eq.bB) / 14).toFixed(2).padStart(11) +
    eq.fr.toFixed(0).padStart(9) + `${(eq.blPct * 100).toFixed(0)}%`.padStart(10) + (eq.dec / 22 / 7).toFixed(2).padStart(14) +
    `${Math.min(...totaux).toFixed(0)} a ${Math.max(...totaux).toFixed(0)}`.padStart(17));
}

// Détail de la variante retenue
console.log('\n===== DETAIL DE LA VARIANTE G =====');
appliquer(VARIANTES.find(x => x.nom.startsWith('G')).v);
const noms = Object.keys(TACTIQUES);
console.log('duel'.padEnd(26) + 'score'.padStart(11) + 'buts/j/eq'.padStart(11) + 'bloq.'.padStart(7) + 'centres exp.'.padStart(13) + 'passes exp.'.padStart(12));
const tot = [];
for (const a of noms) for (const b of noms) {
  if (noms.indexOf(b) < noms.indexOf(a)) continue;
  const r = duel(a, b, 5);
  tot.push(r.bA + r.bB);
  console.log(`${a} vs ${b}`.padEnd(26) + `${r.bA.toFixed(1)}-${r.bB.toFixed(1)}`.padStart(11) + ((r.bA + r.bB) / 14).toFixed(2).padStart(11) +
    `${(r.blPct * 100).toFixed(0)}%`.padStart(7) + `${(r.cexPct * 100).toFixed(0)}%`.padStart(13) + `${(r.pexPct * 100).toFixed(0)}%`.padStart(12));
}
console.log(`\nButs par match : min ${Math.min(...tot).toFixed(1)} | median ${[...tot].sort((a, b) => a - b)[tot.length >> 1].toFixed(1)} | max ${Math.max(...tot).toFixed(1)}`);
const perf = noms.map(t => {
  let m = 0, e = 0, n = 0;
  for (const o of noms) { const r = duel(t, o, 3); m += r.bA; e += r.bB; n++; }
  return { t, m: m / n, e: e / n };
}).sort((x, y) => (y.m - y.e) - (x.m - x.e));
console.log('\nEcart entre tactiques (variante G) :');
for (const p of perf) console.log(`  ${p.t.padEnd(12)} marque ${p.m.toFixed(1).padStart(5)} | encaisse ${p.e.toFixed(1).padStart(5)} | difference ${((p.m - p.e) >= 0 ? '+' : '') + (p.m - p.e).toFixed(1)}`);
