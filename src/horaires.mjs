#!/usr/bin/env node
// ============================================================
// Tables d'horaires théoriques · POC MercatOr
//
// Trois sources ne publient que le retard, sans heure absolue : la Norvège,
// la Finlande et l'Irlande. Leur heure d'événement se reconstitue par
//
//     heure réelle = horaire théorique + retard
//
// ce qui suppose de disposer de l'horaire théorique de chaque arrêt, donc de
// stop_times.txt du GTFS statique. C'est ce que ce script construit.
//
// Sortie : state/horaires/<source>_<jour>.json.gz
//   { fuseau, builtAt, trajets: { "<trip_id>": [seq, arr, dep, seq, arr, dep, ...] } }
// où arr et dep sont des secondes depuis minuit du jour de service, valeur -1
// si l'horaire est absent. Le format plat divise par trois la taille du JSON.
//
// La table est DATÉE, comme les tables d'arrêts : Entur et la NTA régénèrent
// leurs trip_id à chaque version du statique. Sans archive datée, l'horaire
// des jours passés serait irrécupérable et la jointure échouerait rétroactivement,
// exactement comme gtfs.de a fait tomber l'Allemagne à 35 gares.
//
// À exécuter une fois par jour, avant la collecte du jour, via refdata.yml.
//
// Usage : node src/horaires.mjs [source ...]   (défaut : toutes celles à horaires_gtfs)
// ============================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import config from './config.json' with { type: 'json' };

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'state', 'horaires');
const RAIL = new Set(config.rail_route_types);

// Parseur CSV minimal avec guillemets, identique à celui de refdata.mjs.
function* lignesCsv(texte) {
  const lignes = texte.split(/\r?\n/);
  const entete = decouper(lignes[0].replace(/^﻿/, ''));
  for (let i = 1; i < lignes.length; i++) {
    if (!lignes[i]) continue;
    const champs = decouper(lignes[i]);
    const obj = {};
    for (let j = 0; j < entete.length; j++) obj[entete[j]] = champs[j] ?? '';
    yield obj;
  }
}
function decouper(ligne) {
  const resultat = [];
  let champ = '', entreGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (entreGuillemets) {
      if (c === '"' && ligne[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') entreGuillemets = false;
      else champ += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === ',') { resultat.push(champ); champ = ''; }
    else champ += c;
  }
  resultat.push(champ);
  return resultat;
}

// "HH:MM:SS" en secondes depuis minuit. GTFS autorise au-delà de 24:00:00 pour
// les services qui débordent sur le lendemain : la valeur reste relative au
// jour de service, ce qui est exactement ce dont la jointure a besoin.
function enSecondes(hms) {
  if (!hms) return -1;
  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(hms.trim());
  if (!m) return -1;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function telecharger(url) {
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), 1500000);
  try {
    const rep = await fetch(url, {
      signal: controle.signal,
      headers: { 'User-Agent': config.user_agent, 'Digitraffic-User': 'Blinytz/MercatOr-POC' },
    });
    if (rep.status !== 200) throw new Error(`HTTP ${rep.status} sur ${url}`);
    return Buffer.from(await rep.arrayBuffer());
  } finally {
    clearTimeout(minuteur);
  }
}

async function construire(nom, source) {
  const urls = Array.isArray(source.horaires_gtfs) ? source.horaires_gtfs : [source.horaires_gtfs];
  const trajets = {};
  const arrets = {};
  let fuseau = null;
  const stats = { routesRail: 0, routesTotal: 0, tripsRail: 0, tripsTotal: 0, arretsRetenus: 0, arretsIgnores: 0 };

  for (const url of urls) {
    console.log(`[${nom}] téléchargement ${url}`);
    const zip = new AdmZip(await telecharger(url));
    const lire = n => {
      const e = zip.getEntries().find(x => x.entryName.endsWith(n));
      if (!e) throw new Error(`${n} absent du zip`);
      return e.getData().toString('utf8');
    };

    // Fuseau déclaré par l'agence : indispensable, un horaire GTFS est local.
    if (!fuseau) {
      for (const a of lignesCsv(lire('agency.txt'))) {
        if (a.agency_timezone) { fuseau = a.agency_timezone; break; }
      }
    }

    // Restriction au ferroviaire : inutile de porter les horaires des autobus.
    const routesRail = new Set();
    for (const r of lignesCsv(lire('routes.txt'))) {
      stats.routesTotal++;
      if (RAIL.has(Number(r.route_type))) routesRail.add(r.route_id);
    }
    stats.routesRail += routesRail.size;

    const tripsRail = new Set();
    for (const t of lignesCsv(lire('trips.txt'))) {
      stats.tripsTotal++;
      if (routesRail.has(t.route_id)) tripsRail.add(t.trip_id);
    }
    stats.tripsRail += tripsRail.size;

    // Les sources sans statique de filtrage n'ont pas de table d'arrêts
    // ailleurs : on la construit ici, sinon leurs gares restent des codes.
    if (!source.static_gtfs) {
      for (const s of lignesCsv(lire('stops.txt'))) {
        if (!s.stop_id) continue;
        arrets[s.stop_id] = [s.stop_name || '', s.parent_station || '',
          Number(Number(s.stop_lat).toFixed(5)) || 0, Number(Number(s.stop_lon).toFixed(5)) || 0];
      }
    }

    for (const s of lignesCsv(lire('stop_times.txt'))) {
      if (!s.trip_id || !tripsRail.has(s.trip_id)) { stats.arretsIgnores++; continue; }
      const seq = Number(s.stop_sequence);
      if (!Number.isFinite(seq)) { stats.arretsIgnores++; continue; }
      (trajets[s.trip_id] ??= []).push(seq, enSecondes(s.arrival_time), enSecondes(s.departure_time));
      stats.arretsRetenus++;
    }
  }

  if (!fuseau) throw new Error('aucun agency_timezone déclaré');
  if (!stats.arretsRetenus) throw new Error('aucun horaire ferroviaire retenu');

  // Table d'arrêts pour les sources qui n'ont pas de statique de filtrage :
  // sans elle, la Finlande reste identifiée par ses seuls codes officiels
  // (TKL, PSL) et ses gares n'ont pas de nom lisible au catalogue.
  if (!source.static_gtfs && Object.keys(arrets).length) {
    const refdata = join(RACINE, 'state', 'refdata');
    mkdirSync(refdata, { recursive: true });
    const charge = gzipSync(JSON.stringify({ builtAt: new Date().toISOString(), arrets }));
    writeFileSync(join(refdata, `${nom}_stops_${new Date().toISOString().slice(0, 10)}.json.gz`), charge);
    writeFileSync(join(refdata, `${nom}_stops.json.gz`), charge);
    console.log(`[${nom}] table d'arrêts : ${Object.keys(arrets).length} arrêts`);
  }

  mkdirSync(SORTIE, { recursive: true });
  const jour = new Date().toISOString().slice(0, 10);
  const charge = gzipSync(JSON.stringify({ fuseau, builtAt: new Date().toISOString(), source: nom, stats, trajets }));
  writeFileSync(join(SORTIE, `${nom}_${jour}.json.gz`), charge);
  writeFileSync(join(SORTIE, `${nom}.json.gz`), charge);   // alias du plus récent
  console.log(`[${nom}] fuseau ${fuseau} · routes rail ${stats.routesRail}/${stats.routesTotal} · ` +
    `trajets rail ${stats.tripsRail}/${stats.tripsTotal} · horaires ${stats.arretsRetenus} · ` +
    `${(charge.length / 1048576).toFixed(1)} Mo compressés`);
}

const demandes = process.argv.slice(2);
let echecs = 0;
for (const [nom, source] of Object.entries(config.sources)) {
  if (!source.horaires_gtfs) continue;
  if (source.actif === false) continue;
  if (demandes.length && !demandes.includes(nom)) continue;
  try {
    await construire(nom, source);
  } catch (e) {
    // Un échec laisse en place la table de la veille : la collecte continue,
    // et la jointure se rabattra sur la table datée la plus proche.
    console.error(`[${nom}] ECHEC horaires : ${e.message}`);
    echecs++;
  }
}
if (echecs) process.exitCode = 1;
