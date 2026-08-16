#!/usr/bin/env node
// ============================================================
// Chronologies de jauge · les vrais trains des 370 joueurs
//
// Le simulateur consomme, pour chaque joueur, la suite des événements qui font
// bouger sa jauge : un train à l'heure vaut +1, un train en retard -1, une
// annulation -1 aussi, décision du concepteur du 16 août.
//
// Jusqu'ici il tournait sur des chronologies projetées avant la collecte.
// Celles-ci sont les vraies, tirées de la fenêtre de qualification du 7 au
// 13 août, couverte à 100 %.
//
// Deux règles héritées de la qualification, et pour les mêmes raisons :
//   - tout se compte en journées MercatOr, de 03:00 UTC à 03:00 UTC ;
//   - un événement physique ne compte qu'une fois, la capture retenue étant
//     la plus proche de l'événement, et seuls les événements observés à moins
//     de cinq minutes sont gardés.
//
// Sortie : sim/chronologies-saison-1.json.gz
//   { debut, joueurs: { "<reseau>|<cle>": [[minute, delta], ...] } }
// La minute est comptée depuis le coup d'envoi du match.
//
// Usage : node sim/chronologies.mjs   (env NODE_OPTIONS=--max-old-space-size=6144)
// ============================================================

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../src/config.json' with { type: 'json' };
import { joindreJour } from './jointure.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEN_DEBUT = Date.parse(config.fenetre_qualification.debut_utc) / 1000;
const FEN_FIN = Date.parse(config.fenetre_qualification.fin_utc) / 1000;
const JOURS = Math.round((FEN_FIN - FEN_DEBUT) / 86400);
const SEUIL_FRAIS_S = 300;
const SEUIL_RETARD_S = config.seuil_retard_s;

// ---- Les joueurs à suivre ----
const csv = readFileSync(join(RACINE, 'docs', 'effectif-saison-1.csv'), 'utf8')
  .replace(/\r/g, '').trim().split('\n');
const col = Object.fromEntries(csv[0].split(';').map((e, i) => [e, i]));
const effectif = csv.slice(1).map(l => l.split(';'));
const suivis = new Map();     // "net|gare" -> nom du joueur
for (const c of effectif) suivis.set(c[col.reseau] + '|' + c[col.cle], c[col.nom]);
const parSource = {};
for (const c of effectif) (parSource[c[col.reseau]] ??= new Set()).add(c[col.cle]);

// La Finlande joue par gare et non par quai : même fusion qu'à la qualification.
const gareJouable = (net, gare) => net === 'fi_digitraffic' ? gare.replace(/_\d+$/, '') : gare;

const dansFenetre = evt => evt >= FEN_DEBUT && evt < FEN_FIN;
const jourCal = d => new Date((FEN_DEBUT + d * 86400) * 1000).toISOString().slice(0, 10);

// delta : +1 si le train est à l'heure, -1 s'il est en retard ou annulé.
const deltaDe = (retard, annule) => annule ? -1 : (retard <= SEUIL_RETARD_S ? 1 : -1);

const chronos = new Map();    // "net|gare" -> [[minute, delta], ...]
function noter(net, gare, evt, retard, annule) {
  const cle = net + '|' + gare;
  if (!suivis.has(cle)) return;
  (chronos.get(cle) ?? chronos.set(cle, []).get(cle))
    .push([Math.floor((evt - FEN_DEBUT) / 60), deltaDe(retard, annule)]);
}

// ---- Sources à fenêtre : ea et ed sont déjà là ----
function traiterFenetre(net) {
  const base = join(RACINE, 'data', net);
  if (!existsSync(base) || !parSource[net]) return;
  for (let d = 0; d < JOURS; d++) {
    const dossiers = [jourCal(d), jourCal(d + 1)].map(j => join(base, j)).filter(existsSync);
    const meilleurs = new Map();
    for (const dossier of dossiers) {
      for (const f of readdirSync(dossier)) {
        if (!f.endsWith('.ndjson.gz')) continue;
        for (const ligne of gunzipSync(readFileSync(join(dossier, f))).toString().split('\n')) {
          if (!ligne) continue;
          const o = JSON.parse(ligne);
          if (!parSource[net].has(gareJouable(net, o.gare))) continue;
          const evt = o.ed ?? o.ea;
          if (evt == null || !dansFenetre(evt)) continue;
          const annule = o.rel === 'CANCELED';
          const retard = o.rd ?? o.ra;
          if (retard == null && !annule) continue;
          if (o.rel === 'SKIPPED' || o.rel === 'NO_DATA') continue;
          const fraicheur = Math.abs(Date.parse(o.t) / 1000 - evt);
          const cle = `${o.gare}|${o.trip}|${o.seq ?? ''}|${Math.round(evt / 1200)}`;
          const prec = meilleurs.get(cle);
          if (!prec || fraicheur < prec[0]) meilleurs.set(cle, [fraicheur, retard ?? 0, annule, o.gare, evt]);
        }
      }
    }
    for (const [, [fraicheur, retard, annule, gare, evt]] of meilleurs) {
      if (fraicheur <= SEUIL_FRAIS_S) noter(net, gareJouable(net, gare), evt, retard, annule);
    }
  }
  process.stderr.write(`  ${net} : ${[...chronos.keys()].filter(k => k.startsWith(net + '|')).length} joueurs servis\n`);
}

// ---- Sources à retard seul : la jointure fournit l'heure ----
function traiterJointe(net) {
  const base = join(RACINE, 'data', net);
  if (!existsSync(base) || !parSource[net]) return;
  const meilleurs = new Map();
  for (const jour of readdirSync(base).sort()) {
    for (const o of joindreJour(net, jour, { seuilFraicheurS: 1e9 }).observations) {
      const gare = gareJouable(net, o.gare);
      if (!parSource[net].has(gare) || !dansFenetre(o.evt)) continue;
      const cle = `${gare}|${o.trip}|${o.seq ?? ''}|${o.sd}`;
      const prec = meilleurs.get(cle);
      if (!prec || o.fraicheur < prec[0]) {
        meilleurs.set(cle, [o.fraicheur, o.rd ?? o.ra ?? 0, o.rel === 'CANCELED', gare, o.evt]);
      }
    }
  }
  for (const [, [fraicheur, retard, annule, gare, evt]] of meilleurs) {
    if (fraicheur <= SEUIL_FRAIS_S) noter(net, gare, evt, retard, annule);
  }
  process.stderr.write(`  ${net} : ${[...chronos.keys()].filter(k => k.startsWith(net + '|')).length} joueurs servis\n`);
}

// ============================================================
process.stderr.write('Extraction des chronologies...\n');
for (const [net, src] of Object.entries(config.sources)) {
  if (src.actif === false || !parSource[net]) continue;
  if (src.horaires_gtfs) traiterJointe(net); else traiterFenetre(net);
}

for (const arr of chronos.values()) arr.sort((a, b) => a[0] - b[0]);

// ---- Contrôle ----
const manquants = [...suivis.keys()].filter(k => !chronos.has(k));
const tailles = [...chronos.values()].map(a => a.length).sort((a, b) => a - b);
const total = tailles.reduce((a, b) => a + b, 0);
console.log(`\n${chronos.size} joueurs sur ${suivis.size}, ${total} evenements sur ${JOURS} jours`);
console.log(`evenements par joueur : min ${tailles[0]}, median ${tailles[tailles.length >> 1]}, max ${tailles.at(-1)}`);
const positifs = [...chronos.values()].flat().filter(e => e[1] > 0).length;
console.log(`a l'heure ${(100 * positifs / total).toFixed(1)} %, en retard ou annules ${(100 * (total - positifs) / total).toFixed(1)} %`);
if (manquants.length) {
  console.log(`\nSANS AUCUN EVENEMENT : ${manquants.length}`);
  for (const k of manquants.slice(0, 10)) console.log('   ' + suivis.get(k) + '  (' + k + ')');
}

writeFileSync(join(RACINE, 'sim', 'chronologies-saison-1.json.gz'),
  gzipSync(JSON.stringify({ debut: config.fenetre_qualification.debut_utc, jours: JOURS,
    joueurs: Object.fromEntries(chronos) })));
console.log(`\nEcrit : sim/chronologies-saison-1.json.gz`);
