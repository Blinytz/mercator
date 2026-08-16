#!/usr/bin/env node
// ============================================================
// Moteur d'actions MercatOr, version 3 (règles consolidées du 1er août 2026).
// Simulateur fidèle aux sections 5 à 9 du handoff v3. Aucune valeur en dur :
// tout est dans CFG et CATALOGUE, tous deux modifiables à chaud.
//
// Différences majeures avec la version 1 :
//   - catalogue consolidé (Box-to-box, Transversale, Prise à deux, Parade)
//   - postures à plusieurs charges (un état, N charges)
//   - gel tant qu'un état produit par le joueur reste actif
//   - consigne changée pendant un état actif : mise en attente
//   - jauge entièrement consommée dès qu'une action est tentée
//   - effet « si bloquée » sur les deux types de blocs
//   - cascade de bonus bornée en profondeur
//   - formations et bots adaptatifs
// ============================================================

export const CFG = {
  ponctualiteReference: 0.9,
  seuilRetardS: 300,
  gainPositif: 1,
  gainNegatif: -1,
  productionCible: { superstar: 3, star: 2.5, titulaire: 2, rotation: 1.5, petit: 1 },
  dureeMatchJours: 7,
  chaineSecondsBallonsMax: 5,
  cascadeBonusMax: 3,          // borne ajoutée : voir rapport, non spécifiée par le handoff
  // Délai de réflexe des clubs adverses, en minutes. Réglable par le joueur,
  // bornes comprises : c'est le curseur de difficulté. Deux à quatre heures
  // par défaut, soit le rythme d'un humain attentif mais pas rivé à l'écran.
  reflexeAdverse: { minMinutes: 120, maxMinutes: 240 },
  annulationCompteNegatif: true,   // une annulation vaut un retard, décision du 16 août
  seuilsStatut: { superstar: 200, star: 100, titulaire: 50, rotation: 25 },
};

export const coutK = (coef, K) => Math.max(1, Math.ceil(coef * K));
export const bonusK = (coef, K) => Math.max(1, Math.round(coef * K));

// ---- Catalogue consolidé, section 8 du handoff v3 ----
// produit : frappe | passe | centre | blocArret | blocContre | reactionSecond |
//           reactionCentre | interception | domination | bonusSeul | multi
export const CATALOGUE = {
  // 8.1 Attaquants
  frappeImmediate:   { poste: 'A', coef: 0.8, cond: null,     elimine: 0, produit: 'frappe', duree: 0 },
  dribbleEtFrappe:   { poste: 'A', coef: 1.0, cond: null,     elimine: 1, produit: 'frappe', duree: 0, siBloquee: { cible: 'milieuAdverse', coef: 0.3, n: 1 } },
  repriseDeVolee:    { poste: 'A', coef: 0.9, cond: 'centre', consomme: 'centre', elimine: 1, produit: 'frappe', duree: 0, siBloquee: { cible: 'gardienAdverse', coef: 0.2, n: 1 } },
  tetePlongeante:    { poste: 'A', coef: 0.6, cond: 'centre', consomme: 'centre', elimine: 0, produit: 'frappe', duree: 0, siBloquee: { cible: 'defenseurAdverse', coef: 0.2, n: 1 } },
  appelEtFrappe:     { poste: 'A', coef: 0.9, cond: 'passe',  consomme: 'passe',  elimine: 1, produit: 'frappe', duree: 0 },
  finition:          { poste: 'A', coef: 0.6, cond: 'passe',  consomme: 'passe',  elimine: 0, produit: 'frappe', duree: 0 },
  renardDesSurfaces: { poste: 'A', coef: 0.6, cond: null,     elimine: 0, produit: 'reactionSecond', duree: 3, siBloquee: { cible: 'milieuAdverse', coef: 0.2, n: 1 } },
  passeDecisive:     { poste: 'A', coef: 0.6, cond: null,     elimine: 1, produit: 'passe', duree: 5, bonus: { cible: 'attaquantAllie', coef: 0.2, n: 1 } },
  // 8.2 Milieux
  frappeDeLoin:      { poste: 'M', coef: 1.0, cond: null,     elimine: 1, produit: 'frappe', duree: 0, siBloquee: { cible: 'defenseurAdverse', coef: 0.3, n: 1 } },
  suivi:             { poste: 'M', coef: 1.0, cond: null,     elimine: 0, produit: 'reactionSecond', duree: 8, siBloquee: { cible: 'milieuAdverse', coef: 0.2, n: 1 } },
  centrePremiere:    { poste: 'M', coef: 0.3, cond: null,     elimine: 0, produit: 'centre', duree: 2 },
  recuperateur:      { poste: 'M', coef: 1.0, cond: null,     elimine: 0, produit: 'bonusSeul', duree: 0, bonus: { cible: 'attaquantAllie', coef: 0.3, n: 2 } },
  passeProfondeur:   { poste: 'M', coef: 0.8, cond: null,     elimine: 1, produit: 'passe', duree: 5, bonus: { cible: 'attaquantAllie', coef: 0.3, n: 1 } },
  jeuDePossession:   { poste: 'M', coef: 0.4, cond: null,     elimine: 0, produit: 'engage', duree: 5, malus: { cible: 'milieuAdverse', coef: 0.2, n: 2 } },
  uneDeux:           { poste: 'M', coef: 0.5, cond: 'passe',  consomme: 'passe', elimine: 0, produit: 'passe', duree: 3, bonus: { cible: 'attaquantAllie', coef: 0.2, n: 1 } },
  repliDefensif:     { poste: 'M', coef: 0.7, cond: null,     elimine: 0, produit: 'blocArret', duree: 4 },
  boxToBox:          { poste: 'M', coef: 0.3, cond: null,     elimine: 0, produit: 'bonusSeul', duree: 0, bonus: { cible: 'attaquantAllie', coef: 0.1, n: 3 } },
  transversale:      { poste: 'M', coef: 0.7, cond: 'passe',  consomme: 'passe', elimine: 1, produit: 'passe', duree: 4, bonus: { cible: 'attaquantAllie', coef: 0.2, n: 1 } },
  // 8.3 Défenseurs
  enOpposition:      { poste: 'D', coef: 0.4, cond: null, elimine: 0, produit: 'blocContre', duree: 4 },
  epauleContreEpaule:{ poste: 'D', coef: 0.6, cond: null, elimine: 0, produit: 'blocArret', duree: 4 },
  tacleGlisse:       { poste: 'D', coef: 1.0, cond: null, elimine: 0, produit: 'blocArret', duree: 8 },
  priseADeux:        { poste: 'D', coef: 1.0, cond: null, elimine: 0, produit: 'blocContre', charges: 2, duree: 6 },
  jeuDeTete:         { poste: 'D', coef: 0.6, cond: null, elimine: 0, produit: 'reactionCentre', duree: 3, siBloquee: { cible: 'attaquantAdverse', coef: 0.3, n: 1 } },
  debordeEtCentre:   { poste: 'D', coef: 0.7, cond: null, elimine: 1, produit: 'centre', duree: 8 },
  premierRelanceur:  { poste: 'D', coef: 0.7, cond: null, elimine: 0, produit: 'multi', etats: [['blocContre', 3], ['passe', 3]], duree: 3, bonus: { cible: 'milieuAllie', coef: 0.3, n: 1 } },
  interception:      { poste: 'D', coef: 0.5, cond: null, elimine: 0, produit: 'interception', duree: 6 },
  dominationAerienne:{ poste: 'D', coef: 0.5, cond: null, elimine: 0, produit: 'domination', duree: 6 },
  // 8.4 Gardiens
  surSaLigne:        { poste: 'G', coef: 0.6, cond: null, elimine: 0, produit: 'blocContre', duree: 8 },
  parade:            { poste: 'G', coef: 0.8, cond: null, elimine: 0, produit: 'blocContre', charges: 2, duree: 6 },
  mainOpposee:       { poste: 'G', coef: 1.0, cond: null, elimine: 0, produit: 'blocArret', charges: 2, duree: 6 },
  sortieAerienne:    { poste: 'G', coef: 0.5, cond: null, elimine: 0, produit: 'domination', duree: 6 },
  relanceRapide:     { poste: 'G', coef: 0.8, cond: null, elimine: 0, produit: 'multi', etats: [['blocContre', 5], ['passe', 3]], duree: 5, bonus: { cible: 'milieuAllie', coef: 0.2, n: 1 } },
};

export const FORMATIONS = {
  '3-4-3': { D: 3, M: 4, A: 3 }, '4-3-3': { D: 4, M: 3, A: 3 }, '4-4-2': { D: 4, M: 4, A: 2 },
  '4-5-1': { D: 4, M: 5, A: 1 }, '5-3-2': { D: 5, M: 3, A: 2 }, '5-4-1': { D: 5, M: 4, A: 1 },
};

export function rng(graine) {
  let x = (graine >>> 0) || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

// ============================================================
// Moteur
// ============================================================
export function simuler(equipes, evenementsParJoueur, alea, options = {}) {
  const joueurs = [...equipes[0], ...equipes[1]];
  const etats = [];        // { type, equipe, joueur, expire, cree, charges }
  const S = creerStats();

  for (const j of joueurs) {
    j.jauge = 0; j.consigneEnAttente = null;
    j.stats = { declench: 0, echecs: 0, frappes: 0, buts: 0, kPerdu: 0, engageMin: 0 };
  }

  // File d'événements ferroviaires, triée par heure d'événement
  const file = [];
  for (const j of joueurs) for (const [t, delta] of evenementsParJoueur.get(j) || []) file.push([t, j, delta]);
  file.sort((a, b) => a[0] - b[0] || (a[1].equipe - b[1].equipe));

  const etatsActifs = (type, equipe) => etats.filter(e => e.type === type && e.equipe === equipe && e.charges > 0);
  const plusTot = arr => arr.length ? arr.reduce((a, b) => (b.expire < a.expire || (b.expire === a.expire && b.cree < a.cree)) ? b : a) : null;
  const aUnEtatActif = j => etats.some(e => e.joueur === j && e.charges > 0);

  function expirer(t) {
    for (const e of etats) {
      if (e.charges <= 0 || e.expire > t) continue;
      if (e.type === 'passe') S.passesExpirees[e.equipe]++;
      else if (e.type === 'centre') S.centresExpires[e.equipe]++;
      else if (e.type === 'interception') S.interceptionsExpirees[e.equipe]++;
      else if (e.type === 'domination') S.dominationsExpirees[e.equipe]++;
      else if (e.type === 'blocArret' || e.type === 'blocContre') S.blocsExpires[e.equipe] += e.charges;
      else if (e.type === 'reactionSecond' || e.type === 'reactionCentre') S.reactionsExpirees[e.equipe]++;
      e.charges = 0;
    }
  }

  function candidats(j, cible) {
    const map = {
      attaquantAllie: ['A', true], milieuAllie: ['M', true], defenseurAllie: ['D', true],
      milieuAdverse: ['M', false], attaquantAdverse: ['A', false], defenseurAdverse: ['D', false], gardienAdverse: ['G', false],
    };
    const [poste, allie] = map[cible] || ['M', true];
    // Éligibilité : titulaire en train de charger, donc pas gelé par un état actif
    return joueurs.filter(x => x.poste === poste && (allie ? x.equipe === j.equipe : x.equipe !== j.equipe) && !aUnEtatActif(x));
  }

  function appliquerEffet(j, spec, signe, t, profondeur) {
    if (!spec) return;
    const pool = candidats(j, spec.cible);
    const n = Math.min(spec.n || 1, pool.length);
    const choisis = [];
    if (signe > 0 && /Allie$/.test(spec.cible)) {
      // Ciblage allié préparé : ordre stable (cibles définies à l'avance)
      for (const c of pool) { if (choisis.length < n) choisis.push(c); }
    } else {
      const copie = [...pool];
      while (choisis.length < n && copie.length) choisis.push(copie.splice(Math.floor(alea() * copie.length), 1)[0]);
    }
    for (const cible of choisis) {
      const avant = cible.jauge;
      cible.jauge = Math.max(0, cible.jauge + signe * bonusK(spec.coef, cible.K));
      if (signe > 0) S.bonusVerses[j.equipe]++; else S.malusInfliges[j.equipe]++;
      // Cascade : un bonus peut faire franchir un seuil
      if (signe > 0 && avant < coutK(cible.consigne.coef, cible.K) && cible.jauge >= coutK(cible.consigne.coef, cible.K)) {
        if (profondeur < CFG.cascadeBonusMax) { S.cascades++; declencher(cible, t, profondeur + 1); }
        else S.cascadesBloquees++;
      }
    }
    // Part de bonus perdue si moins de cibles que prévu (section 7)
    if ((spec.n || 1) > choisis.length) S.bonusPerdus[j.equipe] += (spec.n || 1) - choisis.length;
  }

  function resoudreFrappe(j, t, profondeur, chaine = 0) {
    S.frappes[j.equipe]++; j.stats.frappes++;
    const blocs = etats.filter(e => (e.type === 'blocArret' || e.type === 'blocContre') && e.equipe !== j.equipe && e.charges > 0);
    const bloc = plusTot(blocs);
    if (!bloc) { S.buts[j.equipe]++; j.stats.buts++; S.butsParJour[j.equipe][Math.floor(t / 1440)]++; if (chaine) S.chaines.push(chaine); return { bloquee: false }; }
    bloc.charges--;
    S.frappesBloquees[j.equipe]++;
    S.blocsConsommes[1 - j.equipe]++;
    if (bloc.type === 'blocArret') { S.arrets[1 - j.equipe]++; if (chaine) S.chaines.push(chaine); return { bloquee: true }; }
    // Bloc contré : second ballon pour l'équipe qui attaquait
    S.seconds[j.equipe]++;
    if (chaine >= CFG.chaineSecondsBallonsMax) { S.chaines.push(chaine); return { bloquee: true }; }
    const reaction = plusTot(etatsActifs('reactionSecond', j.equipe));
    if (!reaction) { S.secondsPerdus[j.equipe]++; if (chaine) S.chaines.push(chaine); return { bloquee: true }; }
    reaction.charges = 0;
    S.secondsUtilises[j.equipe]++;
    const auteur = reaction.joueur;
    const r2 = resoudreFrappe(auteur, t, profondeur, chaine + 1);
    if (r2.bloquee && auteur.consigne.siBloquee) appliquerEffet(auteur, auteur.consigne.siBloquee, +1, t, profondeur);
    return { bloquee: true };
  }

  function declencher(j, t, profondeur = 0) {
    const c = j.consigne;
    // 5. La jauge est entièrement consommée dès qu'une action est tentée
    const excedent = j.jauge - coutK(c.coef, j.K);
    j.stats.kPerdu += Math.max(0, excedent);
    j.jauge = 0;
    S.declenchements[j.equipe]++; j.stats.declench++;
    S.parConsigne[j.consigneNom] = (S.parConsigne[j.consigneNom] || 0) + 1;

    // 6-7. Condition
    let etatConsomme = null;
    if (c.cond === 'passe' || c.cond === 'centre') {
      etatConsomme = plusTot(etatsActifs(c.cond, j.equipe));
      if (!etatConsomme) { S.echecsConditionnels[j.equipe]++; j.stats.echecs++; S.echecsParConsigne[j.consigneNom] = (S.echecsParConsigne[j.consigneNom] || 0) + 1; return; }
    }
    // 8. Élimination préalable
    for (let i = 0; i < (c.elimine || 0); i++) {
      const b = plusTot(etats.filter(e => (e.type === 'blocArret' || e.type === 'blocContre') && e.equipe !== j.equipe && e.charges > 0));
      if (b) { b.charges--; S.blocsElimines[j.equipe]++; }
    }
    // 9. Bonus et malus immédiats
    if (c.bonus) appliquerEffet(j, c.bonus, +1, t, profondeur);
    if (c.malus) appliquerEffet(j, c.malus, -1, t, profondeur);

    const fin = t + (c.duree || 0) * 60;
    const creer = (type, dureeH, charges = 1) => etats.push({ type, equipe: j.equipe, joueur: j, expire: t + dureeH * 60, cree: t, charges });

    // 10-11. Consommation de l'état requis, puis création
    if (etatConsomme && c.consomme) { etatConsomme.charges = 0; S[c.consomme === 'passe' ? 'passesUtilisees' : 'centresUtilises'][j.equipe]++; }

    switch (c.produit) {
      case 'frappe': {
        const r = resoudreFrappe(j, t, profondeur);
        if (r.bloquee && c.siBloquee) appliquerEffet(j, c.siBloquee, +1, t, profondeur);
        break;
      }
      case 'passe': creer('passe', c.duree); S.passesCreees[j.equipe]++; break;
      case 'centre': creer('centre', c.duree); S.centresCrees[j.equipe]++; break;
      case 'blocArret': creer('blocArret', c.duree, c.charges || 1); S.blocsCrees[j.equipe] += (c.charges || 1); break;
      case 'blocContre': creer('blocContre', c.duree, c.charges || 1); S.blocsCrees[j.equipe] += (c.charges || 1); break;
      case 'reactionSecond': creer('reactionSecond', c.duree); break;
      case 'reactionCentre': {
        const centre = plusTot(etatsActifs('centre', j.equipe));
        if (centre) {
          centre.charges = 0; S.centresUtilises[j.equipe]++;
          const r = resoudreFrappe(j, t, profondeur);
          if (r.bloquee && c.siBloquee) appliquerEffet(j, c.siBloquee, +1, t, profondeur);
        } else creer('reactionCentre', c.duree);
        break;
      }
      case 'interception': {
        const passe = plusTot(etatsActifs('passe', 1 - j.equipe));
        if (passe) { passe.charges = 0; S.passesInterceptees[j.equipe]++; }
        else creer('interception', c.duree);
        break;
      }
      case 'domination': {
        const centre = plusTot(etatsActifs('centre', 1 - j.equipe));
        if (centre) { centre.charges = 0; S.centresNeutralises[j.equipe]++; }
        else creer('domination', c.duree);
        break;
      }
      case 'multi': for (const [type, d] of c.etats) { creer(type, d); if (type === 'passe') S.passesCreees[j.equipe]++; if (type === 'blocContre' || type === 'blocArret') S.blocsCrees[j.equipe]++; } break;
      case 'engage': creer('engage', c.duree); break;
      case 'bonusSeul': break;
    }
    // Prise en compte d'une consigne mise en attente
    if (j.consigneEnAttente && !aUnEtatActif(j)) { appliquerConsigne(j, j.consigneEnAttente); j.consigneEnAttente = null; }
  }

  function appliquerConsigne(j, nom) { j.consigne = CATALOGUE[nom]; j.consigneNom = nom; }
  function changer(j, nom, t) {
    if (nom === j.consigneNom || nom === j.consigneEnAttente) return;
    S.changements[j.equipe]++;
    if (aUnEtatActif(j)) { j.consigneEnAttente = nom; return; }   // 5.5 : mise en attente
    appliquerConsigne(j, nom);
    if (j.jauge >= coutK(j.consigne.coef, j.K)) declencher(j, t);  // déclenchement immédiat possible
  }

  const politique = options.politique || null;
  // Réflexe des clubs adverses : le délai avant qu'ils ne revoient leurs
  // consignes est tiré au hasard dans un intervalle, et non fixe. Un bot qui
  // réagit toujours au même rythme est lisible, et un bot qui réagit
  // instantanément est imbattable. L'intervalle est un réglage du joueur, ses
  // deux bornes comprises : c'est le curseur de difficulté du jeu.
  const reflexeMin = options.reflexeMinMin ?? CFG.reflexeAdverse.minMinutes;
  const reflexeMax = Math.max(reflexeMin, options.reflexeMaxMin ?? CFG.reflexeAdverse.maxMinutes);
  const tirerDelai = () => reflexeMin + Math.floor(alea() * (reflexeMax - reflexeMin + 1));
  let jourCourant = 0, prochaineDecision = tirerDelai();

  for (const [t, j, delta] of file) {
    // 1. Expirations
    expirer(t);
    // Reprise d'une consigne en attente dès que le joueur est libéré
    for (const p of joueurs) if (p.consigneEnAttente && !aUnEtatActif(p)) { appliquerConsigne(p, p.consigneEnAttente); p.consigneEnAttente = null; }
    // Bots adaptatifs : révision périodique des consignes
    if (politique && t >= prochaineDecision) {
      prochaineDecision = t + tirerDelai();
      for (const p of joueurs) {
        const nom = politique(p, { etats, joueurs, S, t, equipe: p.equipe, etatsActifs, aUnEtatActif });
        if (nom && CATALOGUE[nom] && CATALOGUE[nom].poste === p.poste) changer(p, nom, t);
      }
    }
    if (Math.floor(t / 1440) > jourCourant) { jourCourant = Math.floor(t / 1440); S.blocsActifsReleves.push(etats.filter(e => e.charges > 0 && (e.type === 'blocArret' || e.type === 'blocContre')).length); }
    // 2-4. Événement ferroviaire, uniquement si le joueur n'a aucun état actif
    if (aUnEtatActif(j)) { j.stats.engageMin += 1; S.kPerduGel[j.equipe] += Math.max(0, delta); continue; }
    j.jauge = Math.max(0, j.jauge + delta);
    if (j.jauge >= coutK(j.consigne.coef, j.K)) declencher(j, t);
  }
  S.blocsActifsMoyen = S.blocsActifsReleves.length ? S.blocsActifsReleves.reduce((a, b) => a + b, 0) / S.blocsActifsReleves.length : 0;
  return S;
}


function creerStats() {
  const p = () => [0, 0];
  return {
    buts: p(), frappes: p(), frappesBloquees: p(), arrets: p(), seconds: p(), secondsUtilises: p(), secondsPerdus: p(),
    passesCreees: p(), passesUtilisees: p(), passesExpirees: p(), passesInterceptees: p(),
    centresCrees: p(), centresUtilises: p(), centresExpires: p(), centresNeutralises: p(),
    blocsCrees: p(), blocsConsommes: p(), blocsExpires: p(), blocsElimines: p(),
    interceptionsExpirees: p(), dominationsExpirees: p(), reactionsExpirees: p(),
    echecsConditionnels: p(), declenchements: p(), changements: p(), bonusVerses: p(), bonusPerdus: p(), malusInfliges: p(), kPerduGel: p(),
    butsParJour: [new Array(8).fill(0), new Array(8).fill(0)],
    chaines: [], blocsActifsReleves: [], parConsigne: {}, echecsParConsigne: {},
    cascades: 0, cascadesBloquees: 0, blocsActifsMoyen: 0,
  };
}

// ---- Composition ----
export function statutPourN(N) {
  const s = CFG.seuilsStatut;
  if (N >= s.superstar) return 'superstar'; if (N >= s.star) return 'star';
  if (N >= s.titulaire) return 'titulaire'; if (N >= s.rotation) return 'rotation'; return 'petit';
}
export function creerJoueur(st, poste, consigneNom, equipe) {
  const statut = statutPourN(st.Nfrais ?? st.N);
  const A = CFG.productionCible[statut];
  const coefRef = 2 * CFG.ponctualiteReference - 1;
  const K = Math.max(1, Math.ceil(coefRef * (st.Nfrais ?? st.N) / A));
  return { cle: st.cle, nom: st.nom || st.cle.slice(0, 22), net: st.net, statut, K, poste,
    consigne: CATALOGUE[consigneNom], consigneNom, equipe, jauge: 0, consigneEnAttente: null,
    p: st.ponct[CFG.seuilRetardS], N: st.Nfrais ?? st.N };
}
