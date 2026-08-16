#!/usr/bin/env node
// ============================================================
// Profils tactiques et bot adaptatif
//
// Extraits de sim/run3.mjs le 16 aout pour etre partages avec le calage :
// l'equilibrage doit se mesurer contre des bots adaptatifs, jamais contre des
// adversaires passifs, mesure d'aout a l'appui, les bots adaptatifs doublent
// le nombre de buts dans un duel centres contre defensif.
// ============================================================

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
export function politiqueAdaptative(j, ctx) {
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
