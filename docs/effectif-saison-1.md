# Effectif de la saison 1 · 360 joueurs

Établi le 15 août 2026 à partir du catalogue qualifié de 6 555 gares, sur trois
demandes du concepteur : casser la domination allemande, rendre les noms
prononçables, et ramener l'effectif à une taille jouable.

## Ce qui a changé

| | Catalogue qualifié | Effectif de la saison |
|---|---:|---:|
| Joueurs | 6 555 | **360** |
| Part de l'Allemagne | 72 % | **19 %** |
| Superstars | 377 | **12** |
| Noms illisibles | la majorité | **aucun** |
| Mots par nom | 3 à 5 | **1** dans 353 cas sur 360 |

## La pyramide

Plus le statut est élevé, plus il est rare, comme une génération de football ne
produit qu'une poignée de très grands joueurs.

| Statut | Effectif | N par jour | A |
|---|---:|---|---:|
| Superstar | 12 | 200 et plus | 3 |
| Star | 28 | 100 à 200 | 2,5 |
| Titulaire | 70 | 50 à 100 | 2 |
| Rotation | 120 | 25 à 50 | 1,5 |
| Petit joueur | 130 | 15 à 25 | 1 |

360 joueurs pour 8 équipes, soit 45 par équipe : de quoi composer un onze,
tenir un banc et laisser au mercato de quoi négocier. La réserve des 6 195
autres gares qualifiées reste disponible si le jeu s'ouvre un jour à plus de
clubs.

## L'équilibrage par pays

Aucun plafond arbitraire. À chaque tour d'attribution, la place suivante va au
pays le moins servi qui a encore des candidats : les pays profonds ne
récupèrent que le surplus dont les autres n'ont pas l'usage.

| Pays | Superstar | Star | Titulaire | Rotation | Petit | Total | Part |
|---|---:|---:|---:|---:|---:|---:|---:|
| Allemagne | 2 | 4 | 10 | 17 | 37 | 70 | 19 % |
| France | 2 | 4 | 10 | 17 | 37 | 70 | 19 % |
| Pays-Bas | 2 | 4 | 10 | 17 | 16 | 49 | 14 % |
| États-Unis | 2 | 4 | 10 | 16 | 16 | 48 | 13 % |
| Norvège | 2 | 4 | 9 | 16 | 8 | 39 | 11 % |
| Irlande | 0 | 1 | 9 | 16 | 13 | 39 | 11 % |
| Australie | 1 | 4 | 9 | 16 | 2 | 32 | 9 % |
| Finlande | 1 | 3 | 3 | 5 | 1 | 13 | 4 % |

Deux écarts subsistent, et ils sont réels, pas arbitraires. **L'Irlande n'a
aucune superstar** : aucune gare irlandaise n'atteint 200 mouvements par jour,
Dublin Connolly plafonnant à 177. **La Finlande ne fournit que 13 joueurs** :
elle n'a que 17 gares qualifiées en tout, elle donne donc presque tout ce
qu'elle a. Inventer des joueurs pour combler ces cases aurait été mentir.

Le bas de pyramide reste franco-allemand, faute de petites gares qualifiées
ailleurs. C'est sans conséquence : c'est en haut que se joue la partie.

## Les douze superstars

| Joueur | Pays | N | Ponctualité | K |
|---|---|---:|---:|---:|
| **Ostkreuz** | Allemagne | 1 595 | 96,4 % | 426 |
| **Friedrichstraße** | Allemagne | 1 304 | 96,8 % | 348 |
| **Utrecht** | Pays-Bas | 1 144 | 94,6 % | 305 |
| **Amsterdam** | Pays-Bas | 1 015 | 92,1 % | 271 |
| **Oslo** | Norvège | 838 | 86,6 % | 224 |
| **Jamaica** | États-Unis | 671 | 96,0 % | 179 |
| **Nationaltheatret** | Norvège | 608 | 80,4 % | 163 |
| **Strasbourg** | France | 512 | 94,6 % | 137 |
| **Fortitude Valley** | Australie | 499 | 91,1 % | 133 |
| **Montparnasse** | France | 472 | 92,3 % | 126 |
| **Tikkurila** | Finlande | 467 | 97,9 % | 125 |
| **Penn** | États-Unis | 404 | 94,5 % | 108 |

Nationaltheatret à 80,4 % et Tikkurila à 97,9 % : deux superstars aux profils
opposés, l'une qui trébuche souvent, l'autre presque infaillible. C'est
exactement le contraste recherché.

## Les noms

Un **seul nom**, court et unique, sans prénom : Matabiau s'appelle Matabiau.
Le nom complet de la gare reste dans la fiche du joueur.

Six règles, et une trentaine d'arbitrages pris à la main là où les règles
produisaient un non-mot. Détail complet, cas litigieux compris, dans
`docs/noms-arbitrages.md`.

**360 noms, 360 uniques, 7,7 caractères en moyenne, 353 en un seul mot.**


## Le contraste de ponctualité, préservé

| Pays | Médiane | Étendue |
|---|---:|---|
| Finlande | 97,5 % | 95,5 à 98,0 |
| Pays-Bas | 94,6 % | 73,6 à 97,9 |
| Australie | 92,7 % | 86,8 à 96,7 |
| États-Unis | 91,5 % | 73,8 à 97,1 |
| France | 90,7 % | 72,3 à 97,7 |
| Irlande | 89,2 % | 46,4 à 96,1 |
| Allemagne | 86,6 % | 42,9 à 97,7 |
| Norvège | 86,6 % | 71,1 à 96,8 |

De 42,9 % à 98,0 % : les différences nationales sont conservées sans
normalisation, décision actée, et l'effectif garde toute son amplitude.

## Fichiers

| Fichier | Contenu |
|---|---|
| `docs/effectif-saison-1.csv` | les 360 joueurs : nom, pays, statut, N, K, ponctualité, fraîcheur, gare d'origine |
| `sim/effectif.mjs` | la sélection, pyramide réglable en tête de fichier |
| `sim/noms.mjs` | la fabrication des noms, exceptions comprises |
| `docs/noms-arbitrages.md` | les règles et tous les arbitrages |
| `docs/catalogue-joueurs.md` | le catalogue complet des 6 555 gares qualifiées, qui reste la réserve |
