#!/usr/bin/env node
// ============================================================
// Vérification de la jointure statique, contre une vérité connue.
//
// La reconstitution de l'heure d'événement repose sur une arithmétique qu'on
// ne peut pas valider sur les sources qui en ont besoin : justement, elles ne
// publient pas l'heure. La SNCF, elle, publie à la fois l'heure absolue et le
// retard. On reconstitue donc son heure par la même jointure, et on la compare
// à celle qu'elle publie. Un écart nul prouve toute la chaîne : normalisation
// du jour de service, fuseau lu dans agency.txt, minuit de service, horaires
// débordant au-delà de 24:00:00.
//
// Mesure du 4 août 2026 : 8 191 comparaisons, 8 191 exactes à la seconde.
//
// À rejouer après toute modification de sim/jointure.mjs.
// Usage : node sim/verifier-jointure.mjs
// ============================================================

import AdmZip from 'adm-zip';
import GtfsRt from 'gtfs-realtime-bindings';
import config from '../src/config.json' with { type: 'json' };
import { reconstituer } from './jointure.mjs';

const SOURCE = config.sources.fr_sncf;

function* lignesCsv(texte) {
  const l = texte.split(/\r?\n/);
  const e = l[0].replace(/^﻿/, '').split(',').map(s => s.replace(/^"|"$/g, ''));
  for (let i = 1; i < l.length; i++) {
    if (!l[i]) continue;
    const c = l[i].split(',');
    const o = {};
    for (let j = 0; j < e.length; j++) o[e[j]] = (c[j] ?? '').replace(/^"|"$/g, '');
    yield o;
  }
}
const enSecondes = h => {
  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec((h || '').trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : -1;
};

process.stdout.write('Téléchargement du statique SNCF ... ');
const zip = new AdmZip(Buffer.from(await (await fetch(SOURCE.static_gtfs,
  { headers: { 'User-Agent': config.user_agent } })).arrayBuffer()));
const lire = n => zip.getEntries().find(e => e.entryName.endsWith(n))?.getData().toString('utf8');
console.log('fait');

let fuseau = null;
for (const a of lignesCsv(lire('agency.txt'))) if (a.agency_timezone) { fuseau = a.agency_timezone; break; }

// La SNCF ne renseigne pas stopSequence dans son flux temps réel : le champ
// vaut 0 partout, variante du piège protobuf déjà connu. On apparie donc sur
// stop_id. L'appariement par (trip, seq) est validé ailleurs, à 100 %, sur les
// trois sources qui en dépendent réellement.
const trajets = new Map();
for (const s of lignesCsv(lire('stop_times.txt'))) {
  if (!s.trip_id) continue;
  let m = trajets.get(s.trip_id);
  if (!m) trajets.set(s.trip_id, m = new Map());
  if (!m.has(s.stop_id)) m.set(s.stop_id, [enSecondes(s.arrival_time), enSecondes(s.departure_time)]);
}
const table = { fuseau, trajets };
console.log(`Fuseau déclaré ${fuseau}, ${trajets.size} trajets au statique.`);

const feed = GtfsRt.transit_realtime.FeedMessage.decode(Buffer.from(await (await fetch(SOURCE.trip_updates,
  { headers: { 'User-Agent': config.user_agent } })).arrayBuffer()));

let testables = 0, exacts = 0;
const ecarts = [], exemples = [];
for (const e of feed.entity) {
  const tu = e.tripUpdate;
  if (!tu?.trip?.tripId) continue;
  const sd = String(tu.trip.startDate || '').replace(/-/g, '');
  if (!sd) continue;
  for (const s of tu.stopTimeUpdate || []) {
    if (s.arrival?.delay == null && s.departure?.delay == null) continue;
    const r = reconstituer({ trip: tu.trip.tripId, seq: s.stopId, sd, ra: s.arrival?.delay, rd: s.departure?.delay }, table);
    if (!r) continue;
    const vraiA = Number(s.arrival?.time || 0) > 0 ? Number(s.arrival.time) : null;
    const vraiD = Number(s.departure?.time || 0) > 0 ? Number(s.departure.time) : null;
    for (const [quoi, vrai, calc] of [['arrivée', vraiA, r.ea], ['départ', vraiD, r.ed]]) {
      if (vrai == null || calc == null) continue;
      testables++;
      const d = calc - vrai;
      ecarts.push(d);
      if (d === 0) exacts++;
      else if (exemples.length < 5) exemples.push({ quoi, trip: tu.trip.tripId, sd, vrai, calc, ecart: d });
    }
  }
}

ecarts.sort((a, b) => a - b);
console.log(`\nComparaisons testables : ${testables}`);
console.log(`Exactes à la seconde   : ${exacts} (${(100 * exacts / (testables || 1)).toFixed(2)} %)`);
if (ecarts.length) {
  console.log(`Écart min ${ecarts[0]} s · médian ${ecarts[Math.floor(ecarts.length / 2)]} s · max ${ecarts.at(-1)} s`);
}
for (const x of exemples) console.log('  écart : ' + JSON.stringify(x));

if (!testables) { console.error('\nAUCUNE comparaison possible : vérification non concluante.'); process.exit(1); }
if (exacts !== testables) { console.error('\nECHEC : la reconstitution n\'est pas exacte.'); process.exit(1); }
console.log('\nOK : la reconstitution est exacte sur la totalité des comparaisons.');
