#!/usr/bin/env node
// Extraction des profils de gare pour le moteur d'actions.
// Décomposition honnête : le VOLUME de trains vient de tous les événements
// (une estimation lointaine prouve qu'un train est prévu), la PONCTUALITÉ
// vient uniquement des observations fraîches (<=5 min).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';

const RACINE = process.argv[2];
const SOURCES = readdirSync(join(RACINE, 'data'));
const COMPLETS = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];
const FRAIS = 300;
const SEUILS = [60, 180, 300, 600];
const jourM = s => new Date((s - 3 * 3600) * 1000).toISOString().slice(0, 10);

const stops = {};
for (const f of readdirSync(join(RACINE, 'state', 'refdata'))) {
  if (!f.endsWith('_stops.json.gz')) continue;
  stops[f.replace('_stops.json.gz', '')] = JSON.parse(gunzipSync(readFileSync(join(RACINE, 'state', 'refdata', f))).toString()).arrets;
}
function identite(net, stopId) {
  if (net === 'fr_sncf') { const m = String(stopId).match(/(\d{7,8})/); if (m) return { id: 'UIC' + m[1], nom: stops[net]?.[stopId]?.[0] ?? null }; }
  const s = stops[net]?.[stopId];
  if (s) {
    const parent = s[1] && stops[net][s[1]] ? stops[net][s[1]] : null;
    const nom = (parent ? parent[0] : s[0]) || '';
    const lat = parent ? parent[2] : s[2], lon = parent ? parent[3] : s[3];
    if (nom && lat) return { id: `${nom.toLowerCase().replace(/[^a-z0-9]/g, '')}@${lat.toFixed(2)},${lon.toFixed(2)}`, nom };
    if (nom) return { id: 'N' + nom.toLowerCase().replace(/[^a-z0-9]/g, ''), nom };
  }
  return { id: String(stopId), nom: null };
}

// gare -> jour -> { n, frais, ponct{seuil:count}, annul, skip, heures[24], evts[[minute, retard, frais]] }
const gares = new Map();

for (const net of SOURCES) {
  const dossier = join(RACINE, 'data', net);
  const ev = new Map(); const annul = new Map();
  for (const j of readdirSync(dossier).filter(d => /^\d{4}-/.test(d)).sort()) {
    for (const f of readdirSync(join(dossier, j)).filter(x => x.startsWith('obs-')).sort()) {
      for (const ligne of gunzipSync(readFileSync(join(dossier, j, f))).toString().split('\n')) {
        if (!ligne) continue;
        const o = JSON.parse(ligne);
        const t = Date.parse(o.t) / 1000;
        if (o.rel === 'CANCELED' && o.stop === undefined) { annul.set(o.trip, t); continue; }
        const cle = `${o.trip}|${o.stop}|${o.seq}`;
        const e = ev.get(cle);
        if (e) { e[0] = t; e[1] = o.rel; e[2] = o.ad; e[3] = o.dd; e[4] = o.as; e[5] = o.ds; }
        else ev.set(cle, [t, o.rel, o.ad, o.dd, o.as, o.ds, o.stop, o.trip]);
      }
    }
  }
  const tripGares = new Map();
  for (const [, e] of ev) {
    const [tLast, rel, ad, dd, as, ds, stop, trip] = e;
    const tEvt = ds ?? as; if (!tEvt) continue;
    const frais = (tEvt - tLast) <= FRAIS;
    const retard = dd ?? ad ?? null;
    const tTheo = tEvt - (retard ?? 0);
    const jour = jourM(tTheo); if (!COMPLETS.includes(jour)) continue;
    const g = identite(net, stop);
    const cle = `${net}|${g.id}`;
    (tripGares.get(trip) ?? tripGares.set(trip, new Set()).get(trip)).add(cle);
    let G = gares.get(cle);
    if (!G) { G = { net, nom: g.nom, jours: {} }; gares.set(cle, G); }
    const J = (G.jours[jour] ??= { n: 0, frais: 0, ponct: Object.fromEntries(SEUILS.map(s => [s, 0])), skip: 0, annul: 0, heures: new Array(24).fill(0), evts: [] });
    J.n++;
    const minute = Math.floor(((tTheo - 3 * 3600) % 86400) / 60);
    J.heures[Math.floor(minute / 60)]++;
    if (rel === 'SKIPPED') J.skip++;
    if (frais) {
      J.frais++;
      if (retard != null) for (const s of SEUILS) if (retard <= s) J.ponct[s]++;
      J.evts.push([minute, retard ?? 0, 1]);
    } else J.evts.push([minute, null, 0]);
  }
  for (const [trip, t] of annul) {
    const jour = jourM(t);
    for (const c of tripGares.get(trip) ?? []) { const J = gares.get(c)?.jours?.[jour]; if (J) J.annul++; }
  }
}

// Sélection : gares avec du volume sur au moins 4 des 6 journées
const retenues = [];
for (const [cle, G] of gares) {
  const jours = COMPLETS.filter(j => G.jours[j] && G.jours[j].n >= 3);
  if (jours.length < 4) continue;
  const n = jours.map(j => G.jours[j].n), frais = jours.map(j => G.jours[j].frais);
  const somme = a => a.reduce((x, y) => x + y, 0);
  retenues.push({
    cle, net: G.net, nom: G.nom, jours: jours.length,
    N: somme(n) / jours.length,
    Nfrais: somme(frais) / jours.length,
    manquant: 1 - somme(frais) / somme(n),
    ponct: Object.fromEntries(SEUILS.map(s => [s, somme(jours.map(j => G.jours[j].ponct[s])) / Math.max(1, somme(frais))])),
    annul: somme(jours.map(j => G.jours[j].annul)) / jours.length,
    skip: somme(jours.map(j => G.jours[j].skip)) / jours.length,
    heures: COMPLETS.reduce((acc, j) => { const h = G.jours[j]?.heures; if (h) h.forEach((v, i) => acc[i] += v); return acc; }, new Array(24).fill(0)).map(v => v / jours.length),
    parJour: Object.fromEntries(jours.map(j => [j, { n: G.jours[j].n, frais: G.jours[j].frais, p300: G.jours[j].ponct[300] / Math.max(1, G.jours[j].frais) }])),
  });
}
retenues.sort((a, b) => b.N - a.N);
console.log(`Gares retenues (>=3 trains sur >=4 journées) : ${retenues.length}`);
console.log(`  N moyen : min ${retenues.at(-1).N.toFixed(1)} | médiane ${retenues[Math.floor(retenues.length / 2)].N.toFixed(1)} | max ${retenues[0].N.toFixed(1)}`);

// Ponctualité globale par seuil et par réseau
console.log('\nPonctualité observée (fraîche) par réseau et par seuil de retard :');
const parNet = {};
for (const r of retenues) { (parNet[r.net] ??= []).push(r); }
console.log('  réseau'.padEnd(20) + SEUILS.map(s => `<=${s}s`.padStart(9)).join('') + '   gares');
for (const [net, arr] of Object.entries(parNet)) {
  const poids = arr.reduce((a, r) => a + r.Nfrais, 0);
  const l = SEUILS.map(s => (arr.reduce((a, r) => a + r.ponct[s] * r.Nfrais, 0) / poids * 100).toFixed(1).padStart(8) + '%').join('');
  console.log(`  ${net.padEnd(18)}${l}   ${arr.length}`);
}
// Répartition des gares par ponctualité (seuil 300 s) : combien sous 50 % (progression négative)
for (const s of SEUILS) {
  const sous50 = retenues.filter(r => r.ponct[s] < 0.5).length;
  const net0 = retenues.filter(r => r.ponct[s] >= 0.5 && r.ponct[s] < 0.6).length;
  console.log(`  seuil ${String(s).padStart(3)} s : ${(sous50 / retenues.length * 100).toFixed(1)} % des gares sous 50 % de ponctualité (jauge qui ne monte jamais), ${(net0 / retenues.length * 100).toFixed(1)} % entre 50 et 60 %`);
}

writeFileSync(join(RACINE, '..', 'stations.json.gz'), gzipSync(JSON.stringify(retenues)));
// Timelines détaillées pour toutes les gares retenues, petites gares comprises
const top = new Set(retenues.map(r => r.cle));
const timelines = {};
for (const [cle, G] of gares) if (top.has(cle)) timelines[cle] = Object.fromEntries(COMPLETS.filter(j => G.jours[j]).map(j => [j, G.jours[j].evts]));
writeFileSync(join(RACINE, '..', 'timelines.json.gz'), gzipSync(JSON.stringify(timelines)));
console.log(`\nÉcrit : stations.json.gz (${retenues.length} gares) et timelines.json.gz (${Object.keys(timelines).length} gares)`);
