# Rapport POC ferroviaire · MercatOr

Verdict : **GO SOUS CONDITIONS**

Les gares ferroviaires sont un support de jeu valide : les données publiques
gratuites fournissent des retards réels, des annulations, et permettent de
distinguer le retard hérité du retard produit par la gare. Les notes simulées
sur ces données donnent une distribution jouable et des scores de football
crédibles. La condition qui reste à lever ne porte pas sur les sources mais sur
notre propre collecte : GitHub Actions n'a exécuté que 21 % des captures
prévues, ce qui a dégradé la moitié des observations en simples horaires
théoriques. Ce point est identifié, mesuré et corrigeable.

## 1. Ce qui a été collecté

- Période : du 21/07/2026 22:19 UTC au 28/07/2026 19:00 UTC (arrêt automatique
  programmé le 30/07 à 04:00 UTC).
- 7 réseaux, 5 pays : France, Pays-Bas, Allemagne, États-Unis (3 réseaux),
  Australie.
- 82 exécutions, 532 captures, 7,09 millions de lignes d'observation brutes,
  consolidées en **1,88 million d'événements d'arrêt** (un par train et par gare).
- 113 Mo dans le dépôt, coût 0 €, aucune intervention manuelle pendant 7 jours.
- 6 journées MercatOr complètes analysées (22 au 27/07, 05:00 à 05:00 Paris).
  La 7e journée (28/07) se termine le 29/07 à 05:00 Paris ; elle ne changera pas
  le verdict, le facteur limitant étant la couverture et non la taille
  d'échantillon.

## 2. Le problème de couverture, mesuré

Cible : une capture toutes les 5 minutes, 90 % des créneaux couverts.
Réalité : **21 % du temps couvert**.

- Écart médian entre deux captures : 5,0 minutes (conforme, à l'intérieur d'une
  exécution).
- Mais 68 trous dépassent 1 heure, le plus long atteignant 3 h 42.
- 11 à 16 exécutions par jour au lieu de 24, et 8 cycles par exécution au lieu
  de 12.
- Durée cumulée en collecte dense : 32 h sur 164 h.

Trois causes, toutes dans notre conception, aucune chez les fournisseurs :

1. **Conception « une exécution occupe l'heure »** : chaque exécution tournait
   jusqu'à la minute 58. Combinée au groupe de concurrence `collect`, une
   exécution en retard restait en file derrière celle en cours et se faisait
   remplacer par la suivante. Un seul retard supprimait donc une heure entière.
2. **Dérive du planificateur GitHub** : les tâches planifiées des dépôts publics
   sont « au mieux » et sont retardées ou abandonnées en période de charge.
3. **Effet ciseau** : une exécution démarrée à la minute 45 s'arrêtait quand même
   à la minute 58, ne produisant que 2 cycles.

## 3. La loi de fraîcheur : le résultat le plus important du POC

Chaque événement d'arrêt a été daté par l'écart entre sa dernière observation et
l'heure réelle de l'événement. Le signal se dégrade brutalement avec cet écart :

| Fraîcheur de la dernière estimation | Événements | Retard médian | Retards > 5 min | À l'heure |
|---|---:|---:|---:|---:|
| 0 à 2 min | 782 575 | 60 s | 13,8 % | 56,2 % |
| 2 à 5 min | 40 504 | 55 s | 13,3 % | 61,4 % |
| 5 à 15 min | 100 829 | 12 s | 12,6 % | 65,3 % |
| 15 à 30 min | 138 132 | 0 s | 8,5 % | 76,6 % |
| plus de 30 min | 691 248 | 0 s | 2,8 % | 92,6 % |

Lecture : une estimation vieille de plus de 30 minutes affirme que 92,6 % des
trains sont à l'heure, ce qui est l'horaire théorique et non la réalité. Une
estimation de moins de 5 minutes retrouve le vrai taux de perturbation.

Conséquences directes :

- **Une capture toutes les 5 minutes suffit** : la bande 2 à 5 min est
  statistiquement identique à la bande 0 à 2 min. Inutile de viser plus serré.
- **Au-delà de 15 minutes, la donnée est inexploitable** pour noter une gare.
- Sur cette collecte, seuls **43,8 % des événements** sont exploitables. Tout le
  reste a été écarté de l'analyse plutôt que d'être compté comme « à l'heure ».

## 4. A3 · Retard hérité, ajouté, récupéré

Mesurable, et bien mesurable :

- **82,5 % des événements portent à la fois une heure d'arrivée et de départ**,
  ce qui permet le calcul direct `retard_ajouté = max(0, retard_départ - retard_arrivée)`
  et `retard_récupéré = max(0, retard_arrivée - retard_départ)`.
- Retard ajouté : médiane 0 s, p90 60 s, strictement positif dans 27,1 % des arrêts.
- Retard récupéré : médiane 0 s, p90 30 s, strictement positif dans 14,9 % des arrêts.

Autrement dit une gare typique ne dégrade ni n'améliore la situation, et environ
un arrêt sur quatre produit un retard supplémentaire attribuable. C'est un signal
discriminant réel, mais peu dispersé : la note ne peut pas reposer sur ce seul
terme, elle doit le combiner à la ponctualité et aux incidents, ce qui est ce que
fait la formule testée en section 6.

Aucune méthode secondaire par observations successives n'a été nécessaire :
82,5 % de paires complètes rendent l'estimation indirecte inutile pour la version
actuelle.

## 5. A5 et A7 · Gares et catalogue

Gares ayant au moins 5 mouvements réellement observés dans la journée :

| Journée MercatOr | Gares vues | Gares qualifiées |
|---|---:|---:|
| 22/07 | 5 066 | 1 479 |
| 23/07 | 7 367 | 3 876 |
| 24/07 | 8 791 | **7 233** |
| 25/07 | 10 212 | 3 053 |
| 26/07 | 8 124 | 4 960 |
| 27/07 | 7 396 | 3 774 |

Le nombre de gares qualifiées suit la couverture du jour, pas la richesse des
sources : le 24/07, mieux couvert, a produit 7 233 gares qualifiées.

Persistance sur les 6 journées complètes :

- 409 gares qualifiées les 6 jours sur 6 ;
- **555 gares sur au moins 5 jours sur 6** ;
- 829 sur au moins 4 jours ; 3 168 sur au moins 3 jours.

Répartition du noyau de 555 gares : Pays-Bas 236, Australie 126, Metro-North 94,
France 35, MBTA 33, Allemagne 27, LIRR 4.

Le seuil de 500 gares est donc atteint **malgré** une collecte à 21 %. Deux
réserves franches :

- La concentration est réelle : Pays-Bas et Australie fournissent 65 % du noyau.
- L'Allemagne est massivement sous-représentée (27 gares) alors qu'elle est la
  source la plus riche, avec 3 800 à 8 400 gares observées chaque jour. Cause :
  gtfs.de régénère ses identifiants d'arrêt à chaque version du GTFS statique,
  et le collecteur n'archivait que la dernière table d'arrêts. Le recouvrement
  des identifiants entre le 22/07 et le 27/07 n'est que de 1 %. La France souffre
  du même mal en plus léger (48 % de recouvrement) : une même gare y apparaît
  sous plusieurs identifiants selon la marque du train, corrigé ici en extrayant
  le code UIC. Les autres réseaux sont stables : Pays-Bas 91 %, MBTA 96 %,
  Australie, LIRR et Metro-North 100 %.

Ces deux réserves sont des défauts de notre collecteur, pas des sources.

## 6. A6 · Notes, postes et match simulés

Formule provisoire testée, entièrement paramétrable : ponctualité comparée à la
moyenne du réseau du jour, retard net ajouté (ajouté moins récupéré), pénalité
d'incidents (arrêts supprimés et annulations), le tout pondéré par une confiance
`n / (n + 8)` fonction du nombre de mouvements observés.

Distribution obtenue sur 24 375 notes gare-jour :

| Indicateur | Valeur | Cible du handoff |
|---|---:|---|
| Moyenne | 5,52 | proche de 5,5 |
| Médiane | 5,77 | · |
| Écart-type | 1,29 | · |
| Entre 4,5 et 6,5 | 61,0 % | majorité |
| Au-dessus de 7 | 6,9 % | 15 à 20 % |
| Au-dessus de 9 | 0,2 % | moins de 1 % |
| Au-dessous de 4 | 12,8 % | · |

La moyenne et le haut du spectre sont conformes ; la proportion de notes
supérieures à 7 est en dessous de la cible et se corrigera en ajustant les poids,
qui restent des paramètres.

Sur le noyau de 555 gares notées au moins 5 jours :

- volatilité intra-gare : 0,87 point par jour, donc une identité sportive stable
  mais des journées qui comptent ;
- 50 gares « stars » de moyenne supérieure à 6,5, 70 gares faibles sous 4,5,
  435 au milieu : la hiérarchie recherchée existe ;
- meilleures : Cleveland 9,02, Thorneside 8,91, Central 8,82 (Queensland) ;
  moins bonnes : Glass House Mountains 1,61, Deventer 1,98, 's-Hertogenbosch 2,37 ;
- **corrélation note moyenne / trafic : -0,10**, c'est-à-dire aucun biais de
  taille. Une petite gare régulière peut être une star, une grande gare
  perturbée peut être mauvaise, ce qui était une exigence explicite.

Attribution des postes par volatilité selon les quotas du handoff (10 % gardiens,
31 % défenseurs, 34 % milieux, 25 % attaquants) : 56 G, 172 D, 189 M, 138 A.

Match simulé 11 contre 11 sur les 6 journées, avec les règles de buts de la
section 13 du handoff : **6 - 8**, avec le détail quotidien 1-1, 0-1, 1-1, 2-1,
1-3, 1-1 et un cumul jamais réinitialisé. Soit 1,17 but par club et par jour,
un peu en dessous de la cible de 1,5 à 2,5, à ajuster par les paramètres de
lignes. Les scores ressemblent à du football.

## 7. Grille de verdict A8

| Critère de GO | État |
|---|---|
| Au moins 500 gares qualifiées réalistes | **Oui** : 555 sur 5 jours sur 6, malgré une collecte à 21 % |
| Plusieurs pays représentés | **Oui** : 5 pays, 7 réseaux |
| Collecte gratuite | **Oui** : 0 €, aucune clé, aucune carte |
| Licences compatibles | **Oui** : ODbL, CC BY-SA 4.0, CC BY 4.0, usage libre, conditions MTA et MassDOT, séparées par source |
| Les données couvrent réellement les journées | **Non aujourd'hui** : 21 % de couverture, 43,8 % d'événements exploitables |
| Retards et annulations assez fréquents | **Oui** : 13,8 % des mouvements observés à plus de 5 minutes, annulations présentes sur 5 réseaux |
| Retard ajouté ou récupéré mesurable | **Oui** : 82,5 % de paires arrivée plus départ |
| Distribution des notes ludique | **Oui** : moyenne 5,52, écart-type 1,29, pas de biais de taille |
| Infrastructure tenable sur une saison | **Non prouvé** : GitHub Actions a perdu 75 % des exécutions |
| Aucune opération manuelle quotidienne | **Oui** : 7 jours sans intervention |

Aucun critère de NO GO n'est atteint : le catalogue dépasse 500 gares, les
licences conviennent, rien n'est payant, les retards sont attribuables, et la
dépendance aux horaires théoriques est un symptôme de notre cadence de collecte,
pas une propriété des flux.

## 8. Conditions à lever

- **C1 · Cadence de collecte.** Remplacer l'exécution longue horaire par des
  exécutions courtes toutes les 5 minutes (un cycle, environ 40 secondes),
  sans groupe de concurrence bloquant, et doubler par un second workflow décalé.
  Un abandon ponctuel de GitHub coûtera alors un créneau de 5 minutes au lieu
  d'une heure entière.
- **C2 · Validation de la cadence.** Mesurer la couverture réelle obtenue sur
  48 heures avant de fonder une saison dessus. Seuil d'acceptation : 90 % des
  créneaux de 5 minutes, tel que défini dans le collecteur.
- **C3 · Identité de gare.** Archiver une table d'arrêts datée par jour et
  résoudre l'identité à la collecte : code UIC pour la France, nom et
  coordonnées pour l'Allemagne et les Pays-Bas. Ce seul correctif devrait faire
  passer l'Allemagne de 27 à plusieurs milliers de gares éligibles.
- **C4 · Référentiel des réseaux MTA.** Ajouter les GTFS statiques de LIRR et
  Metro-North pour disposer des noms de gares, aujourd'hui absents.
- **C5 · Repli si C2 échoue.** Si GitHub Actions reste insuffisant, deux options
  gratuites existent mais demandent chacune la création d'un compte par vous :
  un déclencheur planifié Cloudflare Workers, plus fiable et à la minute, ou un
  projet Supabase distinct dédié à la collecte. Aucune ne sera engagée sans
  votre accord.

Sous réserve de C1 à C3, le développement du jeu peut commencer sur le
fournisseur simulé, comme le prévoit le handoff, pendant qu'une collecte
corrigée constitue l'historique réel des gares.
