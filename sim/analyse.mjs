#!/usr/bin/env node
// Analyse A3/A5/A7 du POC ferroviaire : agrège les observations en événements
// d'arrêt consolidés, mesure la qualité d'observation (lead time), puis
// produit des métriques par gare et par journée MercatOr.
//
// Usage : node analyse.mjs <racine-depot> [jour...]
// Sortie : agg/<jour>.json (métriques par gare) + diagnostic sur stdout.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const RACINE = process.argv[2];
const JOURS_DEMANDES = process.argv.slice(3);
const SORTIE = join(RACINE, '..', 'agg');
mkdirSync(SORTIE, { recursive: true });

// ---- Journée MercatOr : 05:00 Paris -> 05:00 Paris ----
// Paris = UTC+2 en juillet : la bascule est à 03:00 UTC.
const BASCULE_UTC_H = 3;
function jourMercatOr(epochS) {
  const d = new Date((epochS - BASCULE_UTC_H * 3600) * 1000);
  return d.toISOString().slice(0, 10);
}

// ---- Référentiel des arrêts (identité de gare) ----
const stops = {};
for (const f of readdirSync(join(RACINE, 'state', 'refdata'))) {
  if (!f.endsWith('_stops.json.gz')) continue;
  const net = f.replace('_stops.json.gz', '');
  stops[net] = JSON.parse(gunzipSync(readFileSync(join(RACINE, 'state', 'refdata', f))).toString()).arrets;
}
// Identité de gare : parent_station si disponible, sinon stop_id.
function gare(net, stopId) {
  const s = stops[net]?.[stopId];
  if (!s) return { id: stopId, nom: null, connu: false };
  const parent = s[1];
  if (parent && stops[net][parent]) return { id: parent, nom: stops[net][parent][0], connu: true };
  return { id: stopId, nom: s[0], connu: true };
}

const SOURCES = readdirSync(join(RACINE, 'data')).filter(d => existsSync(join(RACINE, 'data', d)));

// ---- Passe 1 : consolidation des événements d'arrêt ----
// cle = net|trip|stop|seq -> [tLast, rel, ad, dd, as, ds, nObs, tFirst]
function consoliderSource(net) {
  const dossierSource = join(RACINE, 'data', net);
  const jours = readdirSync(dossierSource).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const evenements = new Map();
  const annulations = new Map();   // trip -> tLast
  let lignes = 0;
  for (const jour of jours) {
    const fichiers = readdirSync(join(dossierSource, jour)).filter(f => f.startsWith('obs-')).sort();
    for (const f of fichiers) {
      const texte = gunzipSync(readFileSync(join(dossierSource, jour, f))).toString();
      for (const ligne of texte.split('\n')) {
        if (!ligne) continue;
        lignes++;
        const o = JSON.parse(ligne);
        const t = Date.parse(o.t) / 1000;
        if (o.rel === 'CANCELED' && o.stop === undefined) { annulations.set(o.trip, t); continue; }
        const cle = `${o.trip}|${o.stop}|${o.seq}`;
        const e = evenements.get(cle);
        if (e) { e[0] = t; e[1] = o.rel; e[2] = o.ad; e[3] = o.dd; e[4] = o.as; e[5] = o.ds; e[6]++; }
        else evenements.set(cle, [t, o.rel, o.ad, o.dd, o.as, o.ds, 1, t, o.stop]);
      }
    }
  }
  return { evenements, annulations, lignes };
}

// ---- Passe 2 : métriques ----
const mediane = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const global = { parSource: {}, leadTimes: [], parJour: {} };

for (const net of SOURCES) {
  const { evenements, annulations, lignes } = consoliderSource(net);
  // trip -> ensemble des gares vues (pour attribuer les annulations)
  const tripGares = new Map();
  const stats = { lignes, evenements: evenements.size, annulTrips: annulations.size, sansStatique: 0, leadObs: 0, leadPredit: 0 };
  const parJourGare = {};   // jour -> gareId -> agrégats

  for (const [cle, e] of evenements) {
    const [tLast, rel, ad, dd, as, ds, nObs, tFirst, stopId] = e;
    const trip = cle.slice(0, cle.indexOf('|'));
    const tEvt = ds ?? as;
    if (!tEvt) continue;
    const g = gare(net, stopId);
    if (!g.connu) stats.sansStatique++;
    (tripGares.get(trip) ?? tripGares.set(trip, new Set()).get(trip)).add(g.id);

    const lead = tEvt - tLast;           // > 0 : dernière obs AVANT l'événement
    global.leadTimes.push(lead);
    if (lead <= 120) stats.leadObs++; else stats.leadPredit++;

    const jour = jourMercatOr(tEvt);
    const parGare = (parJourGare[jour] ??= {});
    const a = (parGare[g.id] ??= { nom: g.nom, mvt: 0, obs: 0, predit: 0, ad: [], dd: [], ajoute: [], recup: [], heure: 0, skip: 0, annul: 0, leads: [] });
    a.mvt++;
    if (lead <= 120) a.obs++; else a.predit++;
    a.leads.push(lead);
    if (rel === 'SKIPPED') { a.skip++; continue; }
    if (ad != null) a.ad.push(ad);
    if (dd != null) a.dd.push(dd);
    if (ad != null && dd != null) {
      a.ajoute.push(Math.max(0, dd - ad));
      a.recup.push(Math.max(0, ad - dd));
    }
    const retard = dd ?? ad;
    if (retard != null && retard <= 300) a.heure++;
  }

  // Annulations : attribuées aux gares vues sur le trajet avant annulation
  for (const [trip, t] of annulations) {
    const jour = jourMercatOr(t);
    const gares = tripGares.get(trip);
    if (!gares) continue;
    for (const gid of gares) {
      const a = parJourGare[jour]?.[gid];
      if (a) a.annul++;
    }
  }

  global.parSource[net] = stats;
  for (const [jour, parGare] of Object.entries(parJourGare)) {
    (global.parJour[jour] ??= {})[net] = parGare;
  }
  console.log(`[${net}] ${lignes} lignes -> ${evenements.size} événements | sans statique: ${stats.sansStatique} | ` +
    `observés(<=2min): ${stats.leadObs} | prédits: ${stats.leadPredit} | trips annulés: ${annulations.size}`);
}

// ---- Diagnostic lead time ----
const lt = global.leadTimes.filter(l => l > -3600 && l < 86400).sort((a, b) => a - b);
const q = p => Math.round(lt[Math.floor(lt.length * p)] / 60);
console.log(`\nLead time (min) entre dernière observation et heure de l'événement :`);
console.log(`  p10 ${q(.1)} | médiane ${q(.5)} | p75 ${q(.75)} | p90 ${q(.9)}`);
console.log(`  <=2 min (réalisé observé) : ${(lt.filter(l => l <= 120).length / lt.length * 100).toFixed(1)} %`);
console.log(`  <=10 min : ${(lt.filter(l => l <= 600).length / lt.length * 100).toFixed(1)} %`);
console.log(`  > 30 min (prédiction lointaine) : ${(lt.filter(l => l > 1800).length / lt.length * 100).toFixed(1)} %`);

// ---- Écriture des agrégats ----
for (const [jour, parNet] of Object.entries(global.parJour)) {
  if (JOURS_DEMANDES.length && !JOURS_DEMANDES.includes(jour)) continue;
  const sortie = {};
  for (const [net, parGare] of Object.entries(parNet)) {
    for (const [gid, a] of Object.entries(parGare)) {
      sortie[`${net}|${gid}`] = {
        net, gare: gid, nom: a.nom, mvt: a.mvt, obs: a.obs, predit: a.predit,
        adMed: mediane(a.ad), ddMed: mediane(a.dd),
        adMoy: a.ad.length ? Math.round(a.ad.reduce((x, y) => x + y, 0) / a.ad.length) : null,
        ajouteTot: a.ajoute.reduce((x, y) => x + y, 0), recupTot: a.recup.reduce((x, y) => x + y, 0),
        nPaires: a.ajoute.length, heure: a.heure, skip: a.skip, annul: a.annul,
        leadMed: mediane(a.leads),
      };
    }
  }
  writeFileSync(join(SORTIE, `${jour}.json`), JSON.stringify(sortie));
}

// ---- Vue par journée ----
console.log(`\nPar journée MercatOr (05:00->05:00 Paris) :`);
const jours = Object.keys(global.parJour).sort();
for (const jour of jours) {
  let gares = 0, gares5 = 0, gares5obs = 0, mvt = 0;
  for (const parGare of Object.values(global.parJour[jour])) {
    for (const a of Object.values(parGare)) {
      gares++; mvt += a.mvt;
      if (a.mvt >= 5) gares5++;
      if (a.obs >= 5) gares5obs++;
    }
  }
  console.log(`  ${jour} : ${gares} gares vues, ${gares5} avec >=5 mouvements, ${gares5obs} avec >=5 mouvements RÉELLEMENT observés, ${mvt} mouvements`);
}
