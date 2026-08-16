#!/usr/bin/env node
// Detail par duel aux reglages candidats, avec assez de matchs pour que la
// variance ne decide pas a notre place.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMATIONS, simuler, creerJoueur, rng } from './moteur2.mjs';
import { PROFILS, politiqueAdaptative } from './profils.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const csv = readFileSync(join(RACINE, 'docs', 'effectif-saison-1.csv'), 'utf8').replace(/\r/g, '').trim().split('\n');
const col = Object.fromEntries(csv[0].split(';').map((e, i) => [e, i]));
const effectif = csv.slice(1).map(l => { const c = l.split(';');
  return { cle: c[col.cle], net: c[col.reseau], nom: c[col.nom], N: +c[col.N],
    statut: c[col.statut], K: +c[col.K], ponct: { 300: +c[col.ponctualite] / 100 } }; });
const chrono = JSON.parse(gunzipSync(readFileSync(join(RACINE, 'sim', 'chronologies-saison-1.json.gz'))).toString());

let multK = 1;
function composer(formation, alea) {
  const parStatut = {};
  for (const g of effectif) (parStatut[g.statut] ??= []).push(g);
  for (const s of Object.keys(parStatut)) parStatut[s].sort(() => alea() - 0.5);
  const f = FORMATIONS[formation];
  const ordre = ['superstar', 'star', 'titulaire', 'rotation', 'petit joueur'];
  const cur = Object.fromEntries(ordre.map(s => [s, 0]));
  const clubs = [];
  for (let c = 0; c < 2; c++) { const club = [];
    for (const [poste, n] of [['G', 1], ['D', f.D], ['M', f.M], ['A', f.A]])
      for (let k = 0; k < n; k++)
        for (const s of ordre) { const p = parStatut[s] || [];
          if (cur[s] < p.length) { club.push([p[cur[s]++], poste]); break; } }
    clubs.push(club); }
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
const opt = { politique: (j, ctx) => (j.equipe === 1 ? politiqueAdaptative(j, ctx) : null) };
function duel(a, b, n) {
  let buts = 0;
  for (let i = 0; i < n; i++) {
    const alea = rng(1000 + i * 7919);
    const clubs = composer('4-4-2', alea);
    const eqs = [equipe(clubs[0], a, 0, alea), equipe(clubs[1], b, 1, alea)];
    const m = new Map();
    for (const e of eqs) for (const j of e) m.set(j, chrono.joueurs[j.net + '|' + j.cle] || []);
    const S = simuler(eqs, m, alea, opt);
    buts += S.buts[0] + S.buts[1];
  }
  return buts / n;
}
const DUELS = [['equilibre', 'equilibre'], ['offensif', 'offensif'], ['defensif', 'defensif'],
  ['centres', 'defensif'], ['frappes', 'possession'], ['passes', 'transitions']];
const N = 40;
for (const mult of [5, 5.5, 6]) {
  multK = mult;
  const r = DUELS.map(([a, b]) => [a + ' vs ' + b, duel(a, b, N)]).sort((x, y) => y[1] - x[1]);
  const moy = r.reduce((s, x) => s + x[1], 0) / r.length;
  console.log(`\nK x ${mult} · moyenne ${moy.toFixed(1)} buts sur ${N} matchs par duel`);
  for (const [k, v] of r) console.log('   ' + k.padEnd(26) + v.toFixed(1).padStart(7) + ' buts');
}
