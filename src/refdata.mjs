#!/usr/bin/env node
// ============================================================
// Référentiel de filtrage ferroviaire · POC Mercator
//
// Télécharge les GTFS statiques et construit, par source, l'ensemble des
// route_id (ou trip_id) ferroviaires servant à filtrer les TripUpdates.
// Sortie : state/refdata/<source>.json.gz  { mode, ids, builtAt, stats }
//
// À exécuter une fois par jour (workflow refdata.yml) : les statiques de
// gtfs.de et de la SNCF régénèrent leurs trip_id régulièrement.
//
// Usage : node src/refdata.mjs [source ...]   (défaut : toutes celles à filtre)
// ============================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import config from './config.json' with { type: 'json' };

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'state', 'refdata');
const RAIL = new Set(config.rail_route_types);

// Parseur CSV minimal avec guillemets (suffisant pour routes.txt / trips.txt GTFS)
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

async function telecharger(url) {
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), 900000);
  try {
    const rep = await fetch(url, { signal: controle.signal, headers: { 'User-Agent': config.user_agent } });
    if (rep.status !== 200) throw new Error(`HTTP ${rep.status} sur ${url}`);
    return Buffer.from(await rep.arrayBuffer());
  } finally {
    clearTimeout(minuteur);
  }
}

function extraire(zipBuffer, nomFichier) {
  const zip = new AdmZip(zipBuffer);
  const entree = zip.getEntries().find(e => e.entryName.endsWith(nomFichier));
  if (!entree) throw new Error(`${nomFichier} absent du zip`);
  return entree.getData().toString('utf8');
}

async function construire(nom, source) {
  const urls = Array.isArray(source.static_gtfs) ? source.static_gtfs : [source.static_gtfs];
  const routesRail = new Set();
  const tripsRail = new Set();
  const tripsExclus = new Set();
  const arrets = {};
  const stats = { routesTotal: 0, tripsTotal: 0 };
  for (const url of urls) {
    console.log(`[${nom}] téléchargement ${url}`);
    const zip = await telecharger(url);
    console.log(`[${nom}] zip ${(zip.length / 1048576).toFixed(1)} Mo`);
    for (const r of lignesCsv(extraire(zip, 'routes.txt'))) {
      stats.routesTotal++;
      if (RAIL.has(Number(r.route_type))) routesRail.add(r.route_id);
    }
    if (source.filtre === 'trips') {
      for (const t of lignesCsv(extraire(zip, 'trips.txt'))) {
        stats.tripsTotal++;
        if (routesRail.has(t.route_id)) tripsRail.add(t.trip_id);
        else tripsExclus.add(t.trip_id);
      }
    }
    // Table des arrêts : indispensable pour les sources dont les identifiants
    // sont régénérés à chaque version du statique (NL, DE) et utile partout
    // (noms, gare parente, coordonnées) pour l'analyse.
    for (const s of lignesCsv(extraire(zip, 'stops.txt'))) {
      if (!s.stop_id) continue;
      arrets[s.stop_id] = [s.stop_name || '', s.parent_station || '',
        Number(Number(s.stop_lat).toFixed(5)) || 0, Number(Number(s.stop_lon).toFixed(5)) || 0];
    }
  }
  mkdirSync(SORTIE, { recursive: true });
  const mode = source.filtre;
  if (mode !== 'aucun') {
    const ids = mode === 'trips' ? [...tripsRail] : [...routesRail];
    const exclus = mode === 'trips' ? [...tripsExclus] : [];
    writeFileSync(join(SORTIE, `${nom}.json.gz`),
      gzipSync(JSON.stringify({ mode, ids, exclus, builtAt: new Date().toISOString(), stats: { ...stats, routesRail: routesRail.size, tripsRail: tripsRail.size } })));
  }
  writeFileSync(join(SORTIE, `${nom}_stops.json.gz`),
    gzipSync(JSON.stringify({ builtAt: new Date().toISOString(), arrets })));
  console.log(`[${nom}] ${mode} : rail ${mode === 'trips' ? tripsRail.size : routesRail.size}, ` +
    `exclus ${tripsExclus.size} (routes ${routesRail.size}/${stats.routesTotal}), arrêts ${Object.keys(arrets).length}`);
}

const demandes = process.argv.slice(2);
for (const [nom, source] of Object.entries(config.sources)) {
  if (!source.static_gtfs) continue;
  if (demandes.length && !demandes.includes(nom)) continue;
  try {
    await construire(nom, source);
  } catch (e) {
    // Un échec de référentiel ne doit pas casser la collecte : l'ancien fichier reste en place.
    console.error(`[${nom}] ECHEC référentiel : ${e.message}`);
    process.exitCode = 1;
  }
}
