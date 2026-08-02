#!/usr/bin/env node
// ============================================================
// Collecteur MercatOr, version 2 (2 août 2026).
//
// Change de principe par rapport à la version 1, qui perdait 79 % des
// captures : au lieu d'une exécution longue qui occupe l'heure, chaque
// exécution est courte et revendique un CRÉNEAU de 5 minutes.
//
//   - le créneau est déduit de l'horloge, pas de l'heure de lancement ;
//   - on ne conserve que les arrêts dont l'heure d'événement tombe dans la
//     fenêtre du créneau, donc toute observation stockée est fraîche par
//     construction, ce qui supprime le besoin d'un état de déduplication ;
//   - si le témoin du créneau existe déjà, l'exécution s'arrête aussitôt :
//     deux workflows décalés peuvent tourner sans se doubler ;
//   - l'identité de gare est résolue ici, plus à l'analyse.
//
// Aucun secret n'est journalisé. Variables : SLOT_FORCE, DRY_RUN.
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import GtfsRt from 'gtfs-realtime-bindings';
import config from './config.json' with { type: 'json' };

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const maintenant = () => new Date();

// ---- Créneau : borne inférieure du pas de cycle en cours ----
const CYCLE_MS = config.cycle_seconds * 1000;
const slotDebutMs = Number(process.env.SLOT_FORCE || Math.floor(Date.now() / CYCLE_MS) * CYCLE_MS);
const slotDebut = new Date(slotDebutMs);
const slotISO = slotDebut.toISOString();
const slotJour = slotISO.slice(0, 10);
const slotNom = slotISO.slice(11, 16).replace(':', '');
const slotIndex = Math.floor(slotDebutMs / CYCLE_MS);

// Fenêtre d'événements retenue, un peu plus large que le cycle pour couvrir
// les flux qui retirent un trajet dès qu'il est terminé.
const bornBasse = slotDebutMs / 1000 - config.fenetre_avant_s;
const bornHaute = slotDebutMs / 1000 + config.fenetre_apres_s;

// ---- Exclusions décidées sur critères intrinsèques ----
let exclusions = { sourcesRejetees: {}, garesExclues: [], garesQuarantaine: [] };
try { exclusions = JSON.parse(readFileSync(join(RACINE, 'src', 'exclusions.json'), 'utf8')); } catch { }
const sourcesKO = new Set(Object.keys(exclusions.sourcesRejetees || {}));
const garesKO = new Set((exclusions.garesExclues || []).map(g => g.cle));

// ---- Référentiels : filtres ferroviaires et tables d'arrêts datées ----
function lireGz(chemin) { try { return JSON.parse(gunzipSync(readFileSync(chemin)).toString()); } catch { return null; } }
const REF = join(RACINE, 'state', 'refdata');
const filtres = {}, arrets = {};
for (const [nom, src] of Object.entries(config.sources)) {
  if (src.filtre && src.filtre !== 'aucun') {
    const r = lireGz(join(REF, `${nom}.json.gz`));
    filtres[nom] = r ? { mode: r.mode, ids: new Set(r.ids), exclus: new Set(r.exclus || []) } : null;
  }
  if (existsSync(REF)) {
    const dates = readdirSync(REF).filter(f => f.startsWith(`${nom}_stops_`)).sort();
    const dernier = dates.at(-1) || (existsSync(join(REF, `${nom}_stops.json.gz`)) ? `${nom}_stops.json.gz` : null);
    if (dernier) arrets[nom] = (lireGz(join(REF, dernier)) || {}).arrets || {};
  }
}

// ---- Identité de gare, résolue à la collecte ----
function identite(net, src, stopId) {
  if (stopId == null) return null;
  const s = String(stopId);
  if (src.identite === 'uic') {                    // SNCF : le code UIC est stable
    const m = s.match(/(\d{7,8})/);
    return m ? 'UIC' + m[1] : s;
  }
  if (src.identite === 'statique') {               // nom et coordonnees, robuste aux identifiants regeneres
    const a = arrets[net]?.[s];
    if (!a) return s;
    const parent = a[1] && arrets[net][a[1]] ? arrets[net][a[1]] : null;
    const nom = (parent ? parent[0] : a[0]) || '';
    const lat = parent ? parent[2] : a[2], lon = parent ? parent[3] : a[3];
    if (nom && lat) return `${nom.toLowerCase().replace(/[^a-z0-9]/g, '')}@${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
    return nom ? 'N' + nom.toLowerCase().replace(/[^a-z0-9]/g, '') : s;
  }
  return s;                                         // DIDOK suisse, code finlandais, StopArea francilien
}

// ---- Réseau ----
async function chercher(url, entetes) {
  for (let essai = 0; essai <= config.retry_par_cycle; essai++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), config.fetch_timeout_ms);
    try {
      const rep = await fetch(url, { headers: { 'User-Agent': config.user_agent, ...entetes }, signal: ctl.signal });
      const buf = Buffer.from(await rep.arrayBuffer());
      if (rep.status !== 200) throw new Error('HTTP ' + rep.status);
      if (buf.length > config.max_response_bytes) throw new Error('reponse anormale ' + buf.length);
      return { buf, quota: Object.fromEntries([...rep.headers].filter(([k]) => /ratelimit|quota|remaining/i.test(k))) };
    } catch (e) {
      if (essai >= config.retry_par_cycle) return { erreur: ctl.signal.aborted ? 'timeout' : e.message };
      await new Promise(r => setTimeout(r, config.retry_backoff_ms));
    } finally { clearTimeout(t); }
  }
}
function entetesDe(src) {
  const h = { ...(src.entetes || {}) };
  if (src.auth) {
    const v = process.env[src.auth.secret];
    if (!v) return null;                             // secret absent : source ignoree
    h[src.auth.entete] = v;
  }
  return h;
}

// ---- Collecte GTFS-Realtime ----
const REL_TRIP = { 0: 'SCHEDULED', 1: 'ADDED', 2: 'UNSCHEDULED', 3: 'CANCELED' };
async function collecterGtfsRt(net, src, lignes) {
  const entetes = entetesDe(src);
  if (!entetes) return { statut: 'secret absent' };
  const urls = Array.isArray(src.trip_updates) ? src.trip_updates : [src.trip_updates];
  const feeds = [];
  let quota = {};
  for (const u of urls) {
    const r = await chercher(u, entetes);
    if (r.erreur) { if (urls.length === 1) return { statut: 'erreur: ' + r.erreur }; continue; }
    if (r.quota && Object.keys(r.quota).length) quota = r.quota;
    try { feeds.push(GtfsRt.transit_realtime.FeedMessage.decode(r.buf)); }
    catch (e) { if (urls.length === 1) return { statut: 'decodage: ' + e.message }; }
  }
  if (!feeds.length) return { statut: 'aucun flux exploitable' };
  const fts = feeds[0].header.timestamp ? Number(feeds[0].header.timestamp) : null;
  const filtre = filtres[net];
  let vus = 0, rail = 0, retenus = 0;
  for (const e of feeds.flatMap(f => f.entity)) {
    const tu = e.tripUpdate;
    if (!tu?.trip) continue;
    vus++;
    const trip = tu.trip.tripId || '', route = tu.trip.routeId || '';
    if (filtre) {
      const id = filtre.mode === 'trips' ? trip : route;
      if (!filtre.ids.has(id) && (filtre.exclus.has(id) || !src.garder_inconnus)) continue;
    }
    rail++;
    const annule = REL_TRIP[tu.trip.scheduleRelationship ?? 0] === 'CANCELED';
    for (const stu of tu.stopTimeUpdate || []) {
      // protobufjs rend 0 pour un champ absent : il faut donc tester la valeur,
      // pas seulement sa presence. Norvege et Finlande ne donnent que le retard,
      // sans heure absolue : leur fenetre est desactivee et l'heure d'evenement
      // sera reconstituee a l'analyse par jointure avec l'horaire statique.
      const ea = Number(stu.arrival?.time || 0) > 0 ? Number(stu.arrival.time) : null;
      const ed = Number(stu.departure?.time || 0) > 0 ? Number(stu.departure.time) : null;
      const evt = ed ?? ea;
      if (!src.sans_fenetre && (evt == null || evt < bornBasse || evt > bornHaute)) continue;
      if (src.sans_fenetre && stu.arrival?.delay == null && stu.departure?.delay == null) continue;
      const gare = identite(net, src, stu.stopId);
      if (!gare || garesKO.has(`${net}|${gare}`)) continue;
      const rel = annule ? 'CANCELED'
        : (stu.scheduleRelationship ?? 0) === 1 ? 'SKIPPED'
          : (stu.scheduleRelationship ?? 0) === 2 ? 'NO_DATA' : 'OK';
      lignes.push({
        t: slotISO, net, gare, trip, seq: stu.stopSequence ?? null, rel,
        ra: stu.arrival?.delay ?? null, rd: stu.departure?.delay ?? null, ea, ed, fts,
      });
      retenus++;
    }
  }
  return { statut: 'ok', vus, rail, retenus, quota, fraicheur: fts ? Math.round(Date.now() / 1000 - fts) : null };
}

// ---- Collecte SIRI Lite, Île-de-France ----
async function collecterSiri(net, src, lignes) {
  const entetes = entetesDe(src);
  if (!entetes) return { statut: 'secret absent' };
  let courses = 0, retenus = 0, appels = 0, quota = {};
  for (const [, code] of src.lignes) {
    const url = `${src.siri_base}?LineRef=${encodeURIComponent(`STIF:Line::${code}:`)}`;
    const r = await chercher(url, { ...entetes, Accept: 'application/json' });
    appels++;
    if (r.erreur) continue;
    if (r.quota && Object.keys(r.quota).length) quota = r.quota;
    let j;
    try { j = JSON.parse(r.buf.toString('utf8')); } catch { continue; }
    const frames = j?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery?.[0]?.EstimatedJourneyVersionFrame || [];
    for (const c of frames.flatMap(f => f.EstimatedVehicleJourney || [])) {
      if (!(c.VehicleMode || []).includes('RAIL')) continue;    // filtre ferroviaire natif
      courses++;
      const trip = c.DatedVehicleJourneyRef?.value || '';
      const rec = c.RecordedAtTime ? Math.round(Date.parse(c.RecordedAtTime) / 1000) : null;
      for (const call of c.EstimatedCalls?.EstimatedCall || []) {
        const aa = call.AimedArrivalTime ? Date.parse(call.AimedArrivalTime) / 1000 : null;
        const ea = call.ExpectedArrivalTime ? Date.parse(call.ExpectedArrivalTime) / 1000 : null;
        const ad = call.AimedDepartureTime ? Date.parse(call.AimedDepartureTime) / 1000 : null;
        const ed = call.ExpectedDepartureTime ? Date.parse(call.ExpectedDepartureTime) / 1000 : null;
        const evt = ed ?? ea;
        if (evt == null || evt < bornBasse || evt > bornHaute) continue;
        const gare = call.StopPointRef?.value;
        if (!gare || garesKO.has(`${net}|${gare}`)) continue;
        const annule = call.DepartureStatus === 'CANCELLED' || call.ArrivalStatus === 'CANCELLED';
        lignes.push({
          t: slotISO, net, gare, trip, seq: null, rel: annule ? 'CANCELED' : 'OK',
          ra: (aa != null && ea != null) ? Math.round(ea - aa) : null,
          rd: (ad != null && ed != null) ? Math.round(ed - ad) : null,
          ea, ed, fts: rec,
        });
        retenus++;
      }
    }
  }
  return { statut: 'ok', vus: courses, rail: courses, retenus, appels, quota };
}

// ---- Taille du dépôt ----
function tailleDataMo() {
  let total = 0;
  const parcourir = d => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) parcourir(p); else total += statSync(p).size; } };
  if (existsSync(join(RACINE, 'data'))) parcourir(join(RACINE, 'data'));
  return total / 1048576;
}

// ============================================================
async function principal() {
  const debut = maintenant();
  if (config.end_utc && debut > new Date(config.end_utc)) { console.log(`Fin de campagne (${config.end_utc}), rien a faire.`); return; }
  if (config.start_utc && debut < new Date(config.start_utc)) { console.log(`Campagne pas encore commencee (${config.start_utc}).`); return; }

  const temoin = join(RACINE, 'data', '_slots', slotJour, `${slotNom}.txt`);
  if (existsSync(temoin) && !process.env.DRY_RUN) { console.log(`Creneau ${slotJour} ${slotNom} deja collecte, sortie.`); return; }

  const tailleMo = tailleDataMo();
  if (tailleMo > config.max_repo_data_mb) { console.error(`data/ = ${Math.round(tailleMo)} Mo, plafond atteint : collecte stoppee.`); return; }

  const lignes = [];
  const journal = { slot: slotISO, debutReel: debut.toISOString(), sources: {} };
  await Promise.all(Object.entries(config.sources).map(async ([net, src]) => {
    if (sourcesKO.has(net)) { journal.sources[net] = { statut: 'source rejetee' }; return; }
    if (src.cadence_ticks && slotIndex % src.cadence_ticks !== 0) { journal.sources[net] = { statut: 'hors cadence' }; return; }
    journal.sources[net] = src.format === 'siri'
      ? await collecterSiri(net, src, lignes)
      : await collecterGtfsRt(net, src, lignes);
  }));

  journal.lignes = lignes.length;
  journal.dureeS = Math.round((maintenant() - debut) / 1000);
  console.log(`Creneau ${slotJour} ${slotNom} : ${lignes.length} observations en ${journal.dureeS} s`);
  for (const [net, r] of Object.entries(journal.sources)) {
    console.log(`  ${net.padEnd(18)} ${r.statut === 'ok'
      ? `${String(r.retenus).padStart(6)} retenues sur ${r.rail}/${r.vus} trajets${r.fraicheur != null ? ', fraicheur ' + r.fraicheur + ' s' : ''}`
      : r.statut}`);
    if (r.quota && Object.keys(r.quota).length) console.log(`    quota : ${JSON.stringify(r.quota)}`);
  }
  if (process.env.DRY_RUN) { console.log('DRY_RUN : aucune ecriture.'); return; }

  const parSource = {};
  for (const l of lignes) (parSource[l.net] ??= []).push(l);
  for (const [net, arr] of Object.entries(parSource)) {
    const dossier = join(RACINE, 'data', net, slotJour);
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, `obs-${slotNom}.ndjson.gz`), gzipSync(arr.map(x => JSON.stringify(x)).join('\n') + '\n'));
  }
  mkdirSync(dirname(temoin), { recursive: true });
  writeFileSync(temoin, slotISO + '\n');
  mkdirSync(join(RACINE, 'logs'), { recursive: true });
  appendFileSync(join(RACINE, 'logs', 'runs.ndjson'), JSON.stringify(journal) + '\n');
  if (tailleMo > config.warn_repo_data_mb) console.warn(`AVERTISSEMENT : data/ = ${Math.round(tailleMo)} Mo`);
}

principal().catch(e => { console.error('Echec du collecteur :', e); process.exit(1); });
