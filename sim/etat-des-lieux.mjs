#!/usr/bin/env node
// État des lieux des données : qualité, cohérence et régularité gare par gare.
// Applique les critères de la section 3.5 du handoff v3, plus deux critères de
// régularité ajoutés à la demande du concepteur (« données cohérentes et
// régulières »). Aucune requête réseau.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const BASE = process.argv[2] || '..';
const st = JSON.parse(gunzipSync(readFileSync(`${BASE}/../stations.json.gz`)).toString());
const JOURS = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];
const WEEKEND = new Set(['2026-07-25', '2026-07-26']);
const PAYS = { fr_sncf: 'France', nl_ovapi: 'Pays-Bas', de_gtfsde: 'Allemagne', us_mbta: 'Etats-Unis', us_mta_lirr: 'Etats-Unis', us_mta_mnr: 'Etats-Unis', au_translink_seq: 'Australie' };

const SEUILS = {
  volumeMin: 15,          // mouvements observables par jour
  joursMin: 6,            // sur les 6 journées complètes disponibles
  ponctMax: 0.98,         // au-delà : joueur parfait
  p60Max: 0.98,           // anti « trop parfait »
  dispersionMin: 0.02,    // p600 - p60
  cvVolumeMax: 0.35,      // régularité du volume quotidien
  amplitudePonctMax: 0.60,// écart max entre le meilleur et le pire jour de ponctualité
  fraicheurMin: 0.80,     // critère différé tant que la collecte n'est pas corrigée
};

const moy = a => a.reduce((x, y) => x + y, 0) / a.length;
const ecart = a => { const m = moy(a); return Math.sqrt(moy(a.map(x => (x - m) ** 2))); };
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// ---- Couverture de collecte par journée MercatOr et par heure ----
// Indispensable : le volume observé d'une gare varie d'abord parce que NOTRE
// collecte a des trous, pas parce que la gare est irrégulière. On normalise donc
// le volume quotidien par la couverture réellement obtenue sur les heures où
// cette gare circule.
const CYCLES_PAR_HEURE = 12;
const couverture = {};   // jourMercatOr -> [24] fraction de créneaux couverts
try {
  const runs = readFileSync(`${BASE}/logs/runs.ndjson`, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.type === 'run');
  for (const r of runs) for (const c of r.detailCycles || []) {
    const t = Date.parse(c.t) / 1000;
    const jour = new Date((t - 3 * 3600) * 1000).toISOString().slice(0, 10);
    const heure = Math.floor((((t - 3 * 3600) % 86400) + 86400) % 86400 / 3600);
    (couverture[jour] ??= new Array(24).fill(0))[heure]++;
  }
  for (const j of Object.keys(couverture)) couverture[j] = couverture[j].map(n => Math.min(1, n / CYCLES_PAR_HEURE));
} catch { console.error('logs/runs.ndjson introuvable : normalisation desactivee'); }

// Couverture pondérée par le profil horaire de la gare
function couverturePonderee(profilHeures, jour) {
  const cov = couverture[jour];
  if (!cov) return null;
  const total = profilHeures.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return profilHeures.reduce((acc, poids, h) => acc + poids * cov[h], 0) / total;
}

const lignes = st.map(s => {
  const jours = JOURS.filter(j => s.parJour[j]);
  const n = jours.map(j => s.parJour[j].n);
  const p = jours.map(j => s.parJour[j].p300);
  const cvBrut = n.length > 1 && moy(n) > 0 ? ecart(n) / moy(n) : 9;
  // Volume corrigé de la couverture de collecte du jour, sur les heures où la gare circule
  const nCorrige = jours.map(j => {
    const c = couverturePonderee(s.heures, j);
    return c && c > 0.05 ? s.parJour[j].n / c : null;
  }).filter(x => x != null);
  const cvVolume = nCorrige.length > 1 && moy(nCorrige) > 0 ? ecart(nCorrige) / moy(nCorrige) : cvBrut;
  const amplitudePonct = p.length > 1 ? Math.max(...p) - Math.min(...p) : 9;
  // Effet week-end mesuré séparément pour ne pas le confondre avec de l'irrégularité
  const nSem = jours.filter(j => !WEEKEND.has(j)).map(j => s.parJour[j].n);
  const nWe = jours.filter(j => WEEKEND.has(j)).map(j => s.parJour[j].n);
  const effetWeekend = nSem.length && nWe.length ? moy(nWe) / moy(nSem) : null;

  const motifs = [];
  if (!s.nom) motifs.push('identite non resolue');
  if (jours.length < SEUILS.joursMin) motifs.push(`presente ${jours.length}/6 jours`);
  if (s.Nfrais < SEUILS.volumeMin) motifs.push(`volume observable ${s.Nfrais.toFixed(1)} < ${SEUILS.volumeMin}`);
  const dispersion = s.ponct[600] - s.ponct[60];
  if (s.ponct[60] > SEUILS.p60Max) motifs.push(`trop parfaite (${(s.ponct[60] * 100).toFixed(0)} % sous 60 s)`);
  else if (s.ponct[300] >= 1) motifs.push('trop parfaite (aucun retard > 5 min)');
  else if (dispersion < SEUILS.dispersionMin) motifs.push(`distribution degeneree (${(dispersion * 100).toFixed(1)} pt)`);
  else if (s.ponct[300] > SEUILS.ponctMax) motifs.push(`ponctualite ${(s.ponct[300] * 100).toFixed(1)} % > 98 %`);
  if (cvVolume > SEUILS.cvVolumeMax) motifs.push(`volume irregulier (CV ${cvVolume.toFixed(2)})`);
  if (amplitudePonct > SEUILS.amplitudePonctMax) motifs.push(`ponctualite erratique (amplitude ${(amplitudePonct * 100).toFixed(0)} pt)`);

  return {
    pays: PAYS[s.net], reseau: s.net, nom: s.nom || '', cle: s.cle,
    N: +s.N.toFixed(1), Nobs: +s.Nfrais.toFixed(1), fraicheur: +((1 - s.manquant) * 100).toFixed(0),
    p60: +(s.ponct[60] * 100).toFixed(1), p300: +(s.ponct[300] * 100).toFixed(1), p600: +(s.ponct[600] * 100).toFixed(1),
    dispersion: +(dispersion * 100).toFixed(1), cvVolume: +cvVolume.toFixed(2), cvBrut: +cvBrut.toFixed(2), amplitudePonct: +(amplitudePonct * 100).toFixed(0),
    effetWeekend: effetWeekend != null ? +(effetWeekend * 100).toFixed(0) : '', jours: jours.length,
    annulJour: +s.annul.toFixed(2), supprJour: +s.skip.toFixed(2),
    verdict: motifs.length ? 'REJETEE' : 'RETENUE', motif: motifs.join(' ; '),
    fraicheurOk: (1 - s.manquant) >= SEUILS.fraicheurMin,
  };
});

const retenues = lignes.filter(l => l.verdict === 'RETENUE').sort((a, b) => b.Nobs - a.Nobs);
const rejetees = lignes.filter(l => l.verdict === 'REJETEE').sort((a, b) => b.Nobs - a.Nobs);

console.log('=== DISTRIBUTIONS OBSERVEES (pour justifier les seuils) ===');
const cvs = lignes.map(l => l.cvVolume).filter(x => x < 9).sort((a, b) => a - b);
console.log(`Regularite du volume, coefficient de variation : p25 ${cvs[Math.floor(cvs.length * .25)].toFixed(2)} | mediane ${med(cvs).toFixed(2)} | p75 ${cvs[Math.floor(cvs.length * .75)].toFixed(2)} | p90 ${cvs[Math.floor(cvs.length * .9)].toFixed(2)}`);
const amps = lignes.map(l => l.amplitudePonct).filter(x => x < 900).sort((a, b) => a - b);
console.log(`Amplitude de ponctualite entre le meilleur et le pire jour : mediane ${med(amps)} pt | p75 ${amps[Math.floor(amps.length * .75)]} pt | p90 ${amps[Math.floor(amps.length * .9)]} pt`);
const we = lignes.map(l => l.effetWeekend).filter(x => typeof x === 'number').sort((a, b) => a - b);
console.log(`Effet week-end (volume week-end / volume semaine) : mediane ${med(we)} %`);

console.log('\n=== VERDICTS PAR PAYS ===');
console.log('pays'.padEnd(13) + 'candidates'.padStart(11) + 'retenues'.padStart(10) + 'taux'.padStart(7) + '  motif de rejet dominant');
const parPays = {};
for (const l of lignes) (parPays[l.pays] ??= []).push(l);
for (const [p, arr] of Object.entries(parPays).sort((a, b) => b[1].filter(x => x.verdict === 'RETENUE').length - a[1].filter(x => x.verdict === 'RETENUE').length)) {
  const r = arr.filter(x => x.verdict === 'RETENUE').length;
  const m = {};
  for (const x of arr) if (x.verdict === 'REJETEE') { const k = x.motif.split(' ; ')[0].replace(/[\d.,]+/g, 'N'); m[k] = (m[k] || 0) + 1; }
  const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  console.log(p.padEnd(13) + String(arr.length).padStart(11) + String(r).padStart(10) + `${(r / arr.length * 100).toFixed(0)}%`.padStart(7) + `  ${top ? top[0] + ' (' + top[1] + ')' : '-'}`);
}
console.log('TOTAL'.padEnd(13) + String(lignes.length).padStart(11) + String(retenues.length).padStart(10) + `${(retenues.length / lignes.length * 100).toFixed(0)}%`.padStart(7));

console.log('\n=== MOTIFS DE REJET, TOUS CUMULES (une gare peut en cumuler plusieurs) ===');
const agg = {};
for (const l of rejetees) for (const m of l.motif.split(' ; ')) { const k = m.replace(/[\d.,]+/g, 'N'); agg[k] = (agg[k] || 0) + 1; }
for (const [m, n] of Object.entries(agg).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${m}`);

console.log('\n=== EFFET DE CHAQUE CRITERE PRIS ISOLEMENT ===');
const tests = {
  'identite resolue': l => l.nom !== '',
  'presente 6/6 jours': l => l.jours >= 6,
  'volume >= 15/jour': l => l.Nobs >= SEUILS.volumeMin,
  'pas trop parfaite': l => l.p60 <= 98 && l.p300 < 100 && l.dispersion >= 2,
  'ponctualite <= 98 %': l => l.p300 <= 98,
  'volume regulier': l => l.cvVolume <= SEUILS.cvVolumeMax,
  'ponctualite stable': l => l.amplitudePonct <= SEUILS.amplitudePonctMax * 100,
  'fraicheur >= 80 % (differe)': l => l.fraicheurOk,
};
for (const [nom, f] of Object.entries(tests)) console.log(`  ${nom.padEnd(30)} : ${String(lignes.filter(f).length).padStart(5)} gares sur ${lignes.length}`);

console.log('\n=== GARES RETENUES : PROFIL ===');
console.log('statut'.padEnd(14) + 'total'.padStart(7) + Object.keys(parPays).map(p => p.slice(0, 9).padStart(11)).join(''));
for (const [nom, min, max] of [['superstar', 200, 1e9], ['star', 100, 200], ['titulaire', 50, 100], ['rotation', 25, 50], ['petit', 15, 25]]) {
  const sel = retenues.filter(l => l.Nobs >= min && l.Nobs < max);
  console.log(nom.padEnd(14) + String(sel.length).padStart(7) + Object.keys(parPays).map(p => String(sel.filter(l => l.pays === p).length).padStart(11)).join(''));
}
if (retenues.length) {
  console.log(`\nPonctualite des retenues : p10 ${[...retenues].sort((a, b) => a.p300 - b.p300)[Math.floor(retenues.length * .1)].p300} % | mediane ${med(retenues.map(l => l.p300))} % | p90 ${[...retenues].sort((a, b) => a.p300 - b.p300)[Math.floor(retenues.length * .9)].p300} %`);
  console.log(`Fraicheur des retenues : mediane ${med(retenues.map(l => l.fraicheur))} % (cible 80 %, atteinte par ${retenues.filter(l => l.fraicheurOk).length} gares)`);
  console.log('\n=== TOP 15 DES GARES RETENUES ===');
  console.log('gare'.padEnd(30) + 'pays'.padEnd(12) + 'N obs'.padStart(7) + 'ponct'.padStart(7) + 'CV vol'.padStart(8) + 'fraich.'.padStart(8));
  for (const l of retenues.slice(0, 15)) console.log((l.nom || l.cle).slice(0, 28).padEnd(30) + l.pays.padEnd(12) + String(l.Nobs).padStart(7) + `${l.p300}%`.padStart(7) + String(l.cvVolume).padStart(8) + `${l.fraicheur}%`.padStart(8));
}
console.log('\n=== REJETS NOTABLES (grandes gares perdues) ===');
for (const l of rejetees.filter(l => l.N >= 100).slice(0, 15)) console.log(`  ${(l.nom || l.cle).slice(0, 28).padEnd(30)} ${l.pays.padEnd(12)} N=${String(l.N).padStart(6)} : ${l.motif}`);

const entetes = ['pays', 'reseau', 'nom', 'cle', 'N', 'Nobs', 'fraicheur', 'p60', 'p300', 'p600', 'dispersion', 'cvVolume', 'cvBrut', 'amplitudePonct', 'effetWeekend', 'jours', 'annulJour', 'supprJour', 'verdict', 'motif'];
const csv = arr => entetes.join(';') + '\n' + arr.map(l => entetes.map(k => String(l[k] ?? '').replace(/;/g, ',')).join(';')).join('\n') + '\n';
writeFileSync(`${BASE}/docs/etat-donnees-retenues.csv`, csv(retenues));
writeFileSync(`${BASE}/docs/etat-donnees-rejetees.csv`, csv(rejetees));
console.log(`\nEcrit : docs/etat-donnees-retenues.csv (${retenues.length}) et docs/etat-donnees-rejetees.csv (${rejetees.length})`);
