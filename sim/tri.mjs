#!/usr/bin/env node
// Tri des gares en trois familles, sur les seuls critères INTRINSÈQUES,
// c'est-à-dire indépendants de notre défaut de collecte.
// Produit src/exclusions.json, consommé par le collecteur, et docs/tri-gares.csv.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const BASE = process.argv[2] || '..';
const st = JSON.parse(gunzipSync(readFileSync(`${BASE}/../stations.json.gz`)).toString());
const PAYS = { fr_sncf: 'France', nl_ovapi: 'Pays-Bas', de_gtfsde: 'Allemagne', us_mbta: 'Etats-Unis', us_mta_lirr: 'Etats-Unis', us_mta_mnr: 'Etats-Unis', au_translink_seq: 'Australie' };

const SEUILS = {
  echantillonMin: 100,   // mouvements observés cumulés requis pour conclure (handoff 3.5)
  p60Max: 0.98, ponctMax: 0.98, dispersionMin: 0.02,
  partSourceRejet: 0.8,  // au-delà, c'est la source entière qui est en cause
};

const lignes = st.map(s => {
  const echantillon = Math.round(s.Nfrais * s.jours);
  const dispersion = s.ponct[600] - s.ponct[60];
  const motifs = [];
  if (s.ponct[60] > SEUILS.p60Max) motifs.push(`${(s.ponct[60] * 100).toFixed(0)} % des mouvements sous 60 s`);
  if (s.ponct[300] >= 1) motifs.push('aucun retard superieur a 5 min');
  if (dispersion < SEUILS.dispersionMin) motifs.push(`dispersion ${(dispersion * 100).toFixed(1)} pt`);
  if (s.ponct[300] > SEUILS.ponctMax && s.ponct[300] < 1) motifs.push(`ponctualite ${(s.ponct[300] * 100).toFixed(1)} %`);
  let famille;
  if (!motifs.length) famille = 'A_QUALIFIER';
  else if (echantillon >= SEUILS.echantillonMin) famille = 'EXCLUE';
  else famille = 'QUARANTAINE';
  return { pays: PAYS[s.net], reseau: s.net, nom: s.nom || '', cle: s.cle, echantillon,
    Nobs: +s.Nfrais.toFixed(1), p60: +(s.ponct[60] * 100).toFixed(1), p300: +(s.ponct[300] * 100).toFixed(1),
    dispersion: +(dispersion * 100).toFixed(1), famille, motif: motifs.join(' ; ') };
});

// Test anti-parfait appliqué à la SOURCE, sur l'échantillon agrégé de toutes ses
// gares. C'est le bon niveau : une source peut être disqualifiée alors qu'aucune
// de ses gares n'a individuellement assez de mouvements pour conclure.
const sourcesRejetees = {};
for (const net of new Set(st.map(s => s.net))) {
  const a = st.filter(s => s.net === net);
  const poids = a.reduce((x, s) => x + s.Nfrais * s.jours, 0);
  if (poids < SEUILS.echantillonMin) continue;
  const agg = seuil => a.reduce((x, s) => x + s.ponct[seuil] * s.Nfrais * s.jours, 0) / poids;
  const p60 = agg(60), p300 = agg(300), disp = agg(600) - p60;
  const motifs = [];
  if (p60 > SEUILS.p60Max) motifs.push(`${(p60 * 100).toFixed(1)} % des mouvements sous 60 s`);
  if (p300 >= 0.995) motifs.push('quasiment aucun retard superieur a 5 min');
  if (disp < SEUILS.dispersionMin) motifs.push(`dispersion agregee ${(disp * 100).toFixed(1)} pt`);
  if (motifs.length) sourcesRejetees[net] = motifs.join(' ; ') + ` (echantillon ${Math.round(poids)} mouvements)`;
}
for (const l of lignes) if (sourcesRejetees[l.reseau] && l.famille !== 'EXCLUE') { l.famille = 'EXCLUE'; l.motif = 'source rejetee en bloc'; }

const par = f => lignes.filter(l => l.famille === f);
console.log('=== TRI SUR CRITERES INTRINSEQUES (independants de notre collecte) ===\n');
console.log('famille'.padEnd(16) + 'gares'.padStart(7) + '  signification');
console.log('EXCLUE'.padEnd(16) + String(par('EXCLUE').length).padStart(7) + '  signal de retard absent ou artificiel, echantillon suffisant pour conclure');
console.log('QUARANTAINE'.padEnd(16) + String(par('QUARANTAINE').length).padStart(7) + '  meme symptome mais moins de 100 mouvements observes, a retester');
console.log('A_QUALIFIER'.padEnd(16) + String(par('A_QUALIFIER').length).padStart(7) + '  signal sain, verdict final sur la fenetre propre');

console.log('\n=== PAR PAYS ===');
console.log('pays'.padEnd(13) + 'exclues'.padStart(9) + 'quarantaine'.padStart(13) + 'a qualifier'.padStart(13));
for (const p of [...new Set(lignes.map(l => l.pays))]) {
  const a = lignes.filter(l => l.pays === p);
  console.log(p.padEnd(13) + String(a.filter(l => l.famille === 'EXCLUE').length).padStart(9) +
    String(a.filter(l => l.famille === 'QUARANTAINE').length).padStart(13) + String(a.filter(l => l.famille === 'A_QUALIFIER').length).padStart(13));
}
console.log('\n=== PAR RESEAU ===');
console.log('reseau'.padEnd(20) + 'exclues'.padStart(9) + 'quarantaine'.padStart(13) + 'a qualifier'.padStart(13) + '  source');
for (const net of [...new Set(lignes.map(l => l.reseau))]) {
  const a = lignes.filter(l => l.reseau === net);
  console.log(net.padEnd(20) + String(a.filter(l => l.famille === 'EXCLUE').length).padStart(9) +
    String(a.filter(l => l.famille === 'QUARANTAINE').length).padStart(13) + String(a.filter(l => l.famille === 'A_QUALIFIER').length).padStart(13) +
    (sourcesRejetees[net] ? '  REJETEE : ' + sourcesRejetees[net] : ''));
}

console.log('\n=== PLUS GROSSES GARES EXCLUES ===');
for (const l of par('EXCLUE').filter(l => l.reseau !== 'us_mbta').sort((a, b) => b.Nobs - a.Nobs).slice(0, 12))
  console.log(`  ${(l.nom || l.cle).slice(0, 30).padEnd(32)} ${l.pays.padEnd(11)} ${String(l.Nobs).padStart(6)} mvt/j : ${l.motif}`);

const exclusions = {
  genere: new Date().toISOString().slice(0, 10),
  methode: 'criteres intrinseques du handoff v3 section 3.5 : test anti-parfait et ponctualite superieure a 98 %',
  sourcesRejetees,
  garesExclues: par('EXCLUE').filter(l => !sourcesRejetees[l.reseau]).map(l => ({ reseau: l.reseau, cle: l.cle, nom: l.nom, motif: l.motif })),
  garesQuarantaine: par('QUARANTAINE').map(l => ({ reseau: l.reseau, cle: l.cle, motif: l.motif })),
};
writeFileSync(`${BASE}/src/exclusions.json`, JSON.stringify(exclusions, null, 1));
const ent = ['pays', 'reseau', 'nom', 'cle', 'Nobs', 'echantillon', 'p60', 'p300', 'dispersion', 'famille', 'motif'];
writeFileSync(`${BASE}/docs/tri-gares.csv`, ent.join(';') + '\n' + lignes.map(l => ent.map(k => String(l[k]).replace(/;/g, ',')).join(';')).join('\n') + '\n');
console.log(`\nEcrit : src/exclusions.json (${exclusions.garesExclues.length} gares + ${Object.keys(sourcesRejetees).length} source(s)) et docs/tri-gares.csv`);
