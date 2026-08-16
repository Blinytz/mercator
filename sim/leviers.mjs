#!/usr/bin/env node
// ============================================================
// Deux questions ouvertes, mesurées
//
// A. COMMENT RAMENER LE JEU A 28 BUTS SANS RENDRE L'EFFECTIF SPECTATEUR ?
//    Multiplier K par 5,5 y arrive, mais contredit une règle actée : la
//    production cible est de 3 actions par jour pour une superstar, et le
//    multiplicateur la ramène à 0,68. L'autre levier est celui que le
//    concepteur avait choisi en août, renforcer la défense : les frappes
//    restent aussi nombreuses, elles aboutissent moins souvent.
//
// B. QU'EST-CE QUI FAIT UN VRAI CURSEUR DE DIFFICULTE ?
//    Le réflexe adverse n'en est pas un, mesure du 16 août. On teste trois
//    autres pistes : des fenêtres de réflexe beaucoup plus tardives, un écart
//    de qualité entre effectifs, et un bot bridé qui ne lit pas le jeu.
//
// Usage : node sim/leviers.mjs [matchs]
// ============================================================

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, FORMATIONS, simuler, creerJoueur, rng } from './moteur2.mjs';
import { PROFILS, politiqueAdaptative } from './profils.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.argv[2] || 30);
const CIBLE = 28;

const csv = readFileSync(join(RACINE, 'docs', 'effectif-saison-1.csv'), 'utf8').replace(/\r/g, '').trim().split('\n');
const col = Object.fromEntries(csv[0].split(';').map((e, i) => [e, i]));
const effectif = csv.slice(1).map(l => { const c = l.split(';');
  return { cle: c[col.cle], net: c[col.reseau], nom: c[col.nom], N: +c[col.N],
    statut: c[col.statut], K: +c[col.K], ponct: { 300: +c[col.ponctualite] / 100 } }; });
const chrono = JSON.parse(gunzipSync(readFileSync(join(RACINE, 'sim', 'chronologies-saison-1.json.gz'))).toString());

// ---- Renfort défensif ----
// On agit sur ce qui bloque : durée et nombre de charges des postures. Le
// catalogue d'origine est sauvegardé pour que chaque essai reparte du même.
const ORIGINE = JSON.parse(JSON.stringify(CATALOGUE));
const EST_BLOC = c => c.produit === 'blocArret' || c.produit === 'blocContre'
  || (c.produit === 'multi' && (c.etats || []).some(([t]) => t.startsWith('bloc')));
function renfortDefensif(facteur) {
  for (const [nom, c] of Object.entries(ORIGINE)) {
    const cible = CATALOGUE[nom];
    if (!EST_BLOC(c)) { cible.duree = c.duree; cible.charges = c.charges; continue; }
    cible.duree = Math.round(c.duree * facteur);
    cible.charges = Math.max(1, Math.round((c.charges || 1) * facteur));
    if (c.etats) cible.etats = c.etats.map(([t, n]) => [t, t.startsWith('bloc') ? Math.round(n * facteur) : n]);
  }
}

// ---- Composition, avec écart de qualité possible ----
let multK = 1;
function composer(formation, alea, ecartStatut = 0) {
  const parStatut = {};
  for (const g of effectif) (parStatut[g.statut] ??= []).push(g);
  for (const s of Object.keys(parStatut)) parStatut[s].sort(() => alea() - 0.5);
  const f = FORMATIONS[formation];
  const ordre = ['superstar', 'star', 'titulaire', 'rotation', 'petit joueur'];
  const cur = Object.fromEntries(ordre.map(s => [s, 0]));
  const tirer = (decalage) => {
    for (let i = Math.max(0, decalage); i < ordre.length; i++) {
      const p = parStatut[ordre[i]] || [];
      if (cur[ordre[i]] < p.length) return p[cur[ordre[i]]++];
    }
    for (const s of ordre) { const p = parStatut[s] || []; if (cur[s] < p.length) return p[cur[s]++]; }
    return effectif[0];
  };
  const clubs = [];
  for (let c = 0; c < 2; c++) {
    const club = [];
    // ecartStatut > 0 : le club 1, l'adversaire, pioche plus bas dans la
    // hiérarchie. C'est un handicap donné au bot, donc un jeu plus facile.
    const decalage = c === 1 ? ecartStatut : 0;
    for (const [poste, n] of [['G', 1], ['D', f.D], ['M', f.M], ['A', f.A]])
      for (let k = 0; k < n; k++) club.push([tirer(decalage), poste]);
    clubs.push(club);
  }
  return clubs;
}
function equipe(club, profil, eq, alea) {
  return club.map(([g, poste]) => {
    const cs = PROFILS[profil][poste];
    const j = creerJoueur({ cle: g.cle, nom: g.nom, net: g.net, N: g.N, ponct: g.ponct },
      poste, cs[Math.floor(alea() * cs.length)], eq);
    j.K = Math.max(1, Math.ceil(g.K * multK));
    return j;
  });
}

// ---- Politiques adverses ----
// Le bot bridé ne lit pas le jeu : il tient sa consigne de départ et ne
// consomme même pas les passes ou les centres qu'on lui offre.
const botBride = () => null;
const politiques = {
  adaptatif: (j, ctx) => (j.equipe === 1 ? politiqueAdaptative(j, ctx) : null),
  bride: botBride,
};

function match(profA, profB, formation, graine, opt = {}) {
  const alea = rng(graine);
  const clubs = composer(formation, alea, opt.ecartStatut || 0);
  const eqs = [equipe(clubs[0], profA, 0, alea), equipe(clubs[1], profB, 1, alea)];
  const m = new Map();
  for (const e of eqs) for (const j of e) m.set(j, chrono.joueurs[j.net + '|' + j.cle] || []);
  return simuler(eqs, m, alea, opt);
}
function campagne(opt = {}, duels = [['equilibre', 'equilibre']], n = N) {
  let bh = 0, bb = 0, v = 0, nuls = 0, tot = 0, frappes = 0;
  for (const [a, b] of duels) for (let i = 0; i < n; i++) {
    const S = match(a, b, '4-4-2', 1000 + i * 7919, opt);
    bh += S.buts[0]; bb += S.buts[1]; tot++;
    frappes += S.frappes[0] + S.frappes[1];
    if (S.buts[0] > S.buts[1]) v++; else if (S.buts[0] === S.buts[1]) nuls++;
  }
  return { humain: bh / tot, adverse: bb / tot, total: (bh + bb) / tot,
    victoires: 100 * v / tot, nuls: 100 * nuls / tot, frappes: frappes / tot };
}

const DUELS = [['equilibre', 'equilibre'], ['offensif', 'offensif'], ['defensif', 'defensif'],
  ['centres', 'defensif'], ['frappes', 'possession'], ['passes', 'transitions']];
const adapt = { politique: politiques.adaptatif };

console.log(`LEVIERS · ${N} matchs par point de mesure\n`);

console.log('A. RENFORCER LA DEFENSE PLUTOT QUE RALENTIR TOUT LE MONDE');
console.log('   Le renfort multiplie duree et charges des postures defensives.');
console.log('   ' + 'renfort'.padEnd(10) + 'buts'.padStart(8) + 'frappes'.padStart(9)
  + 'conversion'.padStart(12) + '   ecart a la cible');
multK = 1;
let meilleurDef = null;
for (const f of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
  renfortDefensif(f);
  const r = campagne(adapt, DUELS, Math.max(10, Math.round(N / 2)));
  const conv = 100 * r.total / r.frappes;
  const ecart = Math.abs(r.total - CIBLE);
  if (!meilleurDef || ecart < meilleurDef.ecart) meilleurDef = { f, total: r.total, ecart };
  console.log('   x' + String(f).padEnd(9) + r.total.toFixed(1).padStart(8) + r.frappes.toFixed(0).padStart(9)
    + (conv.toFixed(0) + ' %').padStart(12) + '   ' + (r.total - CIBLE > 0 ? '+' : '') + (r.total - CIBLE).toFixed(1));
}
renfortDefensif(1);
console.log(`\n   RETENU : defense x ${meilleurDef.f}, ${meilleurDef.total.toFixed(1)} buts, production cible intacte\n`);

console.log('B. CURSEURS DE DIFFICULTE, mesures sur le taux de victoire humain');
renfortDefensif(meilleurDef.f);

console.log('\n   B1. Fenetres de reflexe tardives');
console.log('   ' + 'intervalle'.padEnd(18) + 'humain'.padStart(8) + 'adverse'.padStart(9) + 'victoires'.padStart(11));
for (const [min, max] of [[120, 240], [360, 720], [720, 1440], [1440, 2880], [2880, 5760]]) {
  const r = campagne({ ...adapt, reflexeMinMin: min, reflexeMaxMin: max });
  console.log('   ' + `${(min / 60).toFixed(0)}-${(max / 60).toFixed(0)} h`.padEnd(18)
    + r.humain.toFixed(1).padStart(8) + r.adverse.toFixed(1).padStart(9) + `${r.victoires.toFixed(0)} %`.padStart(11));
}

console.log('\n   B2. Ecart de qualite entre effectifs');
console.log('   ' + 'handicap adverse'.padEnd(22) + 'humain'.padStart(8) + 'adverse'.padStart(9) + 'victoires'.padStart(11));
for (const e of [0, 1, 2, 3]) {
  const r = campagne({ ...adapt, ecartStatut: e });
  const lib = e === 0 ? 'aucun, effectifs egaux' : `${e} cran${e > 1 ? 's' : ''} plus bas`;
  console.log('   ' + lib.padEnd(22) + r.humain.toFixed(1).padStart(8) + r.adverse.toFixed(1).padStart(9)
    + `${r.victoires.toFixed(0)} %`.padStart(11));
}

console.log('\n   B3. Intelligence du bot');
console.log('   ' + 'politique'.padEnd(22) + 'humain'.padStart(8) + 'adverse'.padStart(9) + 'victoires'.padStart(11));
for (const [nom, pol, lib] of [['bride', politiques.bride, 'bride, ne lit pas le jeu'],
     ['adaptatif', politiques.adaptatif, 'adaptatif, lit le jeu']]) {
  const r = campagne({ politique: pol });
  console.log('   ' + lib.padEnd(22) + r.humain.toFixed(1).padStart(8) + r.adverse.toFixed(1).padStart(9)
    + `${r.victoires.toFixed(0)} %`.padStart(11));
}
renfortDefensif(1);
