#!/usr/bin/env node
// ============================================================
// Noms de joueurs · du code technique au nom prononçable
//
// L'identité de gare fabriquée à la collecte est volontairement brutale :
// minuscules, ponctuation supprimée, coordonnées accolées. Elle sert à
// reconnaître une gare malgré des identifiants qui changent, pas à être lue.
// « Hamm (Westf) Hauptbahnhof » y devient « hammwestfhauptbahnhof ».
//
// Ce module rend leur vrai nom aux gares, puis en tire un nom de joueur à la
// façon du football : un NOM, celui qu'on lit sur le maillot, unique dans tout
// le catalogue, et un PRÉNOM qui situe sans encombrer. Toulouse Matabiau joue
// sous le nom de Matabiau, prénom Toulouse.
//
// **Le nom retenu est le mot le plus RARE, pas le dernier.** Une première
// version prenait le dernier mot significatif : elle donnait « Dieu » pour
// Lyon Part-Dieu et « Berlin » pour Ostkreuz Bhf (Berlin), la ville étant
// écrite à la fin en allemand. La rareté tranche sans connaître les langues :
// dans un catalogue ferroviaire, Berlin revient des dizaines de fois et
// Ostkreuz une seule, donc Ostkreuz identifie et Berlin situe.
//
// Export : construireNoms(entrees) -> Map(cle -> { nom, prenom, complet })
// entrees : [{ cle, net }] triées par importance décroissante, car en cas de
// collision c'est la plus petite gare qui prend le nom composé.
// ============================================================

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(RACINE, 'state', 'refdata');

// ---- Reconstitution du nom d'origine ----------------------------------
// On rejoue la fabrication d'identité du collecteur sur la table d'arrêts,
// ce qui donne l'inverse : identité -> nom tel que le producteur l'écrit.
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

// La Finlande s'identifie par code officiel (TKL, PSL) et non par nom+position.
// Sa table d'arrêts, construite depuis le 15 août par src/horaires.mjs, donne
// la correspondance ; le dictionnaire ci-dessous ne sert plus que de secours.
function tableCodes(source) {
  const noms = new Map();
  const fichiers = existsSync(REF) ? readdirSync(REF).filter(f => f.startsWith(`${source}_stops`)).sort() : [];
  for (const f of fichiers) {
    let arrets;
    try { arrets = JSON.parse(gunzipSync(readFileSync(join(REF, f))).toString()).arrets || {}; }
    catch { continue; }
    for (const [id, a] of Object.entries(arrets)) {
      if (!a?.[0]) continue;
      const code = id.replace(/_\d+$/, '');     // le quai n'est pas la gare
      if (!noms.has(code)) noms.set(code, a[0].trim());
    }
  }
  return noms;
}

const NOMS_FI = {
  HKI: 'Helsinki', PSL: 'Pasila', TKL: 'Tikkurila', TPE: 'Tampere', TKU: 'Turku',
  OL: 'Oulu', KUO: 'Kuopio', JY: 'Jyväskylä', LH: 'Lahti', KV: 'Kouvola',
  RI: 'Riihimäki', HML: 'Hämeenlinna', SLO: 'Salo', KKN: 'Kirkkonummi',
  LOH: 'Lohja', MRL: 'Myyrmäki', KIL: 'Kilo', HK: 'Hanko', SK: 'Seinäjoki',
  JNS: 'Joensuu', VS: 'Vaasa', KEM: 'Kemi', ROI: 'Rovaniemi', PM: 'Pieksämäki',
  OLK: 'Oulunkylä', ML: 'Malmi', 'KÄP': 'Käpylä', KE: 'Kerava', HP: 'Hiekkaharju',
  PJM: 'Pohjois-Haaga', KAN: 'Kannelmäki', PLA: 'Pitäjänmäki', LPV: 'Leppävaara',
  EPO: 'Espoo', KLH: 'Kauklahti', MAS: 'Masala', TRL: 'Tuomarila', JRS: 'Järvenpää',
  SAU: 'Saunakallio', PRL: 'Purola', NUP: 'Nuppulinna', RKL: 'Rekola', KYT: 'Koivukylä',
  HKH: 'Hiekkaharju', VMO: 'Vantaankoski', VEH: 'Vehkala', LNA: 'Louhela',
  MLO: 'Martinlaakso', HHL: 'Huopalahti', VLP: 'Valimo', PUS: 'Puistola',
  TNA: 'Tapanila', PMK: 'Pukinmäki', HNA: 'Hiekkaharju',
};

// ---- Nettoyage --------------------------------------------------------
// Les mots qui disent « ceci est une gare » n'identifient personne.
const MOTS_GARE = new RegExp('\\b(' + [
  'hauptbahnhof', 'hbf', 'bahnhof', 'bhf', 'bf', 'haltepunkt',
  'gare', 'sncf', 'centraal', 'station', 'stations', 'stasjon',
  'railway', 'rail', 'asema', 'holdeplass',
].join('|') + ')\\b', 'gi');

// Marqueurs de réseau en tête de nom allemand : S, U, S+U, et quais divers.
const BRUIT = [
  /^\s*S\s*\+\s*U\b/i, /^\s*[SU]\s+(?=[A-ZÄÖÜ])/,
  /\bstop\s*\d+\b.*$/i, /\bplatform\s*\d+\b.*$/i, /\bhall\s*[\d\s-]+$/i,
  /\bnear\b.*$/i, /\bkryss\b.*$/i, /\bsnuplass\b.*$/i, /\bgleis\s*\d+.*$/i,
];

// Mots-outils sans valeur d'identification, retirés avant tout choix.
const OUTILS = new Set(['de', 'du', 'des', 'et', 'and', 'the', 'og', 'i', 'zu', 'auf']);

// Mots génériques de géographie : ils appartiennent au nom quand ils y sont
// (Fortitude Valley, Tara Street) mais ne peuvent jamais faire un prénom à eux
// seuls, car ils ne situent rien.
const GENERIQUES = new Set(['street', 'st', 'str', 'road', 'rd', 'valley', 'junction',
  'hills', 'hill', 'park', 'gardens', 'central', 'centre', 'center', 'north', 'south',
  'east', 'west', 'nord', 'sud', 'est', 'ouest', 'ville', 'stadt', 'city', 'lufthavn',
  'airport', 'terminal', 'oost', 'noord', 'zuid', 'west']);

// À partir de combien d'occurrences un mot cesse d'identifier une gare pour
// désigner une agglomération. « Berlin » revient des dizaines de fois,
// « Ostkreuz » une seule.
const SEUIL_VILLE = 4;

function nettoyer(nom) {
  let t = nom;
  for (const r of BRUIT) t = t.replace(r, ' ');
  t = t.replace(/\(([^)]*)\)/g, ' $1 ');       // « Hamm (Westf) » -> « Hamm Westf »
  t = t.replace(MOTS_GARE, ' ');
  t = t.replace(/[_/,;.]+/g, ' ');
  t = t.replace(/\s+-\s+/g, ' ');              // « Étaples - Le Touquet »
  // Traits d'union orphelins laissés par la parenthèse ouverte :
  // « Selters (Taunus)-Niederselters » devient « Selters Taunus -Niederselters ».
  t = t.replace(/\s+-(?=\S)/g, ' ').replace(/(?<=\S)-\s+/g, ' ');
  t = t.replace(/\s+/g, ' ').replace(/^[-\s]+|[-\s]+$/g, '');
  return t;
}

// Découpe simple : on ne recolle rien, le nom sera repris comme sous-chaîne
// contiguë de l'original. Une version antérieure recollait les jetons et
// produisait « Le-Mans », « Der-Stadt », « Op-Zoom ».
function jetons(propre) {
  return propre.split(/\s+/).filter(m => {
    const n = m.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
    if (!n) return false;
    if (OUTILS.has(n)) return false;
    if (/^\d+$/.test(n)) return false;                       // « 125 »
    if (n.replace(/[^a-zà-ÿ]/g, '').length <= 1) return false; // le « S » de Oslo S
    return true;
  });
}

const estVille = (mot, freq) => {
  const n = mot.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
  return !GENERIQUES.has(n) && (freq.get(n) || 0) >= SEUIL_VILLE;
};

// ============================================================
export function construireNoms(entrees) {
  const tables = {};
  const uic = tableUic();

  // Passe 1 : récupérer le nom d'origine et le découper.
  const decoupes = new Map();
  const frequence = new Map();
  for (const { cle, net } of entrees) {
    let nom = '';
    if (net === 'fr_sncf') nom = uic.get(cle) || '';
    else if (net === 'fi_digitraffic') {
      tables.fi ??= tableCodes('fi_digitraffic');
      nom = tables.fi.get(cle) || NOMS_FI[cle] || cle;
    } else { tables[net] ??= tableNoms(net); nom = tables[net].get(cle) || ''; }
    const j = jetons(nettoyer(nom));
    decoupes.set(cle, { original: nom, jetons: j });
    for (const m of new Set(j.map(x => x.toLowerCase()))) {
      frequence.set(m, (frequence.get(m) || 0) + 1);
    }
  }

  // Passe 2 : on retire les villes en tête et en queue, et ce qui reste au
  // milieu est le nom, repris tel quel, dans son orthographe d'origine.
  const pris = new Set();
  const resultat = new Map();
  for (const { cle } of entrees) {
    const { original, jetons: j } = decoupes.get(cle);
    if (!j.length) {
      const secours = original || cle;
      resultat.set(cle, { nom: secours, prenom: '', complet: secours, sansNom: !original });
      pris.add(secours.toLowerCase());
      continue;
    }

    // On rogne tant qu'il reste au moins un mot : une gare dont tous les mots
    // sont des villes garde le dernier, « Paris Gare de Lyon » donnant Lyon.
    let debut = 0, fin = j.length - 1;
    while (debut < fin && estVille(j[debut], frequence)) debut++;
    while (fin > debut && estVille(j[fin], frequence)) fin--;

    const avant = j.slice(0, debut), apres = j.slice(fin + 1);
    let nom = j.slice(debut, fin + 1).join(' ');
    let prenom = [...avant, ...apres].join(' ');

    // Unicité du nom porté sur le maillot : on lui rend d'abord son prénom,
    // du plus proche au plus lointain, avant de recourir à un suffixe.
    if (pris.has(nom.toLowerCase())) {
      for (let k = avant.length - 1; k >= 0 && pris.has(nom.toLowerCase()); k--) {
        nom = avant[k] + ' ' + nom;
        prenom = [...avant.slice(0, k), ...apres].join(' ');
      }
      for (let k = 0; k < apres.length && pris.has(nom.toLowerCase()); k++) {
        nom = nom + ' ' + apres[k];
        prenom = avant.join(' ');
      }
    }
    if (pris.has(nom.toLowerCase())) {
      let n = 2;
      while (pris.has(`${nom} ${n}`.toLowerCase())) n++;
      nom = `${nom} ${n}`;
    }
    pris.add(nom.toLowerCase());
    resultat.set(cle, { nom, prenom, complet: original || cle });
  }
  return resultat;
}
