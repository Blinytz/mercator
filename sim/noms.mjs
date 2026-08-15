#!/usr/bin/env node
// ============================================================
// Noms de joueurs · un seul nom, court, prononçable, unique
//
// Une gare s'appelle « Saint-Étienne-de-Montluc » ou « Hamm (Westf)
// Hauptbahnhof ». Un joueur s'appelle Montluc. Ce module fait la traduction.
//
// Le nom complet reste conservé pour la fiche du joueur : on simplifie ce qui
// s'affiche sur le terrain, on ne perd rien.
//
// SIX RÈGLES, dans cet ordre.
//
// 1. Retirer tout ce qui dit « ceci est une gare » : Hauptbahnhof, Centraal,
//    Centrum, station, stasjon, et les marqueurs de réseau S, U, S+U.
// 2. Couper aux particules de localisation et ne garder qu'un morceau :
//    « Saint-Étienne-de-Montluc » donne Montluc, « Banyuls-sur-Mer » Banyuls,
//    « Saint-Saturnin-lès-Avignon » Saturnin. Le morceau retenu est le plus
//    rare, car le plus fréquent désigne l'agglomération, pas la gare.
// 3. Retirer les orientations, Nord, Süd, West, Oost, sauf si c'est le dernier
//    mot debout : une gare qui ne s'appelle que « Nord » garde Nord.
// 4. Retirer le « Saint » initial : Saint-Saturnin joue sous le nom de
//    Saturnin, comme le concepteur l'a tranché.
// 5. Quand plusieurs noms de lieux sont accolés, n'en garder qu'un, le plus
//    rare : « Wolterdingen Soltau » donne Wolterdingen, « Bornel Belle-Église »
//    donne Bornel.
// 6. Pas de nom composé, sauf en France où il reste rare et nécessaire :
//    Part-Dieu se tient, Belle-Église non.
//
// Les cas que ces règles traitent mal sont corrigés à la main dans EXCEPTIONS,
// chacun avec son motif. C'est volontaire : une règle qui essaierait de tout
// couvrir produirait plus de dégâts que la douzaine de décisions qu'elle évite.
//
// Export : construireNoms(entrees) -> Map(cle -> { nom, complet })
// ============================================================

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(RACINE, 'state', 'refdata');

// ---- Décisions prises à la main --------------------------------------
// Clé : le nom complet de la gare. Valeur : le nom de joueur retenu.
// Chaque ligne est un arbitrage que les règles ne savent pas rendre seules.
export const EXCEPTIONS = {
  // -- Patronymes : l'usage colle le préfixe, et c'est lui qui fait le nom.
  'Drogheda Mac Bride': 'MacBride',
  'Dun Laoghaire (Mallin)': 'Mallin',

  // -- Noms propres en deux mots. Les couper les détruirait : « New Haven »
  // n'est pas « New » plus « Haven ». À distinguer de deux villes accolées,
  // « Wolterdingen Soltau », où l'on ne garde qu'un nom.
  'Grand Central': 'Grand Central',
  'Fortitude Valley station': 'Fortitude Valley',
  'Kew Gardens': 'Kew Gardens',
  'Hempstead Gardens': 'Hempstead Gardens',
  'Penn Station': 'Penn',

  // -- Homonymes réels : le qualificatif fait partie de l'identité de la gare,
  // le retirer confondrait deux gares distinctes du même réseau.
  'Wynnum station': 'Wynnum',
  'Wynnum Central station': 'Wynnum Central',
  'Islip': 'Islip',
  'Central Islip': 'Central Islip',
  'West Hempstead': 'West Hempstead',
  'Veenendaal Centrum': 'Veenendaal',
  'Veenendaal West': 'Veenendaal West',

  // -- Abréviations laissées tronquées par le producteur.
  'S+U Friedrichstr. Bhf (Berlin)': 'Friedrichstraße',
  'S Ostkreuz Bhf (Berlin)': 'Ostkreuz',
  'S Südkreuz Bhf (Berlin)': 'Südkreuz',
  'S Westkreuz (Berlin)': 'Westkreuz',

  // -- Générique accolé à un lieu : le générique saute.
  'Eygelshoven Markt': 'Eygelshoven',
  'Tara Street': 'Tara',

  // -- France. Le composé n'est gardé que s'il est le nom, jamais s'il situe.
  'Lyon Part Dieu': 'Part-Dieu',
  'Paris Montparnasse Hall 1 - 2': 'Montparnasse',
  'Brive-la-Gaillarde': 'Brive',                    // « la Gaillarde » est un surnom de ville
  'Castelnau-d\'Estrétefonds': 'Castelnau',
  'Tain-l\'Hermitage - Tournon': 'Tain',
  'Lamotte-Beuvron': 'Lamotte',
  'Pas des Lanciers': 'Lanciers',                   // « Pas » seul ne nomme rien
  'Saint-Médard-d\'Eyrans': 'Médard',
  'Saint-Cyr-en-Val': 'Cyr',                        // « Val » seul ne nomme rien
  'Saint-Sulpice-Laurière': 'Laurière',             // commune double : le second terme est le plus distinctif
  'Les Sables-d\'Olonne': 'Olonne',
  'La Ferté-Saint-Aubin': 'Aubin',                  // « Ferté » est déjà ambigu, voir La Ferté-sous-Jouarre
  'Saint-Dié-des-Vosges': 'Dié',                    // décision incertaine, voir le rapport
};

// ---- Reconstitution du nom d'origine ---------------------------------
function tableNoms(source) {
  const noms = new Map();
  if (!existsSync(REF)) return noms;
  const fichiers = readdirSync(REF)
    .filter(f => f.startsWith(`${source}_stops`) && f.endsWith('.json.gz')).sort();
  for (const f of fichiers) {
    let arrets;
    try { arrets = JSON.parse(gunzipSync(readFileSync(join(REF, f))).toString()).arrets || {}; }
    catch { continue; }
    for (const a of Object.values(arrets)) {
      if (!a) continue;
      const parent = a[1] && arrets[a[1]] ? arrets[a[1]] : null;
      const nom = (parent ? parent[0] : a[0]) || '';
      const lat = parent ? parent[2] : a[2], lon = parent ? parent[3] : a[3];
      if (!nom) continue;
      const compact = nom.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!compact) continue;
      const cle = lat ? `${compact}@${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}` : 'N' + compact;
      noms.set(cle, nom.trim());
    }
  }
  return noms;
}

function tableUic() {
  const noms = new Map();
  const fichiers = existsSync(REF) ? readdirSync(REF).filter(f => f.startsWith('fr_sncf_stops')).sort() : [];
  for (const f of fichiers) {
    let arrets;
    try { arrets = JSON.parse(gunzipSync(readFileSync(join(REF, f))).toString()).arrets || {}; }
    catch { continue; }
    for (const [id, a] of Object.entries(arrets)) {
      const m = id.match(/(\d{7,8})/);
      if (m && a[0]) noms.set('UIC' + m[1], a[0].trim());
    }
  }
  return noms;
}

function tableCodes(source) {
  const noms = new Map();
  const fichiers = existsSync(REF) ? readdirSync(REF).filter(f => f.startsWith(`${source}_stops`)).sort() : [];
  for (const f of fichiers) {
    let arrets;
    try { arrets = JSON.parse(gunzipSync(readFileSync(join(REF, f))).toString()).arrets || {}; }
    catch { continue; }
    for (const [id, a] of Object.entries(arrets)) {
      if (!a?.[0]) continue;
      const code = id.replace(/_\d+$/, '');
      if (!noms.has(code)) noms.set(code, a[0].trim());
    }
  }
  return noms;
}

// ---- Règle 1 : ce qui dit « gare » ------------------------------------
const MOTS_GARE = new RegExp('\\b(' + [
  'hauptbahnhof', 'hbf', 'bahnhof', 'bhf', 'bf', 'haltepunkt',
  'gare', 'sncf', 'centraal', 'centrum', 'centre', 'center', 'central',
  'station', 'stations', 'stasjon', 'railway', 'rail', 'asema', 'holdeplass',
  'strasse', 'straße', 'str', 'street', 'st', 'road', 'rd', 'terminal',
  'platform', 'stop', 'halt',
].join('|') + ')\\b', 'gi');

const BRUIT = [
  /^\s*S\s*\+\s*U\b/i, /^\s*[SU]\s+(?=[A-ZÄÖÜ])/,
  /\bstop\s*\d+\b.*$/i, /\bplatform\s*\d+\b.*$/i, /\bhall\s*[\d\s-]+$/i,
  /\bnear\b.*$/i, /\bkryss\b.*$/i, /\bsnuplass\b.*$/i, /\bgleis\s*\d+.*$/i,
];

// ---- Règle 2 : particules de localisation -----------------------------
// Elles annoncent un complément de lieu : ce qui suit situe, ce qui précède
// ou ce qui suit peut nommer, on choisira par la rareté.
const PARTICULES = /\s*[-\s](?:sur|sous|lès|les|le[zs]|en|de|du|d'|des|am|an\s+der|an|im|ob|bei|auf|op|aan|a\/d|upon|on|by|nad|ved)[-\s]\s*/i;

// ---- Règle 3 : orientations ------------------------------------------
const ORIENTATIONS = new Set(['nord', 'sud', 'est', 'ouest', 'north', 'south', 'east', 'west',
  'nord', 'süd', 'sued', 'ost', 'west', 'oost', 'noord', 'zuid', 'øst', 'vest', 'nedre', 'øvre',
  'upper', 'lower', 'old', 'new', 'neu', 'alt', 'oben', 'unten', 'ober', 'unter', 'mitte', 'midt']);

// ---- Règle 4 : le « Saint » initial -----------------------------------
const SAINTS = /^(saint|sainte|sankt|st|ste|sant|san)[-\s]+/i;

// Mots qui ne nomment personne.
const OUTILS = new Set(['de', 'du', 'des', 'et', 'and', 'the', 'og', 'i', 'zu', 'auf', 'la', 'le', 'les', 'van', 'der', 'den', 'die', 'das', 'am', 'an', 'im', 'op', 'aan', 'bei']);

const SEUIL_VILLE = 3;   // à partir de 3 gares partageant le mot, c'est une agglomération

function nettoyer(nom) {
  let t = nom;
  for (const r of BRUIT) t = t.replace(r, ' ');
  t = t.replace(/\(([^)]*)\)/g, ' $1 ');
  t = t.replace(MOTS_GARE, ' ');
  t = t.replace(/[_/,;.]+/g, ' ');
  t = t.replace(/\s+-\s+/g, ' ');
  t = t.replace(/\s+-(?=\S)/g, ' ').replace(/(?<=\S)-\s+/g, ' ');
  t = t.replace(/\s+/g, ' ').replace(/^[-\s]+|[-\s]+$/g, '');
  return t;
}

const normal = m => m.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
const utile = m => {
  const n = normal(m);
  return n && !OUTILS.has(n) && !/^\d+$/.test(n) && n.replace(/[^a-zà-ÿ]/g, '').length > 1;
};

// ============================================================
export function construireNoms(entrees) {
  const tables = {};
  const uic = tableUic();

  // Passe 1 : nom d'origine, et fréquence des mots sur tout le catalogue.
  const bruts = new Map();
  const frequence = new Map();
  // Indexé par réseau ET clé : une gare frontalière comme Eygelshoven existe
  // dans deux réseaux avec la même clé, et un index par clé seule les
  // confondrait, la seconde écrasant la première.
  const idx = (net, cle) => net + '|' + cle;
  for (const { cle, net } of entrees) {
    let nom = '';
    if (net === 'fr_sncf') nom = uic.get(cle) || '';
    else if (net === 'fi_digitraffic') { tables.fi ??= tableCodes('fi_digitraffic'); nom = tables.fi.get(cle) || cle; }
    else { tables[net] ??= tableNoms(net); nom = tables[net].get(cle) || ''; }
    bruts.set(idx(net, cle), nom);
    for (const m of new Set(nettoyer(nom).split(/[\s-]+/).filter(utile).map(normal))) {
      frequence.set(m, (frequence.get(m) || 0) + 1);
    }
  }

  const rarete = m => frequence.get(normal(m)) || 0;

  // Choisit le segment le plus rare, à égalité le premier : c'est ce qui donne
  // Wolterdingen plutôt que Soltau, et Bornel plutôt que Belle-Église.
  function meilleur(segments) {
    let choix = null;
    for (const s of segments) {
      const mots = s.split(/[\s-]+/).filter(utile);
      if (!mots.length) continue;
      const score = Math.min(...mots.map(rarete));
      if (!choix || score < choix.score) choix = { s, score };
    }
    return choix ? choix.s : '';
  }

  // Passe 2 : simplification.
  const pris = new Map();
  const resultat = new Map();
  const journal = [];
  for (const { cle, net } of entrees) {
    const original = bruts.get(idx(net, cle)) || cle;
    let nom, motif = '';

    if (EXCEPTIONS[original]) {
      nom = EXCEPTIONS[original];
      motif = 'exception';
    } else {
      const propre = nettoyer(original);
      // Règle 2 : couper aux particules, garder le morceau le plus rare.
      const segments = propre.split(PARTICULES).filter(Boolean);
      let choisi = segments.length > 1 ? meilleur(segments) : propre;
      if (!choisi) choisi = propre;

      // Règle 5 : plusieurs lieux accolés, on garde le plus rare.
      let mots = choisi.split(/\s+/).filter(utile);
      // Règle 3 : orientations retirées, sauf si elles sont tout ce qui reste.
      const sansOrientation = mots.filter(m => !ORIENTATIONS.has(normal(m)));
      if (sansOrientation.length) mots = sansOrientation;
      if (mots.length > 1) {
        let iBest = 0;
        for (let i = 1; i < mots.length; i++) if (rarete(mots[i]) < rarete(mots[iBest])) iBest = i;
        // Un mot fréquent au milieu de mots rares est l'agglomération.
        mots = [mots[iBest]];
        motif = 'plusieurs lieux, gardé le plus rare';
      }
      nom = mots.join(' ') || choisi;

      // Règle 4 : le « Saint » initial saute s'il reste quelque chose.
      const sansSaint = nom.replace(SAINTS, '');
      if (sansSaint && sansSaint !== nom && utile(sansSaint.split(/[-\s]/)[0])) {
        nom = sansSaint; motif = motif ? motif + ' ; Saint retiré' : 'Saint retiré';
      }

      // Règle 6 : composé toléré en France seulement.
      if (nom.includes('-') && net !== 'fr_sncf') {
        const part = nom.split('-').filter(utile);
        if (part.length > 1) {
          let iBest = 0;
          for (let i = 1; i < part.length; i++) if (rarete(part[i]) < rarete(part[iBest])) iBest = i;
          nom = part[iBest];
          motif = motif ? motif + ' ; composé réduit' : 'composé réduit';
        }
      }
      nom = nom.replace(/^[-\s]+|[-\s]+$/g, '');
      if (!nom) { nom = nettoyer(original) || original; motif = 'aucune simplification possible'; }
    }

    // Unicité : sur collision, on revient au nom complet nettoyé, puis on suffixe.
    const cleNom = nom.toLowerCase();
    if (pris.has(cleNom)) {
      const secours = nettoyer(original).replace(/\s+/g, ' ').trim();
      if (secours && !pris.has(secours.toLowerCase())) {
        journal.push({ cle, original, nom, retenu: secours, raison: 'collision avec ' + pris.get(cleNom) });
        nom = secours;
      } else {
        let n = 2;
        while (pris.has(`${nom} ${n}`.toLowerCase())) n++;
        journal.push({ cle, original, nom, retenu: `${nom} ${n}`, raison: 'collision non résolue avec ' + pris.get(cleNom) });
        nom = `${nom} ${n}`;
      }
    }
    pris.set(nom.toLowerCase(), nom);
    resultat.set(idx(net, cle), { nom, complet: original, motif });
  }
  resultat.journalCollisions = journal;
  return resultat;
}
