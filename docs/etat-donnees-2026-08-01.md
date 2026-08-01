# État des lieux des données · 1er août 2026

Analyse gare par gare des 2 743 profils du POC, sur les 6 journées MercatOr
complètes du 22 au 27 juillet 2026. Script reproductible : `sim/etat-des-lieux.mjs`.
Listes nominatives complètes : `docs/etat-donnees-retenues.csv` et
`docs/etat-donnees-rejetees.csv`.

## Résultat principal

**133 gares sur 2 743 passent tous les critères, dont 118 australiennes.**

Ce chiffre ne mesure pas la qualité des gares. Il mesure surtout **où notre
collecte a fonctionné**. Il ne faut donc pas le lire comme un catalogue, ni
chercher à le faire grossir en assouplissant les seuils.

| Pays | Candidates | Retenues | Taux | Motif de rejet dominant |
|---|---:|---:|---:|---|
| Australie | 154 | 118 | 77 % | absence sur certains jours |
| Pays-Bas | 352 | 14 | 4 % | volume irrégulier |
| France | 736 | 1 | 0 % | absence sur certains jours |
| États-Unis | 281 | 0 | 0 % | identité non résolue |
| Allemagne | 1 220 | 0 | 0 % | identité non résolue |

## Les critères ne se valent pas : deux familles

### Famille 1 · critères évaluables aujourd'hui

Ils portent sur la nature du signal, pas sur notre façon de le capter. Leurs
verdicts sont fiables et exploitables immédiatement.

| Critère | Gares conformes |
|---|---:|
| Identité résolue | 1 506 sur 2 743 |
| Distribution non artificielle | 2 215 sur 2 743 |
| Ponctualité au plus 98 % | 2 209 sur 2 743 |

### Famille 2 · critères contaminés par le défaut de collecte

Ils dépendent tous de la couverture temporelle, aujourd'hui à 21 %. Leurs
verdicts ne disent rien de la gare tant que la cadence n'est pas corrigée.

| Critère | Gares conformes | Commentaire |
|---|---:|---|
| Fraîcheur au moins 80 % | **52** sur 2 743 | mesure directe du défaut de collecte |
| Présente les 6 jours | 718 sur 2 743 | une gare absente un jour l'est souvent parce que nous n'avons rien capté |
| Volume au moins 15 par jour | 1 163 sur 2 743 | le volume observable dépend de la couverture |
| Volume régulier | 438 sur 2 743 | voir ci-dessous |

## Le critère de régularité, à ne pas utiliser en l'état

Le concepteur demande de ne garder que les gares produisant des données
cohérentes et régulières. J'ai mesuré la régularité par le coefficient de
variation du volume quotidien. Résultat : **médiane 0,77**, ce qui signifierait
que la gare médiane voit son trafic varier de 77 % d'un jour à l'autre. C'est
invraisemblable pour un réseau ferroviaire cadencé.

J'ai donc recalculé le volume en le normalisant par la couverture de collecte
réellement obtenue, heure par heure, pondérée par le profil horaire de chaque
gare. **La médiane est passée de 0,74 à 0,77**, c'est-à-dire qu'elle n'a pas
bougé. La variance ne s'explique donc pas simplement par le volume de captures :
elle vient de l'interaction entre le moment précis de nos trous et l'horaire
propre à chaque gare, et de l'instabilité des identifiants.

La preuve par les noms : ce critère rejette Utrecht Centraal (coefficient 0,39),
Rotterdam Centraal (0,52), Leiden Centraal (0,45), Amsterdam Sloterdijk (0,42),
Den Haag HS (0,53), Amersfoort Centraal (0,43). Ce sont des gares majeures d'un
réseau parmi les plus cadencés d'Europe. Si un critère les rejette, c'est le
critère qui est faux, pas les gares.

**Conclusion : la régularité doit être conservée comme critère, avec un seuil à
0,35, mais elle ne pourra être appliquée qu'après correction de la cadence.**
Elle rejettera alors les vraies anomalies plutôt que nos propres trous.

Mesures annexes utiles pour plus tard : l'effet week-end médian est de 70 % du
volume de semaine, ce qui est cohérent et devra être neutralisé avant de juger
l'irrégularité. L'amplitude médiane de ponctualité entre le meilleur et le pire
jour est de 29 points, ce qui est plausible.

## Ce que l'on sait déjà avec certitude : la qualité par source

Ce tableau, lui, est exploitable. Il porte sur la nature du signal.

| Réseau | Gares | Identité résolue | Trop parfaites | Ponctualité > 98 % | Dispersion < 2 pt |
|---|---:|---:|---:|---:|---:|
| MBTA | 123 | 100 % | **123 (100 %)** | 123 | 123 |
| SNCF | 736 | 100 % | **182 (25 %)** | 182 | 164 |
| OVapi | 352 | 100 % | 55 (16 %) | 99 | 15 |
| TransLink | 154 | 99 % | 17 (11 %) | 20 | 3 |
| gtfs.de | 1 220 | **12 %** | 89 (7 %) | 107 | 14 |
| Metro-North | 108 | **0 %** | 0 | 5 | 6 |
| LIRR | 50 | **0 %** | 1 | 1 | 0 |

Trois enseignements nouveaux :

1. **MBTA est confirmé irrécupérable en l'état** : 123 gares sur 123 échouent au
   test anti-parfait. Rejet total, comme décidé.
2. **La SNCF a un problème de signal sur un quart de ses gares** : 182 gares
   déclarent 100 % de ponctualité et 164 ont une distribution dégénérée. Ce
   n'est pas de la ponctualité, c'est l'absence de mesure. Ces gares sont
   probablement desservies par des trains dont le flux ne porte pas de retard.
   **À traiter comme MBTA : quarantaine jusqu'à démonstration d'un retard réel.**
   C'est un point nouveau, non identifié dans les rapports précédents.
3. **Metro-North et LIRR ont un signal authentique mais aucune identité** : 0 %
   de gares nommées, faute de GTFS statique configuré. Correctif simple et à
   fort rendement, 158 gares récupérables.

## Ce que la collecte corrigée doit produire pour trancher

Pour que les critères de la famille 2 deviennent des verdicts sur les gares et
non sur nous :

- couverture d'au moins 90 % des créneaux de 5 minutes, par source et par jour ;
- fenêtre d'au moins 7 jours pleins, idéalement 14 pour lisser l'effet week-end ;
- identité résolue à la collecte et tables d'arrêts archivées par jour ;
- exclusion préalable de MBTA et mise en quarantaine des gares SNCF sans signal.

Sous ces conditions, l'ordre de grandeur attendu est de plusieurs milliers de
gares candidates, la contrainte redevenant l'identité et le test anti-parfait,
et non la fraîcheur.

## Recommandation

Ne publier aucun catalogue officiel tant que la collecte n'est pas corrigée. Les
133 gares actuelles ne doivent pas servir de base de saison. En revanche les
verdicts par source ci-dessus sont acquis et peuvent être appliqués dès
maintenant au collecteur.
