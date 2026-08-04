# MercatOr · mémoire complète de la conversation du 21 juillet au 4 août 2026

## Comment lire ce document

Ce document existe pour qu'une nouvelle fenêtre de discussion reprenne le
projet exactement là où la précédente s'est arrêtée, sans rien perdre.

Il restitue l'intégralité de ce qui s'est dit et fait : chaque échange, chaque
décision, chaque mesure, chaque erreur et chaque correction, dans l'ordre
chronologique. Les commandes exécutées, leurs résultats chiffrés et les
raisonnements sont conservés.

**Une limite, annoncée franchement.** Les messages contenant des réponses JSON
brutes de plusieurs milliers de lignes, collées pour analyse, sont restitués
par leur contenu utile et non caractère par caractère : les recopier
intégralement occuperait des dizaines de pages sans rien apporter, puisque ce
qui compte est ce qu'on en a extrait. Tout le reste est là, y compris les
formulations exactes des décisions et des consignes.

Un lecteur pressé peut lire la partie 2, l'état actuel, puis la partie 6, ce
qu'il reste à faire. Les parties 1, 3 et 4 servent à comprendre pourquoi les
choses sont ce qu'elles sont, ce qui évite de refaire les erreurs déjà faites.

---

# PARTIE 1 · Récit chronologique

## Phase 1 · Le point de départ, 21 juillet

Le concepteur transmet un handoff nommé « MercatOr, nouvelle app, un MPG-like
basé sur les données des aéroports ». Le principe : un jeu solo de fantasy
football où les joueurs sont des aéroports mondiaux, notés chaque jour d'après
des données aériennes et météorologiques réelles. Un club humain contre sept
clubs pilotés par des IA, championnat de 14 journées, chaque journée étant un
match continu de sept jours, mercato aux enchères en monnaie MO, récompenses en
éclats, la monnaie commune de son écosystème Supabase.

Le handoff impose une règle dure : **ne rien développer avant un POC
AeroDataBox concluant**, avec 27 points de test à documenter et un verdict
GO ou NO GO.

Travail effectué :

- inspection de l'écosystème existant. Projet Supabase partagé `eclats`, réf
  `psutbulpezfdftmaqkoo`. Table `eclats_ledger` en écriture serveur uniquement
  via fonctions SECURITY DEFINER. Chaque application préfixe ses tables ;
  `mo_` est retenu pour MercatOr. Front en PWA vanilla, sans framework.
- création du dépôt de travail, harnais de POC en Node sans dépendances,
  échantillon de 36 aéroports sur six continents.
- Le POC ne peut pas s'exécuter : aucune clé AeroDataBox. Procédure remise au
  concepteur, sans jamais lui demander de coller la clé dans la conversation.

## Phase 2 · Le POC AeroDataBox, 21 juillet

Le concepteur pose la clé dans `poc/.env` et confirme que le plan RapidAPI
Basic est gratuit, 600 unités par mois, sans dépassement facturé.

Vérifications de sécurité d'abord : `poc/.env` bien ignoré par git, clé détectée
sans être affichée. Puis 24 appels, 95 unités consommées sur 600.

Résultats mesurés :

| Endpoint | Coût | Contenu |
|---|---|---|
| fiche aéroport | 1 unité | IATA, ICAO, nom, ville, pays, fuseau, coordonnées |
| recherche | 2 unités | peu fiable, 0 résultat sur « international » |
| `/airports/delays` mondial | 6 unités | **1 642 aéroports en un appel** |
| retards par aéroport | 6 unités | même structure, un seul aéroport |
| historique par date | 6 unités | profondeur d'au moins 90 jours |

Verdict rendu : **GO sous conditions**. L'endpoint mondial rendait le projet
viable pour 6 unités, soit trois relevés quotidiens dans le quota. Conditions :
collecte exclusivement par l'endpoint mondial, journée reconstituée par agrégat
d'instantanés, aucun historique initial, catalogue construit sur l'union des
aéroports actifs, garde-fous de quota.

## Phase 3 · Le NO GO et le pivot, 21 juillet

Le concepteur tranche autrement, et il a raison : la granularité réelle est une
fenêtre glissante de deux heures, et trois relevés par jour ne couvrent que six
heures sur vingt-quatre. **« C'est un NO GO car on ne peut pas collecter 24h
d'informations sans dépasser notre limite. »**

Décision : abandon définitif d'AeroDataBox et des aéroports. Deux pistes de
repli, dans l'ordre : le trafic ferroviaire, puis les stations de vélos en
libre-service au standard GBFS.

Le concepteur transmet un cahier des charges détaillé du POC ferroviaire,
phases A1 à A8, avec une exigence de méthode répétée plusieurs fois : ne jamais
compter une donnée absente comme une réussite, ne jamais présenter une source
pressentie comme validée, ne rien engager qui coûte de l'argent.

## Phase 4 · L'inventaire ferroviaire, 21 juillet

Archivage propre du POC aéroports, puis sondage réel de flux GTFS-Realtime.
Sept sources répondent sans aucune clé :

| Réseau | Résultat du sondage |
|---|---|
| SNCF | 200 trains à 23:15, retards, 5 annulés, 55 arrêts supprimés |
| OVapi Pays-Bas | 6 143 trajets, fraîcheur 1 s, 1 110 annulations |
| gtfs.de Allemagne | 19 548 trajets, 212 288 arrêts, 11,6 Mo |
| MBTA Boston | 2 017 trajets |
| MTA LIRR et Metro-North | 188 et 297 trains, 100 % ferroviaires |
| Translink Queensland | 2 321 trajets |

Découverte au passage : OVapi publie un flux `trainUpdates.pb` réservé aux
trains, préférable au flux multimodal.

Le concepteur valide la création d'un dépôt public dédié à la collecte, avec dix
précautions explicites : aucun secret, licences vérifiées avant publication,
pas de republication des flux bruts, observations minimales seulement, licences
séparées par source, commits groupés si possible, minutes décalées, concurrence
limitée, déclenchement manuel et plafond temporel, tests avant lancement.

Le dépôt `Blinytz/mercator-poc-rail` est créé, le collecteur écrit, testé
localement puis en conditions réelles. La collecte de sept jours démarre le
21 juillet à 22:19 UTC.

## Phase 5 · L'analyse du POC ferroviaire, 28 juillet

Entre-temps, le concepteur a restructuré son écosystème : les dossiers locaux
ont disparu, tout vit désormais dans des dépôts GitHub, et
`mercator-poc-rail` a été renommé `mercator`.

L'analyse de 1,88 million d'événements consolidés produit **le résultat le plus
important de tout le projet**, la loi de fraîcheur :

| Fraîcheur de la dernière estimation | Retard médian | Retards > 5 min | À l'heure |
|---|---:|---:|---:|
| 0 à 2 min | 60 s | 13,8 % | 56,2 % |
| 2 à 5 min | 55 s | 13,3 % | 61,4 % |
| 5 à 15 min | 12 s | 12,6 % | 65,3 % |
| 15 à 30 min | 0 s | 8,5 % | 76,6 % |
| plus de 30 min | 0 s | **2,8 %** | **92,6 %** |

Autrement dit une estimation vieille de plus de trente minutes affirme que
92,6 % des trains sont à l'heure, ce qui est l'horaire théorique et non la
réalité. Une capture toutes les cinq minutes est nécessaire et suffisante.

Autres mesures : 82,5 % des événements portent à la fois une arrivée et un
départ, ce qui rend calculable le retard ajouté et le retard récupéré par gare.
Les notes simulées donnent une moyenne de 5,52, un écart-type de 1,29 et une
corrélation note/trafic de -0,10, donc aucun biais de taille.

Mais la couverture n'a été que de **21 %** : 68 trous de plus d'une heure, le
plus long de 3 h 42. Cause identifiée et assumée comme une erreur de conception :
chaque exécution occupait l'heure jusqu'à la minute 58, et le groupe de
concurrence faisait qu'une exécution retardée était remplacée par la suivante.
Un seul retard supprimait une heure entière.

Verdict : **GO sous conditions**, les conditions portant sur notre collecte et
non sur les sources.

## Phase 6 · Le changement de moteur, 29 juillet

Le concepteur transmet un nouveau cadrage : les buts calculés la nuit façon MPG
sont abandonnés. Le nouveau moteur est continu. Chaque train fait progresser la
jauge d'une gare, et quand la jauge atteint le coût de la consigne choisie par
le sélectionneur, l'action se déclenche : frappe, passe, centre, bloc,
interception, second ballon.

Analyse demandée et livrée. Résultats marquants :

- **Le temps de charge vaut `24 × coefficient / A` heures et ne dépend pas de la
  taille de la gare.** Le N s'annule entre la formule de K et le rythme réel.
  La monnaie du moteur est le temps d'immobilisation, pas le K.
- Le coefficient 0,8 fondé sur 90 % de ponctualité est presque exact :
  ponctualité médiane mesurée 89,4 %, coefficient net 0,79. Mais seulement au
  seuil de 300 secondes ; à 60 secondes, 32 % des gares auraient une progression
  négative et seraient mortes.
- Les valeurs proposées donnaient **46 buts par match de sept jours**, très
  au-dessus de toute cible crédible.
- Deux mécaniques dominaient tout : l'élimination préalable de bloc, gratuite et
  plus abondante que la capacité défensive adverse, et le gel du joueur pendant
  un état actif, qui ne taxe que la défense puisque les frappes sont
  instantanées.

## Phase 7 · Le moteur version 3 et la seconde simulation, 1er août

Le concepteur tranche différemment de ce qui était proposé : il conserve les
rythmes, les éliminations et le gel, et rééquilibre par la défense, avec des
postures moins chères, plus courtes et à plusieurs charges, et par les
formations.

Le simulateur v3 est écrit, fidèle au catalogue consolidé. Campagne de cent
matchs par duel :

| Confrontation en 4-4-2 | Buts/match | Buts/équipe/jour |
|---|---:|---:|
| équilibré vs équilibré | 46 | 3,56 |
| offensif vs offensif | 157 | 11,18 |
| défensif vs défensif | 6 | 0,52 |
| équilibré 5-4-1 vs 5-4-1 | 24 | 1,71 |
| équilibré 3-4-3 vs 3-4-3 | 75 | 5,36 |

Les formations font exactement leur travail, mais l'amplitude entre profils
tactiques reste ingouvernable, de 6 à 157 buts. Les bots adaptatifs doublent le
nombre de buts dans un duel centres contre défensif, ce qui impose de calibrer
l'équilibrage contre des bots adaptatifs et non statiques.

Une borne non prévue par le cadrage a dû être ajoutée : les cascades de bonus,
observées jusqu'à 2 203 par lot de simulations, peuvent boucler entre deux
joueurs qui se donnent mutuellement du K. Profondeur plafonnée à 3, paramétrable.

## Phase 8 · L'état des lieux des données, 1er août

Le concepteur insiste : **« Il vaut mieux n'avoir que peu de gares mais qui ont
des données régulières et cohérentes, que beaucoup de données avec du déchet. »**

L'analyse révèle que sur 2 743 gares, seules 133 passent tous les critères, dont
118 australiennes. Ce chiffre ne mesure pas la qualité des gares mais l'endroit
où notre collecte a fonctionné.

Le critère de régularité construit à sa demande s'avère inutilisable en l'état :
coefficient de variation médian de 0,77, et la normalisation par la couverture
horaire ne le fait pas bouger. La preuve par les noms est sans appel, il rejette
Utrecht Centraal, Rotterdam Centraal, Leiden Centraal et Amsterdam Sloterdijk.
Quand un critère rejette les plus grandes gares néerlandaises, c'est le critère
qui est faux.

En revanche un résultat nouveau et solide : **un quart des gares françaises,
182 sur 736, déclarent 100 % de ponctualité**, avec 164 distributions
dégénérées. Ce n'est pas de la ponctualité, c'est l'absence de mesure, comme
MBTA à plus petite échelle.

Un tri sur critères intrinsèques est produit et versionné dans
`src/exclusions.json` : 169 gares exclues dont MBTA en bloc sur preuve agrégée,
430 en quarantaine, 2 144 à qualifier.

## Phase 9 · L'ouverture des nouveaux pays, 1er et 2 août

Le concepteur demande plus de pays, gratuits, avec de la donnée propre.

Sondages réels. Deux pays ouverts sans aucune clé : **Norvège** via Entur,
4 217 trajets et 92 % d'arrêts avec arrivée et départ, et **Finlande** via
Digitraffic, retard médian 23 secondes, licence CC BY 4.0.

Trois pays demandent une clé gratuite : Suisse, Irlande, Île-de-France.
**SEPTA Philadelphie est écarté après test** : 100 % de retards nuls, une seule
valeur distincte. Le piège aurait passé une inspection superficielle.

Une leçon de méthode apparaît ici : en filtrant Entur sur le seul opérateur Vy,
le test anti-parfait échoue avec 94 % de retards nuls. Ce n'est pas un défaut de
la source, c'est que sur un instantané la plupart des arrêts sont futurs, donc
prédits à zéro. **Le test anti-parfait doit toujours être appliqué après le
filtre de fraîcheur, jamais sur une capture brute.**

## Phase 10 · L'épisode Île-de-France, 2 août

Séquence où le verdict a changé deux fois, et où le concepteur a eu raison
d'insister.

Premier test, sur une ligne de bus : aucune heure théorique, aucune heure
d'arrivée, tous les arrêts à `ON_TIME`, arrêts non ordonnés, horodatages
incohérents. Recommandation rendue : mettre PRIM de côté.

Le concepteur ne s'arrête pas là. Le jeu de données du périmètre temps réel,
public et hors PRIM, montre que les RER et Transilien sont bien couverts :
RER C 280 arrêts, J 266, D 256, R 217, B 198, A 188, H 188, E 183.

Second test, sur le RER C : **les quatre champs décisifs sont présents**,
`AimedArrivalTime`, `ExpectedArrivalTime`, `AimedDepartureTime`,
`ExpectedDepartureTime`. Le signal est réel, un train à +95 s marqué `DELAYED`,
un autre à +49 s constant sur sept arrêts, un troisième arrivant avec 85 s
d'avance et repartant à l'heure, ce qui est exactement la mesure du retard
ajouté. Trois bonnes surprises : identité au niveau `StopArea` donc stable,
`VehicleMode: RAIL` pour filtrer, et `RecordedAtTime` par course qui donne un
indicateur de fraîcheur natif.

Correction assumée : le flux bus et le flux rail viennent d'opérateurs
différents, il était faux d'extrapoler de l'un à l'autre.

Restait la requête globale. `ALL` est refusé, `STIF:Line::ALL:` est accepté mais
renvoie une trame vide : il n'existe pas de mode global, la mention du Swagger
est une scorie. Il faut interroger ligne par ligne.

## Phase 11 · Les clés et la validation des sources, 2 août

Le concepteur crée les comptes. Les secrets ne sont lisibles que depuis GitHub
Actions, un workflow de sonde est donc écrit pour les tester sans jamais les
exposer.

| Source | Résultat |
|---|---|
| **Suisse** | Token de 120 caractères en `Authorization` brut. 8 742 trajets, 111 711 arrêts, 20 960 points d'arrêt, 297 valeurs distinctes. Quota **illimité**, 5 appels par minute |
| **Irlande** | L'en-tête Azure standard `Ocp-Apim-Subscription-Key` **échoue**. C'est **`x-api-key`** qu'il faut. 1 754 trajets, **6,8 % de retards > 5 min**, le plus contrasté |
| **Île-de-France** | Quota révélé par les en-têtes : **1 000 appels par jour**. Sans requête globale, cela impose de se limiter aux 5 RER |

## Phase 12 · Le déploiement du collecteur v2, 2 août

Sur feu vert, déploiement unique : cadence par créneaux, identité résolue à la
collecte, tables d'arrêts datées, MBTA retiré, statiques MTA ajoutés, quatre
nouveaux pays, adaptateur SIRI.

Trois découvertes pendant le déploiement :

1. **Bug protobuf** : la bibliothèque renvoie `0` au lieu de « absent », ce qui
   faisait passer des heures inexistantes pour valides.
2. **Norvège, Finlande et Irlande ne publient que le retard**, sans heure
   absolue. Leur fenêtre de créneau est désactivée, l'heure sera reconstituée à
   l'analyse par jointure avec l'horaire statique.
3. **L'Île-de-France ne contient que les passages à venir.** Sa fenêtre devait
   regarder devant : elle est passée de 3 à 287 observations par créneau.

La **Suisse est mise en attente** : 98,9 % de ses arrêts sans heure absolue et
un flux tous modes de 111 000 arrêts, soit 32 millions de lignes par jour sans
filtre ferroviaire. Le portail statique refuse l'accès automatisé, y compris
avec le jeton.

## Phase 13 · Le bilan du 4 août

Le concepteur signale recevoir des dizaines de mails d'échec par jour.

Diagnostic : **la collecte n'a jamais échoué**. C'est le script qui se terminait
sur un code d'erreur, à cause d'un piège bash. Sur la dernière itération de la
boucle, `[ $i -lt 6 ]` renvoie faux, et comme c'était la dernière commande, la
tâche entière était marquée en échec alors que les données étaient collectées et
publiées. Corrigé.

Mais la couverture plafonnait toujours : 29 %, 24 %, 18 %. Cause enfin
identifiée avec certitude : **GitHub ne déclenche le cron qu'une douzaine de
fois par jour, quelle que soit la fréquence demandée.** Avec six créneaux par
exécution, la couverture était mécaniquement plafonnée à 25 %.

Correctif : chaque exécution couvre désormais **36 créneaux, soit trois heures**.
Douze déclenchements couvrent alors trente-six heures. Vérification immédiate :
douze créneaux consécutifs servis sur la dernière heure, un seul manquant.

Bilan des données sur 2,5 jours à 25 % de couverture : **10 689 gares vues,
454 275 mouvements**. L'Allemagne est ressuscitée par le correctif d'identité,
de 58 gares utilisables à 6 207, avec des identifiants lisibles.

---

# PARTIE 2 · État actuel du système

## Le dépôt

`github.com/Blinytz/mercator`, public. Il contient à la fois le collecteur, les
données collectées, le simulateur du moteur et la documentation.

```
src/collect.mjs        collecteur v2, par créneaux de 5 minutes
src/refdata.mjs        référentiels : filtres ferroviaires et tables d'arrêts datées
src/config.json        toute la configuration, sources comprises
src/exclusions.json    gares et sources écartées, avec motif
src/sonde-sources.mjs  sonde des sources à clé, exécutable en Actions
.github/workflows/     collect, collect-secours, refdata, sonde
data/<source>/<jour>/  observations, un fichier par créneau
data/_slots/<jour>/    témoins de créneau, empêchent la duplication
logs/runs.ndjson       journal d'exécution
state/refdata/         filtres et tables d'arrêts, archivées par jour
sim/                   simulateur du moteur et scripts d'analyse
docs/                  rapports et catalogues
```

## Format d'une observation

```json
{"t":"2026-08-04T17:45:00.000Z","net":"fr_sncf","gare":"UIC87319012",
 "trip":"OCESN12177F1187_...","seq":0,"rel":"OK",
 "ra":300,"rd":300,"ea":1785864900,"ed":1785865080,"fts":1785865416}
```

`t` créneau, `net` source, `gare` identité résolue, `rel` vaut OK, SKIPPED,
CANCELED ou NO_DATA, `ra` et `rd` retards à l'arrivée et au départ en secondes,
`ea` et `ed` heures estimées en époque Unix, `fts` horodatage de fraîcheur du
flux.

## Le principe du collecteur v2

Chaque exécution revendique un **créneau** de cinq minutes déduit de l'horloge,
et non de son heure de lancement. Elle ne conserve que les arrêts dont l'heure
d'événement tombe dans la fenêtre du créneau : toute observation stockée est
donc fraîche par construction, ce qui supprime le besoin d'un état de
déduplication entre exécutions. Un témoin déposé dans `data/_slots` empêche
qu'un second workflow refasse le même créneau.

Chaque exécution enchaîne 36 créneaux, soit trois heures, parce que GitHub ne
déclenche qu'une douzaine de fois par jour.

## Les onze sources configurées

| Clé | Pays | Format | Authentification | Particularité |
|---|---|---|---|---|
| `fr_sncf` | France | GTFS-RT | aucune | identité par code UIC |
| `fr_idfm` | France IdF | SIRI Lite | `apikey` | 5 RER, 1 000 appels/jour, fenêtre vers l'avant |
| `ch_opentransport` | Suisse | GTFS-RT | `Authorization` | **désactivée**, en attente du statique |
| `no_entur` | Norvège | GTFS-RT | aucune | opérateurs VYG et FLT, sans fenêtre, cadence 15 min |
| `ie_nta` | Irlande | GTFS-RT | **`x-api-key`** | sans fenêtre |
| `fi_digitraffic` | Finlande | GTFS-RT | aucune | sans fenêtre |
| `nl_ovapi` | Pays-Bas | GTFS-RT | aucune | flux `trainUpdates.pb` |
| `de_gtfsde` | Allemagne | GTFS-RT | aucune | meilleur contributeur |
| `us_mta_mnr` | États-Unis | GTFS-RT | aucune | statique ajouté |
| `us_mta_lirr` | États-Unis | GTFS-RT | aucune | statique ajouté |
| `au_translink_seq` | Australie | GTFS-RT | aucune | |

## Les secrets GitHub

`SWISS_TOKEN`, `IRELAND_API_KEY`, `IDFM_API_KEY`. Le secret
`SWISS_TOKEN_HASH` a été supprimé, inutile. Ces valeurs ne sont lisibles que
depuis GitHub Actions : pour tester une source à clé, lancer
`gh workflow run sonde.yml -f sources=suisse|irlande|idfm|toutes`.

## La fenêtre de qualification en cours

Du **mercredi 5 août 03:00 UTC au mardi 11 août 03:00 UTC**, soit sept journées
MercatOr complètes, chacune de 05:00 à 05:00 heure de Paris, week-end compris.
Le collecteur tourne jusqu'au 13 août pour garder un jour de marge.

---

# PARTIE 3 · Les règles du jeu, telles que décidées

## Ce qui est tranché et ne doit pas être rouvert

- Les joueurs sont des gares ferroviaires. Les aéroports sont abandonnés.
- Un seul univers de données par saison, jamais de mélange.
- Les buts nocturnes façon MPG sont supprimés. Tous les buts viennent du moteur
  d'actions en temps réel.
- Un match dure du **lundi au dimanche inclus**, sept jours.
- La journée MercatOr court de 05:00 à 05:00 heure de Paris, stockage en UTC,
  fuseau IANA `Europe/Paris`, jamais de décalage fixe.
- Seuil ferroviaire : un retard inférieur ou égal à **300 secondes** vaut `+1`,
  au-delà `-1`. Ce seuil est validé par la mesure : ponctualité médiane 89,4 %,
  coefficient net 0,79 contre 0,80 supposé.
- Production cible par statut : 3 / 2,5 / 2 / 1,5 / 1 actions coûtant K par jour.
- `K = plafond(0,8 × N / A)`, N calculé sur les trains **observables**, sur
  28 jours glissants, entre deux matchs, figé au coup d'envoi.
- Les différences réelles de ponctualité entre pays sont conservées, sans
  normalisation nationale.
- Les gares faibles restent jouables. Aucun plancher de progression.
- Qualification en **7 jours sur 7**, décision du 4 août qui amende le handoff.
- Changements de consigne illimités, quantité brute de K conservée hors état
  actif, jauge entièrement consommée dès qu'une action est tentée.
- Ciblage allié préparé à l'avance, ciblage adverse aléatoire.

## Les critères de qualification d'un joueur

Sur la fenêtre de sept jours :

| Critère | Seuil |
|---|---|
| Volume observable | 15 mouvements par jour |
| Régularité | les 7 jours sur 7 |
| Fraîcheur | 80 % des événements observés à moins de 5 minutes |
| Ponctualité haute | au plus 98 %, au-delà le joueur est parfait donc sans intérêt |
| Identité | résolue et stable sur toute la fenêtre |
| Distribution | non artificielle, voir le test ci-dessous |

## Le test anti-« trop parfait », obligatoire

Sur au moins 100 mouvements, rejeter une source ou une gare si plus de 90 % des
retards valent exactement zéro, ou plus de 98 % sont sous une minute, ou moins
de cinq valeurs distinctes apparaissent, ou aucun mouvement ne dépasse cinq
minutes de retard.

**À appliquer après le filtre de fraîcheur, jamais sur une capture brute**, et
au niveau de la source quand aucune gare n'a individuellement assez de
mouvements : c'est ainsi que MBTA a été confondu, avec 100 % des mouvements sous
60 secondes sur 5 495 mouvements agrégés.

## Les interdits permanents

Aucune dépense, aucune carte bancaire, aucun abonnement payant. Aucun secret
dans le dépôt public, les logs ou les documents. Ne jamais demander au
concepteur de coller une clé dans une conversation. Ne pas modifier ni déployer
le projet Supabase de production `eclats`. Ne pas republier les flux bruts.
Ne jamais compter une donnée absente comme une réussite. Arrêter et demander
l'accord si une inscription, une clé ou une infrastructure distante devient
nécessaire. Le caractère tiret cadratin est proscrit de tout contenu visible.

---

# PARTIE 4 · Les mesures à ne pas refaire

## La loi de fraîcheur

Reproduite ici parce qu'elle conditionne tout le reste.

| Fraîcheur | Retard médian | Retards > 5 min | À l'heure |
|---|---:|---:|---:|
| 0 à 2 min | 60 s | 13,8 % | 56,2 % |
| 2 à 5 min | 55 s | 13,3 % | 61,4 % |
| 5 à 15 min | 12 s | 12,6 % | 65,3 % |
| 15 à 30 min | 0 s | 8,5 % | 76,6 % |
| plus de 30 min | 0 s | 2,8 % | 92,6 % |

## Le seuil de retard décide de tout

| Seuil | Ponctualité médiane | Coefficient net | Gares capables de charger |
|---|---:|---:|---:|
| 60 s | environ 56 % | 0,12 | 68 % |
| 180 s | 78,3 % | 0,57 | 90 % |
| **300 s** | **89,4 %** | **0,79** | **98 %** |
| 600 s | 96,6 % | 0,93 | 99 % |

## Le moteur d'actions

Temps de charge d'une action : `24 × coefficient / A` heures, indépendant de la
taille de la gare. Avec une durée active, le cycle réel devient
`24 × coefficient / A + durée`.

Simulation v3, cent matchs par duel, 4-4-2 : équilibré contre équilibré 46 buts,
offensif contre offensif 157, défensif contre défensif 6. En 5-4-1 contre 5-4-1,
24 buts. Les bots adaptatifs doublent les buts dans un duel centres contre
défensif, 70 contre 34, et divisent par trois les centres perdus.

## Le bilan du 4 août, 2,5 jours à 25 % de couverture

| Pays | Gares vues | Au-dessus de 15 mvt/j | Ponctualité | Retards > 5 min | Valeurs distinctes |
|---|---:|---:|---:|---:|---:|
| Allemagne | 6 207 | 1 713 | 83,1 % | 16,9 % | 1 778 |
| France SNCF | 2 645 | 224 | 91,0 % | 9,0 % | 42 |
| Pays-Bas | 489 | 263 | 94,7 % | 5,3 % | 1 140 |
| Finlande | 319 | 44 | 95,6 % | 4,4 % | 561 |
| États-Unis | 274 | 140 | 94,0 % | 6,0 % | 790 |
| Irlande | 206 | 53 | 89,0 % | 11,0 % | 103 |
| Norvège | 204 | 103 | 95,8 % | 4,2 % | 795 |
| France IdF | 195 | 168 | 97,0 % | 3,0 % | 733 |
| Australie | 150 | 65 | 95,2 % | 4,8 % | 652 |

Volume : environ 135 Ko par créneau, soit 39 Mo par jour à couverture complète.

## Les pièges déjà rencontrés, à ne pas retomber dedans

1. **MBTA et SEPTA** déclarent 100 % de trains à l'heure. Toute source qui
   affiche une ponctualité parfaite ment.
2. **Un quart des gares SNCF** ont une distribution dégénérée. Quarantaine.
3. **gtfs.de régénère ses identifiants d'arrêt chaque jour.** Sans tables datées,
   l'identité des jours passés est irrécupérable et l'Allemagne tombe de
   plusieurs milliers de gares à 35.
4. **protobufjs renvoie 0 au lieu de « absent ».** Toujours tester la valeur.
5. **Le flux SIRI d'Île-de-France ne contient que les passages à venir.**
6. **Norvège, Finlande, Irlande, Suisse ne fournissent que le retard**, sans
   heure absolue.
7. **GitHub ne déclenche un cron qu'une douzaine de fois par jour**, quelle que
   soit la fréquence demandée.
8. **Un test bash en fin de boucle fait échouer toute la tâche.**
9. **Le critère de régularité ne peut pas s'appliquer tant que la collecte est
   trouée** : il mesurerait nos trous et rejetterait Utrecht Centraal.

---

# PARTIE 5 · Ce qui reste ouvert

## Décisions réservées au concepteur

1. **Biais national de ponctualité.** Les gares néerlandaises tournent à 1,14
   fois le rythme cible, les allemandes à 0,76. L'assumer, ou calculer K sur la
   ponctualité historique de chaque gare.
2. **Annulations et arrêts supprimés** : quel effet sur la jauge. Proposition à
   valider, `-1` comme un retard.
3. **Cadence de décision des bots adverses.** Un bot qui réagit instantanément
   est imbattable. Proposition : deux à quatre heures, comme un humain attentif,
   et en faire un curseur de difficulté.
4. **Équilibrage du nombre de joueurs par pays** au mercato.
5. **Cible de buts.** Les valeurs actuelles donnent 46 buts par match là où le
   cadrage vise 28.

## Problèmes techniques en attente

1. **La Suisse est désactivée**, faute de GTFS statique pour filtrer le
   ferroviaire. Le concepteur peut le télécharger depuis sa session connectée
   sur opentransportdata.swiss. C'est la meilleure source du projet.
2. **La reconstitution de l'heure d'événement** pour la Norvège, la Finlande et
   l'Irlande, par jointure avec l'horaire statique, reste à écrire.
3. **La couverture doit être vérifiée** sur 24 heures avec le correctif des
   36 créneaux. Si elle n'atteint pas 90 %, il faudra sortir de GitHub Actions.
4. **Le catalogue officiel** n'existe pas encore. Le chiffre de 704 gares est
   une projection, pas un catalogue.

---

# PARTIE 6 · Ce qu'il faut faire ensuite

Dans cet ordre.

1. **Vérifier la couverture** sur une journée pleine avec le correctif des
   36 créneaux. Seuil d'acceptation : 90 % des 288 créneaux par jour et par
   source. Script : compter les fichiers de `data/_slots/<jour>/`.
2. **Écrire la jointure statique** pour la Norvège, la Finlande et l'Irlande,
   afin de reconstituer l'heure d'événement à partir du retard et de l'horaire
   théorique.
3. **Débloquer la Suisse** si le concepteur fournit le GTFS statique.
4. **Qualifier** sur la fenêtre du 5 au 11 août, en appliquant mécaniquement les
   critères de la partie 3, et produire `docs/catalogue-joueurs.md` : liste
   nominative par pays, N, K par statut, ponctualité, fraîcheur, et les rejets
   avec leur motif.
5. **Rejouer la simulation du moteur** sur le catalogue officiel, avec bots
   adaptatifs, et proposer un ajustement paramétrique pour atteindre la cible de
   buts.
6. **Ne développer le jeu lui-même** qu'après validation explicite du catalogue.

---

# Annexe · Documents du dépôt

| Fichier | Contenu |
|---|---|
| `docs/rail-poc-report.md` | verdict du POC ferroviaire, GO sous conditions |
| `docs/moteur-actions-analyse.md` | première analyse d'équilibrage, 16 réponses |
| `docs/simulation-v3-resultats.txt` | résultats bruts de la campagne v3 |
| `docs/etat-donnees-2026-08-01.md` | état des lieux des données |
| `docs/catalogue-sources.md` | verdicts par source, mesures du 2 août |
| `docs/guide-ouverture-pays.md` | marche à suivre pour les clés |
| `docs/ia-adversaires-conception.md` | architecture de l'IA adverse |
| `docs/handoff-catalogue-donnees.md` | critères de qualité |
| `docs/tri-gares.csv` | tri des 2 743 gares en trois familles |
| `docs/etat-donnees-retenues.csv` | listes nominatives |
| `sim/moteur2.mjs` | simulateur du moteur v3 |
| `sim/bilan.mjs` | bilan de campagne |
| `sim/projection.mjs` | projection du catalogue |
