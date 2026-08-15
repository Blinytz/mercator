# Catalogue des joueurs · saison 1

Établi le 15 août 2026 sur la fenêtre de qualification du vendredi 7 au jeudi
13 août inclus, sept journées MercatOr complètes de 05:00 à 05:00 heure de
Paris, couvertes à **100 %** : 2 016 créneaux de collecte sur 2 016.

**Ce catalogue attend la validation explicite du concepteur.** Rien du jeu ne
se développe avant.

## Le verdict

**6 555 gares qualifiées**, sur 11 198 réellement observées et identifiées
pendant la fenêtre. 4,2 millions d'événements frais ont servi au calcul.

| Pays | Observées | Qualifiées | Premier motif de rejet |
|---|---:|---:|---|
| Allemagne | 6 788 | 4 710 | volume insuffisant |
| France (SNCF) | 2 735 | 955 | volume insuffisant |
| Pays-Bas | 497 | 345 | ponctualité > 98 % |
| Australie | 168 | 130 | ponctualité > 98 % |
| Norvège | 242 | 128 | absente certains jours |
| États-Unis | 237 | 204 | ponctualité > 98 % |
| Irlande | 152 | 66 | volume insuffisant |
| Finlande | 202 | 17 | volume insuffisant |
| France (Île-de-France) | 196 | **0** | fraîcheur, voir plus bas |

Le chiffre allemand exclut 61 740 fragments d'identité non résolue, expliqués
plus bas.

## Les statuts

Statut selon N, le nombre moyen de mouvements frais par journée MercatOr.
A est la production cible d'actions par jour, K le coût d'une action,
`K = plafond(0,8 × N / A)`.

| Statut | N | A | Effectif | Dont Allemagne |
|---|---|---:|---:|---:|
| Superstar | 200 et plus | 3 | 377 | 290 |
| Star | 100 à 200 | 2,5 | 730 | 529 |
| Titulaire | 50 à 100 | 2 | 1 721 | 1 209 |
| Rotation | 25 à 50 | 1,5 | 2 575 | 1 973 |
| Petit joueur | 15 à 25 | 1 | 1 152 | 709 |

Quelques têtes d'affiche : Schiphol Airport (Pays-Bas, N = 742, la plus grosse
gare du catalogue), Tampere TKL (Finlande, N = 467), Brisbane Central
(Australie, N = 444), Asker (Norvège, N = 429), Paris Gare de Lyon (N = 429),
Dublin Connolly (Irlande, N = 177).

**L'Allemagne représente 72 % du catalogue.** L'équilibrage du nombre de
joueurs par pays au mercato est une décision réservée au concepteur, partie 5
du mémoire, et elle devient concrète maintenant.

## Les critères appliqués

Ceux de la partie 3 du mémoire, mécaniquement, sans exception :

| Critère | Seuil | Rejets (premier motif) |
|---|---|---:|
| Identité résolue et stable | | 61 759, dont 61 740 fragments allemands |
| Volume | 15 mouvements frais par jour en moyenne | 1 643 |
| Régularité | présente les 7 journées sur 7 | 1 515 |
| Ponctualité | au plus 98 % | 491 |
| Anti-parfait | après filtre de fraîcheur | 708 |
| Fraîcheur | 80 % des événements à moins de 5 minutes | 286 |

Pas de plancher de ponctualité : les gares faibles restent jouables, décision
actée. La plus mal classée du catalogue tourne à 45 % de ponctualité et c'est
très bien ainsi.

Deux règles de méthode, payées par les mesures d'août : tout est compté en
journées MercatOr et jamais en jours calendaires, les trains de nuit
appartenant à la journée qui les a vus partir ; et un événement physique n'est
compté qu'une fois, les flux republiant le même arrêt sur des heures. Sans la
déduplication, le critère de volume ne voudrait rien dire.

Le test anti-parfait a aussi été appliqué à chaque source entière :
**les dix sources actives le passent.**

## Ce que la qualification a tranché en chemin

### L'Île-de-France est écartée de la saison 1

Aucune gare francilienne ne se qualifie, et le motif dominant est la
fraîcheur : 158 gares sur 196. C'est structurel, pas accidentel. La source est
interrogée toutes les dix minutes pour respecter son quota de 1 000 appels par
jour, donc la moitié des passages sont observés à plus de cinq minutes ; et le
quota, épuisé chaque jour en début d'après-midi malgré les correctifs du
8 août, l'a privée de toutes ses soirées. Ses données décrivent un réseau
observé le matin, jamais la pointe du soir : les qualifier aurait donné des
joueurs mesurés sur la moitié de leur journée.

Voie de retour pour la saison 2 : réduire aux deux ou trois RER les plus
contrastés pour doubler la cadence à quota constant, et achever la
désynchronisation des exécutions.

### La Finlande se compte en gares, pas en quais

Ses identifiants désignent la voie, `KTI_1`, `KTI_2`. Sans fusion, chaque quai
devenait un pseudo-joueur au volume émietté. La fusion se fait à l'analyse, le
quai restant une information vraie dans les données collectées. Effet notable :
en fusionnant, certaines gares atteignent un volume suffisant pour être
jugées... et sont alors rejetées pour excès de ponctualité, comme Pasila à
98,1 %. Dix-sept gares finlandaises qualifiées, dont quatre superstars.

### Les fragments allemands

61 740 identifiants allemands n'ont pas pu être rattachés à une gare. C'est la
trace du piège n° 3 : gtfs.de régénère ses identifiants chaque jour, et entre
la régénération et la reconstruction de notre table à 03:35, quelques heures
d'observations portent des identifiants orphelins. Ces fragments sont écartés
par le critère d'identité, c'est leur rôle. Coût réel : un léger sous-comptage
du volume des vraies gares allemandes, identique chaque jour, donc sans biais
de classement. L'Allemagne qualifie 4 710 gares malgré tout.

### La borne des 98 % coûte de très grosses gares, et c'est voulu

Parmi les rejets les plus notables : Weesp aux Pays-Bas, N = 723, ponctualité
98,2 % ; Pasila en Finlande, N = 713, 98,1 % ; huit gares du S-Bahn de Berlin
entre 98,0 et 98,4 % ; Versailles Chantiers, N = 459, 98,1 %. Le critère « au
plus 98 % » est acté : un joueur qui ne connaît pas l'échec est sans intérêt
pour le jeu. Mais il faut le dire honnêtement : certaines de ces gares sont
réellement très ponctuelles, pas dégénérées. Si le concepteur voulait les
récupérer, c'est cette borne qu'il faudrait rouvrir, pas le test anti-parfait,
qui a par ailleurs écarté 708 gares dont les distributions sont, elles,
artificielles : Hamburg Berliner Tor à 91 % de retards exactement nuls,
Almere Centrum à 95 %.

## Les listes nominatives

| Fichier | Contenu |
|---|---|
| `docs/catalogue-retenus.csv` | les 6 555 qualifiées : pays, réseau, identifiant, nom, N, ponctualité, fraîcheur, valeurs distinctes, annulations/jour, statut, K |
| `docs/catalogue-rejetes.csv` | les 66 402 rejets, fragments compris, avec tous les motifs |
| `sim/qualification.mjs` | le calcul, rejouable à l'identique |

## Ce que ce catalogue attend

1. **La validation du concepteur**, ou ses amendements : borne des 98 %,
   équilibrage par pays, sort des annulations (comptées, non intégrées à la
   jauge, la décision reste réservée).
2. La **simulation du moteur** rejouée sur ces effectifs réels, avec bots
   adaptatifs, pour l'ajustement vers la cible de buts.
3. Rien d'autre : le développement du jeu vient après la validation, pas avant.
