# Moteur d'actions en temps réel · analyse d'équilibrage sur données réelles

Réponse à la demande d'analyse du document de cadrage. Aucun code de production
n'a été modifié. Toutes les mesures viennent des gares réellement collectées
pendant le POC ferroviaire, rejouées dans un simulateur fidèle au catalogue de
consignes.

**Conclusion courte** : le moteur fonctionne et produit des matchs lisibles, mais
les valeurs proposées donnent environ **46 buts par match de 7 jours**, soit 3,3
buts par équipe et par jour. Deux mécaniques dominent tout le reste :
l'élimination préalable de bloc et le gel du joueur pendant un état actif. Avec
quatre correctifs paramétriques, on tombe à **10 buts par match** et un écart
entre tactiques inférieur à 1,2 but, ce qui ressemble enfin à du football.

Un point de calibrage est en revanche remarquablement juste : le coefficient 0,8
fondé sur 90 % de ponctualité correspond presque exactement au réel, à condition
de définir « à l'heure » comme un retard inférieur ou égal à 5 minutes.

---

## 1. Ce que le POC apporte à ce moteur

Le moteur est piloté par des événements individuels en temps réel. Chaque arrêt
de train en gare vaut `+1` ou `-1`. Le collecteur actuel produit exactement cette
matière : une observation par arrêt de train, avec heure théorique, heure
estimée, retard à l'arrivée et au départ, arrêt supprimé et train annulé.

Trois propriétés du collecteur conditionnent le moteur :

1. **L'instant qui compte.** Un arrêt possède une heure estimée d'arrivée et de
   départ. J'ai retenu l'heure de l'événement lui-même (départ, sinon arrivée)
   comme instant où le train fait progresser la jauge. C'est la seule date qui
   ait un sens sportif, et elle est disponible sur 100 % des événements.
2. **Le retard n'est connu que si l'estimation est fraîche.** La loi de fraîcheur
   établie par le POC est ici décisive : une estimation de moins de 5 minutes
   donne le vrai retard, une estimation de plus de 30 minutes vaut l'horaire
   théorique et annonce 92,6 % de trains à l'heure. **Médiane actuelle : 52 % des
   événements d'une gare ne sont pas fraîchement observés.**
3. **Conséquence directe et sévère** : avec la cadence de collecte actuelle,
   une jauge n'avancerait pas régulièrement mais par à-coups, avec des heures de
   silence suivies de rafales. Les notifications temps réel seraient
   massivement décalées. **Les correctifs C1 à C3 du rapport POC cessent d'être
   une amélioration : ils deviennent une condition d'existence du moteur.**

---

## 2. Gares et périodes testées

- **2 743 gares** retenues (au moins 3 trains sur au moins 4 journées), réparties
  sur 7 réseaux et 5 pays : Allemagne 1 220, France 736, Pays-Bas 352, Australie
  154, Metro-North 108, MBTA 123, LIRR 50.
- **6 journées MercatOr complètes**, du 22 au 27 juillet 2026, bornées à 05:00
  heure de Paris.
- Simulations : matchs de 7 jours, effectifs disjoints, rôles domicile et
  extérieur alternés, 8 à 16 tirages par duel, 6 tactiques types.

### Échantillon documenté

| Gare | Réseau | N par jour | Observés | Manquant | Ponct. 60 s | Ponct. 300 s | Annul./j | Amplitude |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Schiphol Airport | NL | 725 | 420 | 42 % | 74 % | 96 % | 5,3 | 24 h, pointe 42/h |
| Rotterdam Centraal | NL | 534 | 270 | 49 % | 71 % | 94 % | 5,0 | 24 h, pointe 30/h |
| Northgate station | AU | 242 | 127 | 47 % | 56 % | 95 % | 0,3 | 22 h, pointe 16/h |
| gare allemande 124940 | DE | 95 | 56 | 41 % | 29 % | 56 % | 0 | 24 h, pointe 6/h |
| Lindum station | AU | 69 | 45 | 34 % | 64 % | 95 % | 0 | 21 h, pointe 5/h |
| Den Haag Mariahoeve | NL | 56 | 36 | 36 % | 87 % | 97 % | 0 | 22 h, pointe 5/h |
| gare allemande 143210 | DE | 45 | 30 | 33 % | 35 % | 74 % | 0 | 23 h, pointe 4/h |

Volume moyen par gare : **100,5 trains en jour ouvré contre 77,3 le week-end**,
soit -23 %. Le moteur produira donc naturellement moins d'action le samedi et le
dimanche, ce qui est plutôt heureux pour un jeu de football.

---

## 3. N, ponctualité et données manquantes

- **N par jour** : médiane 25, p90 83, maximum 725 (Schiphol).
  Le profil « très grande superstar à N = 2 200 » du document de cadrage
  **n'existe pas dans nos données** : la plus grosse gare observée est à 725.
  Les valeurs de K doivent être recalculées sur cette échelle réelle.
- **Ponctualité** (mesurée uniquement sur les observations fraîches) :

| Réseau | ≤ 60 s | ≤ 180 s | ≤ 300 s | ≤ 600 s |
|---|---:|---:|---:|---:|
| Pays-Bas | 66,7 % | 90,9 % | 95,6 % | 98,4 % |
| Australie | 56,2 % | 85,2 % | 94,0 % | 98,7 % |
| Metro-North | 45,3 % | 71,9 % | 86,4 % | 96,5 % |
| LIRR | 48,7 % | 77,3 % | 89,6 % | 98,4 % |
| France | 64,5 % | 65,7 % | 81,8 % | 87,7 % |
| Allemagne | 50,6 % | 70,4 % | 80,4 % | 91,0 % |
| MBTA | 100 % | 100 % | 100 % | 100 % |

  **MBTA est inutilisable en l'état** : 100 % à tous les seuils signifie que le
  flux ne renseigne pas de retard et déclare tout à l'heure. Il faudrait calculer
  le retard en comparant l'heure estimée à l'horaire du GTFS statique, sinon ces
  123 gares seraient des joueurs parfaits et gratuits.
- **Données manquantes** : médiane 52 % des événements non fraîchement observés,
  conséquence de la cadence de collecte et non des sources.

---

## 4. Valeurs de K

Formule du document, `K = plafond(0,8 × N / A)`, appliquée aux volumes réels :

| Statut | A | K si N = 725 | 300 | 100 | 40 | 12 |
|---|---:|---:|---:|---:|---:|---:|
| Superstar | 3 | 194 | 80 | 27 | 11 | 4 |
| Star | 2,5 | 232 | 96 | 32 | 13 | 4 |
| Titulaire | 2 | 290 | 120 | 40 | 16 | 5 |
| Rotation | 1,5 | 387 | 160 | 54 | 22 | 7 |
| Petit joueur | 1 | 580 | 240 | 80 | 32 | 10 |

### Résultat analytique important

Le temps de charge d'une action ne dépend **pas** de la taille de la gare :

```
temps de charge (heures) = 24 × coefficient / A
```

Le `N` s'annule entre la formule de K et le rythme de production. Deux gares de
même statut produisent donc au même rythme, que l'une voie 700 trains et l'autre
40. La taille n'intervient que par le statut qu'on lui attribue, et par la
finesse de la jauge : une petite gare à K = 5 avance par pas de 20 %, une grosse
à K = 290 par pas de 0,3 %.

**C'est une décision de conception à confirmer.** Elle est défendable (le statut
est le vrai curseur de puissance), mais elle signifie qu'une superstar n'est
supérieure que parce qu'on lui a attribué A = 3.

| Coefficient | Superstar | Star | Titulaire | Rotation | Petit |
|---|---:|---:|---:|---:|---:|
| 0,3 K | 2,4 h | 2,9 h | 3,6 h | 4,8 h | 7,2 h |
| 0,5 K | 4,0 h | 4,8 h | 6,0 h | 8,0 h | 12,0 h |
| 0,6 K | 4,8 h | 5,8 h | 7,2 h | 9,6 h | 14,4 h |
| 0,8 K | 6,4 h | 7,7 h | 9,6 h | 12,8 h | 19,2 h |
| 1,0 K | 8,0 h | 9,6 h | 12,0 h | 16,0 h | 24,0 h |

Vérification par rejeu des événements réels (statut titulaire) : le temps de
charge mesuré est **plus court que la théorie** sur les grandes et moyennes gares
(4,8 h contre 7,2 h théoriques pour 0,6 K), parce que leur ponctualité réelle
dépasse souvent 90 % et que les trains se concentrent aux heures de pointe.

### Le coefficient 0,8 est juste, à condition de choisir le bon seuil

| Seuil « à l'heure » | Ponctualité médiane | Coefficient net médian | Rythme réel |
|---|---:|---:|---:|
| 180 s | 78,3 % | 0,57 | 71 % de la cible |
| **300 s** | **89,4 %** | **0,79** | **98 % de la cible** |
| 600 s | 96,6 % | 0,93 | 116 % de la cible |

À 5 minutes, l'hypothèse de 90 % du document est confirmée presque exactement.
C'est aussi le seuil standard du secteur ferroviaire.

Dispersion entre gares à ce seuil : p10 = 67 %, p90 = 100 %. Le rythme relatif
va de 0,42x à 1,25x, médiane 0,98x. **13,9 % des gares tournent à moins de la
moitié du rythme cible, et 2,2 % ne chargent jamais** (ponctualité sous 50 %,
donc progression nette négative et jauge bloquée à zéro).

---

## 5. Résultats des simulations

### Configuration du document, telle quelle

| Duel | Score moyen | Buts/équipe/jour | Frappes bloquées |
|---|---|---:|---:|
| équilibrée vs équilibrée | 25,4 - 25,1 | 3,61 | 34 % |
| offensive vs offensive | 33,5 - 34,3 | 4,84 | 25 % |
| centres vs centres | 28,0 - 33,0 | 4,36 | 19 % |
| défensive vs défensive | 5,7 - 7,4 | 0,93 | 80 % |
| passes vs passes | 13,6 - 15,4 | 2,07 | 36 % |
| seconds ballons vs idem | 11,0 - 12,6 | 1,68 | 67 % |

Buts par match : minimum 13, **médiane 35**, maximum 68. Un match à 25-25 n'est
pas un score de football. Seuls les duels entre équipes très défensives donnent
un résultat crédible, ce qui pousserait tout le monde vers la même tactique.

Moyenne de **1,1 bloc actif** sur le terrain, pour environ 77 frappes par match.

### Cause structurelle : l'attaque produit deux fois plus que la défense

Une équipe équilibrée type produit environ **10,7 frappes par jour** (trois
attaquants et un milieu) contre **5,4 blocs par jour** (deux défenseurs et le
gardien). Deux mécaniques creusent encore l'écart :

1. **L'élimination préalable de bloc est gratuite et abondante.** Dans une équipe
   équilibrée, reprise de volée, frappe de loin et passe en profondeur cumulent
   **6,5 éliminations par jour**, soit davantage que ce que la défense adverse
   produit de blocs. Elle ne coûte rien, ne génère ni arrêt ni second ballon, et
   s'applique avant la frappe. À elle seule, la retirer des consignes de frappe
   fait passer le match de 46 à 33 buts.
2. **Le gel pendant l'état actif ne taxe que la défense.** Une frappe est
   instantanée et n'immobilise personne. Un bloc immobilise son défenseur
   pendant 5 à 8 heures. Par K dépensé, l'attaquant obtient donc bien plus
   d'actions. Supprimer ce gel pour les seuls états défensifs fait passer de 33
   à 19,5 buts.

### Variantes testées

| Variante | Buts/match | Buts/équipe/jour | Frappes bloquées | Actions/joueur/jour |
|---|---:|---:|---:|---:|
| A. référence du document | 46,0 | 3,29 | 35 % | 1,77 |
| J. sans élimination sur les frappes | 33,0 | 2,36 | 55 % | 1,78 |
| K. aucune élimination nulle part | 23,9 | 1,71 | 68 % | 1,76 |
| L. J + blocs sans gel | 19,5 | 1,39 | 73 % | 2,14 |
| M. L + rythme A divisé par 2 | 11,0 | 0,79 | 65 % | 1,08 |
| **N. M + centres portés à 5 h** | **12,4** | **0,88** | **62 %** | **1,05** |
| O. N + frappes 25 % plus chères | 9,5 | 0,68 | 64 % | 0,96 |

### Variante N en détail

Buts par match : minimum 5,2, **médiane 9,9**, maximum 23,2. Scores typiques
6-5, 3-4, 11-8 sur sept jours. Écart entre tactiques très resserré :

| Tactique | Marque | Encaisse | Différence |
|---|---:|---:|---:|
| offensive | 8,3 | 7,2 | +1,1 |
| seconds ballons | 4,6 | 3,5 | +1,1 |
| défensive | 4,4 | 3,8 | +0,6 |
| équilibrée | 6,1 | 5,5 | +0,6 |
| passes | 4,1 | 4,6 | -0,5 |
| centres | 6,5 | 7,5 | -1,1 |

Aucune tactique ne domine : l'écart maximal est de 2,2 buts sur un match entier.
C'est exactement ce qu'on veut d'un jeu où le choix tactique compte sans
déterminer le résultat.

Par taille de gare, variante N :

| Effectif | Buts/match | Actions/joueur/jour | Frappes |
|---|---:|---:|---:|
| grandes (N ≥ 150) | 19,1 | 1,43 | 51 |
| moyennes (40 à 150) | 19,0 | 1,02 | 36 |
| petites (N < 40) | 8,4 | 0,57 | 18 |
| très petites (N < 15) | 8,6 | 0,36 | 10 |

---

## 6. Actions manifestement trop fortes ou trop faibles

**Trop fortes :**

- **Toute consigne éliminant un bloc.** Effet gratuit, cumulable, et supérieur à
  la capacité défensive adverse. C'est la mécanique la plus déséquilibrante du
  catalogue.
- **En opposition** (0,5 K, bloc contré 6 h) domine strictement **Épaule contre
  épaule** (0,6 K, bloc arrêt 5 h) : elle est moins chère, dure plus longtemps,
  et son inconvénient (offrir un second ballon) ne se matérialise jamais contre
  une équipe qui n'a pas de consigne de réaction active. Sur nos simulations,
  **0 % des seconds ballons sont exploités** en jeu équilibré.
- **Centre en première intention** (0,3 K) : action la moins chère du catalogue,
  4,3 par jour, mais 54 à 99 % des centres expirent sans être utilisés. Elle
  inonde le terrain d'états inutiles.
- **Domination aérienne** : n'expire quasiment jamais sans cible, les centres
  étant surabondants.

**Trop faibles :**

- **Tacle glissé** (K, un seul bloc arrêt, 8 h) : 1,2 bloc par jour pour le coût
  maximum. À comparer à **Main opposée** (K, deux blocs, 6 h) qui donne 2,7 blocs
  par jour. Le tacle glissé n'a aucune raison d'être choisi.
- **Suivi** (K, réaction 8 h) : 1,2 déclenchement par jour, et seulement si
  l'adversaire joue des blocs contrés. Inutile dans la majorité des duels.
- **Renard des surfaces** : même dépendance, mais son coût de 0,6 K le rend
  jouable dans une tactique spécialisée, où 38 % des seconds ballons finissent
  exploités.
- **Interception** : expire sans cible environ 9 fois par match en jeu
  équilibré, les passes étant rares (19 créées par match).

---

## 7. Paramètres recommandés

| Paramètre | Valeur actuelle | Recommandation | Effet mesuré |
|---|---|---|---|
| Seuil « à l'heure » | non fixé | **300 s** | valide le coefficient 0,8 (mesuré 0,79) ; 98 % des gares peuvent charger |
| Production cible A | 3 / 2,5 / 2 / 1,5 / 1 | **1,5 / 1,25 / 1 / 0,75 / 0,5** | environ 1 action par joueur et par jour |
| Élimination préalable | sur 8 consignes | **retirée des consignes de frappe**, conservée sur passe et centre | 46 → 33 buts |
| Gel pendant état défensif | oui | **non** pour bloc, interception, domination aérienne | 33 → 19,5 buts |
| Durée des centres | 2 h et 8 h | **5 h** partout | réduit les centres perdus |
| Objectif de buts | non fixé | **0,5 à 1,2 but par club et par jour**, soit 4 à 8 buts par club sur un match de 7 jours | variante N : 0,88 |

Corrections ponctuelles complémentaires :

- **Tacle glissé** : passer à 2 blocs arrêts, ou réduire son coût à 0,7 K.
- **Épaule contre épaule** : abaisser à 0,5 K, ou allonger le bloc contré
  d'En opposition n'a pas d'intérêt tant que les seconds ballons ne sont pas
  exploités ; à défaut, réduire En opposition à une durée de 4 h.
- **Centre en première intention** : monter à 0,4 K ou limiter à un centre actif
  par équipe.
- **Interception** : autoriser la consommation d'une passe créée pendant sa
  durée (déjà le cas) et envisager un remboursement partiel de K si elle expire
  sans cible.

---

## 8. Règles qui demandent une décision du concepteur

1. **Le rythme est indépendant de la taille de la gare.** Confirmé par le calcul.
   Est-ce voulu, ou faut-il que N influence aussi la puissance ?
2. **Biais national permanent.** Les gares néerlandaises tournent à 1,14x du
   rythme cible, les allemandes à 0,76x, du seul fait de leur ponctualité
   nationale. Soit on l'assume (certains joueurs sont meilleurs), soit on calcule
   K à partir de la ponctualité historique de chaque gare, auquel cas seule la
   variation quotidienne compte. Les deux sont défendables, ce n'est pas à moi
   de trancher.
3. **Gares qui ne chargent jamais** : 2,2 % des gares ont une ponctualité sous
   50 %. Leur jauge ne monte jamais. Faut-il un plancher, par exemple une
   progression minimale garantie, ou les exclure du catalogue ?
4. **Annulations et arrêts supprimés** : le document ne dit pas ce qu'ils font à
   la jauge. Le collecteur les distingue pourtant. Proposition à valider : arrêt
   supprimé = -1 comme un retard, annulation = -1 sur chaque gare du parcours.
5. **Bonus d'une passe interceptée** : le document dit que l'interception
   supprime « la passe ainsi que le bonus de K qu'elle devait accorder ». Dans
   ma simulation le bonus est versé à la création de la passe, donc avant toute
   interception possible. Il faut soit différer le bonus à la consommation de la
   passe, soit accepter qu'il soit acquis.
6. **Jeu de tête** attend « un centre actif » : celui de son équipe ou celui de
   l'adversaire ? J'ai supposé le sien.
7. **Une-deux** consomme une passe et en crée une autre : deux milieux peuvent-ils
   se la renvoyer indéfiniment ?
8. **Changement de consigne pendant un état actif** : j'ai appliqué la règle
   proposée (l'état en cours survit, la nouvelle consigne s'applique ensuite).
   À confirmer explicitement.
9. **Chaîne de seconds ballons** : plafonnée à 5 dans la simulation, jamais
   atteinte (maximum observé 3).

---

## 9. Risques techniques et de données

1. **Cadence de collecte, risque majeur.** Le moteur consomme des événements en
   temps réel. Aujourd'hui 52 % des événements d'une gare ne sont pas fraîchement
   observés et les trous dépassent l'heure 68 fois par semaine. Sans les
   correctifs C1 à C3 du rapport POC, les jauges avanceraient par rafales et les
   notifications seraient fausses.
2. **Ordre de traitement.** Les observations arrivent par lots. Le moteur doit
   traiter les événements dans l'ordre de leur **heure d'événement**, pas de leur
   heure de réception, sinon un lot en retard produirait des actions dans le
   désordre. Cela impose un moteur rejouable et idempotent, avec une horloge de
   match qui n'avance que jusqu'à la borne de données consolidées.
3. **Identifiants de gare instables** (Allemagne 1 % de recouvrement d'un jour à
   l'autre) : un joueur changerait d'identité en pleine saison.
4. **MBTA sans retards exploitables** : 123 gares seraient des joueurs parfaits.
5. **Volume de notifications** : environ 1 action par joueur et par jour, soit
   22 actions et 2 buts par jour et par match. Acceptable, mais il faudra
   distinguer les notifications importantes (buts) du reste.

---

## 10. Plan d'implémentation proposé

Aucune de ces étapes ne sera engagée sans votre accord.

1. Corriger la collecte (C1 à C3 du rapport POC) et vérifier 90 % de couverture
   sur 48 heures. Préalable indispensable.
2. Figer les paramètres dans un fichier de configuration versionné, avec
   instantané au coup d'envoi de chaque match, conformément au paragraphe 8.3.
3. Implémenter le moteur comme une fonction pure : état du match plus liste
   d'événements triés par heure d'événement donne un nouvel état plus un journal
   d'actions. Rejouable, testable, idempotent.
4. Rejouer les 6 journées du POC comme test de non-régression du moteur.
5. Brancher les notifications sur le journal d'actions.
6. Écrire les bots sur des règles déterministes : le catalogue s'y prête bien,
   une simple table de préférences par profil suffit, sans modèle exécuté en
   production.

---

## Annexe · réponses aux 16 questions d'équilibrage

1. **Le coefficient 0,8 correspond-il au réel ?** Oui, à 5 minutes : coefficient
   net médian mesuré 0,79. Non aux autres seuils (0,57 à 3 min, 0,93 à 10 min).
2. **La formule tient-elle avec des données manquantes ?** Elle tient, mais le
   rythme réel devient proportionnel à la part observée. Avec 52 % de données
   manquantes, une gare charge deux fois trop lentement. La formule doit être
   calculée sur les trains **observables**, pas sur les trains théoriques.
3. **Les petites gares produisent-elles environ une action par jour ?** Oui pour
   les gares à N ≥ 15 (0,57 action par joueur et par jour en variante N). Les
   très petites (N < 15) tombent à 0,36, ce qui reste jouable mais lent.
4. **Les superstars produisent-elles 3 actions sans saturer ?** Avec A = 3 oui,
   mais cela sature : 1,43 action par joueur et par jour pour une équipe de
   grandes gares, et 19 buts par match. Avec A = 1,5 le rythme redevient sain.
5. **Les actions à 0,3 K ou 0,5 K se déclenchent-elles trop souvent ?** Oui pour
   le centre en première intention (4,3 par jour, 54 à 99 % de centres perdus).
   Les autres à 0,5 K sont correctes.
6. **Les durées compensent-elles les faibles coûts ?** Non, elles sur-compensent
   pour la défense et pas du tout pour l'attaque, puisque les frappes sont
   instantanées. C'est le déséquilibre central.
7. **Combien de buts ?** 46 par match avec les valeurs du document, 10 avec les
   correctifs recommandés. Plage crédible recommandée : 0,5 à 1,2 but par club
   et par jour.
8. **Les formations défensives empilent-elles trop de blocs ?** Non, l'inverse :
   3,1 blocs actifs en moyenne dans un duel très défensif, 1,1 en jeu équilibré.
   La défense est structurellement sous-dotée.
9. **Les blocs arrêts sont-ils trop sûrs par rapport aux blocs contrés ?** Non,
   c'est l'inverse : le bloc contré est sous-coté puisque le second ballon n'est
   presque jamais exploité (0 % en jeu équilibré, 38 % en tactique spécialisée).
10. **Les éliminations préalables sont-elles dominantes ?** Oui, c'est le
    problème numéro un du catalogue.
11. **Le jeu de possession à -0,2 K est-il paralysant ?** Non, effet modeste :
    il retarde deux milieux d'environ 5 % de leur cycle. Il est plutôt trop
    faible pour son coût de 0,5 K et son immobilisation de 5 h.
12. **Premier relanceur produit-il trop d'effets pour K ?** Non. Trois effets
    mais 1,6 déclenchement par jour seulement. Correctement dosé.
13. **Main opposée est-elle trop forte ?** Non, c'est la meilleure consigne
    défensive du catalogue et elle sert de référence : 2,7 blocs par jour. Ce
    sont les autres qui sont trop faibles.
14. **Passes et centres sont-ils rentables ?** Les passes oui (29 % d'expiration).
    Les centres non (54 à 99 % d'expiration) : trop produits, trop peu consommés.
15. **La conservation du K brut crée-t-elle des abus ?** Un abus théorique existe :
    charger une consigne à K puis basculer sur une consigne à 0,3 K au moment où
    la condition est favorable, pour déclencher immédiatement. La perte de
    l'excédent limite le gain, mais un joueur attentif obtiendra toujours un
    avantage sur un joueur absent. À surveiller plutôt qu'à interdire.
16. **Les bots peuvent-ils jouer sans modèle ?** Oui. Une table de préférences
    par profil, plus trois règles de réaction (poser un bloc si l'adversaire a
    des frappes chargées, jouer la finition si une passe est active, changer de
    consigne si la jauge dépasse le coût d'une action disponible) suffisent à
    produire un jeu correct.
