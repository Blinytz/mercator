#!/usr/bin/env node
// ============================================================
// Collecteur GTFS-Realtime · POC ferroviaire MercatOr
//
// Conçu pour tourner UNE FOIS PAR HEURE (GitHub Actions, cron minute 2) et
// exécuter en interne des cycles de capture toutes les cycle_seconds (300 s)
// jusqu'à la minute run_deadline_minute (58). Un seul commit par heure.
//
// Ne conserve JAMAIS les flux bruts : uniquement des observations minimales
// dédupliquées (une ligne quand l'estimation d'un arrêt change), séparées par
// source, au format NDJSON gzippé sous data/<source>/<date UTC>/.
//
// Ligne d'observation :
//   { t, net, trip, route, stop, seq, rel, ad, dd, as, ds, fts }
//   t   : horodatage de capture ISO UTC        net : source
//   trip/route/stop/seq : identifiants GTFS publics (non personnels)
//   rel : SCHEDULED | SKIPPED | CANCELED | ADDED | NO_DATA
//   ad/dd : retard arrivée/départ (s)          as/ds : époque estimée arr/dep
//   fts : timestamp du header du flux (fraîcheur)
//   Heure théorique = as - ad (ou ds - dd) : non stockée, dérivable.
//
// L'état de déduplication vit dans .state-cache/ (actions/cache, hors dépôt).
// Un trou de cache ne perd aucune donnée : il produit seulement quelques
// lignes en double, filtrables à l'analyse.
//
// Env : CYCLES=n (test : n cycles puis stop), CYCLE_SECONDS, DRY_RUN=1.
// Aucun secret nécessaire ; rien de sensible n'est journalisé.
// ============================================================

import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import GtfsRt from 'gtfs-realtime-bindings';
import config from './config.json' with { type: 'json' };

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(RACINE, '.state-cache');
const CYCLE_S = Number(process.env.CYCLE_SECONDS || config.cycle_seconds);
const CYCLES_MAX = process.env.CYCLES ? Number(process.env.CYCLES) : null;

const dodo = ms => new Promise(r => setTimeout(r, ms));
const maintenant = () => new Date();

// ---------- État persistant ----------
function lireJson(chemin, defaut) {
  try { return JSON.parse(readFileSync(chemin, 'utf8')); } catch { return defaut; }
}
function lireJsonGz(chemin, defaut) {
  try { return JSON.parse(gunzipSync(readFileSync(chemin)).toString('utf8')); } catch { return defaut; }
}

const sante = lireJson(join(RACINE, 'state', 'health.json'), { sources: {}, derniereCapture: null });
for (const nom of Object.keys(config.sources)) {
  sante.sources[nom] ??= { requetes: 0, erreurs: 0, erreursConsecutives: 0, desactiveeJusqua: null, derniereReussite: null };
}

// Déduplication : cle "trip|stop|seq" -> { v: signature, vu: epoch }
const dernierEtat = {};
for (const nom of Object.keys(config.sources)) {
  dernierEtat[nom] = lireJsonGz(join(CACHE, `${nom}.json.gz`), {});
}

// Référentiels de filtrage ferroviaire
const filtres = {};
for (const [nom, source] of Object.entries(config.sources)) {
  if (source.filtre === 'aucun') { filtres[nom] = null; continue; }
  const ref = lireJsonGz(join(RACINE, 'state', 'refdata', `${nom}.json.gz`), null);
  filtres[nom] = ref ? { mode: ref.mode, ids: new Set(ref.ids), exclus: new Set(ref.exclus || []) } : null;
}

// ---------- Capture d'une source ----------
async function capturerSource(nom, source, tampon, journalCycle) {
  const etat = sante.sources[nom];
  const nowIso = new Date().toISOString();
  if (etat.desactiveeJusqua && Date.parse(etat.desactiveeJusqua) > Date.now()) {
    journalCycle[nom] = 'desactivee';
    return;
  }
  let octets = null, tentative = 0;
  while (tentative <= config.retry_per_cycle && !octets) {
    tentative++;
    const controle = new AbortController();
    const minuteur = setTimeout(() => controle.abort(), config.fetch_timeout_ms);
    try {
      etat.requetes++;
      const rep = await fetch(source.trip_updates, {
        signal: controle.signal,
        headers: { 'User-Agent': config.user_agent },
      });
      if (rep.status !== 200) throw new Error(`HTTP ${rep.status}`);
      const corps = Buffer.from(await rep.arrayBuffer());
      if (corps.length > config.max_response_bytes) throw new Error(`réponse anormale: ${corps.length} octets`);
      octets = corps;
    } catch (e) {
      const motif = controle.signal.aborted ? `timeout ${config.fetch_timeout_ms} ms` : e.message;
      if (tentative > config.retry_per_cycle) {
        etat.erreurs++;
        etat.erreursConsecutives++;
        journalCycle[nom] = `erreur: ${motif}`;
        if (etat.erreursConsecutives >= config.max_consecutive_errors) {
          etat.desactiveeJusqua = new Date(Date.now() + config.disable_hours_after_errors * 3600000).toISOString();
          journalCycle[nom] += ` -> source suspendue ${config.disable_hours_after_errors} h`;
        }
        return;
      }
      await dodo(config.retry_backoff_ms);
    } finally {
      clearTimeout(minuteur);
    }
  }

  let feed;
  try {
    feed = GtfsRt.transit_realtime.FeedMessage.decode(octets);
  } catch (e) {
    etat.erreurs++; etat.erreursConsecutives++;
    journalCycle[nom] = `decodage: ${e.message}`;
    return;
  }
  etat.erreursConsecutives = 0;
  etat.desactiveeJusqua = null;
  etat.derniereReussite = nowIso;

  const fts = feed.header.timestamp ? Number(feed.header.timestamp) : null;
  const filtre = filtres[nom];
  const etatSource = dernierEtat[nom];
  const nowEpoch = Math.floor(Date.now() / 1000);
  let vus = 0, gardes = 0, emis = 0;

  const REL_TRIP = { 0: 'SCHEDULED', 1: 'ADDED', 2: 'UNSCHEDULED', 3: 'CANCELED' };
  for (const e of feed.entity) {
    const tu = e.tripUpdate;
    if (!tu?.trip) continue;
    vus++;
    const trip = tu.trip.tripId || '';
    const route = tu.trip.routeId || '';
    if (filtre) {
      const id = filtre.mode === 'trips' ? trip : route;
      if (!filtre.ids.has(id)) {
        // Identifiant inconnu du statique : bus/tram connu -> exclu ; sinon la
        // politique par source décide (SNCF : flux quasi purement rail, on garde).
        if (filtre.exclus.has(id) || !source.garder_inconnus) continue;
      }
    }
    gardes++;
    const relTrip = REL_TRIP[tu.trip.scheduleRelationship ?? 0] || 'SCHEDULED';
    if (relTrip === 'CANCELED') {
      const cle = `${trip}|CANCELED`;
      if (!etatSource[cle]) {
        etatSource[cle] = { v: '1', vu: nowEpoch };
        tampon.push({ t: nowIso, net: nom, trip, route, rel: 'CANCELED', fts });
        emis++;
      } else etatSource[cle].vu = nowEpoch;
      continue;
    }
    for (const stu of tu.stopTimeUpdate || []) {
      const rel = (stu.scheduleRelationship ?? 0) === 1 ? 'SKIPPED'
        : (stu.scheduleRelationship ?? 0) === 2 ? 'NO_DATA' : 'SCHEDULED';
      const ad = stu.arrival?.delay ?? null;
      const dd = stu.departure?.delay ?? null;
      const as = stu.arrival?.time != null ? Number(stu.arrival.time) : null;
      const ds = stu.departure?.time != null ? Number(stu.departure.time) : null;
      if (rel === 'SCHEDULED' && ad == null && dd == null && as == null && ds == null) continue;
      const cle = `${trip}|${stu.stopId ?? ''}|${stu.stopSequence ?? ''}`;
      const signature = `${rel}|${ad}|${dd}|${as}|${ds}`;
      const precedent = etatSource[cle];
      if (precedent && precedent.v === signature) { precedent.vu = nowEpoch; continue; }
      etatSource[cle] = { v: signature, vu: nowEpoch };
      tampon.push({
        t: nowIso, net: nom, trip, route, stop: stu.stopId ?? null,
        seq: stu.stopSequence ?? null, rel, ad, dd, as, ds, fts,
      });
      emis++;
    }
  }
  journalCycle[nom] = { trips: vus, rail: gardes, emis, fraicheurS: fts ? nowEpoch - fts : null };
}

// ---------- Alertes de service (une capture par run, best effort) ----------
async function capturerAlertes(nom, source) {
  if (!source.service_alerts) return [];
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), config.fetch_timeout_ms);
  try {
    const rep = await fetch(source.service_alerts, {
      signal: controle.signal, headers: { 'User-Agent': config.user_agent },
    });
    if (rep.status !== 200) return [];
    const feed = GtfsRt.transit_realtime.FeedMessage.decode(Buffer.from(await rep.arrayBuffer()));
    const nowIso = new Date().toISOString();
    const lignes = [];
    for (const e of feed.entity) {
      const a = e.alert;
      if (!a) continue;
      lignes.push({
        t: nowIso, net: nom, id: e.id, cause: a.cause ?? null, effet: a.effect ?? null,
        debut: a.activePeriod?.[0]?.start ? Number(a.activePeriod[0].start) : null,
        fin: a.activePeriod?.[0]?.end ? Number(a.activePeriod[0].end) : null,
        routes: [...new Set((a.informedEntity || []).map(i => i.routeId).filter(Boolean))].slice(0, 50),
        stops: [...new Set((a.informedEntity || []).map(i => i.stopId).filter(Boolean))].slice(0, 100),
        titre: (a.headerText?.translation?.[0]?.text || '').slice(0, 200),
      });
    }
    return lignes;
  } catch {
    return [];
  } finally {
    clearTimeout(minuteur);
  }
}

// ---------- Écriture des sorties ----------
function ecrireObservations(parSource, suffixe) {
  for (const [nom, lignes] of Object.entries(parSource)) {
    if (!lignes.length) continue;
    const parJour = {};
    for (const l of lignes) (parJour[l.t.slice(0, 10)] ??= []).push(l);
    for (const [jour, arr] of Object.entries(parJour)) {
      const dossier = join(RACINE, 'data', nom, jour);
      mkdirSync(dossier, { recursive: true });
      writeFileSync(join(dossier, `obs-${suffixe}.ndjson.gz`),
        gzipSync(arr.map(l => JSON.stringify(l)).join('\n') + '\n'));
    }
  }
}

function tailleDataMo() {
  let total = 0;
  const parcourir = d => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const chemin = join(d, f.name);
      if (f.isDirectory()) parcourir(chemin);
      else total += statSync(chemin).size;
    }
  };
  if (existsSync(join(RACINE, 'data'))) parcourir(join(RACINE, 'data'));
  return total / 1048576;
}

// ---------- Boucle principale ----------
async function principal() {
  const debut = maintenant();
  const heureDebut = new Date(debut); heureDebut.setUTCMinutes(0, 0, 0);
  const echeance = process.env.CYCLES ? null
    : new Date(heureDebut.getTime() + config.run_deadline_minute * 60000);

  // Plafond temporel du POC : aucune collecte après end_utc.
  if (config.end_utc && debut > new Date(config.end_utc)) {
    console.log(`Fin du POC dépassée (${config.end_utc}) : aucune collecte.`);
    appendFileSync(join(RACINE, 'logs', 'runs.ndjson'),
      JSON.stringify({ type: 'apres-fin', t: debut.toISOString() }) + '\n');
    return;
  }
  // Contrôle de taille du dépôt.
  const tailleMo = tailleDataMo();
  if (tailleMo > config.max_repo_data_mb) {
    console.error(`data/ = ${tailleMo.toFixed(0)} Mo > ${config.max_repo_data_mb} Mo : collecte stoppée.`);
    appendFileSync(join(RACINE, 'logs', 'runs.ndjson'),
      JSON.stringify({ type: 'taille-depassee', t: debut.toISOString(), tailleMo: Math.round(tailleMo) }) + '\n');
    return;
  }

  const trou = sante.derniereCapture
    ? Math.round((debut - new Date(sante.derniereCapture)) / 1000) : null;
  const tampons = Object.fromEntries(Object.keys(config.sources).map(n => [n, []]));
  const alertes = {};
  const cyclesJournal = [];
  let cycle = 0;

  while (true) {
    cycle++;
    const debutCycle = maintenant();
    const journalCycle = { t: debutCycle.toISOString() };
    await Promise.all(Object.entries(config.sources).map(([nom, source]) =>
      capturerSource(nom, source, tampons[nom], journalCycle)));
    if (cycle === 1) {
      await Promise.all(Object.entries(config.sources).map(async ([nom, source]) => {
        const lignes = await capturerAlertes(nom, source);
        if (lignes.length) alertes[nom] = lignes;
      }));
      journalCycle.alertes = Object.fromEntries(Object.entries(alertes).map(([n, l]) => [n, l.length]));
    }
    journalCycle.dureeMs = maintenant() - debutCycle;
    cyclesJournal.push(journalCycle);
    sante.derniereCapture = debutCycle.toISOString();
    console.log(`cycle ${cycle} (${journalCycle.dureeMs} ms) : ` + Object.entries(journalCycle)
      .filter(([k]) => config.sources[k])
      .map(([k, v]) => `${k}=${typeof v === 'object' ? `${v.rail}/${v.trips} rail, ${v.emis} émis` : v}`)
      .join(' | '));

    if (CYCLES_MAX && cycle >= CYCLES_MAX) break;
    const prochain = new Date(Math.ceil((Date.now() + 1000) / (CYCLE_S * 1000)) * CYCLE_S * 1000);
    if (echeance && prochain > echeance) break;
    await dodo(prochain - Date.now());
  }

  // Purge de l'état de déduplication : oublier ce qui n'a pas été vu depuis 24 h.
  const limite = Math.floor(Date.now() / 1000) - 86400;
  for (const etatSource of Object.values(dernierEtat)) {
    for (const [cle, val] of Object.entries(etatSource)) if (val.vu < limite) delete etatSource[cle];
  }

  if (process.env.DRY_RUN) {
    console.log('DRY_RUN : aucune écriture. Lignes par source :',
      Object.fromEntries(Object.entries(tampons).map(([n, l]) => [n, l.length])));
    return;
  }

  const suffixe = debut.toISOString().slice(11, 16).replace(':', '') + 'Z';
  ecrireObservations(tampons, suffixe);
  for (const [nom, lignes] of Object.entries(alertes)) {
    const dossier = join(RACINE, 'data', nom, debut.toISOString().slice(0, 10));
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, `alerts-${suffixe}.ndjson.gz`),
      gzipSync(lignes.map(l => JSON.stringify(l)).join('\n') + '\n'));
  }
  mkdirSync(CACHE, { recursive: true });
  for (const [nom, etatSource] of Object.entries(dernierEtat)) {
    writeFileSync(join(CACHE, `${nom}.json.gz`), gzipSync(JSON.stringify(etatSource)));
  }
  mkdirSync(join(RACINE, 'logs'), { recursive: true });
  appendFileSync(join(RACINE, 'logs', 'runs.ndjson'), JSON.stringify({
    type: 'run',
    heurePrevue: process.env.CYCLES ? null : new Date(heureDebut.getTime() + 2 * 60000).toISOString(),
    debutReel: debut.toISOString(),
    finReelle: new Date().toISOString(),
    dureeS: Math.round((Date.now() - debut) / 1000),
    trouDepuisDerniereCaptureS: trou,
    cycles: cyclesJournal.length,
    lignesEmises: Object.fromEntries(Object.entries(tampons).map(([n, l]) => [n, l.length])),
    detailCycles: cyclesJournal,
  }) + '\n');
  writeFileSync(join(RACINE, 'state', 'health.json'), JSON.stringify(sante, null, 2));
  console.log(`Terminé : ${cyclesJournal.length} cycles, ` +
    Object.entries(tampons).map(([n, l]) => `${n}:${l.length}`).join(' ') +
    (trou != null ? ` | trou avant ce run : ${trou} s` : ''));
  if (tailleMo > config.warn_repo_data_mb) {
    console.warn(`AVERTISSEMENT : data/ = ${tailleMo.toFixed(0)} Mo (seuil d'alerte ${config.warn_repo_data_mb} Mo)`);
  }
}

principal().catch(e => { console.error('Échec du collecteur :', e); process.exit(1); });
