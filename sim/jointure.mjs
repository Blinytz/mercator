#!/usr/bin/env node
// ============================================================
// Jointure statique · reconstitution de l'heure d'événement
//
// La Norvège, la Finlande et l'Irlande ne publient qu'un retard, sans heure
// absolue. Leurs observations sortent donc de la collecte avec ea et ed nuls,
// ce qui les rend inutilisables telles quelles : sans heure d'événement, ni la
// loi de fraîcheur ni la déduplication ne peuvent s'appliquer.
//
// Ce module reconstitue l'heure :
//
//     heure réelle = minuit du jour de service (heure locale)
//                  + horaire théorique en secondes
//                  + retard
//
// et rend un flux d'observations au même format que les sources qui publient
// déjà ea et ed. À partir de là, l'analyse ne fait plus de différence entre
// une source à heure absolue et une source à retard seul.
//
// Trois précautions, chacune payée par une mesure :
//
//  1. La table d'horaires est choisie à la date de l'observation, pas la plus
//     récente. Entur et la NTA régénèrent leurs trip_id ; utiliser la table du
//     jour pour relire une observation de la veille ferait chuter
//     l'appariement, comme gtfs.de a fait tomber l'Allemagne à 35 gares.
//  2. Le fuseau vient de agency.txt et l'offset est recalculé à l'instant
//     considéré, jamais figé. Un décalage fixe casserait au changement d'heure.
//  3. La déduplication garde, pour un même événement (gare, trajet, arrêt,
//     jour de service), l'observation la plus fraîche. Les flux sans fenêtre
//     republient le même arrêt à chaque capture pendant des heures : sans cela
//     un seul train compterait pour des dizaines de mouvements.
//
// Usage :
//   node sim/jointure.mjs                       toutes sources, tous jours
//   node sim/jointure.mjs no_entur 2026-08-05   une source, un jour
// ============================================================

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../src/config.json' with { type: 'json' };

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const HORAIRES = join(RACINE, 'state', 'horaires');

// ---- Fuseaux : offset réel à un instant donné, changement d'heure compris ----
const cacheOffset = new Map();
function offsetSecondes(fuseau, msUtc) {
  // On arrondit à l'heure : l'offset ne change qu'aux bascules, et cela réduit
  // le nombre d'appels à Intl, qui est lent.
  const cle = fuseau + '|' + Math.floor(msUtc / 3600000);
  const memo = cacheOffset.get(cle);
  if (memo !== undefined) return memo;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(msUtc)).map(x => [x.type, x.value]));
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second));
  const off = Math.round((local - Math.floor(msUtc / 1000) * 1000) / 1000);
  cacheOffset.set(cle, off);
  return off;
}

// Minuit du jour de service, en époque Unix. GTFS compte les horaires depuis
// midi moins douze heures du jour de service : pour tous les fuseaux qui nous
// concernent, cela revient à minuit local, l'offset étant pris ce jour-là.
function minuitService(fuseau, sd) {
  const an = Number(sd.slice(0, 4)), mois = Number(sd.slice(4, 6)), jour = Number(sd.slice(6, 8));
  const approx = Date.UTC(an, mois - 1, jour, 12, 0, 0);       // midi, hors zone de bascule
  const off = offsetSecondes(fuseau, approx);
  return Math.floor(Date.UTC(an, mois - 1, jour) / 1000) - off;
}

// ---- Tables d'horaires, choisies à la date de l'observation ----
const tablesDisponibles = new Map();   // source -> [{ jour, chemin }]
function listerTables(source) {
  if (tablesDisponibles.has(source)) return tablesDisponibles.get(source);
  let liste = [];
  if (existsSync(HORAIRES)) {
    liste = readdirSync(HORAIRES)
      .map(f => /^(.+)_(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(f))
      .filter(m => m && m[1] === source)
      .map(m => ({ jour: m[2], chemin: join(HORAIRES, m[0]) }))
      .sort((a, b) => a.jour.localeCompare(b.jour));
  }
  tablesDisponibles.set(source, liste);
  return liste;
}

const cacheTable = new Map();
function chargerTable(chemin) {
  if (cacheTable.has(chemin)) return cacheTable.get(chemin);
  const brut = JSON.parse(gunzipSync(readFileSync(chemin)).toString());
  // Reprise du format plat [seq, arr, dep, ...] en accès direct par séquence.
  const trajets = new Map();
  for (const [trip, plat] of Object.entries(brut.trajets)) {
    const m = new Map();
    for (let i = 0; i < plat.length; i += 3) m.set(plat[i], [plat[i + 1], plat[i + 2]]);
    trajets.set(trip, m);
  }
  const t = { fuseau: brut.fuseau, trajets };
  cacheTable.set(chemin, t);
  return t;
}

// La table retenue est la plus récente qui ne soit pas postérieure au jour
// observé ; à défaut, la plus ancienne disponible.
function tablePour(source, jour) {
  const liste = listerTables(source);
  if (!liste.length) return null;
  let choisie = liste[0];
  for (const t of liste) if (t.jour <= jour) choisie = t;
  return chargerTable(choisie.chemin);
}

// ============================================================
// Reconstitution d'une observation.
// Rend { ea, ed, theoriqueA, theoriqueD, fraicheur } ou null si non appariable.
export function reconstituer(obs, table) {
  if (!table) return null;
  const trajet = table.trajets.get(obs.trip);
  if (!trajet) return null;
  const horaire = trajet.get(obs.seq);
  if (!horaire) return null;
  const sd = obs.sd;
  if (!sd) return null;
  const minuit = minuitService(table.fuseau, sd);
  const [arrTh, depTh] = horaire;
  const theoriqueA = arrTh >= 0 ? minuit + arrTh : null;
  const theoriqueD = depTh >= 0 ? minuit + depTh : null;
  // Le retard s'ajoute à l'horaire théorique du même événement. Quand un seul
  // des deux retards est publié, il vaut pour les deux : c'est ce que font les
  // producteurs eux-mêmes, et cela reste vrai à l'arrêt près.
  const ra = obs.ra ?? obs.rd, rd = obs.rd ?? obs.ra;
  return {
    ea: theoriqueA != null && ra != null ? theoriqueA + ra : null,
    ed: theoriqueD != null && rd != null ? theoriqueD + rd : null,
    theoriqueA, theoriqueD,
  };
}

// ============================================================
// Application à un jour de collecte, avec fraîcheur et déduplication.
export function joindreJour(source, jour, options = {}) {
  const seuilFraicheurS = options.seuilFraicheurS ?? 300;
  const dossier = join(RACINE, 'data', source, jour);
  if (!existsSync(dossier)) return { source, jour, observations: [], stats: null };
  const table = tablePour(source, jour);
  const stats = { lues: 0, sansSd: 0, sansTrajet: 0, sansHoraire: 0, reconstituees: 0, dedupliquees: 0, fraiches: 0 };
  const parEvenement = new Map();

  for (const f of readdirSync(dossier).sort()) {
    if (!f.endsWith('.ndjson.gz')) continue;
    for (const ligne of gunzipSync(readFileSync(join(dossier, f))).toString().split('\n')) {
      if (!ligne) continue;
      const o = JSON.parse(ligne);
      stats.lues++;
      if (!o.sd) { stats.sansSd++; continue; }
      if (!table?.trajets.has(o.trip)) { stats.sansTrajet++; continue; }
      const r = reconstituer(o, table);
      if (!r || (r.ea == null && r.ed == null)) { stats.sansHoraire++; continue; }
      stats.reconstituees++;

      // Un événement, c'est un arrêt précis d'un trajet précis un jour précis.
      const cle = `${o.gare}|${o.trip}|${o.seq}|${o.sd}`;
      const evt = r.ed ?? r.ea;
      const tSlot = Math.floor(Date.parse(o.t) / 1000);
      // Fraîcheur : écart entre l'instant de capture et l'événement observé.
      // C'est la grandeur que gouverne la loi de fraîcheur, et elle n'était pas
      // calculable pour ces trois sources avant la jointure.
      const fraicheur = Math.abs(tSlot - evt);
      const precedent = parEvenement.get(cle);
      if (!precedent || fraicheur < precedent.fraicheur) {
        parEvenement.set(cle, { ...o, ...r, evt, fraicheur, capture: tSlot });
      }
    }
  }

  stats.dedupliquees = parEvenement.size;
  const observations = [...parEvenement.values()].filter(o => {
    const ok = o.fraicheur <= seuilFraicheurS;
    if (ok) stats.fraiches++;
    return ok;
  }).sort((a, b) => a.evt - b.evt);

  return { source, jour, observations, stats, fuseau: table?.fuseau ?? null };
}

// ============================================================
const SOURCES = Object.entries(config.sources)
  .filter(([, s]) => s.horaires_gtfs && s.actif !== false)
  .map(([n]) => n);

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('jointure.mjs')) {
  const [argSource, argJour] = process.argv.slice(2);
  const sources = argSource ? [argSource] : SOURCES;
  console.log('Jointure statique · reconstitution de l\'heure d\'événement\n');
  for (const source of sources) {
    const base = join(RACINE, 'data', source);
    if (!existsSync(base)) { console.log(`${source} : aucune donnée`); continue; }
    const jours = argJour ? [argJour] : readdirSync(base).sort();
    if (!listerTables(source).length) {
      console.log(`${source} : AUCUNE table d'horaires dans state/horaires, jointure impossible`);
      continue;
    }
    console.log(`=== ${source} (${config.sources[source].pays}) ===`);
    for (const jour of jours) {
      const r = joindreJour(source, jour);
      if (!r.stats) continue;
      const s = r.stats;
      const pc = n => s.lues ? (100 * n / s.lues).toFixed(1).padStart(5) + ' %' : '    - ';
      console.log(`  ${jour}  lues ${String(s.lues).padStart(7)} · appariées ${pc(s.reconstituees)} · ` +
        `événements distincts ${String(s.dedupliquees).padStart(6)} · fraîches <5min ${String(s.fraiches).padStart(6)}` +
        (s.sansTrajet ? ` · trajet inconnu ${pc(s.sansTrajet)}` : '') +
        (s.sansSd ? ` · sans jour de service ${pc(s.sansSd)}` : ''));
    }
  }
}
