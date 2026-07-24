# Mercator Rail

Collecte temporaire (7 jours) d'observations ferroviaires dérivées de flux
GTFS-Realtime publics, pour un POC de faisabilité du jeu Mercator : évaluer si
au moins 500 gares peuvent recevoir une note quotidienne calculée sur des
données réelles couvrant toute la journée.

Ce dépôt ne contient aucun secret : tous les flux interrogés sont publics et
sans clé. Le code est sous licence MIT ([LICENSE](LICENSE)). **Les données de
`data/` ne sont pas sous une licence unique** : chaque sous-dossier
`data/<source>/` reste régi par la licence de sa source, indiquée dans son
`LICENSE.md`. Les bases dérivées par source ne sont pas fusionnées juridiquement.

## Ce qui est collecté (et ce qui ne l'est pas)

Les flux GTFS-Realtime bruts ne sont **pas** republiés. Seules des observations
minimales dérivées sont conservées, une ligne NDJSON par changement d'estimation
sur un arrêt d'un train :

```
{ t, net, trip, route, stop, seq, rel, ad, dd, as, ds, fts }
```

- `t` : horodatage de capture (ISO, UTC) ; `net` : identifiant de la source ;
- `trip`, `route`, `stop`, `seq` : identifiants GTFS publics des trains, lignes
  et gares. Ce sont des identifiants techniques d'objets publics, sans aucune
  donnée personnelle, conservés en clair pour l'auditabilité des calculs ;
- `rel` : `SCHEDULED`, `SKIPPED` (arrêt supprimé), `CANCELED` (train annulé),
  `ADDED`, `NO_DATA` ;
- `ad` / `dd` : retard estimé à l'arrivée / au départ, en secondes ;
- `as` / `ds` : heure estimée d'arrivée / de départ (époque Unix) ;
  l'heure théorique se dérive de `as - ad` ou `ds - dd` ;
- `fts` : timestamp du header du flux au moment de la capture (fraîcheur).

Fichiers : `data/<source>/<AAAA-MM-JJ UTC>/obs-<HHMM>Z.ndjson.gz` (un par run
horaire). Journal d'exécution : `logs/runs.ndjson` (heure prévue, heure réelle,
durée, cycles, trous entre captures, lignes émises, erreurs). Compteurs et état
des sources : `state/health.json`.

## Fonctionnement

- Workflow `collect` : un run par heure (cron minute 2, décalé du début d'heure),
  qui exécute en interne un cycle de capture toutes les 5 minutes jusqu'à la
  minute 58, puis un seul commit. Concurrence limitée à 1, timeout 75 min,
  déclenchement manuel possible (`workflow_dispatch`, entrée `cycles`).
- Workflow `refdata` : quotidien, reconstruit les référentiels de filtrage
  ferroviaire depuis les GTFS statiques (`route_type` ferroviaires uniquement,
  bus exclus ; les identifiants SNCF et gtfs.de sont régénérés régulièrement).
- Déduplication : une observation n'est réécrite que si l'estimation change.
  L'état vit dans le cache Actions (`.state-cache/`, hors dépôt) ; un défaut de
  cache ne perd aucune donnée, il produit seulement des doublons filtrables.
- Garde-fous : timeout réseau 30 s, 1 retentative avec délai, suspension
  automatique d'une source après 5 erreurs consécutives (6 h), plafond de taille
  de réponse (64 Mo), plafond de taille de `data/` (1,5 Go), arrêt définitif
  après `end_utc` (fin du POC), tout est paramétrable dans `src/config.json`.

## Journée complète et seuil de couverture

Une journée Mercator se termine à 05:00 heure de Paris ; le stockage est en UTC.
Une journée d'une source est déclarée **complète** si sa couverture temporelle
atteint `coverage_threshold` (90 % par défaut) : nombre de créneaux de 5 minutes
contenant au moins une capture réussie de la source, divisé par 288. Les
journées sous le seuil sont signalées et ne sont pas comptées comme complètes.

## Sources et attributions

| Source | Données | Licence |
|---|---|---|
| `fr_sncf` | SNCF Voyageurs via transport.data.gouv.fr | ODbL |
| `nl_ovapi` | OVapi / Stichting OpenGeo (agrégat NDOV, dont NS) | Usage libre, attribution |
| `de_gtfsde` | gtfs.de (base DELFI) | CC BY-SA 4.0 |
| `us_mbta` | MBTA (Boston) | Licence développeur MassDOT |
| `us_mta_lirr` | MTA Long Island Rail Road | Conditions MTA |
| `us_mta_mnr` | MTA Metro-North Railroad | Conditions MTA |
| `au_translink_seq` | TransLink (Queensland, Australie) | CC BY 4.0 |

Détail et mentions exactes : `data/<source>/LICENSE.md`. Merci aux producteurs
de ces données ouvertes. Ce dépôt est un test technique temporaire, sans
affiliation avec les opérateurs cités ; il sera archivé ou supprimé après le POC.
