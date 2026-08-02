#!/usr/bin/env node
// Projection du catalogue : quelles gares seront des joueurs pertinents.
// Distingue ce qui est mesuré de ce qui est projeté, et n'utilise que des
// critères robustes au défaut de collecte.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const BASE = process.argv[2] || '..';
const st = JSON.parse(gunzipSync(readFileSync(`${BASE}/../stations.json.gz`)).toString());
const excl = JSON.parse(readFileSync(`${BASE}/src/exclusions.json`, 'utf8'));
const PAYS = { fr_sncf: 'France', nl_ovapi: 'Pays-Bas', de_gtfsde: 'Allemagne', us_mbta: 'Etats-Unis', us_mta_lirr: 'Etats-Unis', us_mta_mnr: 'Etats-Unis', au_translink_seq: 'Australie' };
const exclues = new Set(excl.garesExclues.map(g => g.cle));
const quarantaine = new Set(excl.garesQuarantaine.map(g => g.cle));
const sourcesKO = new Set(Object.keys(excl.sourcesRejetees));

// Identité : résolue aujourd'hui, ou récupérable après le correctif C3
const identiteRecuperable = new Set(['de_gtfsde', 'us_mta_mnr', 'us_mta_lirr']);
const idOk = s => !!s.nom || identiteRecuperable.has(s.net);

const STATUTS = [['superstar', 200], ['star', 100], ['titulaire', 50], ['rotation', 25], ['petit joueur', 15]];
const statut = N => (STATUTS.find(([, min]) => N >= min) || ['hors catalogue'])[0];

const retenues = st.filter(s =>
  !sourcesKO.has(s.net) && !exclues.has(s.cle) && !quarantaine.has(s.cle) &&
  idOk(s) && s.N >= 15 && s.jours >= 5);

console.log('=== GARES PROJETEES COMME JOUEURS, PAR PAYS ===');
console.log('Criteres : signal authentique, identite resolue ou recuperable,');
console.log('au moins 15 trains par jour, presente au moins 5 jours sur 6.\n');
const parPays = {};
for (const s of retenues) (parPays[PAYS[s.net]] ??= []).push(s);
console.log('pays'.padEnd(13) + 'joueurs'.padStart(9) + STATUTS.map(([n]) => n.slice(0, 9).padStart(11)).join('') + '  identite');
let total = 0;
for (const [p, arr] of Object.entries(parPays).sort((a, b) => b[1].length - a[1].length)) {
  total += arr.length;
  const nets = [...new Set(arr.map(s => s.net))];
  const idNote = nets.every(n => identiteRecuperable.has(n)) ? 'apres correctif' : nets.some(n => identiteRecuperable.has(n)) ? 'partielle' : 'deja stable';
  console.log(p.padEnd(13) + String(arr.length).padStart(9) +
    STATUTS.map(([n]) => String(arr.filter(s => statut(s.N) === n).length).padStart(11)).join('') + '  ' + idNote);
}
console.log('TOTAL'.padEnd(13) + String(total).padStart(9) +
  STATUTS.map(([n]) => String(retenues.filter(s => statut(s.N) === n).length).padStart(11)).join(''));

console.log('\n=== CE QUI EST ECARTE, ET POURQUOI ===');
console.log(`  source entiere rejetee (MBTA)      : ${st.filter(s => sourcesKO.has(s.net)).length} gares, retards artificiels`);
console.log(`  gares exclues individuellement     : ${st.filter(s => exclues.has(s.cle)).length}, signal absent ou ponctualite > 98 %`);
console.log(`  gares en quarantaine               : ${st.filter(s => quarantaine.has(s.cle)).length}, symptome present mais echantillon < 100 mouvements`);
console.log(`  volume insuffisant (moins de 15/j) : ${st.filter(s => !sourcesKO.has(s.net) && !exclues.has(s.cle) && !quarantaine.has(s.cle) && idOk(s) && s.N < 15).length}`);
console.log(`  presentes moins de 5 jours sur 6   : ${st.filter(s => !sourcesKO.has(s.net) && !exclues.has(s.cle) && !quarantaine.has(s.cle) && idOk(s) && s.N >= 15 && s.jours < 5).length}`);
console.log(`  identite irrecuperable             : ${st.filter(s => !idOk(s)).length}`);

console.log('\n=== QUALITE DU NOYAU RETENU ===');
const med = a => { const x = [...a].sort((p, q) => p - q); return x[x.length >> 1]; };
console.log(`  ponctualite mediane a 300 s : ${(med(retenues.map(s => s.ponct[300])) * 100).toFixed(1)} %`);
console.log(`  volume median               : ${med(retenues.map(s => s.N)).toFixed(0)} trains par jour`);
const disp = retenues.map(s => (s.ponct[600] - s.ponct[60]) * 100);
console.log(`  dispersion mediane          : ${med(disp).toFixed(1)} points entre le seuil 60 s et le seuil 600 s`);
console.log(`  gares au-dessus de 95 % de ponctualite : ${retenues.filter(s => s.ponct[300] > 0.95).length} (risque de joueurs trop reguliers)`);
console.log(`  gares sous 80 % de ponctualite         : ${retenues.filter(s => s.ponct[300] < 0.8).length} (joueurs faibles, conserves volontairement)`);

console.log('\n=== ECHANTILLON NOMINATIF DU NOYAU, PAR PAYS ===');
for (const [p, arr] of Object.entries(parPays)) {
  const top = [...arr].sort((a, b) => b.N - a.N).slice(0, 5);
  console.log(`  ${p} :`);
  for (const s of top) console.log(`      ${(s.nom || s.cle).slice(0, 32).padEnd(34)} ${String(s.N.toFixed(0)).padStart(4)} trains/j  ponct ${(s.ponct[300] * 100).toFixed(0)} %  statut ${statut(s.N)}`);
}
