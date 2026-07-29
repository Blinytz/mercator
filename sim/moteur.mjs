#!/usr/bin/env node
// Simulateur du moteur d'actions MercatOr confronté aux gares réelles du POC.
// Toutes les valeurs d'équilibrage sont dans CFG : rien n'est codé en dur.

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const RACINE = process.argv[2] || 'mercator';
const stations = JSON.parse(gunzipSync(readFileSync(`${RACINE}/../stations.json.gz`)).toString());
const timelines = JSON.parse(gunzipSync(readFileSync(`${RACINE}/../timelines.json.gz`)).toString());
const JOURS = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];

export const CFG = {
  ponctualiteReference: 0.9,
  seuilRetardS: 300,
  gainPositif: 1, gainNegatif: -1,
  productionCible: { superstar: 3, star: 2.5, titulaire: 2, rotation: 1.5, petit: 1 },
  dureeMatchJours: 7,
  arrondiCout: 'plafond',
  chaineSecondsBallonsMax: 5,
};
const coutK = (coef, K) => Math.max(1, Math.ceil(coef * K));
const bonusK = (coef, K) => Math.max(1, Math.round(coef * K));

// ---- Catalogue (section 6 du handoff moteur) ----
// cond : null | 'passe' | 'centre' | reaction differee
// produit : 'frappe' | 'passe' | 'centre' | 'blocArret' | 'blocContre' | 'reactionSecond' | 'reactionCentre' | 'interception' | 'domination' | null
export const CATALOGUE = {
  // Attaquants
  frappeImmediate:   { poste: 'A', coef: 0.8, cond: null, elimine: 0, produit: 'frappe', duree: 0 },
  dribbleEtFrappe:   { poste: 'A', coef: 1.0, cond: null, elimine: 1, produit: 'frappe', duree: 0, siBloque: { cible: 'milieuAdverse', coef: 0.3 } },
  repriseDeVolee:    { poste: 'A', coef: 0.7, cond: 'centre', elimine: 1, produit: 'frappe', duree: 0 },
  tetePlongeante:    { poste: 'A', coef: 0.7, cond: 'centre', elimine: 0, produit: 'frappe', duree: 0, siBloque: { cible: 'milieuAllie', coef: 0.2 } },
  appelEtFrappe:     { poste: 'A', coef: 0.8, cond: 'passe', elimine: 1, produit: 'frappe', duree: 0 },
  finition:          { poste: 'A', coef: 0.6, cond: 'passe', elimine: 0, produit: 'frappe', duree: 0 },
  renardDesSurfaces: { poste: 'A', coef: 0.6, cond: null, elimine: 0, produit: 'reactionSecond', duree: 3 },
  passeDecisive:     { poste: 'A', coef: 0.6, cond: null, elimine: 1, produit: 'passe', duree: 5, bonus: { cible: 'attaquantAllie', coef: 0.2, n: 1 } },
  // Milieux
  frappeDeLoin:      { poste: 'M', coef: 1.0, cond: null, elimine: 1, produit: 'frappe', duree: 0, siBloque: { cible: 'milieuAdverse', coef: 0.3 } },
  suivi:             { poste: 'M', coef: 1.0, cond: null, elimine: 0, produit: 'reactionSecond', duree: 8 },
  centrePremiere:    { poste: 'M', coef: 0.3, cond: null, elimine: 0, produit: 'centre', duree: 2 },
  recuperateur:      { poste: 'M', coef: 1.0, cond: null, elimine: 0, produit: null, duree: 0, bonus: { cible: 'attaquantAllie', coef: 0.3, n: 2 } },
  passeProfondeur:   { poste: 'M', coef: 0.8, cond: null, elimine: 1, produit: 'passe', duree: 5, bonus: { cible: 'attaquantAllie', coef: 0.3, n: 1 } },
  jeuDePossession:   { poste: 'M', coef: 0.5, cond: null, elimine: 0, produit: null, duree: 5, malus: { cible: 'milieuAdverse', coef: 0.2, n: 2 } },
  uneDeux:           { poste: 'M', coef: 0.5, cond: 'passe', consomme: 'passe', elimine: 0, produit: 'passe', duree: 3, bonus: { cible: 'attaquantAllie', coef: 0.2, n: 1 } },
  repliDefensif:     { poste: 'M', coef: 0.7, cond: null, elimine: 0, produit: 'blocArret', duree: 4 },
  // Défenseurs
  enOpposition:      { poste: 'D', coef: 0.5, cond: null, elimine: 0, produit: 'blocContre', duree: 6 },
  epauleContreEpaule:{ poste: 'D', coef: 0.6, cond: null, elimine: 0, produit: 'blocArret', duree: 5 },
  tacleGlisse:       { poste: 'D', coef: 1.0, cond: null, elimine: 0, produit: 'blocArret', duree: 8 },
  jeuDeTete:         { poste: 'D', coef: 0.6, cond: null, elimine: 0, produit: 'reactionCentre', duree: 3, siBloque: { cible: 'attaquantAdverse', coef: 0.3 } },
  debordeEtCentre:   { poste: 'D', coef: 0.7, cond: null, elimine: 1, produit: 'centre', duree: 8 },
  premierRelanceur:  { poste: 'D', coef: 1.0, cond: null, elimine: 0, produit: 'blocContre+passe', duree: 3, bonus: { cible: 'milieuAllie', coef: 0.3, n: 1 } },
  interception:      { poste: 'D', coef: 0.6, cond: null, elimine: 0, produit: 'interception', duree: 6 },
  dominationAerienne:{ poste: 'D', coef: 0.5, cond: null, elimine: 0, produit: 'domination', duree: 6 },
  // Gardiens
  surSaLigne:        { poste: 'G', coef: 0.7, cond: null, elimine: 0, produit: 'blocContre', duree: 8 },
  mainOpposee:       { poste: 'G', coef: 1.0, cond: null, elimine: 0, produit: 'blocArret', n: 2, duree: 6 },
  sortieAerienne:    { poste: 'G', coef: 0.5, cond: null, elimine: 0, produit: 'domination', duree: 6 },
  relanceRapide:     { poste: 'G', coef: 0.8, cond: null, elimine: 0, produit: 'blocArret', duree: 5, siConsomme: { produit: 'passe', duree: 3, bonus: { cible: 'milieuAllie', coef: 0.2, n: 1 } } },
};

// ---- Générateur pseudo-aléatoire déterministe ----
function rng(graine) { let x = graine >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

// ---- Construction d'un joueur ----
function creerJoueur(st, statut, consigne, equipe, alea) {
  const A = CFG.productionCible[statut];
  const coefRef = 2 * CFG.ponctualiteReference - 1;
  const K = Math.max(1, Math.ceil((coefRef * st.N) / A));
  return { cle: st.cle, nom: st.nom || st.cle.slice(0, 20), net: st.net, statut, K, consigne, equipe,
    jauge: 0, geleJusqua: -1, p: st.ponct[CFG.seuilRetardS], N: st.N,
    stats: { evts: 0, plus: 0, moins: 0, declench: 0, echecs: 0, frappes: 0, buts: 0 } };
}

// ---- Événements ferroviaires d'un joueur sur la durée du match ----
function evenements(joueur, alea) {
  const tl = timelines[joueur.cle]; if (!tl) return [];
  const out = [];
  for (let d = 0; d < CFG.dureeMatchJours; d++) {
    const jour = JOURS[d % JOURS.length];
    for (const [minute, retard, frais] of tl[jour] || []) {
      // Observation fraîche : on utilise le retard réel. Sinon on tire selon la
      // ponctualité mesurée de la gare (reconstruction d'une collecte complète).
      const aLheure = frais ? retard <= CFG.seuilRetardS : alea() < joueur.p;
      out.push([d * 1440 + minute, aLheure ? CFG.gainPositif : CFG.gainNegatif]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// ---- Moteur ----
export function simuler(equipeA, equipeB, graine) {
  const alea = rng(graine);
  const joueurs = [...equipeA, ...equipeB];
  for (const j of joueurs) { j.jauge = 0; j.geleJusqua = -1; j.stats = { evts: 0, plus: 0, moins: 0, declench: 0, echecs: 0, frappes: 0, buts: 0 }; }
  const etats = [];   // { type, equipe, expire, source, meta }
  const S = { buts: [0, 0], frappes: [0, 0], bloquees: [0, 0], arrets: [0, 0], seconds: [0, 0], secondsUtilises: [0, 0],
    passesCreees: [0, 0], passesExpirees: [0, 0], centresCrees: [0, 0], centresExpires: [0, 0],
    interceptionsExpirees: [0, 0], dominationsExpirees: [0, 0], echecsConditionnels: [0, 0], declenchements: [0, 0],
    chaines: [], blocsActifs: [], scoreParJour: [] };

  // File d'événements ferroviaires
  const file = [];
  for (const j of joueurs) for (const [t, delta] of evenements(j, alea)) file.push([t, j, delta]);
  file.sort((a, b) => a[0] - b[0]);

  const actifs = (type, equipe) => etats.filter(e => e.type === type && e.equipe === equipe && !e.consomme);
  const plusProche = arr => arr.length ? arr.reduce((a, b) => (b.expire < a.expire || (b.expire === a.expire && b.cree < a.cree)) ? b : a) : null;
  function expirer(t) {
    for (const e of etats) {
      if (e.consomme || e.expire > t) continue;
      e.consomme = true; e.expireNaturellement = true;
      if (e.type === 'passe') S.passesExpirees[e.equipe]++;
      if (e.type === 'centre') S.centresExpires[e.equipe]++;
      if (e.type === 'interception') S.interceptionsExpirees[e.equipe]++;
      if (e.type === 'domination') S.dominationsExpirees[e.equipe]++;
      if (e.joueur) e.joueur.geleJusqua = -1;   // le joueur repart, jauge déjà à zéro
    }
  }
  function ciblerAllie(j, poste) {
    const cands = joueurs.filter(x => x.equipe === j.equipe && x.consigne.poste === poste && x.geleJusqua < 0);
    return cands.length ? cands[Math.floor(alea() * cands.length)] : null;
  }
  function ciblerAdverse(j, poste) {
    const cands = joueurs.filter(x => x.equipe !== j.equipe && x.consigne.poste === poste && x.geleJusqua < 0);
    return cands.length ? cands[Math.floor(alea() * cands.length)] : null;
  }
  function appliquerBonus(j, spec, signe) {
    if (!spec) return;
    const posteMap = { attaquantAllie: ['A', 1], milieuAllie: ['M', 1], milieuAdverse: ['M', 0], attaquantAdverse: ['A', 0] };
    const [poste, allie] = posteMap[spec.cible] || ['M', 1];
    for (let i = 0; i < (spec.n || 1); i++) {
      const cible = allie ? ciblerAllie(j, poste) : ciblerAdverse(j, poste);
      if (!cible) continue;
      cible.jauge = Math.max(0, cible.jauge + signe * bonusK(spec.coef, cible.K));
    }
  }
  function resoudreFrappe(j, t, profondeur = 0) {
    S.frappes[j.equipe]++; j.stats.frappes++;
    const blocs = etats.filter(e => (e.type === 'blocArret' || e.type === 'blocContre') && e.equipe !== j.equipe && !e.consomme);
    const bloc = plusProche(blocs);
    if (!bloc) { S.buts[j.equipe]++; j.stats.buts++; return { but: true, chaine: profondeur }; }
    bloc.consomme = true; S.bloquees[j.equipe]++;
    if (bloc.joueur) bloc.joueur.geleJusqua = -1;
    if (bloc.type === 'blocArret') { S.arrets[1 - j.equipe]++; return { but: false, chaine: profondeur }; }
    // bloc contré : second ballon
    S.seconds[j.equipe]++;
    if (profondeur >= CFG.chaineSecondsBallonsMax) return { but: false, chaine: profondeur };
    const reactions = actifs('reactionSecond', j.equipe);
    const r = plusProche(reactions);
    if (!r) return { but: false, chaine: profondeur };
    r.consomme = true; S.secondsUtilises[j.equipe]++;
    if (r.joueur) r.joueur.geleJusqua = -1;
    return resoudreFrappe(r.joueur || j, t, profondeur + 1);
  }
  function declencher(j, t) {
    const c = j.consigne;
    S.declenchements[j.equipe]++; j.stats.declench++;
    // Condition instantanée
    if (c.cond === 'passe' || c.cond === 'centre') {
      const dispo = plusProche(actifs(c.cond, j.equipe));
      if (!dispo) { S.echecsConditionnels[j.equipe]++; j.stats.echecs++; j.jauge = 0; return; }
      if (c.consomme === 'passe' || c.produit === 'frappe') { dispo.consomme = true; if (dispo.joueur) dispo.joueur.geleJusqua = -1; }
    }
    // Élimination préalable d'un bloc adverse
    for (let i = 0; i < (c.elimine || 0); i++) {
      const b = plusProche(etats.filter(e => (e.type === 'blocArret' || e.type === 'blocContre') && e.equipe !== j.equipe && !e.consomme));
      if (b) { b.consomme = true; if (b.joueur) b.joueur.geleJusqua = -1; }
    }
    const finT = t + (c.duree || 0) * 60;
    const creer = (type, meta = {}) => { etats.push({ type, equipe: j.equipe, expire: finT, cree: t, joueur: j, consomme: false, ...meta }); };
    let bloquee = false;
    switch (c.produit) {
      case 'frappe': { const r = resoudreFrappe(j, t); bloquee = !r.but; if (r.chaine) S.chaines.push(r.chaine); break; }
      case 'passe': creer('passe'); S.passesCreees[j.equipe]++; break;
      case 'centre': creer('centre'); S.centresCrees[j.equipe]++; break;
      case 'blocArret': for (let i = 0; i < (c.n || 1); i++) creer('blocArret', c.siConsomme ? { siConsomme: c.siConsomme } : {}); break;
      case 'blocContre': creer('blocContre'); break;
      case 'blocContre+passe': creer('blocContre'); creer('passe'); S.passesCreees[j.equipe]++; break;
      case 'reactionSecond': creer('reactionSecond'); break;
      case 'reactionCentre': {
        // Jeu de tête : consomme un centre allié actif, sinon attend
        const centre = plusProche(actifs('centre', j.equipe));
        if (centre) { centre.consomme = true; const r = resoudreFrappe(j, t); bloquee = !r.but; }
        else creer('reactionCentre');
        break;
      }
      case 'interception': {
        const passe = plusProche(actifs('passe', 1 - j.equipe));
        if (passe) { passe.consomme = true; if (passe.joueur) passe.joueur.geleJusqua = -1; }
        else creer('interception');
        break;
      }
      case 'domination': {
        const centre = plusProche(actifs('centre', 1 - j.equipe));
        if (centre) { centre.consomme = true; if (centre.joueur) centre.joueur.geleJusqua = -1; }
        else creer('domination');
        break;
      }
    }
    if (bloquee && c.siBloque) appliquerBonus(j, c.siBloque, +1);
    if (c.bonus) appliquerBonus(j, c.bonus, +1);
    if (c.malus) appliquerBonus(j, c.malus, -1);
    j.jauge = 0;
    // Gel du joueur pendant la durée active. CFG.gelDefensif = false permet de
    // tester la variante où poser un bloc n'immobilise pas le défenseur.
    const estDefensif = ['blocArret', 'blocContre', 'blocContre+passe', 'interception', 'domination'].includes(c.produit);
    if ((c.duree || 0) > 0 && !(estDefensif && CFG.gelDefensif === false)) j.geleJusqua = finT;
  }

  let jourCourant = 0;
  for (const [t, j, delta] of file) {
    expirer(t);
    if (Math.floor(t / 1440) > jourCourant) { jourCourant = Math.floor(t / 1440); S.scoreParJour.push([...S.buts]); S.blocsActifs.push(etats.filter(e => !e.consomme && (e.type === 'blocArret' || e.type === 'blocContre')).length); }
    if (j.geleJusqua > t) continue;
    j.stats.evts++; if (delta > 0) j.stats.plus++; else j.stats.moins++;
    j.jauge = Math.max(0, j.jauge + delta);
    const cout = coutK(j.consigne.coef, j.K);
    if (j.jauge >= cout) declencher(j, t);
  }
  S.scoreParJour.push([...S.buts]);
  return S;
}

// ---- Composition d'équipes ----
const parN = [...stations].sort((a, b) => b.N - a.N);
function statutPourN(N) {
  if (N >= 300) return 'superstar'; if (N >= 150) return 'star';
  if (N >= 60) return 'titulaire'; if (N >= 25) return 'rotation'; return 'petit';
}
export function composer(tactique, graine, filtre = () => true, exclure = new Set()) {
  const alea = rng(graine);
  const pool = parN.filter(s => timelines[s.cle] && filtre(s) && !exclure.has(s.cle));
  const pris = new Set();
  const prendre = (n, min, max) => {
    const c = pool.filter(s => !pris.has(s.cle) && s.N >= min && s.N < max);
    const out = [];
    while (out.length < n && c.length) { const i = Math.floor(alea() * c.length); out.push(c[i]); pris.add(c[i].cle); c.splice(i, 1); }
    while (out.length < n) { const r = pool.find(s => !pris.has(s.cle)); if (!r) break; pris.add(r.cle); out.push(r); }
    return out;
  };
  // 1 G, 4 D, 3 M, 3 A avec un mélange de statuts réaliste
  const g = prendre(1, 60, 1e9), d = prendre(4, 25, 1e9), m = prendre(3, 60, 1e9), a = prendre(3, 100, 1e9);
  const eq = [];
  const pousser = (arr, consignes) => arr.forEach((s, i) => eq.push(creerJoueur(s, statutPourN(s.N), CATALOGUE[consignes[i % consignes.length]], 0, alea)));
  pousser(g, tactique.G); pousser(d, tactique.D); pousser(m, tactique.M); pousser(a, tactique.A);
  return eq;
}
export const TACTIQUES = {
  equilibree: { G: ['surSaLigne'], D: ['enOpposition', 'epauleContreEpaule', 'debordeEtCentre', 'interception'], M: ['passeProfondeur', 'centrePremiere', 'frappeDeLoin'], A: ['finition', 'frappeImmediate', 'repriseDeVolee'] },
  offensive: { G: ['relanceRapide'], D: ['debordeEtCentre', 'debordeEtCentre', 'premierRelanceur', 'enOpposition'], M: ['frappeDeLoin', 'passeProfondeur', 'centrePremiere'], A: ['frappeImmediate', 'dribbleEtFrappe', 'finition'] },
  defensive: { G: ['mainOpposee'], D: ['tacleGlisse', 'tacleGlisse', 'epauleContreEpaule', 'enOpposition'], M: ['repliDefensif', 'jeuDePossession', 'recuperateur'], A: ['frappeImmediate', 'frappeImmediate', 'renardDesSurfaces'] },
  passes: { G: ['surSaLigne'], D: ['premierRelanceur', 'enOpposition', 'epauleContreEpaule', 'interception'], M: ['passeProfondeur', 'passeProfondeur', 'uneDeux'], A: ['finition', 'finition', 'appelEtFrappe'] },
  centres: { G: ['surSaLigne'], D: ['debordeEtCentre', 'debordeEtCentre', 'jeuDeTete', 'epauleContreEpaule'], M: ['centrePremiere', 'centrePremiere', 'centrePremiere'], A: ['repriseDeVolee', 'tetePlongeante', 'repriseDeVolee'] },
  seconds: { G: ['surSaLigne'], D: ['enOpposition', 'enOpposition', 'enOpposition', 'epauleContreEpaule'], M: ['suivi', 'frappeDeLoin', 'centrePremiere'], A: ['renardDesSurfaces', 'renardDesSurfaces', 'frappeImmediate'] },
};

if (process.argv[1].endsWith('moteur.mjs')) {
  console.log('Module chargé : ' + stations.length + ' gares, ' + Object.keys(timelines).length + ' timelines.');
}
