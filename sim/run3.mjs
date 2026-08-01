#!/usr/bin/env node
// Seconde simulation : formations, profils tactiques, bots statiques et adaptatifs.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CFG, CATALOGUE, FORMATIONS, simuler, creerJoueur, rng, coutK } from './moteur2.mjs';

const BASE = process.argv[2] || '..';
const stations = JSON.parse(gunzipSync(readFileSync(`${BASE}/../stations.json.gz`)).toString());
const timelines = JSON.parse(gunzipSync(readFileSync(`${BASE}/../timelines.json.gz`)).toString());
const JOURS = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];
const pool = stations.filter(s => timelines[s.cle] && s.Nfrais >= 8).sort((a, b) => b.Nfrais - a.Nfrais);

// ---- Profils tactiques (section 11.4) ----
export const PROFILS = {
  offensif:    { G: ['relanceRapide'], D: ['debordeEtCentre', 'premierRelanceur', 'enOpposition'], M: ['frappeDeLoin', 'passeProfondeur', 'boxToBox'], A: ['frappeImmediate', 'dribbleEtFrappe', 'finition'] },
  equilibre:   { G: ['surSaLigne'], D: ['enOpposition', 'epauleContreEpaule', 'interception'], M: ['passeProfondeur', 'centrePremiere', 'frappeDeLoin'], A: ['finition', 'frappeImmediate', 'tetePlongeante'] },
  defensif:    { G: ['mainOpposee'], D: ['tacleGlisse', 'priseADeux', 'epauleContreEpaule'], M: ['repliDefensif', 'jeuDePossession', 'recuperateur'], A: ['frappeImmediate', 'renardDesSurfaces'] },
  passes:      { G: ['relanceRapide'], D: ['premierRelanceur', 'enOpposition', 'interception'], M: ['passeProfondeur', 'uneDeux', 'transversale'], A: ['finition', 'appelEtFrappe', 'passeDecisive'] },
  centres:     { G: ['surSaLigne'], D: ['debordeEtCentre', 'jeuDeTete', 'epauleContreEpaule'], M: ['centrePremiere', 'centrePremiere', 'passeProfondeur'], A: ['tetePlongeante', 'repriseDeVolee', 'frappeImmediate'] },
  frappes:     { G: ['surSaLigne'], D: ['enOpposition', 'epauleContreEpaule', 'tacleGlisse'], M: ['frappeDeLoin', 'frappeDeLoin', 'boxToBox'], A: ['frappeImmediate', 'frappeImmediate', 'dribbleEtFrappe'] },
  penetrantes: { G: ['parade'], D: ['debordeEtCentre', 'premierRelanceur', 'enOpposition'], M: ['frappeDeLoin', 'passeProfondeur', 'transversale'], A: ['dribbleEtFrappe', 'appelEtFrappe', 'repriseDeVolee'] },
  seconds:     { G: ['parade'], D: ['enOpposition', 'priseADeux', 'enOpposition'], M: ['suivi', 'centrePremiere', 'frappeDeLoin'], A: ['renardDesSurfaces', 'renardDesSurfaces', 'frappeImmediate'] },
  possession:  { G: ['surSaLigne'], D: ['interception', 'enOpposition', 'premierRelanceur'], M: ['jeuDePossession', 'uneDeux', 'boxToBox'], A: ['finition', 'passeDecisive', 'frappeImmediate'] },
  transitions: { G: ['relanceRapide'], D: ['premierRelanceur', 'premierRelanceur', 'enOpposition'], M: ['uneDeux', 'transversale', 'centrePremiere'], A: ['finition', 'tetePlongeante', 'frappeImmediate'] },
};

// ---- Bot adaptatif (section 11.5) ----
function politiqueAdaptative(j, ctx) {
  const moi = j.equipe, adv = 1 - moi;
  const a = (type, eq) => ctx.etatsActifs(type, eq).length;
  const passeAlliee = a('passe', moi), centreAllie = a('centre', moi);
  const passeAdverse = a('passe', adv), centreAdverse = a('centre', adv);
  const blocsContreAdv = ctx.etats.filter(e => e.type === 'blocContre' && e.equipe === adv && e.charges > 0).length;
  const defAerienneAdv = a('domination', adv);
  const mene = ctx.S.buts[moi] > ctx.S.buts[adv], memene = ctx.S.buts[moi] < ctx.S.buts[adv];
  switch (j.poste) {
    case 'A':
      if (passeAlliee) return 'finition';                       // consommer une passe disponible
      if (centreAllie) return 'tetePlongeante';                 // consommer un centre disponible
      if (blocsContreAdv >= 2) return 'renardDesSurfaces';       // seconds ballons probables
      return memene ? 'dribbleEtFrappe' : 'frappeImmediate';
    case 'M':
      if (passeAdverse >= 2) return 'jeuDePossession';           // gêner un jeu de passes
      if (blocsContreAdv >= 2) return 'suivi';
      if (defAerienneAdv) return 'passeProfondeur';              // ne plus centrer contre une défense aérienne
      if (mene) return 'repliDefensif';                          // protéger l'avantage
      return memene ? 'frappeDeLoin' : 'centrePremiere';
    case 'D':
      if (centreAdverse >= 1) return 'dominationAerienne';
      if (passeAdverse >= 1) return 'interception';
      if (mene) return 'priseADeux';
      return memene ? 'debordeEtCentre' : 'enOpposition';
    case 'G':
      if (centreAdverse >= 2) return 'sortieAerienne';
      return mene ? 'mainOpposee' : 'parade';
  }
}

// ---- Composition ----
function composer(profil, formation, graine, exclure = new Set()) {
  const alea = rng(graine);
  const f = FORMATIONS[formation];
  const dispo = pool.filter(s => !exclure.has(s.cle));
  const pris = new Set();
  const tirer = (n, min, max) => {
    const c = dispo.filter(s => !pris.has(s.cle) && s.Nfrais >= min && s.Nfrais < max);
    const out = [];
    while (out.length < n && c.length) { const i = Math.floor(alea() * c.length); out.push(c[i]); pris.add(c[i].cle); c.splice(i, 1); }
    while (out.length < n) { const r = dispo.find(s => !pris.has(s.cle)); if (!r) break; pris.add(r.cle); out.push(r); }
    return out;
  };
  const eq = [];
  const ajouter = (sts, poste) => sts.forEach((s, i) => eq.push(creerJoueur(s, poste, profil[poste][i % profil[poste].length], 0)));
  ajouter(tirer(1, 40, 1e9), 'G');
  ajouter(tirer(f.D, 20, 1e9), 'D');
  ajouter(tirer(f.M, 30, 1e9), 'M');
  ajouter(tirer(f.A, 40, 1e9), 'A');
  return eq;
}

function evenements(equipes, graine) {
  const alea = rng(graine);
  const m = new Map();
  for (const eq of equipes) for (const j of eq) {
    const tl = timelines[j.cle]; const out = [];
    for (let d = 0; d < CFG.dureeMatchJours; d++) {
      for (const [minute, retard, frais] of tl[JOURS[d % JOURS.length]] || []) {
        const ok = frais ? retard <= CFG.seuilRetardS : alea() < j.p;
        out.push([d * 1440 + minute, ok ? CFG.gainPositif : CFG.gainNegatif]);
      }
    }
    m.set(j, out.sort((x, y) => x[0] - y[0]));
  }
  return m;
}

export function duel(pA, pB, fA, fB, n = 100, adaptatif = false) {
  const r = { buts: [], butsA: [], butsB: [], frappes: [], bloq: [], blocsActifs: [], echecs: [], seconds: [], secondsU: [],
    centresExp: [], passesExp: [], joursSansBut: 0, joursExplosifs: 0, jours: 0, chaineMax: 0, cascades: 0, consignes: {} };
  for (let g = 1; g <= n; g++) {
    for (const sens of [0, 1]) {
      const p1 = sens ? pB : pA, p2 = sens ? pA : pB, f1 = sens ? fB : fA, f2 = sens ? fA : fB;
      const e1 = composer(PROFILS[p1], f1, g * 7919 + sens * 13);
      const e2 = composer(PROFILS[p2], f2, g * 6577 + sens * 29, new Set(e1.map(j => j.cle)));
      e2.forEach(j => j.equipe = 1);
      const evts = evenements([e1, e2], g * 104729 + sens);
      const S = simuler([e1, e2], evts, rng(g * 31337 + sens), adaptatif ? { politique: politiqueAdaptative, periodeDecisionMin: 180 } : {});
      const bA = sens ? S.buts[1] : S.buts[0], bB = sens ? S.buts[0] : S.buts[1];
      r.buts.push(S.buts[0] + S.buts[1]); r.butsA.push(bA); r.butsB.push(bB);
      r.frappes.push(S.frappes[0] + S.frappes[1]);
      r.bloq.push((S.frappesBloquees[0] + S.frappesBloquees[1]) / Math.max(1, S.frappes[0] + S.frappes[1]));
      r.blocsActifs.push(S.blocsActifsMoyen);
      r.echecs.push((S.echecsConditionnels[0] + S.echecsConditionnels[1]) / Math.max(1, S.declenchements[0] + S.declenchements[1]));
      r.seconds.push(S.seconds[0] + S.seconds[1]); r.secondsU.push(S.secondsUtilises[0] + S.secondsUtilises[1]);
      r.centresExp.push(S.centresExpires[0] + S.centresExpires[1]); r.passesExp.push(S.passesExpirees[0] + S.passesExpirees[1]);
      for (let e = 0; e < 2; e++) for (let d = 0; d < CFG.dureeMatchJours; d++) {
        r.jours++; const b = S.butsParJour[e][d];
        if (b === 0) r.joursSansBut++; if (b > 3) r.joursExplosifs++;
      }
      r.chaineMax = Math.max(r.chaineMax, ...(S.chaines.length ? S.chaines : [0]));
      r.cascades += S.cascades;
      for (const [k, v] of Object.entries(S.parConsigne)) r.consignes[k] = (r.consignes[k] || 0) + v;
    }
  }
  return r;
}

export const stat = a => {
  const s = [...a].sort((x, y) => x - y);
  const moy = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - moy) ** 2, 0) / a.length);
  return { moy, med: s[s.length >> 1], p10: s[Math.floor(s.length * .1)], p90: s[Math.floor(s.length * .9)], ic: 1.96 * sd / Math.sqrt(a.length) };
};

if (process.argv[1].endsWith('run3.mjs')) {
  const N = Number(process.env.N || 60);
  console.log(`Pool : ${pool.length} gares. ${N} tirages par duel, roles alternes (soit ${N * 2} matchs par ligne).\n`);
  console.log('=== A. PROFILS TACTIQUES EN 4-4-2, BOTS STATIQUES ===');
  console.log('duel'.padEnd(30) + 'buts/match'.padStart(12) + 'buts/eq/jour'.padStart(14) + 'IC95'.padStart(8) + 'frappes'.padStart(9) + 'bloq.'.padStart(7) + 'blocs'.padStart(7) + 'j. sans but'.padStart(12));
  const noms = Object.keys(PROFILS);
  for (const [a, b] of [['equilibre', 'equilibre'], ['offensif', 'offensif'], ['defensif', 'defensif'], ['offensif', 'defensif'],
    ['passes', 'equilibre'], ['centres', 'equilibre'], ['frappes', 'equilibre'], ['penetrantes', 'defensif'],
    ['seconds', 'equilibre'], ['possession', 'equilibre'], ['transitions', 'equilibre']]) {
    const r = duel(a, b, '4-4-2', '4-4-2', N);
    const s = stat(r.buts);
    console.log(`${a} vs ${b}`.padEnd(30) + s.med.toFixed(1).padStart(12) + (s.moy / 14).toFixed(2).padStart(14) +
      ('+-' + (s.ic / 14).toFixed(2)).padStart(8) + stat(r.frappes).med.toFixed(0).padStart(9) +
      `${(stat(r.bloq).moy * 100).toFixed(0)}%`.padStart(7) + stat(r.blocsActifs).moy.toFixed(1).padStart(7) +
      `${(r.joursSansBut / r.jours * 100).toFixed(0)}%`.padStart(12));
  }

  console.log('\n=== B. FORMATIONS (profil equilibre des deux cotes) ===');
  console.log('formation A vs B'.padEnd(30) + 'buts/match'.padStart(12) + 'buts A'.padStart(9) + 'buts B'.padStart(9) + 'bloq.'.padStart(7) + 'blocs actifs'.padStart(14));
  for (const [fa, fb] of [['4-4-2', '4-4-2'], ['3-4-3', '5-4-1'], ['3-4-3', '3-4-3'], ['5-3-2', '5-3-2'], ['4-3-3', '4-5-1'], ['5-4-1', '5-4-1'], ['4-3-3', '4-3-3']]) {
    const r = duel('equilibre', 'equilibre', fa, fb, N);
    console.log(`${fa} vs ${fb}`.padEnd(30) + stat(r.buts).med.toFixed(1).padStart(12) + stat(r.butsA).moy.toFixed(1).padStart(9) +
      stat(r.butsB).moy.toFixed(1).padStart(9) + `${(stat(r.bloq).moy * 100).toFixed(0)}%`.padStart(7) + stat(r.blocsActifs).moy.toFixed(1).padStart(14));
  }

  console.log('\n=== C. BOTS STATIQUES CONTRE BOTS ADAPTATIFS ===');
  console.log('scenario'.padEnd(30) + 'buts/match'.padStart(12) + 'bloq.'.padStart(8) + 'echecs cond'.padStart(13) + 'centres exp'.padStart(13) + '2e ballons util.'.padStart(17));
  for (const [lib, ad] of [['statiques', false], ['adaptatifs', true]]) {
    const r = duel('equilibre', 'equilibre', '4-4-2', '4-4-2', N, ad);
    console.log(`equilibre 4-4-2, ${lib}`.padEnd(30) + stat(r.buts).med.toFixed(1).padStart(12) + `${(stat(r.bloq).moy * 100).toFixed(0)}%`.padStart(8) +
      `${(stat(r.echecs).moy * 100).toFixed(0)}%`.padStart(13) + stat(r.centresExp).moy.toFixed(0).padStart(13) +
      `${stat(r.secondsU).moy.toFixed(0)}/${stat(r.seconds).moy.toFixed(0)}`.padStart(17));
  }
  const rA = duel('centres', 'defensif', '4-3-3', '5-3-2', N, true);
  const rS = duel('centres', 'defensif', '4-3-3', '5-3-2', N, false);
  console.log(`centres 4-3-3 vs defensif 5-3-2 : statiques ${stat(rS.buts).med.toFixed(1)} buts, adaptatifs ${stat(rA.buts).med.toFixed(1)} buts`);
  console.log(`  centres expires : statiques ${stat(rS.centresExp).moy.toFixed(0)}, adaptatifs ${stat(rA.centresExp).moy.toFixed(0)}`);
  console.log(`  cascades de bonus declenchees : ${rS.cascades} (statiques), ${rA.cascades} (adaptatifs) | chaine max de seconds ballons : ${Math.max(rS.chaineMax, rA.chaineMax)}`);
}
