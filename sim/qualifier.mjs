#!/usr/bin/env node
// Applique les critères d'acceptation de la section 5 du handoff aux gares
// réellement collectées, et produit les listes nominatives retenues / rejetées.
// Aucune requête réseau : lecture de stations.json.gz uniquement.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const st = JSON.parse(gunzipSync(readFileSync('stations.json.gz')).toString());
const PAYS = { fr_sncf: 'France', nl_ovapi: 'Pays-Bas', de_gtfsde: 'Allemagne', us_mbta: 'Etats-Unis', us_mta_lirr: 'Etats-Unis', us_mta_mnr: 'Etats-Unis', au_translink_seq: 'Australie' };
const SEUILS = {
  volumeMin: 15,        // mouvements fraîchement observés par jour
  joursMin: 6,          // sur les 6 journées complètes
  ponctMin: 0.60,       // en dessous : jauge trop lente ou morte
  ponctMax: 0.98,       // au-dessus : joueur parfait, sans intérêt
  p60Max: 0.98,         // anti "trop parfait"
  dispersionMin: 0.02,  // p600 - p60 : distribution non dégénérée
  fraicheurMin: 0.80,   // critère différé : dépend du correctif de cadence
};

function evaluer(s) {
  const motifs = [];
  // V5 identité : un nom résolu signifie que l'identifiant est rattaché au statique
  if (!s.nom) motifs.push('identite non resolue');
  // V2 régularité
  if (s.jours < SEUILS.joursMin) motifs.push(`present ${s.jours} jours sur 6`);
  // V1 volume
  if (s.Nfrais < SEUILS.volumeMin) motifs.push(`volume observe ${s.Nfrais.toFixed(1)} < ${SEUILS.volumeMin}`);
  // V4 anti trop parfait (prioritaire sur la borne haute de ponctualité)
  const dispersion = s.ponct[600] - s.ponct[60];
  if (s.ponct[60] > SEUILS.p60Max) motifs.push(`trop parfaite : ${(s.ponct[60] * 100).toFixed(0)} % a moins de 60 s`);
  else if (s.ponct[300] >= 1) motifs.push('trop parfaite : aucun retard superieur a 5 min');
  else if (dispersion < SEUILS.dispersionMin) motifs.push(`distribution degeneree : dispersion ${(dispersion * 100).toFixed(1)} pt`);
  // V3 bande de ponctualité
  else if (s.ponct[300] < SEUILS.ponctMin) motifs.push(`ponctualite ${(s.ponct[300] * 100).toFixed(0)} % < ${SEUILS.ponctMin * 100} %`);
  else if (s.ponct[300] > SEUILS.ponctMax) motifs.push(`ponctualite ${(s.ponct[300] * 100).toFixed(0)} % > ${SEUILS.ponctMax * 100} %`);
  return motifs;
}

const lignes = st.map(s => {
  const motifs = evaluer(s);
  return {
    pays: PAYS[s.net], reseau: s.net, nom: s.nom || '', cle: s.cle,
    N: +s.N.toFixed(1), Nobs: +s.Nfrais.toFixed(1), manquant: +(s.manquant * 100).toFixed(0),
    p60: +(s.ponct[60] * 100).toFixed(1), p300: +(s.ponct[300] * 100).toFixed(1), p600: +(s.ponct[600] * 100).toFixed(1),
    dispersion: +((s.ponct[600] - s.ponct[60]) * 100).toFixed(1),
    annulJour: +s.annul.toFixed(2), arretsSupprJour: +s.skip.toFixed(2), jours: s.jours,
    verdict: motifs.length ? 'REJETEE' : 'RETENUE', motif: motifs.join(' ; '),
    fraicheurOk: s.manquant <= 1 - SEUILS.fraicheurMin,
  };
});

const retenues = lignes.filter(l => l.verdict === 'RETENUE').sort((a, b) => b.Nobs - a.Nobs);
const rejetees = lignes.filter(l => l.verdict === 'REJETEE').sort((a, b) => b.Nobs - a.Nobs);

// ---- Synthèse par pays ----
console.log('QUALIFICATION SUR LES 6 JOURNEES COMPLETES (22 au 27 juillet 2026)\n');
console.log('pays'.padEnd(13) + 'candidates'.padStart(11) + 'retenues'.padStart(10) + 'rejetees'.padStart(10) + '  premier motif de rejet');
const parPays = {};
for (const l of lignes) (parPays[l.pays] ??= []).push(l);
for (const [p, arr] of Object.entries(parPays).sort((a, b) => b[1].filter(x => x.verdict === 'RETENUE').length - a[1].filter(x => x.verdict === 'RETENUE').length)) {
  const r = arr.filter(x => x.verdict === 'RETENUE').length;
  const motifs = {};
  for (const x of arr) if (x.verdict === 'REJETEE') { const m = x.motif.split(' ; ')[0].replace(/[0-9]+[.,]?[0-9]*/g, 'N').replace(/ %.*/, ' %'); motifs[m] = (motifs[m] || 0) + 1; }
  const top = Object.entries(motifs).sort((a, b) => b[1] - a[1])[0];
  console.log(p.padEnd(13) + String(arr.length).padStart(11) + String(r).padStart(10) + String(arr.length - r).padStart(10) + `  ${top ? top[0] + ' (' + top[1] + ')' : ''}`);
}
console.log('\nTOTAL'.padEnd(13) + String(lignes.length).padStart(11) + String(retenues.length).padStart(10) + String(rejetees.length).padStart(10));

// ---- Motifs de rejet agrégés ----
console.log('\nMOTIFS DE REJET (premier motif, toutes gares) :');
const agg = {};
for (const l of rejetees) { const m = l.motif.split(' ; ')[0].replace(/[0-9]+[.,]?[0-9]*/g, 'N'); agg[m] = (agg[m] || 0) + 1; }
for (const [m, n] of Object.entries(agg).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${m}`);

// ---- Répartition par réseau ----
console.log('\nPAR RESEAU :');
console.log('reseau'.padEnd(20) + 'candidates'.padStart(11) + 'retenues'.padStart(10) + 'taux'.padStart(8));
for (const net of Object.keys(PAYS)) {
  const arr = lignes.filter(l => l.reseau === net);
  if (!arr.length) continue;
  const r = arr.filter(x => x.verdict === 'RETENUE').length;
  console.log(net.padEnd(20) + String(arr.length).padStart(11) + String(r).padStart(10) + `${(r / arr.length * 100).toFixed(0)}%`.padStart(8));
}

// ---- Statuts du mercato sur les retenues ----
console.log('\nSTATUTS DES GARES RETENUES (selon N observe) :');
const bandes = [['superstar', 200, 1e9], ['star', 100, 200], ['titulaire', 50, 100], ['rotation', 25, 50], ['petit joueur', 15, 25]];
console.log('statut'.padEnd(14) + 'total'.padStart(7) + Object.keys(parPays).map(p => p.slice(0, 9).padStart(11)).join(''));
for (const [nom, min, max] of bandes) {
  const sel = retenues.filter(l => l.Nobs >= min && l.Nobs < max);
  console.log(nom.padEnd(14) + String(sel.length).padStart(7) + Object.keys(parPays).map(p => String(sel.filter(l => l.pays === p).length).padStart(11)).join(''));
}

// ---- Top des retenues par pays ----
console.log('\nMEILLEURES GARES RETENUES PAR PAYS (N observe, ponctualite) :');
for (const [p, arr] of Object.entries(parPays)) {
  const r = arr.filter(x => x.verdict === 'RETENUE').sort((a, b) => b.Nobs - a.Nobs).slice(0, 8);
  if (!r.length) { console.log(`  ${p} : aucune`); continue; }
  console.log(`  ${p} :`);
  for (const l of r) console.log(`      ${(l.nom || l.cle).slice(0, 34).padEnd(36)} N=${String(l.N).padStart(6)} obs=${String(l.Nobs).padStart(6)} ponct300=${String(l.p300).padStart(5)}% dispersion=${String(l.dispersion).padStart(5)}pt`);
}

// ---- Cas notables de rejet ----
console.log('\nREJETS NOTABLES (grosses gares perdues) :');
for (const l of rejetees.filter(l => l.N >= 80).slice(0, 20))
  console.log(`  ${(l.nom || l.cle).slice(0, 30).padEnd(32)} ${l.pays.padEnd(11)} N=${String(l.N).padStart(6)} : ${l.motif}`);

// ---- Fraîcheur, critère différé ----
console.log('\nCRITERE DE FRAICHEUR (differe, depend du correctif de cadence) :');
console.log(`  gares retenues atteignant deja 80 % d'observations fraiches : ${retenues.filter(l => l.fraicheurOk).length} sur ${retenues.length}`);
console.log(`  part de donnees manquantes sur les retenues : mediane ${(() => { const a = retenues.map(l => l.manquant).sort((x, y) => x - y); return a[a.length >> 1]; })()} %`);

// ---- Fichiers ----
const entetes = ['pays', 'reseau', 'nom', 'cle', 'N', 'Nobs', 'manquant', 'p60', 'p300', 'p600', 'dispersion', 'annulJour', 'arretsSupprJour', 'jours', 'verdict', 'motif'];
const csv = arr => entetes.join(';') + '\n' + arr.map(l => entetes.map(k => String(l[k] ?? '').replace(/;/g, ',')).join(';')).join('\n') + '\n';
writeFileSync('mercator/docs/catalogue-retenus.csv', csv(retenues));
writeFileSync('mercator/docs/catalogue-rejetes.csv', csv(rejetees));
console.log(`\nEcrit : docs/catalogue-retenus.csv (${retenues.length}) et docs/catalogue-rejetes.csv (${rejetees.length})`);
