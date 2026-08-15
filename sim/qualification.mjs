#!/usr/bin/env node
// ============================================================
// Qualification officielle · fenêtre du 7 au 13 août 2026
//
// Transforme les observations de la fenêtre en catalogue nominatif de
// joueurs, en appliquant mécaniquement les critères actés (mémoire, partie 3) :
//
//   volume        15 mouvements observables par jour en moyenne
//   régularité    présente les 7 journées MercatOr sur 7
//   fraîcheur     80 % des événements observés à moins de 5 minutes
//   ponctualité   au plus 98 %, au-delà le joueur est parfait donc suspect
//   identité      résolue (rattachée au statique ou à un code stable)
//   distribution  test anti-parfait, appliqué APRÈS le filtre de fraîcheur
//
// Pas de plancher de ponctualité : les gares faibles restent jouables,
// décision actée. Deux règles de méthode issues des mesures d'août :
//
//   - tout est compté en JOURNÉES MERCATOR, de 03:00 UTC à 03:00 UTC
//     (05:00-05:00 Paris), jamais en jours calendaires : les trains de nuit
//     appartiennent à la journée qui les a vus partir ;
//   - un événement physique n'est compté qu'UNE fois : les flux republient le
//     même arrêt sur plusieurs créneaux, on garde l'observation dont la
//     capture est la plus proche de l'événement, et c'est cet écart qui est
//     la fraîcheur.
//
// Sorties : docs/catalogue-retenus.csv, docs/catalogue-rejetes.csv,
// et la synthèse sur la sortie standard (sert à bâtir catalogue-joueurs.md).
//
// Usage : node sim/qualification.mjs   (env NODE_OPTIONS=--max-old-space-size=6144)
// ============================================================

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../src/config.json' with { type: 'json' };
import { joindreJour } from './jointure.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEN_DEBUT = Date.parse(config.fenetre_qualification.debut_utc) / 1000;
const FEN_FIN = Date.parse(config.fenetre_qualification.fin_utc) / 1000;
const JOURS = Math.round((FEN_FIN - FEN_DEBUT) / 86400);
const CRIT = config.fenetre_qualification.criteres;
const SEUIL_FRAIS_S = 300;
const SEUIL_RETARD_S = config.seuil_retard_s;

const PAYS = Object.fromEntries(Object.entries(config.sources).map(([n, s]) => [n, s.pays]));
PAYS.fr_idfm = 'France IdF';   // jugée à part : cadence réduite et quota, profil incomparable au réseau national

// Le joueur est la GARE, jamais le quai. La Finlande identifie ses arrêts par
// code de gare suivi du numéro de voie (KTI_1, KTI_2...) : sans fusion, chaque
// voie devient un pseudo-joueur et le volume de la gare s'émiette sous le
// seuil. La fusion se fait ici, à l'analyse : les données collectées gardent
// le quai, qui reste une information vraie.
function gareJouable(net, gare) {
  if (net === 'fi_digitraffic') return gare.replace(/_\d+$/, '');
  return gare;
}

// ---- Noms lisibles ----
// L'identité SNCF est un code UIC : la table d'arrêts datée permet de lui
// rendre son nom. Les identités « statique » (DE, NL, US, AU, IE, NO)
// embarquent déjà le nom. Finlande et Île-de-France restent des codes.
function chargerNomsSncf() {
  const chemin = join(RACINE, 'state', 'refdata', 'fr_sncf_stops.json.gz');
  if (!existsSync(chemin)) return {};
  const arrets = JSON.parse(gunzipSync(readFileSync(chemin)).toString()).arrets || {};
  const noms = {};
  for (const [id, a] of Object.entries(arrets)) {
    const m = id.match(/(\d{7,8})/);
    if (m && a[0] && !noms['UIC' + m[1]]) noms['UIC' + m[1]] = a[0];
  }
  return noms;
}
const NOMS_SNCF = chargerNomsSncf();
function nomLisible(net, gare) {
  if (net === 'fr_sncf') return NOMS_SNCF[gare] || '';
  const arobase = gare.indexOf('@');
  if (arobase > 0) return gare.slice(0, arobase);
  return '';
}
function identiteResolue(net, gare) {
  const src = config.sources[net];
  if (src.identite === 'uic') return /^UIC\d{7,8}$/.test(gare);
  if (src.identite === 'statique') return gare.includes('@') || gare.startsWith('N');
  return true;   // codes bruts stables : Finlande, Île-de-France
}

// ---- Accumulateurs par gare ----
const gares = new Map();   // net|gare -> stats
function acc(net, gare) {
  const cle = net + '|' + gare;
  let g = gares.get(cle);
  if (!g) gares.set(cle, g = {
    net, gare, joursFrais: new Array(JOURS).fill(0), joursTous: new Array(JOURS).fill(0),
    tous: 0, frais: 0, zero: 0, sous60: 0, sup300: 0, annules: 0,
    distincts: new Set(),
  });
  return g;
}
function foldEvenement(net, gare, jourIdx, retard, fraicheur, annule) {
  const g = acc(net, gare);
  if (annule) { g.annules++; return; }
  g.tous++; g.joursTous[jourIdx]++;
  if (fraicheur <= SEUIL_FRAIS_S) {
    g.frais++; g.joursFrais[jourIdx]++;
    if (retard === 0) g.zero++;
    if (Math.abs(retard) < 60) g.sous60++;
    if (retard > SEUIL_RETARD_S) g.sup300++;
    if (g.distincts.size < 2000) g.distincts.add(retard);
  }
}

const jourIdxDe = evt => Math.floor((evt - FEN_DEBUT) / 86400);
const dansFenetre = evt => evt >= FEN_DEBUT && evt < FEN_FIN;
const jourCal = d => new Date((FEN_DEBUT + d * 86400) * 1000).toISOString().slice(0, 10);

// ---- Sources à fenêtre : ea/ed déjà présents, déduplication par événement ----
function traiterSourceFenetre(net) {
  const base = join(RACINE, 'data', net);
  if (!existsSync(base)) return;
  for (let d = 0; d < JOURS; d++) {
    // Les captures d'une journée MercatOr vivent dans deux dossiers calendaires.
    const dossiers = [jourCal(d), jourCal(d + 1)].map(j => join(base, j)).filter(existsSync);
    const meilleurs = new Map();   // gare|trip|seq|~20min -> [fraicheur, retard, annule]
    for (const dossier of dossiers) {
      for (const f of readdirSync(dossier)) {
        if (!f.endsWith('.ndjson.gz')) continue;
        for (const ligne of gunzipSync(readFileSync(join(dossier, f))).toString().split('\n')) {
          if (!ligne) continue;
          const o = JSON.parse(ligne);
          const evt = o.ed ?? o.ea;
          if (evt == null || !dansFenetre(evt) || jourIdxDe(evt) !== d) continue;
          const annule = o.rel === 'CANCELED';
          const retard = o.rd ?? o.ra;
          if (retard == null && !annule) continue;
          if (o.rel === 'SKIPPED' || o.rel === 'NO_DATA') continue;
          const capture = Date.parse(o.t) / 1000;
          const fraicheur = Math.abs(capture - evt);
          const gare = gareJouable(net, o.gare);
          const cle = `${gare}|${o.trip}|${o.seq ?? ''}|${Math.round(evt / 1200)}`;
          const prec = meilleurs.get(cle);
          if (!prec || fraicheur < prec[0]) meilleurs.set(cle, [fraicheur, retard, annule, gare]);
        }
      }
    }
    for (const [, [fraicheur, retard, annule, gare]] of meilleurs) {
      foldEvenement(net, gare, d, retard, fraicheur, annule);
    }
    process.stderr.write(`  ${net} jour ${d + 1}/${JOURS} : ${meilleurs.size} evenements\n`);
  }
}

// ---- Sources à retard seul : la jointure fournit evt et fraîcheur ----
function traiterSourceJointe(net) {
  const base = join(RACINE, 'data', net);
  if (!existsSync(base)) return;
  // La déduplication de la jointure est par dossier calendaire : on refait une
  // passe par (gare, trajet, arrêt, jour de service) au niveau de la fenêtre.
  const meilleurs = new Map();
  for (const jour of readdirSync(base).sort()) {
    const r = joindreJour(net, jour, { seuilFraicheurS: 1e9 });
    for (const o of r.observations) {
      if (!dansFenetre(o.evt)) continue;
      const gare = gareJouable(net, o.gare);
      const cle = `${gare}|${o.trip}|${o.seq ?? ''}|${o.sd}`;
      const prec = meilleurs.get(cle);
      if (!prec || o.fraicheur < prec[0]) {
        meilleurs.set(cle, [o.fraicheur, o.rd ?? o.ra, o.rel === 'CANCELED', gare, o.evt]);
      }
    }
  }
  for (const [, [fraicheur, retard, annule, gare, evt]] of meilleurs) {
    foldEvenement(net, gare, jourIdxDe(evt), retard, fraicheur, annule);
  }
  process.stderr.write(`  ${net} : ${meilleurs.size} evenements sur la fenetre\n`);
}

// ============================================================
process.stderr.write('Extraction...\n');
for (const [net, src] of Object.entries(config.sources)) {
  if (src.actif === false) continue;
  if (net === 'us_mbta') continue;
  if (src.horaires_gtfs) traiterSourceJointe(net);
  else traiterSourceFenetre(net);
}

// ---- Test anti-parfait au niveau de la source ----
// C'est ainsi que MBTA a été confondu : aucune gare n'avait assez de
// mouvements individuellement, l'agrégat était sans appel.
const parSource = {};
for (const g of gares.values()) {
  const s = (parSource[g.net] ??= { frais: 0, zero: 0, sous60: 0, sup300: 0, distincts: new Set() });
  s.frais += g.frais; s.zero += g.zero; s.sous60 += g.sous60; s.sup300 += g.sup300;
  if (s.distincts.size < 5000) for (const v of g.distincts) s.distincts.add(v);
}
function antiParfait(s) {
  if (s.frais < 100) return ['echantillon insuffisant'];
  const alertes = [];
  if (s.zero / s.frais > 0.9) alertes.push(`${(100 * s.zero / s.frais).toFixed(0)} % de retards exactement nuls`);
  if (s.sous60 / s.frais > 0.98) alertes.push(`${(100 * s.sous60 / s.frais).toFixed(0)} % sous une minute`);
  if (s.distincts.size < 5) alertes.push(`${s.distincts.size} valeurs distinctes`);
  if (s.sup300 === 0) alertes.push('aucun retard superieur a 5 minutes');
  return alertes;
}

// ---- Évaluation par gare ----
const STATUTS = [
  ['superstar', 200, 1e9, 3], ['star', 100, 200, 2.5], ['titulaire', 50, 100, 2],
  ['rotation', 25, 50, 1.5], ['petit joueur', 15, 25, 1],
];
const lignes = [];
for (const g of gares.values()) {
  const Nfrais = g.frais / JOURS;
  const joursPresents = g.joursFrais.filter(n => n > 0).length;
  const fraicheur = g.tous ? g.frais / g.tous : 0;
  const ponct = g.frais ? 1 - g.sup300 / g.frais : 0;
  const motifs = [];
  if (!identiteResolue(g.net, g.gare)) motifs.push('identite non resolue');
  if (joursPresents < CRIT.jours_requis) motifs.push(`presente ${joursPresents} jours sur ${CRIT.jours_requis}`);
  if (Nfrais < CRIT.mouvements_min_par_jour) motifs.push(`volume ${Nfrais.toFixed(1)} < ${CRIT.mouvements_min_par_jour}/jour`);
  if (fraicheur < CRIT.fraicheur_min) motifs.push(`fraicheur ${(100 * fraicheur).toFixed(0)} % < ${100 * CRIT.fraicheur_min} %`);
  if (g.frais >= 100) {
    const alertes = antiParfait(g);
    if (alertes.length && alertes[0] !== 'echantillon insuffisant') motifs.push('anti-parfait : ' + alertes.join(', '));
    else if (ponct > CRIT.ponctualite_max) motifs.push(`ponctualite ${(100 * ponct).toFixed(1)} % > ${100 * CRIT.ponctualite_max} %`);
  } else if (ponct > CRIT.ponctualite_max && Nfrais >= CRIT.mouvements_min_par_jour) {
    motifs.push(`ponctualite ${(100 * ponct).toFixed(1)} % > ${100 * CRIT.ponctualite_max} %`);
  }
  const statut = motifs.length ? null : STATUTS.find(([, min, max]) => Nfrais >= min && Nfrais < max);
  lignes.push({
    pays: PAYS[g.net], reseau: g.net, gare: g.gare, nom: nomLisible(g.net, g.gare),
    N: +Nfrais.toFixed(1),
    ponctualite: +(100 * ponct).toFixed(1), fraicheur: +(100 * fraicheur).toFixed(1),
    distincts: g.distincts.size, annulesJour: +(g.annules / JOURS).toFixed(2),
    jours: joursPresents,
    statut: statut ? statut[0] : '',
    K: statut ? Math.ceil(0.8 * Nfrais / statut[3]) : '',
    verdict: motifs.length ? 'REJETEE' : 'RETENUE', motif: motifs.join(' ; '),
  });
}

const retenues = lignes.filter(l => l.verdict === 'RETENUE').sort((a, b) => b.N - a.N);
const rejetees = lignes.filter(l => l.verdict === 'REJETEE').sort((a, b) => b.N - a.N);

// ---- Synthèse ----
console.log(`QUALIFICATION · fenetre du ${config.fenetre_qualification.debut_utc} au ${config.fenetre_qualification.fin_utc}`);
console.log(`${gares.size} gares observees, ${retenues.length} retenues, ${rejetees.length} rejetees\n`);

console.log('TEST ANTI-PARFAIT PAR SOURCE (sur evenements frais) :');
for (const [net, s] of Object.entries(parSource)) {
  const a = antiParfait(s);
  console.log(`  ${net.padEnd(18)} ${String(s.frais).padStart(8)} evts frais  ${a.length ? 'ALERTE : ' + a.join(' ; ') : 'passe'}`);
}

console.log('\nPAR PAYS :');
console.log('pays'.padEnd(12) + 'observees'.padStart(10) + 'retenues'.padStart(9) + 'rejetees'.padStart(9) + '  premier motif de rejet');
const parPays = {};
for (const l of lignes) (parPays[l.pays] ??= []).push(l);
for (const [p, arr] of Object.entries(parPays).sort((a, b) => b[1].filter(x => x.verdict === 'RETENUE').length - a[1].filter(x => x.verdict === 'RETENUE').length)) {
  const r = arr.filter(x => x.verdict === 'RETENUE').length;
  const motifs = {};
  for (const x of arr) if (x.motif) { const m = x.motif.split(' ; ')[0].replace(/[0-9]+[.,]?[0-9]*/g, 'N'); motifs[m] = (motifs[m] || 0) + 1; }
  const top = Object.entries(motifs).sort((a, b) => b[1] - a[1])[0];
  console.log(p.padEnd(12) + String(arr.length).padStart(10) + String(r).padStart(9) + String(arr.length - r).padStart(9) + `  ${top ? top[0] + ' (' + top[1] + ')' : ''}`);
}

console.log('\nSTATUTS DES RETENUES :');
console.log('statut'.padEnd(14) + 'total'.padStart(6) + '  A/jour  et repartition par pays');
for (const [nom, min, max, A] of STATUTS) {
  const sel = retenues.filter(l => l.N >= min && l.N < max);
  const parP = {};
  for (const l of sel) parP[l.pays] = (parP[l.pays] || 0) + 1;
  const detail = Object.entries(parP).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(', ');
  console.log(nom.padEnd(14) + String(sel.length).padStart(6) + `   ${String(A).padStart(4)}   ${detail}`);
}

console.log('\nMEILLEURES RETENUES PAR PAYS :');
for (const [p, arr] of Object.entries(parPays)) {
  const r = arr.filter(x => x.verdict === 'RETENUE').slice(0, 5);
  if (!r.length) { console.log(`  ${p} : AUCUNE RETENUE`); continue; }
  console.log(`  ${p} :`);
  for (const l of r.sort((a, b) => b.N - a.N)) {
    console.log(`    ${(l.nom || l.gare).slice(0, 36).padEnd(38)} N=${String(l.N).padStart(6)}  ponct ${String(l.ponctualite).padStart(5)} %  fraicheur ${String(l.fraicheur).padStart(5)} %  ${l.statut} K=${l.K}`);
  }
}

console.log('\nREJETS NOTABLES (plus grosses gares perdues) :');
for (const l of rejetees.slice(0, 15)) {
  console.log(`  ${(l.nom || l.gare).slice(0, 32).padEnd(34)} ${l.pays.padEnd(11)} N=${String(l.N).padStart(6)} : ${l.motif}`);
}

console.log('\nMOTIFS DE REJET (premier motif) :');
const agg = {};
for (const l of rejetees) { const m = l.motif.split(' ; ')[0].replace(/[0-9]+[.,]?[0-9]*/g, 'N'); agg[m] = (agg[m] || 0) + 1; }
for (const [m, n] of Object.entries(agg).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${m}`);

// ---- Fichiers ----
const entetes = ['pays', 'reseau', 'gare', 'nom', 'N', 'ponctualite', 'fraicheur', 'distincts', 'annulesJour', 'jours', 'statut', 'K', 'verdict', 'motif'];
const csv = arr => entetes.join(';') + '\n' + arr.map(l => entetes.map(k => String(l[k] ?? '').replace(/;/g, ',')).join(';')).join('\n') + '\n';
writeFileSync(join(RACINE, 'docs', 'catalogue-retenus.csv'), csv(retenues));
writeFileSync(join(RACINE, 'docs', 'catalogue-rejetes.csv'), csv(rejetees));
console.log(`\nEcrit : docs/catalogue-retenus.csv (${retenues.length}) et docs/catalogue-rejetes.csv (${rejetees.length})`);
