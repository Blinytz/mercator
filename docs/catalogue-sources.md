# Catalogue des sources · verdicts

Chaque ligne repose sur un appel réel, décodé et mesuré. Aucune source n'est
déclarée valide sur la foi d'une documentation. Dernière mise à jour :
2 août 2026.

## Sources validées

| Source | Pays | Authentification | Quota constaté | Verdict |
|---|---|---|---|---|
| `ch_opentransport` | Suisse | `Authorization: <Token>` | **illimité**, 5 appels/min | validée |
| `no_entur` | Norvège | aucune, en-tête `ET-Client-Name` | non annoncé | validée |
| `ie_nta` | Irlande | `x-api-key: <clé>` | non annoncé, « fair usage » | validée |
| `fi_digitraffic` | Finlande | aucune, en-tête `Digitraffic-User` | non annoncé | validée |
| `fr_idfm` | France Île-de-France | `apikey: <jeton>` | **1 000 appels/jour** | validée sous contrainte |
| `fr_sncf` | France | aucune | non annoncé | validée |
| `nl_ovapi` | Pays-Bas | aucune | non annoncé | validée |
| `de_gtfsde` | Allemagne | aucune | non annoncé | validée, identité à corriger |
| `au_translink_seq` | Australie | aucune | non annoncé | validée |
| `us_mta_mnr`, `us_mta_lirr` | États-Unis | aucune | non annoncé | validées, statiques à ajouter |

## Mesures du 2 août 2026

| Source | Trajets | Arrêts | Points d'arrêt | Arrivée ET départ | Fraîcheur | Retard médian | > 5 min | Valeurs distinctes | Anti-parfait |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Suisse | 8 742 | 111 711 | 20 960 | 86,7 % | 2 s | 30 s | 1,1 % | **297** | passe |
| Norvège | 4 217 | 90 862 | 16 474 | 91,9 % | 1 s | 0 s | 2,8 % | 1 179 | passe |
| Irlande | 1 754 | 10 366 | 3 821 | 82,7 % | 11 s | 0 s | **6,8 %** | 990 | passe |
| Finlande | 67 | 413 | 144 | 86,7 % | 30 s | 23 s | 1,7 % | 144 | passe |
| Île-de-France | 94 sur 3 lignes | 1 195 | 132 gares | 88,3 % | médiane 21 min | 0 s | 0,9 % | 35 | passe |

Rappel de méthode : sur un instantané, la majorité des arrêts sont futurs et
donc prédits à l'heure théorique. Le test anti-parfait n'a de valeur définitive
qu'après filtrage sur la fraîcheur, ce qui est fait pour l'Île-de-France grâce
au `RecordedAtTime` par course, et reste à confirmer sur 24 h pour les autres.

## Notes par source

### Suisse · la meilleure prise du projet

Authentification par le **Token** de 120 caractères en `Authorization` brut ;
le Token Hash n'est pas utilisé et son secret peut être supprimé. Quota
illimité, seule contrainte 5 appels par minute alors que nous en consommons
0,2. Volume considérable : 20 960 points d'arrêt tous modes, à filtrer sur le
ferroviaire. Les identifiants d'arrêt sont des codes DIDOK nationaux, donc
stables, exactement ce qui manque à l'Allemagne.

### Irlande · en-tête non documenté

L'en-tête Azure par défaut `Ocp-Apim-Subscription-Key` **ne fonctionne pas**.
Le bon en-tête est **`x-api-key`**, trouvé par essais successifs. Meilleur taux
de perturbation de toutes les sources, 6,8 % de retards au-dessus de 5 minutes,
ce qui promet des notes contrastées. Statique confirmé contenant 19 lignes
ferroviaires Iarnród Éireann.

### Île-de-France · quota contraignant

**1 000 appels par jour**, révélé par les en-têtes `x-ratelimit-limit-day`.
Aucune requête globale n'existe : `ALL` est refusé et `STIF:Line::ALL:` renvoie
une trame vide. Il faut donc interroger ligne par ligne, ce qui impose un choix :

| Périmètre | Cadence possible | Appels/jour |
|---|---|---:|
| 13 lignes ferroviaires | une capture toutes les 19 min | 985 |
| **5 RER seulement** | **une capture toutes les 7 min** | **990** |
| 3 lignes | une capture toutes les 4 min | 1 080 (dépasse) |

Recommandation : **les 5 RER à 7 minutes**. La loi de fraîcheur montre qu'entre
5 et 15 minutes le signal reste exploitable, et les RER concentrent les gares
les plus fréquentées. Cela apporte environ 200 à 250 gares franciliennes avec
une identité `StopArea` stable.

Réserve : la fraîcheur médiane des courses est de 21 minutes et seulement 48 %
sont mises à jour depuis moins de 15 minutes. La dispersion des retards est
plus faible qu'ailleurs, 35 valeurs distinctes contre 297 en Suisse, mesurée un
samedi d'août à faible trafic. À revalider sur une journée ouvrée.

## Sources écartées

| Source | Motif, vérifié |
|---|---|
| MBTA Boston | 100 % des mouvements sous 60 s sur 5 495 mouvements agrégés, dispersion nulle |
| SEPTA Philadelphie | 100 % de retards nuls, une seule valeur distincte, 5 % d'arrêts avec arrivée et départ |
| iRail Belgique | aucun endpoint GTFS-RT public identifié |
| Renfe Espagne | portail actif mais statique uniquement à première vue |
| Rejseplanen Danemark | 404 sur l'endpoint candidat |
| peatus.ee Estonie | domaine non résolu |

Piste ouverte non testée : Suède, Trafiklab, clé gratuite.
