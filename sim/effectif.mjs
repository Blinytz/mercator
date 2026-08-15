#!/usr/bin/env node
// ============================================================
// Effectif jouable · du catalogue de 6 555 gares à une saison tenable
//
// Le catalogue qualifié dit quelles gares SONT jouables. Il n'en fait pas un
// jeu : 6 555 joueurs pour 8 équipes, et 72 % d'entre eux allemands, ce n'est
// ni jouable ni intéressant. Ce module en tire un effectif, sur deux règles.
//
// **Une pyramide.** Plus le statut est élevé, plus il est rare. Douze
// superstars au maximum, comme une génération de football n'en produit qu'une
// poignée. Le reste s'élargit vers la base.
//
// **Un équilibrage par pays, par remplissage progressif.** À chaque tour, la
// place suivante va au pays le moins servi qui a encore des candidats. Les
// pays profonds ne prennent que le surplus dont les autres n'ont pas l'usage :
// l'Allemagne cesse d'écraser le catalogue sans qu'on ait à la brider par un
// plafond arbitraire, et la Finlande, qui n'a que 17 gares qualifiées, donne
// tout ce qu'elle a sans qu'on lui invente des joueurs.
//
// À statut et pays donnés, les gares sont prises par volume décroissant : ce
// sont les plus fréquentées, donc les plus reconnaissables.
//
// Usage : node sim/effectif.mjs [total]     (défaut : la pyramide ci-dessous)
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construireNoms } from './noms.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

// Les emblèmes. Ces gares entrent dans l'effectif quoi qu'il arrive, en plus
// des quotas, parce qu'un jeu ferroviaire sans Lyon Part-Dieu ni Marseille
// Saint-Charles manquerait quelque chose.
//
// Elles sont là parce que l'équilibrage par pays, qui traite la France comme
// la Finlande, n'accordait que deux places de superstar à un pays qui en a
// vingt : dix-huit gares majeures sortaient, et le trou était brutal, la
// française suivante retenue tombant de 472 à 190 mouvements par jour.
// Plutôt que de tordre l'équilibrage, on nomme les exceptions.
const EMBLEMES = [
  'Lyon Part Dieu', 'Bordeaux Saint-Jean', 'Lille Flandres',
  'Marseille Saint-Charles', 'Juvisy', 'Toulouse Matabiau', 'Lyon Perrache',
  'Paris Gare de Lyon Hall 1 - 2', 'Paris Gare du Nord', 'Nantes',
  'Paris Montparnasse Hall 1 - 2',   // déjà retenue par les quotas, listée par cohérence
];

// Gares écartées de l'effectif alors qu'elles sont qualifiées. Elles restent
// au catalogue : c'est un choix de casting, pas un rejet de qualité.
const ECARTEES = [
  // Deux gares homonymes du LIRR, et le concepteur veut le nom court pour la
  // plus grosse. La petite sort, remplacée par le candidat suivant.
  'Islip',
];

// La pyramide. Modifiable ici, c'est le seul réglage de l'effectif.
const PYRAMIDE = [
  ['superstar', 12],
  ['star', 28],
  ['titulaire', 70],
  ['rotation', 120],
  ['petit joueur', 130],
];

// ---- Lecture du catalogue ----
const csv = readFileSync(join(RACINE, 'docs', 'catalogue-retenus.csv'), 'utf8').trim().split('\n');
const col = Object.fromEntries(csv[0].split(';').map((e, i) => [e, i]));
const toutes = csv.slice(1).map(l => {
  const c = l.split(';');
  return {
    cle: c[col.gare], net: c[col.reseau], pays: c[col.pays],
    N: +c[col.N], ponctualite: +c[col.ponctualite], fraicheur: +c[col.fraicheur],
    distincts: +c[col.distincts], annulesJour: +c[col.annulesJour],
    statut: c[col.statut], K: +c[col.K],
  };
}).sort((a, b) => b.N - a.N);

// L'écart se fait sur le nom complet de la gare, seul identifiant lisible.
const nomsCatalogue = construireNoms(toutes.map(g => ({ cle: g.cle, net: g.net })));
const estEcartee = g => ECARTEES.includes(nomsCatalogue.get(g.net + '|' + g.cle)?.complet);
const candidatesToutes = toutes.filter(g => !estEcartee(g));

// ---- Remplissage progressif ----
// La place suivante va toujours au pays le moins servi qui a encore des
// candidats. C'est ce qui produit l'équilibre sans plafond arbitraire.
function repartir(candidats, quota) {
  const parPays = {};
  for (const g of candidats) (parPays[g.pays] ??= []).push(g);
  for (const p of Object.keys(parPays)) parPays[p].sort((a, b) => b.N - a.N);
  const pris = Object.fromEntries(Object.keys(parPays).map(p => [p, 0]));
  const retenu = [];
  while (retenu.length < quota) {
    const dispo = Object.keys(parPays).filter(p => pris[p] < parPays[p].length);
    if (!dispo.length) break;
    // Le moins servi ; à égalité, le pays au vivier le plus profond, pour que
    // le surplus aille là où il ne prive personne.
    dispo.sort((a, b) => pris[a] - pris[b] || parPays[b].length - parPays[a].length);
    const p = dispo[0];
    retenu.push(parPays[p][pris[p]++]);
  }
  return retenu;
}

const effectif = [];
const manques = [];
for (const [statut, quota] of PYRAMIDE) {
  const candidats = candidatesToutes.filter(g => g.statut === statut);
  const choisis = repartir(candidats, quota);
  if (choisis.length < quota) manques.push(`${statut} : ${choisis.length} sur ${quota} demandés`);
  for (const g of choisis) effectif.push(g);
}

// ---- Les emblèmes, ajoutés par-dessus les quotas ----
// Il faut leur nom de gare complet pour les reconnaître : le catalogue ne
// porte que l'identité technique, on passe donc par le module de noms.
const nomsBruts = nomsCatalogue;
const dejaPris = new Set(effectif.map(g => g.net + '|' + g.cle));
const ajoutes = [];
for (const emblème of EMBLEMES) {
  const g = toutes.find(x => nomsBruts.get(x.net + '|' + x.cle)?.complet === emblème);
  if (!g) { manques.push(`emblème introuvable au catalogue : ${emblème}`); continue; }
  if (dejaPris.has(g.net + '|' + g.cle)) continue;     // déjà retenue par les quotas
  effectif.push(g);
  dejaPris.add(g.net + '|' + g.cle);
  ajoutes.push(g);
}

// ---- Noms de joueurs ----
// La rareté des mots est calculée sur TOUT le catalogue, pas sur le seul
// effectif : « Berlin » doit rester un mot fréquent même si une seule gare
// berlinoise est retenue, sinon il redeviendrait un nom.
const rang = new Map(effectif.map((g, i) => [g.cle, i]));
const ordreNommage = [...toutes].sort((a, b) => {
  const ra = rang.has(a.cle) ? rang.get(a.cle) : 1e9;
  const rb = rang.has(b.cle) ? rang.get(b.cle) : 1e9;
  return ra - rb || b.N - a.N;               // l'effectif sert en premier
});
const noms = construireNoms(ordreNommage.map(g => ({ cle: g.cle, net: g.net })));
for (const g of effectif) {
  const n = noms.get(g.net + '|' + g.cle);
  g.nom = n.nom; g.gareComplete = n.complet; g.motifNom = n.motif || '';
  g.reseau = g.net;      // la colonne du fichier s'appelle reseau, l'objet net
}

// ---- Synthèse ----
const PAYS = [...new Set(effectif.map(g => g.pays))];
console.log(`EFFECTIF DE LA SAISON 1 · ${effectif.length} joueurs pour 8 equipes\n`);
if (manques.length) console.log('Quotas non remplis :\n  ' + manques.join('\n  ') + '\n');

console.log('REPARTITION');
const entete = 'pays'.padEnd(14) + PYRAMIDE.map(([s]) => s.slice(0, 9).padStart(11)).join('') + 'total'.padStart(9);
console.log(entete);
const parPaysStatut = {};
for (const g of effectif) ((parPaysStatut[g.pays] ??= {})[g.statut] ??= []).push(g);
const totaux = Object.fromEntries(PAYS.map(p => [p, effectif.filter(g => g.pays === p).length]));
for (const p of PAYS.sort((a, b) => totaux[b] - totaux[a])) {
  console.log(p.padEnd(14)
    + PYRAMIDE.map(([s]) => String((parPaysStatut[p][s] || []).length).padStart(11)).join('')
    + String(totaux[p]).padStart(9)
    + `  ${(100 * totaux[p] / effectif.length).toFixed(0)} %`);
}
console.log('TOTAL'.padEnd(14) + PYRAMIDE.map(([s, q]) => String(q).padStart(11)).join('') + String(effectif.length).padStart(9));

console.log('\nLES DOUZE SUPERSTARS');
for (const g of effectif.filter(g => g.statut === 'superstar')) {
  console.log(`  ${g.nom.padEnd(26)} ${g.pays.padEnd(12)} N=${String(g.N).padStart(7)}  ponct ${String(g.ponctualite).padStart(5)} %  K=${g.K}`);
}

console.log('\nECHANTILLON PAR PAYS (meilleur de chaque statut)');
for (const p of PAYS) {
  const noms5 = PYRAMIDE.map(([s]) => (parPaysStatut[p][s] || [])[0]).filter(Boolean)
    .map(g => `${g.nom} (${g.statut.slice(0, 4)})`);
  console.log(`  ${p.padEnd(13)} ${noms5.join(', ')}`);
}

// ---- Fichier ----
const entetes = ['nom', 'pays', 'statut', 'N', 'K', 'ponctualite', 'fraicheur', 'distincts', 'annulesJour', 'gareComplete', 'motifNom', 'reseau', 'cle'];
writeFileSync(join(RACINE, 'docs', 'effectif-saison-1.csv'),
  entetes.join(';') + '\n' + effectif.map(g => entetes.map(k => String(g[k] ?? '').replace(/;/g, ',')).join(';')).join('\n') + '\n');
console.log(`\nEcrit : docs/effectif-saison-1.csv (${effectif.length} joueurs)`);
