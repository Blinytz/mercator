#!/usr/bin/env node
// ============================================================
// Profils tactiques et politique des clubs adverses
//
// Extraits de sim/run3.mjs le 16 août pour être partagés avec le calage :
// l'équilibrage doit se mesurer contre des adversaires qui réagissent, jamais
// contre des adversaires passifs.
//
// LA POLITIQUE A ÉTÉ RÉÉCRITE le 16 août. L'ancienne rendait le bot PLUS
// FACILE à battre qu'un adversaire qui ne faisait rien : 67 % de victoires
// humaines contre lui, 13 % contre un bot bridé. Elle ne jouait pas mieux,
// elle se découvrait.
//
// La cause était mécanique. Dans le moteur, seul un BLOC ACTIF empêche un but.
// Or l'ancienne politique envoyait ses défenseurs sur `interception`,
// `dominationAerienne` et `debordeEtCentre`, et son gardien sur
// `sortieAerienne` : aucune de ces consignes ne produit de bloc. La ligne
// défensive se déshabillait d'elle-même, et l'attaque adverse marquait sans
// obstacle.
//
// La nouvelle politique tient une DOCTRINE plutôt qu'une liste de réflexes :
//
//   1. Le gardien produit toujours un bloc. Sans exception.
//   2. La défense maintient un plancher de charges de blocs actives. Tant que
//      le plancher n'est pas tenu, tous les défenseurs bloquent.
//   3. Au-dessus du plancher, et seulement là, un défenseur peut se projeter.
//   4. Le milieu crée, sauf quand on mène : un milieu redescend couvrir.
//   5. L'attaque consomme ce qui lui est offert avant de tenter sa chance.
//
// Le plancher monte quand le club mène et descend quand il est mené : c'est
// ce qui donne au bot un comportement lisible de vrai entraîneur.
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

// Les seules consignes qui produisent un bloc, donc les seules qui empêchent
// un but. Toute politique défensive qui s'en écarte joue à découvert.
export const BLOQUEURS = {
  G: ['mainOpposee', 'parade', 'relanceRapide', 'surSaLigne'],
  D: ['tacleGlisse', 'priseADeux', 'epauleContreEpaule', 'enOpposition', 'premierRelanceur'],
  M: ['repliDefensif'],
};

// ============================================================
// Politique adverse, réglable.
//
// agressivite : 0 verrouille, 1 se découvre. 0,35 par défaut, ce qui donne un
// club qui défend d'abord et attaque quand il peut. C'est aussi un curseur de
// difficulté honnête : un club plus agressif est plus facile à battre.
// ============================================================
export function creerPolitique(reglages = {}) {
  const agressivite = reglages.agressivite ?? 0.35;
  const equipeCiblee = reglages.equipe ?? 1;      // par défaut, les adversaires seulement

  return function politique(j, ctx) {
    if (equipeCiblee != null && j.equipe !== equipeCiblee) return null;
    const moi = j.equipe, adv = 1 - moi;
    const actifs = (type, eq) => ctx.etatsActifs(type, eq).length;

    // Charges de blocs encore vivantes dans mon camp : c'est la seule mesure
    // qui dise si le but est gardé.
    const chargesBloc = ctx.etats
      .filter(e => e.equipe === moi && e.charges > 0 && (e.type === 'blocArret' || e.type === 'blocContre'))
      .reduce((s, e) => s + e.charges, 0);

    const nbDefenseurs = ctx.joueurs.filter(p => p.equipe === moi && p.poste === 'D').length;
    const mene = ctx.S.buts[moi] > ctx.S.buts[adv];
    const menace = ctx.S.buts[adv] - ctx.S.buts[moi];

    // Plancher de couverture : combien de charges de blocs il faut tenir.
    // On monte la garde quand on mène, on la baisse quand il faut aller
    // chercher le score. L'agressivité rabote le tout.
    let plancher = nbDefenseurs + (mene ? 2 : 0) - (menace > 2 ? 1 : 0);
    plancher = Math.max(1, Math.round(plancher * (1 - 0.5 * agressivite)));
    const decouvert = chargesBloc < plancher;

    const passeAlliee = actifs('passe', moi), centreAllie = actifs('centre', moi);
    const passeAdverse = actifs('passe', adv), centreAdverse = actifs('centre', adv);
    const defAerienneAdv = actifs('domination', adv);
    const blocsContreAdv = ctx.etats
      .filter(e => e.type === 'blocContre' && e.equipe === adv && e.charges > 0).length;

    switch (j.poste) {
      // 1. Le gardien produit TOUJOURS un bloc. C'est la règle qui manquait.
      case 'G':
        if (menace > 0 || decouvert) return 'mainOpposee';   // arrêt net, deux charges
        if (mene) return 'parade';                            // deux charges, on tient
        return 'relanceRapide';                               // cinq charges et une passe

      // 2. La défense tient le plancher avant tout autre considération.
      case 'D':
        if (decouvert) {
          // Sous le plancher : on bloque, en choisissant selon la menace.
          if (centreAdverse >= 1) return 'epauleContreEpaule';
          if (passeAdverse >= 1) return 'priseADeux';         // deux charges
          return 'tacleGlisse';                               // la plus longue
        }
        // 3. Au-dessus du plancher seulement, un défenseur peut sortir.
        if (menace > 0 && agressivite > 0.2) return 'debordeEtCentre';
        if (passeAdverse >= 2) return 'interception';
        return 'enOpposition';

      // 4. Le milieu crée, sauf quand il faut couvrir.
      case 'M':
        if (decouvert) return 'repliDefensif';                // il rentre dans le bloc
        if (mene && agressivite < 0.6) return 'repliDefensif';
        if (passeAdverse >= 2) return 'jeuDePossession';
        if (blocsContreAdv >= 2) return 'suivi';
        if (defAerienneAdv) return 'passeProfondeur';
        return menace > 0 ? 'frappeDeLoin' : 'passeProfondeur';

      // 5. L'attaque consomme ce qu'on lui donne avant de tenter sa chance.
      case 'A':
        if (passeAlliee) return 'finition';
        if (centreAllie) return 'tetePlongeante';
        if (blocsContreAdv >= 2) return 'renardDesSurfaces';
        return menace > 0 ? 'dribbleEtFrappe' : 'frappeImmediate';
    }
  };
}

// Politique par défaut, conservée sous son ancien nom pour ne rien casser.
export const politiqueAdaptative = creerPolitique();
