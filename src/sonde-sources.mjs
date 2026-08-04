#!/usr/bin/env node
// ============================================================
// Sonde des sources à clé : Suisse, Irlande, Île-de-France.
// S'exécute dans GitHub Actions, seul endroit où les secrets existent.
//
// Ne journalise JAMAIS la valeur d'une clé : seulement sa présence et sa
// longueur. Un appel par source (quelques-uns pour l'Île-de-France, qui n'a
// pas de requête globale). Applique le test anti-parfait avec le filtre de
// fraîcheur quand la source le permet.
// ============================================================

import GtfsRt from 'gtfs-realtime-bindings';

const UA = 'MercatOr-POC/1.0 (evaluation de faisabilite; github.com/Blinytz/mercator)';
const dodo = ms => new Promise(r => setTimeout(r, ms));
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (n, d) => d ? (n / d * 100).toFixed(1) + ' %' : 'n/a';

function presence(nom, v) {
  // Empreinte sans jamais reveler la valeur : longueur et classe de caracteres.
  let forme = 'absente';
  if (v) {
    if (/^x+$/i.test(v)) forme = 'UNIQUEMENT DES x, valeur factice copiee depuis l affichage masque';
    else if (/^[0-9a-f]+$/i.test(v)) forme = 'hexadecimal';
    else if (/^[A-Za-z0-9]+$/.test(v)) forme = 'alphanumerique';
    else forme = 'mixte avec caracteres speciaux';
  }
  console.log(`  ${nom.padEnd(18)} : ${v ? 'present, longueur ' + v.length + ', ' + forme : 'ABSENT'}`);
  return v;
}
function entetesQuota(rep) {
  const out = {};
  for (const [k, v] of rep.headers.entries()) if (/quota|ratelimit|rate-limit|remaining|x-limit|retry-after/i.test(k)) out[k] = v;
  return out;
}

async function appel(url, headers, timeout = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const debut = Date.now();
  try {
    const rep = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctl.signal });
    const buf = Buffer.from(await rep.arrayBuffer());
    return { statut: rep.status, buf, ms: Date.now() - debut, quota: entetesQuota(rep) };
  } catch (e) {
    return { statut: 'ERREUR', erreur: ctl.signal.aborted ? 'timeout' : e.message, ms: Date.now() - debut };
  } finally { clearTimeout(t); }
}

// ---- Analyse d'un flux GTFS-Realtime ----
function analyserGtfsRt(buf, etiquette) {
  let feed;
  try { feed = GtfsRt.transit_realtime.FeedMessage.decode(buf); }
  catch (e) { console.log(`  decodage protobuf impossible : ${e.message}`); return null; }
  const age = feed.header.timestamp ? Math.round(Date.now() / 1000 - Number(feed.header.timestamp)) : null;
  const tus = feed.entity.filter(e => e.tripUpdate);
  let arrets = 0, arrEtDep = 0, annules = 0, supprimes = 0;
  const retards = [], gares = new Set(), modes = {};
  for (const e of tus) {
    const tu = e.tripUpdate;
    if ((tu.trip?.scheduleRelationship ?? 0) === 3) annules++;
    for (const s of tu.stopTimeUpdate || []) {
      arrets++;
      if (s.stopId) gares.add(s.stopId);
      if ((s.scheduleRelationship ?? 0) === 1) supprimes++;
      const a = s.arrival, d = s.departure;
      if ((a?.delay != null || a?.time != null) && (d?.delay != null || d?.time != null)) arrEtDep++;
      const r = d?.delay ?? a?.delay;
      if (r != null) retards.push(r);
    }
  }
  const zero = retards.filter(r => r === 0).length;
  const s60 = retards.filter(r => Math.abs(r) <= 60).length;
  const p300 = retards.filter(r => r > 300).length;
  const distinctes = new Set(retards).size;
  console.log(`  fraicheur en-tete   : ${age} s`);
  console.log(`  volume              : ${tus.length} trajets, ${arrets} arrets, ${gares.size} points d'arret`);
  console.log(`  arrivee ET depart   : ${pct(arrEtDep, arrets)}`);
  // Diagnostic decisif : le flux fournit-il une HEURE ABSOLUE, ou seulement un
  // retard ? Sans heure absolue, le filtre de creneau du collecteur ne peut pas
  // placer l'arret dans le temps. protobufjs rend 0 quand le champ est absent.
  let avecHeure = 0, avecDelay = 0;
  for (const e of tus) for (const s of e.tripUpdate.stopTimeUpdate || []) {
    if (Number(s.arrival?.time || 0) > 0 || Number(s.departure?.time || 0) > 0) avecHeure++;
    if (s.arrival?.delay != null || s.departure?.delay != null) avecDelay++;
  }
  console.log(`  heure absolue       : ${pct(avecHeure, arrets)} | retard seul : ${pct(avecDelay - avecHeure, arrets)}`);
  // Quand le flux ne donne que le retard, l'heure se reconstitue par jointure
  // avec l'horaire statique, ce qui exige le JOUR DE SERVICE et une sequence
  // d'arret exploitable. Sans startDate, la source reste inutilisable meme si
  // ses retards sont bons : c'est le point a verifier avant de la qualifier.
  let avecSd = 0, avecSeq = 0;
  const formesSd = new Set();
  for (const e of tus) {
    if (e.tripUpdate.trip?.startDate) { avecSd++; formesSd.add(String(e.tripUpdate.trip.startDate)); }
    for (const s of e.tripUpdate.stopTimeUpdate || []) if (s.stopSequence) avecSeq++;
  }
  console.log(`  jour de service     : ${pct(avecSd, tus.length)} des trajets` +
    `${formesSd.size ? ' (ex. ' + [...formesSd].slice(0, 2).join(', ') + ')' : ' -> JOINTURE STATIQUE IMPOSSIBLE'}`);
  console.log(`  stopSequence        : ${pct(avecSeq, arrets)} des arrets`);
  console.log(`  annules ${annules}, arrets supprimes ${supprimes}, retards renseignes ${retards.length}`);
  if (retards.length) {
    console.log(`  retard median ${med(retards)} s | nuls ${pct(zero, retards.length)} | <=60 s ${pct(s60, retards.length)} | >5 min ${pct(p300, retards.length)} | ${distinctes} valeurs distinctes`);
    const alertes = [];
    if (retards.length >= 100) {
      if (zero / retards.length > 0.9) alertes.push('plus de 90 % de retards nuls');
      if (s60 / retards.length > 0.98) alertes.push('plus de 98 % sous 60 s');
      if (distinctes < 5) alertes.push('moins de 5 valeurs distinctes');
      if (p300 === 0) alertes.push('aucun retard > 5 min');
    }
    console.log(`  test anti-parfait   : ${alertes.length ? 'ALERTE -> ' + alertes.join(', ') : retards.length >= 100 ? 'passe (sur instantane)' : 'echantillon trop faible'}`);
  }
  const ex = tus.find(t => (t.tripUpdate?.stopTimeUpdate || []).length > 1);
  if (ex) console.log(`  exemple : trip=${ex.tripUpdate.trip?.tripId} route=${ex.tripUpdate.trip?.routeId ?? '?'} stop=${ex.tripUpdate.stopTimeUpdate[0]?.stopId}`);
  return { tus: tus.length, gares: gares.size, arrEtDep, arrets };
}

// ============================================================
async function suisse() {
  console.log('\n===== SUISSE · opentransportdata.swiss =====');
  const token = presence('SWISS_TOKEN', process.env.SWISS_TOKEN);
  const hash = presence('SWISS_TOKEN_HASH', process.env.SWISS_TOKEN_HASH);
  if (!token && !hash) return;
  const url = 'https://api.opentransportdata.swiss/la/gtfs-rt';
  // On cherche la bonne combinaison valeur x forme d'en-tete, en respectant
  // la limite de 5 appels par minute annoncee par le plan.
  const candidats = [];
  for (const [nomVal, val] of [['Token', token], ['TokenHash', hash]]) {
    if (!val) continue;
    candidats.push([`${nomVal} / Authorization brut`, { Authorization: val }]);
    candidats.push([`${nomVal} / Authorization Bearer`, { Authorization: 'Bearer ' + val }]);
    candidats.push([`${nomVal} / apikey`, { apikey: val }]);
  }
  for (const [libelle, headers] of candidats) {
    const r = await appel(url, headers);
    console.log(`  essai ${libelle.padEnd(32)} -> ${r.statut}${r.buf ? ' (' + (r.buf.length / 1024).toFixed(0) + ' Ko)' : ''}`);
    if (r.statut === 200 && r.buf.length > 1000) {
      console.log(`  AUTHENTIFICATION RETENUE : ${libelle}`);
      if (Object.keys(r.quota || {}).length) console.log('  quotas :', JSON.stringify(r.quota));
      analyserGtfsRt(r.buf, 'suisse');
      return;
    }
    if (r.buf && r.statut !== 200) console.log(`     reponse : ${r.buf.toString('utf8').slice(0, 160).replace(/\s+/g, ' ')}`);
    await dodo(13000);   // 5 appels par minute maximum
  }
  console.log('  AUCUNE COMBINAISON ACCEPTEE : verifier le produit souscrit');
}

async function irlande() {
  console.log('\n===== IRLANDE · National Transport Authority =====');
  const cle = presence('IRELAND_API_KEY', process.env.IRELAND_API_KEY);
  if (!cle) return;
  const base = 'https://api.nationaltransport.ie/gtfsr/v2/TripUpdates';
  const essais = [
    ['Ocp-Apim-Subscription-Key', base, { 'Ocp-Apim-Subscription-Key': cle }],
    ['x-api-key', base, { 'x-api-key': cle }],
    ['apikey', base, { apikey: cle }],
    ['parametre subscription-key', `${base}?subscription-key=${encodeURIComponent(cle)}`, {}],
    ['v1 avec x-api-key', 'https://api.nationaltransport.ie/gtfsr/v1/TripUpdates', { 'x-api-key': cle }],
    ['gtfsr.transportforireland.ie', 'https://gtfsr.transportforireland.ie/v2/TripUpdates', { 'Ocp-Apim-Subscription-Key': cle }],
  ];
  for (const [libelle, url, headers] of essais) {
    const r = await appel(url, headers);
    console.log(`  essai ${libelle.padEnd(30)} -> ${r.statut}${r.buf ? ' (' + (r.buf.length / 1024).toFixed(0) + ' Ko)' : ''}`);
    if (r.statut === 200 && r.buf.length > 500) {
      console.log(`  ACCES RETENU : ${libelle}`);
      if (Object.keys(r.quota || {}).length) console.log('  quotas :', JSON.stringify(r.quota));
      analyserGtfsRt(r.buf, 'irlande');
      return;
    }
    if (r.buf && r.buf.length) console.log(`     ${r.buf.toString('utf8').slice(0, 140).replace(/\s+/g, ' ')}`);
    await dodo(1500);
  }
  console.log('  AUCUN ACCES : abonnement probablement pas encore actif, ou produit different');
}

async function idfm() {
  console.log('\n===== ILE-DE-FRANCE · PRIM SIRI Lite =====');
  const cle = presence('IDFM_API_KEY', process.env.IDFM_API_KEY);
  if (!cle) return;
  const LIGNES = [['RER A', 'C01742'], ['RER C', 'C01727'], ['Transilien H', 'C01737']];
  let totalGares = new Set(), totalCourses = 0, avecRetard = 0, arrEtDep = 0, arrets = 0;
  const retards = [], fraicheurs = [];
  for (const [nom, code] of LIGNES) {
    const url = `https://prim.iledefrance-mobilites.fr/marketplace/estimated-timetable?LineRef=${encodeURIComponent(`STIF:Line::${code}:`)}`;
    const r = await appel(url, { apikey: cle, Accept: 'application/json' });
    if (r.statut !== 200) { console.log(`  ${nom.padEnd(14)} statut ${r.statut} : ${r.buf ? r.buf.toString('utf8').slice(0, 160) : r.erreur}`); continue; }
    if (Object.keys(r.quota || {}).length) console.log(`  ${nom} quotas :`, JSON.stringify(r.quota));
    let j;
    try { j = JSON.parse(r.buf.toString('utf8')); } catch { console.log(`  ${nom} : JSON illisible`); continue; }
    const frames = j?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery?.[0]?.EstimatedJourneyVersionFrame || [];
    const courses = frames.flatMap(f => f.EstimatedVehicleJourney || []);
    totalCourses += courses.length;
    let garesLigne = new Set(), rail = 0;
    for (const c of courses) {
      if ((c.VehicleMode || []).includes('RAIL')) rail++;
      const rec = c.RecordedAtTime ? (Date.now() - Date.parse(c.RecordedAtTime)) / 1000 : null;
      if (rec != null) fraicheurs.push(rec);
      for (const call of c.EstimatedCalls?.EstimatedCall || []) {
        arrets++;
        const gare = call.StopPointRef?.value;
        if (gare) { garesLigne.add(gare); totalGares.add(gare); }
        const aa = call.AimedArrivalTime, ea = call.ExpectedArrivalTime;
        const ad = call.AimedDepartureTime, ed = call.ExpectedDepartureTime;
        if ((aa && ea) && (ad && ed)) arrEtDep++;
        // Retard mesure uniquement sur les courses fraichement mises a jour
        if (rec != null && rec < 900) {
          if (aa && ea) { retards.push(Math.round((Date.parse(ea) - Date.parse(aa)) / 1000)); avecRetard++; }
          else if (ad && ed) { retards.push(Math.round((Date.parse(ed) - Date.parse(ad)) / 1000)); avecRetard++; }
        }
      }
    }
    console.log(`  ${nom.padEnd(14)} : ${courses.length} courses (${rail} RAIL), ${garesLigne.size} gares, ${(r.buf.length / 1024).toFixed(0)} Ko`);
    await dodo(2000);
  }
  console.log(`  TOTAL sur 3 lignes  : ${totalCourses} courses, ${totalGares.size} gares distinctes, ${arrets} arrets`);
  console.log(`  arrivee ET depart complets : ${pct(arrEtDep, arrets)}`);
  if (fraicheurs.length) {
    const recentes = fraicheurs.filter(f => f < 900).length;
    console.log(`  fraicheur des courses : mediane ${Math.round(med(fraicheurs) / 60)} min | ${pct(recentes, fraicheurs.length)} mises a jour depuis moins de 15 min`);
  }
  if (retards.length) {
    const zero = retards.filter(r => r === 0).length, s60 = retards.filter(r => Math.abs(r) <= 60).length;
    const p300 = retards.filter(r => r > 300).length, distinctes = new Set(retards).size;
    console.log(`  retards sur courses fraiches (${retards.length}) : median ${med(retards)} s | nuls ${pct(zero, retards.length)} | <=60 s ${pct(s60, retards.length)} | >5 min ${pct(p300, retards.length)} | ${distinctes} valeurs`);
    const alertes = [];
    if (retards.length >= 100) {
      if (zero / retards.length > 0.9) alertes.push('plus de 90 % de retards nuls');
      if (s60 / retards.length > 0.98) alertes.push('plus de 98 % sous 60 s');
      if (distinctes < 5) alertes.push('moins de 5 valeurs distinctes');
      if (p300 === 0) alertes.push('aucun retard > 5 min');
    }
    console.log(`  test anti-parfait   : ${alertes.length ? 'ALERTE -> ' + alertes.join(', ') : retards.length >= 100 ? 'passe' : 'echantillon trop faible'}`);
  }
}

console.log('Sonde des sources a cle, ' + new Date().toISOString());
const only = (process.env.SOURCES || 'toutes').toLowerCase();
if (only === 'toutes' || only.includes('suisse')) await suisse();
if (only === 'toutes' || only.includes('irlande')) await irlande();
if (only === 'toutes' || only.includes('idfm')) await idfm();
console.log('\nSonde terminee.');
