# Handoff · construction du catalogue de joueurs MercatOr

Document de transmission destiné à l'agent qui reprend le sujet des données.
Il est autoportant : tout ce qui est nécessaire pour continuer sans relire
l'historique des sessions y figure.

Objectif confié : **obtenir un catalogue de joueurs multi-pays dont les données
sont fiables**, quitte à en avoir peu par pays. La consigne du concepteur est
explicite et prime sur toute autre considération :

> Je ne veux pas de gares pour lesquelles il manque des données, ou qui les
> inventent et qui donnent des résultats trop parfaits. Je préfère avoir peu de
> gares de chaque pays qu'avoir une grande quantité de gares d'un pays dont les
> 3/4 fausseront le jeu.

---

## 1. Ce dont le jeu a réellement besoin

MercatOr est un jeu de football asynchrone dont les joueurs sont, aujourd'hui,
des gares ferroviaires. **Le fait que ce soient des gares n'a aucune importance
en soi.** Le moteur ne consomme que deux choses :

1. **Un flux d'événements datés, attribuables à un joueur.** Chaque événement
   possède un instant et un verdict binaire : positif ou négatif. Pour une gare,
   un train à l'heure vaut `+1`, un train en retard vaut `-1`.
2. **Un volume moyen `N`**, le nombre d'événements exploitables par jour et par
   joueur, dont se déduit la valeur personnelle `K`.

```
K = plafond(coefficient_reference × N / A)
coefficient_reference = 2 × ponctualite_reference − 1 = 0,8 pour 90 %
A = production cible du statut (superstar, star, titulaire, rotation, petit)
```

Toute source fournissant un flux d'événements horodatés avec un verdict
positif/négatif crédible peut donc alimenter le jeu. Le ferroviaire a été retenu
parce qu'il coche ces cases gratuitement, pas par attachement au thème.

**Deux propriétés numériques à connaître avant de toucher aux données :**

- Le temps de charge d'une action vaut `24 × coefficient / A` heures. Le `N`
  s'annule entre la formule de `K` et le rythme réel. **La taille du joueur
  n'influence donc pas son rythme**, seulement la finesse de sa jauge. Ce qui
  compte est la régularité et la véracité des événements, pas leur nombre.
- La progression nette d'un joueur vaut `N × (2p − 1)` où `p` est sa ponctualité.
  **En dessous de 50 % de ponctualité la jauge ne monte jamais** et le joueur est
  mort. Au-dessus de 98 % le joueur est parfait et le jeu perd son intérêt.

---

## 2. État actuel du projet

### Dépôt

`github.com/Blinytz/mercator` (public). Il contient à la fois le collecteur et
les données collectées.

```
src/collect.mjs      collecteur GTFS-Realtime, un run par heure
src/refdata.mjs      référentiels de filtrage ferroviaire et tables d'arrêts
src/config.json      toute la configuration, sources comprises
.github/workflows/   collect.yml (horaire) et refdata.yml (quotidien)
data/<source>/<jour>/obs-HHMMZ.ndjson.gz     observations minimales
data/<source>/LICENSE.md                      licence propre à chaque source
logs/runs.ndjson     journal d'exécution : heure prévue, réelle, durée, trous
state/health.json    compteurs de requêtes et d'erreurs par source
state/refdata/       filtres rail et tables d'arrêts (dernière version seulement)
sim/                 simulateur du moteur d'actions et scripts d'analyse
docs/rail-poc-report.md          verdict du POC ferroviaire
docs/moteur-actions-analyse.md   équilibrage du moteur sur données réelles
```

Format d'une observation, une ligne par changement d'estimation sur un arrêt :

```json
{"t":"2026-07-21T22:18:25.709Z","net":"fr_sncf","trip":"OCE...","route":"",
 "stop":"StopPoint:OCETrain TER-87713040","seq":0,"rel":"SCHEDULED",
 "ad":null,"dd":0,"as":null,"ds":1784649900,"fts":1784672268}
```

`ad`/`dd` retard arrivée/départ en secondes, `as`/`ds` heures estimées en époque
Unix, `rel` vaut `SCHEDULED`, `SKIPPED` (arrêt supprimé), `CANCELED` (train
annulé, ligne sans `stop`), `fts` horodatage de l'en-tête du flux. L'heure
théorique se dérive par `as − ad` ou `ds − dd`.

### Collecte réalisée

Du 21/07/2026 22:19 UTC au 30/07/2026 04:00 UTC, arrêt automatique programmé.
7 réseaux, 5 pays, 7,09 millions de lignes brutes, 1,88 million d'événements
consolidés, 113 Mo. Coût nul, aucune clé, aucune intervention manuelle.

### Sources déjà en place

| Clé | Pays | TripUpdates | Statique | Licence | Clé API |
|---|---|---|---|---|---|
| `fr_sncf` | France | `proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates` | `eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip` | ODbL | non |
| `nl_ovapi` | Pays-Bas | `gtfs.ovapi.nl/nl/trainUpdates.pb` | `gtfs.ovapi.nl/nl/gtfs-nl.zip` | usage libre, attribution | non |
| `de_gtfsde` | Allemagne | `realtime.gtfs.de/realtime-free.pb` | `download.gtfs.de/germany/fv_free/latest.zip` et `rv_free` | CC BY-SA 4.0 | non |
| `us_mbta` | États-Unis | `cdn.mbta.com/realtime/TripUpdates.pb` | `cdn.mbta.com/MBTA_GTFS.zip` | MassDOT | non |
| `us_mta_lirr` | États-Unis | `api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr` | à ajouter | conditions MTA | non |
| `us_mta_mnr` | États-Unis | `api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr` | à ajouter | conditions MTA | non |
| `au_translink_seq` | Australie | `gtfsrt.api.translink.com.au/api/realtime/SEQ/TripUpdates` | `gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip` | CC BY 4.0 | non |

Alertes de service disponibles pour SNCF, OVapi et MBTA, déjà collectées.
Suisse testée : `api.opentransportdata.swiss/la/gtfs-rt` répond 401 sans clé,
clé gratuite sur inscription, non activée à ce jour.

---

## 3. Faits mesurés à ne pas redécouvrir

### 3.1 Loi de fraîcheur, le résultat le plus important

Le retard d'un arrêt n'est connu que si la dernière estimation reçue est proche
de l'événement. Mesuré sur 1,88 million d'événements :

| Fraîcheur de la dernière estimation | Retard médian | Retards > 5 min | À l'heure |
|---|---:|---:|---:|
| 0 à 2 min | 60 s | 13,8 % | 56,2 % |
| 2 à 5 min | 55 s | 13,3 % | 61,4 % |
| 5 à 15 min | 12 s | 12,6 % | 65,3 % |
| 15 à 30 min | 0 s | 8,5 % | 76,6 % |
| plus de 30 min | 0 s | 2,8 % | 92,6 % |

**Conséquences opérationnelles :**

- Une capture toutes les 5 minutes est nécessaire **et suffisante**.
- Au-delà de 15 minutes de fraîcheur, la donnée n'est plus qu'un horaire
  théorique déguisé et doit être **écartée**, jamais comptée comme « à l'heure ».
- Toute statistique de ponctualité doit être calculée sur les seules
  observations fraîches, sous peine d'annoncer 92 % de trains à l'heure.

### 3.2 Seuil définissant un train à l'heure

| Seuil | Ponctualité médiane | Coefficient net `2p−1` | Rythme vs cible |
|---|---:|---:|---:|
| 180 s | 78,3 % | 0,57 | 71 % |
| **300 s** | **89,4 %** | **0,79** | **98 %** |
| 600 s | 96,6 % | 0,93 | 116 % |

**Retenir 300 s.** C'est le seuil qui valide le coefficient 0,8 du moteur
(mesuré 0,79), c'est le standard ferroviaire, et c'est celui où 98 % des gares
restent capables de charger leur jauge. À 60 s, 32 % des gares ont une
progression nette négative et sont mortes.

### 3.3 Ponctualité par réseau, observations fraîches uniquement

| Réseau | ≤ 60 s | ≤ 180 s | ≤ 300 s | ≤ 600 s | Verdict |
|---|---:|---:|---:|---:|---|
| Pays-Bas | 66,7 % | 90,9 % | 95,6 % | 98,4 % | exploitable |
| Australie | 56,2 % | 85,2 % | 94,0 % | 98,7 % | exploitable |
| Metro-North | 45,3 % | 71,9 % | 86,4 % | 96,5 % | exploitable |
| LIRR | 48,7 % | 77,3 % | 89,6 % | 98,4 % | identité instable |
| France | 64,5 % | 65,7 % | 81,8 % | 87,7 % | exploitable, partiel |
| Allemagne | 50,6 % | 70,4 % | 80,4 % | 91,0 % | identité instable |
| **MBTA** | **100 %** | **100 %** | **100 %** | **100 %** | **à rejeter en l'état** |

### 3.4 Catalogue actuel

2 743 gares vues, **588 réellement jouables** (présentes les 6 journées complètes
avec au moins 5 mouvements fraîchement observés par jour) :

| Pays | Vues | Jouables | N médian | N max | Réseaux |
|---|---:|---:|---:|---:|---|
| Allemagne | 1 220 | 35 | 31 | 340 | gtfs.de |
| France | 736 | 88 | 14 | 175 | SNCF |
| Pays-Bas | 352 | 234 | 38 | 725 | OVapi |
| États-Unis | 281 | 142 dont 42 faux | 21 | 513 | MNR 100, MBTA 42, LIRR 0 |
| Australie | 154 | 131 | 61 | 437 | TransLink |

---

## 4. Défauts connus, par ordre de priorité

### D1. Cadence de collecte, bloquant

GitHub Actions n'a exécuté que **21 % des captures prévues** : 11 à 16 runs par
jour au lieu de 24, 68 trous de plus d'une heure, le plus long de 3 h 42.
Résultat : 52 % des événements ne sont pas fraîchement observés.

Cause identifiée, et c'est une erreur de conception du collecteur actuel :
chaque exécution occupe l'heure entière jusqu'à la minute 58, et le groupe de
concurrence `collect` fait que toute exécution retardée par GitHub reste en file
puis se fait remplacer par la suivante. Un seul retard supprime une heure.

**Correctif à appliquer :** exécutions courtes (un cycle, environ 40 secondes)
planifiées toutes les 5 minutes, sans groupe de concurrence bloquant, doublées
par un second workflow décalé pour absorber les abandons de GitHub. Un abandon
coûte alors un créneau de 5 minutes au lieu d'une heure.

**Validation obligatoire :** mesurer la couverture réelle sur 48 heures avant de
constituer un catalogue. Seuil d'acceptation : 90 % des créneaux de 5 minutes
contenant au moins une capture réussie par source.

Si GitHub Actions reste insuffisant après correction, deux replis gratuits
existent mais demandent la création d'un compte par le concepteur : un
déclencheur planifié Cloudflare Workers, ou un projet Supabase distinct dédié à
la collecte. Ne rien engager sans son accord explicite.

### D2. Identité des joueurs instable

`gtfs.de` régénère ses identifiants d'arrêt à chaque publication du GTFS
statique : le recouvrement entre le 22/07 et le 27/07 est de **1 %**. La SNCF
présente une même gare sous plusieurs identifiants selon la marque du train
(`OCETrain TER-`, `OCEOUIGO-`), d'où 48 % de recouvrement seulement.

**Correctifs :**

- Archiver une table d'arrêts **datée par jour** (`state/refdata/<source>_stops_AAAA-MM-JJ.json.gz`)
  au lieu d'écraser la dernière. Sans cela, l'identité des jours passés est
  irrécupérable, ce qui a réduit l'Allemagne de plusieurs milliers de gares à 35.
- Résoudre une identité stable **au moment de la collecte** et la stocker dans
  l'observation : code UIC pour la France (extraire les 7 ou 8 chiffres du
  `stop_id`), nom plus coordonnées arrondies pour l'Allemagne et les Pays-Bas,
  `parent_station` ailleurs.

### D3. Sources qui inventent la donnée

`us_mbta` déclare 100 % de trains à l'heure à tous les seuils : le flux ne
renseigne pas de retard réel. Ces 123 gares seraient des joueurs parfaits.
**Consigne du concepteur : les retirer.** Soit exclure MBTA, soit recalculer le
retard en comparant l'heure estimée à l'horaire du `stop_times.txt` statique, et
ne réintégrer les gares que si elles passent alors les critères de la section 5.

`us_mta_lirr` ne produit aucune gare stable et son statique n'est pas configuré :
ajouter le GTFS statique LIRR et Metro-North (noms de gares aujourd'hui absents),
puis réévaluer.

### D4. France amputée

Une seule gare française dépasse 150 trains par jour et le N médian est de 14 :
le flux SNCF ne porte qu'une partie du trafic, et surtout **Transilien est
absent**. Les gares d'Île-de-France, les plus fréquentées du pays, passent par
Île-de-France Mobilités et demandent une clé PRIM gratuite.

Le concepteur a validé le recours à une clé gratuite, à condition qu'elle
donne des informations correctes sans bridage. **Vérifier les quotas de la clé
PRIM avant de l'intégrer** : la cadence nécessaire est de 288 appels par jour et
par flux. Si le quota est inférieur, le dire et ne pas intégrer.

---

## 5. Critères d'acceptation, le coeur de la mission

Ces critères traduisent la consigne « peu de joueurs mais fiables ». Ils sont à
appliquer mécaniquement, à documenter source par source, et à versionner dans le
dépôt sous forme de script reproductible.

### 5.1 Recevabilité d'un réseau

Un réseau n'entre dans le catalogue que s'il satisfait **tous** les points :

1. **Gratuité totale.** Aucun paiement, aucune carte bancaire, aucun essai
   payant automatique. Une clé gratuite sur inscription est acceptée.
2. **Quota compatible.** Au moins 288 requêtes par jour et par flux, soit une
   capture toutes les 5 minutes, sans bridage ni dégradation. Documenter le
   quota constaté dans les en-têtes de réponse.
3. **Licence compatible** avec le stockage durable et l'usage applicatif,
   attribution documentée dans `data/<source>/LICENSE.md`. Ne jamais fusionner
   juridiquement les bases : une licence par source.
4. **Temps réel authentique.** Le flux doit fournir des retards ou des heures
   estimées qui **diffèrent réellement** de l'horaire théorique. Test de rejet
   ci-dessous en 5.3.
5. **Fraîcheur du flux.** L'en-tête `header.timestamp` doit être daté de moins
   de 5 minutes lors de captures successives.
6. **Statique disponible** pour filtrer le ferroviaire et nommer les gares :
   `routes.txt` avec `route_type`, `stops.txt` avec noms et coordonnées.
7. **Identité résoluble**, stable ou reconstructible par code officiel, ou par
   nom plus coordonnées.

Un réseau qui échoue sur un seul point est écarté et documenté comme tel. Mieux
vaut quatre pays propres que huit pays dont la moitié fausse le jeu.

### 5.2 Recevabilité d'un joueur

Sur une fenêtre glissante de 7 jours, une gare n'entre au catalogue que si :

| Critère | Seuil | Motif |
|---|---|---|
| Volume observable | `N ≥ 15` mouvements fraîchement observés par jour | en dessous, la jauge est trop grossière et le joueur trop lent |
| Régularité | au moins 6 jours sur 7 au-dessus du seuil de volume | un joueur ne doit pas disparaître |
| Fraîcheur | au moins **80 %** des événements observés à moins de 5 minutes | c'est le critère anti-données-manquantes |
| Ponctualité basse | `p(300 s) ≥ 60 %` | en dessous de 50 % la jauge ne monte jamais ; la marge évite les joueurs morts |
| Ponctualité haute | `p(300 s) ≤ 98 %` | au-delà, le joueur est parfait et sans intérêt sportif |
| Identité | même identifiant résolu sur les 7 jours | sinon le joueur change d'identité en pleine saison |

### 5.3 Test anti-« trop parfait », obligatoire

C'est le test qui aurait dû écarter MBTA dès l'inventaire. Une source ou une
gare est rejetée si, sur 7 jours et au moins 100 mouvements observés :

- la part de mouvements dont le retard vaut **exactement 0** dépasse 90 % ;
- ou la part de mouvements à moins de 60 secondes dépasse **98 %** ;
- ou moins de **5 valeurs de retard distinctes** apparaissent ;
- ou **aucun** mouvement ne dépasse 300 secondes de retard.

Un réseau ferroviaire réel présente toujours une dispersion : les mesures de
référence donnent 13,8 % de mouvements à plus de 5 minutes et une médiane de
60 secondes. Une distribution dégénérée signale un flux qui recopie son horaire.

### 5.4 Validité d'une journée

Une journée MercatOr court de 05:00 à 05:00 heure de Paris, stockage en UTC,
fuseau IANA `Europe/Paris`, jamais de décalage fixe. Elle n'est **complète** que
si 90 % de ses 288 créneaux de 5 minutes contiennent au moins une capture
réussie de la source. Une journée incomplète ne doit jamais être présentée comme
complète ni servir au calcul de `N`.

### 5.5 Calcul de N et de K

- `N` se calcule sur les mouvements **fraîchement observés**, jamais sur les
  trains théoriques. Fenêtre recommandée : 28 jours glissants, paramétrable.
- `K = plafond(0,8 × N / A)` avec `A` la production cible du statut.
- Le seuil « à l'heure » est fixé à 300 secondes.
- Décision ouverte à soumettre au concepteur : la ponctualité nationale crée un
  biais permanent (Pays-Bas 1,14x du rythme cible, Allemagne 0,76x). Soit on
  l'assume, soit on calcule `K` à partir de la ponctualité historique propre à
  chaque gare, auquel cas seule la variation quotidienne compte. Ne pas trancher
  seul.

---

## 6. Réseaux à instruire

### 6.1 Demandés explicitement par le concepteur

Norvège, Finlande, Irlande, Suisse, Espagne, et **la France en priorité**.

Points d'entrée connus, **tous à vérifier, aucun n'a été testé** :

| Pays | Piste | Clé | À contrôler en premier |
|---|---|---|---|
| France IdF | Île-de-France Mobilités, plateforme PRIM | gratuite, inscription | quota journalier réel, couverture Transilien et RER |
| Suisse | `opentransportdata.swiss`, endpoint `/la/gtfs-rt` | gratuite, inscription | a répondu 401 sans clé, donc l'endpoint existe ; vérifier quota et périmètre ferroviaire |
| Norvège | Entur, plateforme nationale des transports | à vérifier | existence d'un GTFS-RT TripUpdates, et non seulement du SIRI |
| Finlande | Digitraffic, données ferroviaires nationales | à vérifier | format proposé, GTFS-RT ou API propriétaire à convertir |
| Irlande | National Transport Authority, GTFS-R | gratuite, inscription probable | périmètre ferroviaire (Irish Rail) plutôt que bus |
| Espagne | Renfe et opérateurs régionaux | à vérifier | l'existence d'un temps réel public n'est pas acquise |

Catalogue à utiliser pour découvrir les flux : **Mobility Database**
(`mobilitydatabase.org`), qui recense les GTFS et GTFS-RT publics par pays. Le
Point d'Accès National français `transport.data.gouv.fr` expose une API
`/api/datasets` déjà utilisée avec succès pour retrouver les flux SNCF.

### 6.2 Méthode d'instruction

Pour chaque candidat, dans cet ordre, et **sans jamais engager de dépense** :

1. Vérifier la licence et le droit de stockage avant tout téléchargement massif.
2. Sonder le flux temps réel une fois, décoder le protobuf, mesurer la fraîcheur
   de l'en-tête, compter les trajets et les arrêts, vérifier la présence
   simultanée des retards d'arrivée et de départ.
3. Appliquer le test anti-« trop parfait » de la section 5.3 sur cette première
   capture, puis le confirmer sur 24 heures avant intégration.
4. Vérifier que le statique fournit `route_type` ferroviaire, noms et
   coordonnées d'arrêts.
5. Documenter le tout dans un tableau, source par source, avec verdict motivé.

Le paramètre `filtre` de `src/config.json` accepte `trips`, `routes` ou `aucun`
selon que le flux temps réel expose des `trip_id` ou des `route_id` filtrables.
Le champ `garder_inconnus` permet de conserver les identifiants absents du
statique pour les flux quasi purement ferroviaires comme la SNCF.

---

## 7. Contraintes et interdits

1. **Aucune dépense**, aucune carte bancaire, aucun abonnement payant, jamais.
2. **Aucun secret dans le dépôt public.** Les clés vivent en variables
   d'environnement et, pour GitHub Actions, en secrets de dépôt. Ne jamais les
   écrire dans le code, les logs, la configuration versionnée ou l'interface.
   Ne jamais demander au concepteur de coller une clé dans une conversation.
3. **Ne pas modifier ni déployer le projet Supabase de production** (`eclats`,
   réf `psutbulpezfdftmaqkoo`). Il porte le ledger d'éclats commun à toutes les
   applications du concepteur. Le POC n'y touche pas.
4. **Ne jamais republier les flux GTFS-RT bruts.** Seules les observations
   minimales dérivées sont stockées, séparées par source, avec leur licence.
5. **Ne pas compter une donnée absente comme positive.** C'est la règle qui a
   sauvé l'analyse du POC : les 56 % d'événements non frais ont été écartés, pas
   comptés comme « à l'heure ».
6. **Ne pas poursuivre silencieusement** si une inscription, une clé, une
   modification distante ou une machine laissée allumée devient nécessaire :
   l'annoncer et attendre l'accord.

---

## 8. Travail attendu, dans l'ordre

1. **Corriger la cadence** (D1) et valider 90 % de couverture sur 48 heures.
   Rien de ce qui suit n'a de valeur sans cette étape.
2. **Corriger l'identité** (D2) : tables d'arrêts datées et identité résolue à
   la collecte.
3. **Nettoyer l'existant** (D3) : écarter MBTA ou recalculer ses retards depuis
   le statique, ajouter les statiques LIRR et Metro-North.
4. **Écrire le script de qualification** appliquant mécaniquement la section 5,
   versionné dans le dépôt, produisant un catalogue daté et un rapport de rejet
   motivé par gare.
5. **Instruire la France en priorité** (D4), puis Suisse, Norvège, Finlande,
   Irlande, Espagne selon la méthode 6.2.
6. **Relancer une collecte propre de 7 jours** sur le périmètre qualifié, puis
   publier le catalogue final : nombre de pays, de joueurs par pays, `N`, `K` par
   statut, ponctualité, et les rejets avec leur motif.

### Livrables

- `docs/catalogue-sources.md` : une ligne par réseau instruit, avec URL, licence,
  clé, quota, verdict et motif de rejet le cas échéant.
- `docs/catalogue-joueurs.md` : le catalogue qualifié, par pays, avec les
  statistiques de qualité et la liste des rejets.
- Le script de qualification et le collecteur corrigé, dans le dépôt.

---

## 9. Points ouverts qui appartiennent au concepteur

À ne pas trancher seul, à lui soumettre :

1. Biais national de ponctualité : l'assumer, ou normaliser `K` sur la
   ponctualité historique de chaque joueur.
2. Effet des annulations et des arrêts supprimés sur la jauge. Le collecteur les
   distingue déjà, mais le moteur ne dit pas ce qu'ils valent. Proposition à
   valider : arrêt supprimé `−1`, annulation `−1` sur chaque gare du parcours.
3. Sort des joueurs sous 60 % de ponctualité : exclusion, ou plancher de
   progression garanti.
4. Nombre de joueurs par pays visé, et faut-il équilibrer les pays entre eux
   pour le mercato ou accepter qu'un pays domine.
5. Ouverture à des sources non ferroviaires si elles sont plus propres : le
   moteur n'exige qu'un flux d'événements datés avec verdict binaire. La piste
   des vélos en libre-service (standard GBFS) avait été prévue comme repli et
   n'a jamais été instruite.

---

## 10. Pour aller plus loin dans le contexte

- `docs/rail-poc-report.md` : verdict du POC ferroviaire, GO sous conditions,
  méthode de mesure de la couverture et de la fraîcheur.
- `docs/moteur-actions-analyse.md` : équilibrage du moteur d'actions sur données
  réelles, valeurs de `K`, temps de charge, simulations de matchs, et les
  16 réponses aux questions d'équilibrage du concepteur.
- `sim/` : simulateur réutilisable. `sim/extract.mjs` produit exactement les
  profils de joueur dont parle la section 5 (volume, ponctualité par seuil,
  données manquantes, répartition horaire) et constitue une base directe pour le
  script de qualification.
