# La jointure statique · reconstitution de l'heure d'événement

4 août 2026. Point 2 de la feuille de route.

## Le problème

Trois sources ne publient qu'un retard, sans heure absolue : la Norvège
(Entur), la Finlande (Digitraffic) et l'Irlande (NTA). Leurs observations
sortent de la collecte avec `ea` et `ed` nuls.

Sans heure d'événement, ces sources sont inutilisables. Ni la loi de fraîcheur
ni la déduplication ne peuvent s'appliquer : on ne sait pas quand l'événement
observé a eu lieu, donc on ne sait pas si le retard annoncé est une mesure ou
une prédiction, et on ne sait pas si deux captures parlent du même train.

## Le principe

    heure réelle = minuit du jour de service (heure locale)
                 + horaire théorique en secondes
                 + retard

Trois ingrédients sont donc nécessaires : le jour de service, l'horaire
théorique de l'arrêt, et le fuseau de l'agence.

## Ce qui a été mesuré avant d'écrire quoi que ce soit

### Le jour de service est publié, mais n'était pas conservé

Sondage du 4 août sur les flux : `startDate` est présent sur **100 % des
trajets** en Norvège comme en Finlande. Le collecteur ne le stockait pas.
Un champ `sd` a donc été ajouté aux observations.

Entur publie les deux formes dans le même flux, `2026-08-04` et `20260804`.
La normalisation est obligatoire avant toute comparaison.

### L'appariement fonctionne, et il fonctionne à 100 %

Test décisif : les `trip_id` du temps réel existent-ils dans le GTFS statique,
et la paire (`trip_id`, `stop_sequence`) retrouve-t-elle l'horaire ?

| Source | Statique retenu | Trajets appariés | Arrêts appariés |
|---|---|---:|---:|
| Norvège | `rb_vyg` + `rb_flt`, 79 Mo | 1 154 / 1 154, 100 % | 13 470 / 13 470, 100 % |
| Finlande | `gtfs-all.zip`, 12,6 Mo | 74 / 74, 100 % | 412 / 433, 95,2 % |
| Irlande | `GTFS_Irish_Rail.zip`, 7,9 Mo | 1 905 / 1 905, 100 % | 1 905 / 1 905, 100 % |

L'Irlande a été validée hors ligne, contre 1 905 observations réellement
collectées le 4 août, la clé n'étant pas lisible en local.

Deux statiques ont été changés au passage, sur mesure :

- **Norvège** : les statiques par opérateur pèsent 79 Mo contre 587 Mo pour
  l'agrégé national, et couvrent exactement les deux sources de données qui
  renvoient quelque chose, VYG et FLT. GJB et SJN renvoient zéro entité.
- **Irlande** : le statique Irish Rail seul pèse 7,9 Mo contre 106 Mo pour le
  statique tous opérateurs, et suffit puisque seul le ferroviaire nous intéresse.

### La chaîne complète est juste à la seconde

La SNCF publie **à la fois** l'heure absolue et le retard. On peut donc
reconstituer l'heure par la jointure et la comparer à l'heure réellement
publiée. C'est la seule validation qui prouve l'arithmétique entière : jour de
service, fuseau, minuit de service, débordement au-delà de 24:00:00.

    comparaisons testables : 8 191
    reconstitution exacte à la seconde : 8 191, soit 100,00 %
    écart min 0 s | médian 0 s | max 0 s

Découverte au passage : **la SNCF ne renseigne pas `stopSequence`** dans son
flux temps réel. Le champ vaut 0 partout, ce qui est le piège protobuf déjà
connu sous une autre forme. Sans effet sur la jointure, puisque la SNCF porte
l'heure absolue, mais le champ `seq` de nos observations SNCF ne veut rien dire.

## Ce que la mesure a révélé en chemin

### La Norvège collectait 84,8 % de bruit

Répartition d'une capture Entur par jour de service, 4 août :

| Jour de service | Arrêts | Part | Retards nuls | Valeurs distinctes |
|---|---:|---:|---:|---:|
| 4 août, le jour même | 2 042 | 15,2 % | 72,2 % | **321** |
| 5 août | 7 933 | 58,9 % | 100,0 % | **1** |
| 6 août | 1 203 | 8,9 % | 100,0 % | 1 |
| 7 août | 1 170 | 8,7 % | 100,0 % | 1 |
| 8 août | 1 105 | 8,2 % | 100,0 % | 1 |
| 9 août | 11 | 0,1 % | 100,0 % | 1 |

Le flux publie les circulations jusqu'à cinq jours à l'avance, toutes annoncées
à un retard de zéro exactement. Agrégée, la source affiche **95,8 % de retards
nuls** et serait **rejetée par le test anti-parfait**, alors que la journée du
jour est saine : 321 valeurs distinctes, 4,8 % de retards supérieurs à cinq
minutes.

C'est la même erreur que l'épisode Vy de la phase 9, sous une autre forme, et
la règle qui la gouverne est la même : le test anti-parfait s'applique après
filtrage, jamais sur une capture brute. Ici le filtre manquant était celui du
jour de service, la Norvège et l'Irlande étant déclarées `sans_fenetre`.

Correctif : `jours_service_admis: [-1, 0]`, le jour courant et la veille, la
veille servant aux trains de nuit. Mesure après correctif : 1 006 trajets sur
1 150 écartés, 1 987 observations au lieu de 13 464.

### La cadence norvégienne de 15 minutes devenait intenable

`cadence_ticks: 3` avait été posé à cause du volume. Le filtre du jour de
service le rend inutile : à 1 987 arrêts par capture, la Norvège est comparable
à gtfs.de et ses 2 484.

Surtout, la cadence était incompatible avec le critère de qualification. Une
fenêtre de fraîcheur de cinq minutes ne peut pas être tenue par une capture
toutes les quinze minutes : la plupart des événements ne tomberaient jamais
dans une fenêtre fraîche.

`cadence_ticks` est donc retiré. Le volume baisse malgré tout : 1 987
observations par créneau contre 4 488 en équivalent sous l'ancien réglage.

## Ce qui a été écrit

| Fichier | Rôle |
|---|---|
| `src/horaires.mjs` | construit les tables d'horaires théoriques par source et par jour |
| `sim/jointure.mjs` | reconstitue l'heure, déduplique, filtre sur la fraîcheur |
| `src/collect.mjs` | stocke `sd`, écarte les jours de service non admis |
| `.github/workflows/refdata.yml` | construit les tables d'horaires chaque jour |

### Les tables sont datées, et ce n'est pas un détail

`state/horaires/<source>_<jour>.json.gz`. Entur et la NTA régénèrent leurs
`trip_id` à chaque version du statique. Relire une observation de la veille
avec la table du jour ferait chuter l'appariement, exactement comme gtfs.de a
fait tomber l'Allemagne de plusieurs milliers de gares à 35.

La jointure choisit la table la plus récente qui ne soit pas postérieure au
jour observé.

Coût : 1,2 Mo compressé par jour pour les trois sources réunies.

### Le fuseau n'est jamais figé

Il est lu dans `agency.txt` et l'offset est recalculé à l'instant considéré via
`Intl`. Un décalage fixe casserait au changement d'heure, ce que la règle du
projet interdit déjà pour la journée MercatOr.

L'Irlande déclare `Europe/London` là où `Europe/Dublin` serait attendu. Les
deux fuseaux ont le même décalage toute l'année, la jointure n'en est pas
affectée, mais le fait est noté.

### La déduplication n'est pas optionnelle

Les flux sans fenêtre republient le même arrêt à chaque capture pendant des
heures. Sans déduplication, un seul train compterait pour des dizaines de
mouvements et le critère de volume, quinze mouvements par jour, ne voudrait
plus rien dire.

`joindreJour` regroupe par événement, c'est-à-dire par (gare, trajet, arrêt,
jour de service), et garde l'observation dont la capture est la plus proche de
l'événement. La fraîcheur qui en résulte est celle qu'exige le critère de
qualification, et elle n'était pas calculable pour ces trois sources avant la
jointure.

## Usage

```
node src/horaires.mjs                        # construit les tables du jour
node sim/jointure.mjs                        # toutes sources, tous jours
node sim/jointure.mjs no_entur 2026-08-05    # une source, un jour
```

## Ce qui reste à surveiller

L'Irlande n'a pas pu être testée en direct, faute de clé lisible en local :
l'appariement à 100 % est mesuré contre les observations déjà collectées, ce
qui valide la table d'horaires mais pas la présence de `startDate` dans son
flux. À vérifier au premier créneau collecté après déploiement, via
`gh workflow run sonde.yml -f sources=irlande`, ou simplement en comptant les
observations `ie_nta` dont `sd` est nul.
