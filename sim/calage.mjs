#!/usr/bin/env node
// ============================================================
// Calage du moteur sur l'effectif réel
//
// Les simulations d'août tournaient sur des gares projetées avant la collecte
// et donnaient 46 buts par match là où le cadrage vise 28. Celle-ci tourne sur
// les 370 joueurs de la saison, avec leurs vrais N, leurs vraies ponctualités
// et leurs vraies chronologies de trains.
//
// Trois questions, dans cet ordre.
//
// 1. Où en est-on vraiment, sur les vrais joueurs et contre des bots
//    adaptatifs, seul étalonnage qui vaille : un bot passif se laisse battre.
// 2. Quelle amplitude reste-t-il entre profils tactiques ? Elle était
//    ingouvernable, de 6 à 157 buts.
// 3. Quel réglage ramène à 28 sans écraser les différences entre styles ?
//
// Le levier de calage est le COÛT DES ACTIONS, un multiplicateur sur K. C'est
// celui que le moteur documente déjà : le temps de charge d'une action vaut
// 24 × coefficient / A heures, donc multiplier K ralentit tout le monde dans
// la même proportion sans favoriser un profil ni changer une mécanique.
// Inventer une probabilité d'arrêt aurait ajouté une règle au jeu ; la
// résolution des frappes reste déterministe, un but passe s'il n'y a pas de
// bloc actif, exactement comme le cadrage le prévoit.
//
// Usage : node sim/calage.mjs [matchsParDuel]
// ============================================================

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG, CATALOGUE, FORMATIONS, simuler, creerJoueur, rng } from './moteur2.mjs';
import { PROFILS, politiqueAdaptative } from './profils.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const MATCHS = Number(process.argv[2] || 40);
const CIBLE = 28;

// ---- L'effectif et ses chronologies ----
const csv = readFileSync(join(RACINE, 'docs', 'effectif-saison-1.csv'), 'utf8')
  .replace(/\r/g, '').trim().split('\n');
const col = Object.fromEntries(csv[0].split(';').map((e, i) => [e, i]));
const effectif = csv.slice(1).map(l => {
  const c = l.split(';');
  return { cle: c[col.cle], net: c[col.reseau], nom: c[col.nom], pays: c[col.pays],
    N: +c[col.N], statut: c[col.statut], K: +c[col.K],
    ponct: { 300: +c[col.ponctualite] / 100 } };
});
const chrono = JSON.parse(gunzipSync(readFileSync(join(RACINE, 'sim', 'chronologies-saison-1.json.gz'))).toString());

// ---- Composition de huit clubs ----
// Chaque club reçoit un joueur de chaque statut à tour de rôle, ce qui donne
// huit effectifs comparables : on mesure le moteur, pas le tirage.
function composerClubs(nbClubs, formation, alea) {
  const parStatut = {};
  for (const g of effectif) (parStatut[g.statut] ??= []).push(g);
  for (const s of Object.keys(parStatut)) parStatut[s].sort(() => alea() - 0.5);
  const f = FORMATIONS[formation];
  const besoins = [['G', 1], ['D', f.D], ['M', f.M], ['A', f.A]];
  const ordreStatut = ['superstar', 'star', 'titulaire', 'rotation', 'petit joueur'];
  const curseurs = Object.fromEntries(ordreStatut.map(s => [s, 0]));
  const clubs = [];
  for (let c = 0; c < nbClubs; c++) {
    const club = [];
    let i = 0;
    for (const [poste, n] of besoins) {
      for (let k = 0; k < n; k++) {
        // Les postes avancés reçoivent les meilleurs statuts disponibles.
        for (const s of ordreStatut) {
          const pool = parStatut[s] || [];
          if (curseurs[s] < pool.length) { club.push([pool[curseurs[s]++], poste]); break; }
        }
        i++;
      }
    }
    clubs.push(club);
  }
  return clubs;
}

let multK = 1;      // multiplicateur de coût, seul réglage du calage
function equipeDepuis(club, profil, equipe) {
  return club.map(([g, poste]) => {
    const consignes = PROFILS[profil][poste];
    const nom = consignes[Math.floor(Math.random() * consignes.length)];
    const j = creerJoueur({ cle: g.cle, nom: g.nom, net: g.net, N: g.N, ponct: g.ponct }, poste, nom, equipe);
    j.K = Math.max(1, Math.ceil(g.K * multK));   // K officiel, mis à l'échelle du calage
    j.nomJoueur = g.nom;
    return j;
  });
}

// Les chronologies sont indexées par réseau et clé, les joueurs par objet.
function chronosPour(equipes) {
  const m = new Map();
  for (const eq of equipes) for (const j of eq) m.set(j, chrono.joueurs[j.net + '|' + j.cle] || []);
  return m;
}

function jouer(profilA, profilB, formation, graine, options) {
  const alea = rng(graine);
  const clubs = composerClubs(2, formation, alea);
  const equipes = [equipeDepuis(clubs[0], profilA, 0), equipeDepuis(clubs[1], profilB, 1)];
  const S = simuler(equipes, chronosPour(equipes), alea, options);
  return S;
}

function campagne(duels, formation, options, matchs = MATCHS) {
  const res = {};
  for (const [a, b] of duels) {
    let buts = 0, frappes = 0, bloquees = 0;
    for (let i = 0; i < matchs; i++) {
      const S = jouer(a, b, formation, 1000 + i * 7919, options);
      buts += S.buts[0] + S.buts[1];
      frappes += S.frappes[0] + S.frappes[1];
      bloquees += S.frappesBloquees[0] + S.frappesBloquees[1];
    }
    res[`${a} vs ${b}`] = { buts: buts / matchs, frappes: frappes / matchs, bloquees: bloquees / matchs };
  }
  return res;
}

const DUELS = [
  ['equilibre', 'equilibre'], ['offensif', 'offensif'], ['defensif', 'defensif'],
  ['centres', 'defensif'], ['frappes', 'possession'], ['passes', 'transitions'],
];
// Le bot adaptatif ne s'applique QU'AUX CLUBS ADVERSES. Une premiere version
// le mettait des deux cotes : des la premiere revision de consignes, deux a
// quatre heures apres le coup d'envoi, il ecrasait le profil tactique choisi
// des deux cotes, et les six duels rendaient exactement le meme score. Ce
// n'etait pas un moteur sature, c'etait un protocole faux : dans le vrai jeu,
// le club humain garde ses consignes et seuls les sept adversaires s'adaptent.
const optAdapt = { politique: (j, ctx) => (j.equipe === 1 ? politiqueAdaptative(j, ctx) : null) };

console.log(`CALAGE DU MOTEUR SUR L'EFFECTIF REEL · ${MATCHS} matchs par duel`);
console.log(`370 joueurs, 380 520 evenements ferroviaires sur 7 jours\n`);

console.log('1. ETAT DES LIEUX, bots adaptatifs, formation 4-4-2');
console.log('   ' + 'duel'.padEnd(26) + 'buts'.padStart(8) + 'frappes'.padStart(9) + 'bloquees'.padStart(10));
const base = campagne(DUELS, '4-4-2', optAdapt);
for (const [k, v] of Object.entries(base)) {
  console.log('   ' + k.padEnd(26) + v.buts.toFixed(1).padStart(8) + v.frappes.toFixed(0).padStart(9) + v.bloquees.toFixed(0).padStart(10));
}
const valeurs = Object.values(base).map(v => v.buts);
const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
console.log(`   moyenne ${moyenne.toFixed(1)} buts, amplitude ${Math.min(...valeurs).toFixed(0)} a ${Math.max(...valeurs).toFixed(0)}, cible ${CIBLE}\n`);

console.log('2. EFFET DES FORMATIONS, duel equilibre');
for (const f of Object.keys(FORMATIONS)) {
  const r = campagne([['equilibre', 'equilibre']], f, optAdapt, Math.max(10, Math.round(MATCHS / 2)));
  console.log('   ' + f.padEnd(10) + Object.values(r)[0].buts.toFixed(1).padStart(7) + ' buts');
}

console.log('\n3. RECHERCHE DU REGLAGE : multiplicateur du cout des actions');
console.log('   ' + 'K x'.padEnd(8) + 'moyenne'.padStart(9) + 'min'.padStart(7) + 'max'.padStart(7)
  + 'ecart'.padStart(9) + '   amplitude entre profils');
let meilleur = null;
for (const mult of [1, 2, 3, 4, 5, 6, 8, 10]) {
  multK = mult;
  const c = campagne(DUELS, '4-4-2', optAdapt, Math.max(10, Math.round(MATCHS / 2)));
  const v = Object.values(c).map(x => x.buts);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const ecart = Math.abs(m - CIBLE);
  const amplitude = Math.max(...v) - Math.min(...v);
  if (!meilleur || ecart < meilleur.ecart) meilleur = { mult, m, ecart, min: Math.min(...v), max: Math.max(...v) };
  console.log('   ' + String(mult).padEnd(8) + m.toFixed(1).padStart(9) + Math.min(...v).toFixed(1).padStart(7)
    + Math.max(...v).toFixed(1).padStart(7) + ((m - CIBLE > 0 ? '+' : '') + (m - CIBLE).toFixed(1)).padStart(9)
    + '   ' + amplitude.toFixed(1) + ' buts');
}
multK = meilleur.mult;
console.log(`\n   RETENU : K x ${meilleur.mult}, moyenne ${meilleur.m.toFixed(1)} buts pour une cible de ${CIBLE},`
  + ` de ${meilleur.min.toFixed(1)} a ${meilleur.max.toFixed(1)} selon le duel`);

console.log('\n4. EFFET DU REFLEXE ADVERSE, au reglage retenu');
// Un curseur de difficulté ne doit pas être un robinet à buts : ce qui compte
// est l'issue du match. On mesure donc ce que le club humain, à consignes
// fixes, obtient face à des adversaires plus ou moins vifs.
console.log('   ' + 'intervalle'.padEnd(16) + 'humain'.padStart(8) + 'adverse'.padStart(9)
  + 'victoires'.padStart(11) + '   difficulte');
for (const [min, max, lib] of [[15, 30, 'tres reactif'], [60, 120, 'reactif'],
     [120, 240, 'defaut'], [240, 480, 'lent'], [480, 960, 'tres lent']]) {
  let bh = 0, bb = 0, v = 0;
  const n = Math.max(20, MATCHS * 2);
  for (let i = 0; i < n; i++) {
    const S = jouer('equilibre', 'equilibre', '4-4-2', 1000 + i * 7919,
      { ...optAdapt, reflexeMinMin: min, reflexeMaxMin: max });
    bh += S.buts[0]; bb += S.buts[1];
    if (S.buts[0] > S.buts[1]) v++;
  }
  console.log('   ' + `${min}-${max} min`.padEnd(16) + (bh / n).toFixed(1).padStart(8)
    + (bb / n).toFixed(1).padStart(9) + `${(100 * v / n).toFixed(0)} %`.padStart(11) + '   ' + lib);
}
