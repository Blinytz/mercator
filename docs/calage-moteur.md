# Calage du moteur sur l'effectif réel

16 août 2026. Point 5 de la feuille de route. Le moteur tourne pour la première
fois sur les **370 joueurs de la saison**, avec leurs vrais N, leurs vraies
ponctualités et **380 520 événements ferroviaires réels** tirés de la fenêtre
du 7 au 13 août.

## Le résultat

**Multiplier le coût des actions par 5,5 ramène le jeu à 26,9 buts par match,
pour une cible de 28.**

C'est le seul réglage changé. Le levier est celui que le moteur documente déjà :
le temps de charge d'une action vaut 24 fois le coefficient divisé par A, donc
multiplier K ralentit tout le monde dans la même proportion, sans favoriser un
profil ni ajouter une règle. Inventer une probabilité d'arrêt aurait changé la
nature du jeu : la résolution des frappes reste déterministe, un but passe s'il
n'y a pas de bloc actif.

| Coût des actions | Buts par match | Écart à la cible |
|---|---:|---:|
| K × 1, réglage actuel | 151,3 | +123,3 |
| K × 2 | 72,9 | +44,9 |
| K × 3 | 48,5 | +20,5 |
| K × 4 | 40,1 | +12,1 |
| K × 5 | 30,5 | +2,5 |
| **K × 5,5** | **26,9** | **-1,1** |
| K × 6 | 25,8 | -2,2 |
| K × 10 | 15,7 | -12,3 |

Les valeurs des trois derniers réglages sont mesurées sur 40 matchs par duel.
Le reste du tableau vient d'un balayage à 20 matchs, plus rapide mais plus
bruité : deux exécutions successives y désignaient tantôt K × 5, tantôt K × 6,
ce qui a justifié de remesurer les candidats de plus près.

## Ce que la mesure sur données réelles a changé

**Le problème était trois fois pire qu'annoncé.** Les simulations d'août
donnaient 46 buts par match sur des gares projetées avant la collecte. Sur les
vraies gares, c'est **151**. La raison est simple : les vraies gares sont
beaucoup plus fréquentées que la projection. Berlin Ostkreuz voit 1 595
mouvements par jour là où la projection tablait sur quelques centaines. Plus de
trains, plus de jauge, plus d'actions, plus de buts.

C'est le genre d'écart qui justifie de ne jamais caler un moteur sur des
données estimées.

## Une erreur de protocole, corrigée

Ma première campagne mettait **le bot adaptatif des deux côtés**. Résultat : les
six duels tactiques rendaient exactement le même score, amplitude nulle, et j'ai
d'abord cru à une saturation du moteur.

Ce n'en était pas une. Dès la première révision de consignes, deux à quatre
heures après le coup d'envoi, le bot écrasait le profil tactique choisi **des
deux côtés**. Sur un match de sept jours, le profil ne comptait donc que pour
2 % de la durée. Or dans le vrai jeu, le club humain garde ses consignes et
seuls les sept adversaires s'adaptent.

Protocole corrigé, l'amplitude réapparaît immédiatement : de 10 à 268 buts
selon le duel.

## Les tactiques comptent, et beaucoup

Au réglage retenu, formation 4-4-2, contre des adversaires adaptatifs :

| Duel | Buts |
|---|---:|
| frappes contre possession | 49,2 |
| offensif contre offensif | 39,9 |
| centres contre défensif | 28,2 |
| équilibré contre équilibré | 20,9 |
| passes contre transitions | 12,3 |
| défensif contre défensif | 10,9 |

De 10,9 à 49,2 buts selon le style : un match fermé et un match ouvert n'ont
plus rien à voir. Quatre fois et demie d'écart, ce qui est l'ordre de grandeur
du football réel entre un match verrouillé et un festival.

Les formations pèsent aussi lourd, de 86 buts en 5-4-1 à 261 en 3-4-3 avant
calage. Elles font exactement leur travail.

## Ce qui ne marche pas : le curseur de difficulté

**Le réflexe des adversaires n'est pas un curseur de difficulté**, et il faut le
dire.

| Intervalle de réflexe | Buts humain | Buts adverse | Victoires humaines |
|---|---:|---:|---:|
| 15 à 30 min, très réactif | 9,4 | 9,8 | 35 % |
| 60 à 120 min | 10,3 | 10,3 | 40 % |
| 120 à 240 min, défaut | 9,3 | 9,3 | 43 % |
| 240 à 480 min | 11,9 | 10,8 | 63 % |
| 480 à 960 min, très lent | 10,0 | 9,8 | 45 % |

Entre un adversaire qui révise ses consignes toutes les vingt minutes et un qui
le fait toutes les douze heures, **le taux de victoire ne suit aucune pente**.
Les 63 % de la quatrième ligne sont du bruit : la mesure porte sur 40 matchs et
les lignes voisines l'encadrent à 43 et 45 %.

La cause est mécanique : un match dure sept jours, soit 10 080 minutes. Même à
douze heures d'intervalle, un bot révise ses consignes une vingtaine de fois,
ce qui suffit largement à s'adapter. L'intervalle ne discrimine rien.

Le réglage est implémenté et paramétrable comme demandé, bornes de début et de
fin comprises. Mais **il faudra chercher la difficulté ailleurs** : dans la
qualité de l'effectif adverse, dans la finesse de sa politique, ou dans un
handicap assumé. C'est une question ouverte que je n'ai pas résolue.

## Ce qui est acté et implémenté

**Les annulations comptent comme un retard**, donc `-1` sur la jauge, décision
du 16 août. Elles sont intégrées aux chronologies : sur 380 520 événements,
90,5 % sont à l'heure et 9,5 % en retard ou annulés.

**Le réflexe adverse est un intervalle réglable**, `reflexeAdverse` dans `CFG`,
surchargeable par match via `reflexeMinMin` et `reflexeMaxMin`. Le délai est
tiré au hasard dans l'intervalle à chaque révision, et non fixe : un bot qui
réagit toujours au même rythme serait lisible.

**Le biais national est assumé**, sans normalisation, décision confirmée.

## Fichiers

| Fichier | Contenu |
|---|---|
| `sim/chronologies.mjs` | extrait les vraies chronologies de jauge des 370 joueurs |
| `sim/chronologies-saison-1.json.gz` | 380 520 événements, prêts à rejouer |
| `sim/calage.mjs` | la campagne de calage, rejouable |
| `sim/profils.mjs` | profils tactiques et bot adaptatif, extraits pour être partagés |
| `sim/detail-calage.mjs` | le détail par duel aux réglages candidats |
| `docs/calage-resultats.txt` | la sortie brute de la campagne |

## Suite du 16 août : le bon levier n'est pas K

**K × 5,5 contredit une règle actée.** La partie 3 du mémoire fixe la
production cible à 3 actions par jour pour une superstar et 1 pour un petit
joueur. Le multiplicateur ramène la superstar à 0,68 action par jour et le
petit joueur à une action toutes les 106 heures. L'effectif deviendrait
spectateur.

**Renforcer la défense fait le même travail sans casser cette règle**, et
c'est le levier que le concepteur avait lui-même choisi en août. On multiplie
la durée et le nombre de charges des postures défensives : les frappes restent
aussi nombreuses, elles aboutissent moins souvent.

| Renfort défensif | Buts | Frappes | Conversion |
|---|---:|---:|---:|
| × 1, réglage actuel | 149,3 | 260 | 57 % |
| × 3 | 51,6 | 216 | 24 % |
| × 5 | 31,1 | 206 | 15 % |
| **× 6** | **26,3** | 201 | 13 % |
| × 8 | 15,7 | 193 | 8 % |

**Défense × 6 donne 26,3 buts pour une cible de 28, et la production cible
reste intacte.** Le nombre de frappes ne baisse que de 260 à 201 : les joueurs
continuent d'agir, ce sont les buts qui deviennent rares. C'est le réglage à
retenir.

## Le bot adaptatif est un handicap, pas une force

Mesure la plus importante de la journée, et elle est contre-intuitive.

| Politique adverse | Buts humain | Buts adverse | Victoires humaines |
|---|---:|---:|---:|
| bridée, ne lit pas le jeu | 0,8 | 1,8 | **13 %** |
| adaptative, lit le jeu | 18,0 | 0,5 | **67 %** |

**Le bot le plus bête est de très loin le plus dur à battre.** Un adversaire
qui garde sa consigne de départ conserve ses postures défensives et bloque
tout ; le bot adaptatif, lui, bascule sur des consignes offensives et se
découvre. Il ne joue pas mieux, il joue plus attaquant.

Cela explique aussi l'anomalie des fenêtres de réflexe. Plus le bot est lent à
s'adapter, plus il garde son profil initial, donc plus il défend bien :

| Fenêtre de réflexe | Victoires humaines |
|---|---:|
| 2 à 4 h | 67 % |
| 6 à 12 h | 83 % |
| 12 à 24 h | 90 % |
| 24 à 48 h | 87 % |
| 48 à 96 h | 67 % |

La courbe n'a aucun sens pour un curseur de difficulté : elle monte puis
redescend, parce qu'elle mélange deux effets opposés.

**Conséquence : la politique adaptative doit être réécrite avant tout
équilibrage sérieux.** Tant qu'elle affaiblit celui qui l'applique, aucun
réglage bâti dessus n'a de sens.

## Un curseur de difficulté qui marche

L'écart de qualité entre effectifs, lui, se comporte proprement.

| Handicap adverse | Buts humain | Victoires humaines |
|---|---:|---:|
| aucun, effectifs égaux | 18,0 | 67 % |
| 1 cran de statut plus bas | 27,1 | 80 % |
| 2 crans plus bas | 40,3 | 93 % |
| 3 crans plus bas | 48,8 | 90 % |

Monotone jusqu'à deux crans, lisible, et facile à expliquer au joueur : les
clubs adverses recrutent moins bien. C'est le curseur à retenir, une fois la
politique du bot réparée.

## Ce qui reste à décider

1. **Valider défense × 6** plutôt que K × 5,5, pour préserver la production
   cible actée.
2. **Réécrire la politique du bot adaptatif** : elle doit défendre quand elle
   mène et attaquer quand elle est menée, pas se découvrir en permanence.
3. **Retenir l'écart d'effectif comme curseur de difficulté**, le réflexe
   n'en étant pas un.
4. Ensuite seulement, développer le jeu.


---

# Réécriture de la politique adverse · 16 août, second temps

## Ce qui n'allait pas

Dans le moteur, **seul un bloc actif empêche un but**. Or l'ancienne politique
envoyait ses défenseurs sur `interception`, `dominationAerienne` et
`debordeEtCentre`, et son gardien sur `sortieAerienne` : aucune de ces
consignes ne produit de bloc. La ligne défensive se déshabillait d'elle-même,
et l'attaque adverse marquait sans obstacle.

Ce n'était donc pas un bot trop faible, c'était un bot qui se sabotait.

## La nouvelle doctrine

La politique tient désormais une doctrine plutôt qu'une liste de réflexes.

1. **Le gardien produit toujours un bloc.** Sans exception.
2. **La défense maintient un plancher de charges de blocs actives.** Tant que
   le plancher n'est pas tenu, tous les défenseurs bloquent.
3. **Au-dessus du plancher seulement**, un défenseur peut se projeter.
4. **Le milieu crée**, sauf quand le club mène : un milieu redescend couvrir.
5. **L'attaque consomme** ce qu'on lui offre avant de tenter sa chance.

Le plancher monte quand le club mène et descend quand il est mené, ce qui
donne un comportement lisible de vrai entraîneur. Un réglage `agressivite`,
de 0 à 1, rabote le plancher : c'est un second curseur de difficulté.

## L'effet, mesuré

| Politique adverse | Avant | Après |
|---|---:|---:|
| bridée, ne lit pas le jeu | 13 % de victoires humaines | 60 % |
| **adaptative** | **67 %** | **38 %** |

**Le rapport s'est inversé, et dans le bon sens.** Le bot qui lit le jeu est
maintenant nettement plus dur à battre que celui qui ne fait rien, ce qui est
la moindre des choses pour une intelligence adverse.

Les buts se sont aussi rééquilibrés : le club adverse marquait 0,5 but par
match, il en marque 4,5 contre 10,2 à l'humain.

## Le réflexe devient un vrai curseur

| Fenêtre de réflexe | Victoires humaines |
|---|---:|
| 2 à 4 h | **38 %** |
| 6 à 12 h | 45 % |
| 12 à 24 h | 60 % |
| 24 à 48 h | 55 % |
| 48 à 96 h | 55 % |

La courbe monte proprement jusqu'à 24 heures puis plafonne, au lieu de monter
et redescendre. **Le réglage que vous aviez demandé fonctionne maintenant**,
et la fenêtre de 6 à 12 heures que vous suggériez donne un jeu équilibré à
45 % de victoires.

L'écart d'effectif reste le curseur le plus large : 38 %, 45 %, 65 %, 95 % de
victoires selon que l'adversaire recrute zéro, un, deux ou trois crans plus bas.

## Le calage se déplace

Le bot défendant désormais correctement, il n'a plus besoin d'être aidé. Le
renfort défensif tombe de × 6 à **× 1,5**.

| Renfort défensif | Buts | Frappes | Conversion |
|---|---:|---:|---:|
| × 1 | 59,5 | 224 | 27 % |
| × 1,25 | 52,1 | 223 | 23 % |
| **× 1,5** | **28,7** | 225 | 13 % |
| × 1,75 | 25,1 | 221 | 11 % |
| × 2 | 22,2 | 216 | 10 % |
| × 3 | 10,0 | 210 | 5 % |

**Défense × 1,5 donne 28,7 buts pour une cible de 28.** Le catalogue n'est
presque pas touché, la production cible est intacte, et K reste tel que le
cadrage le définit.

## Réglages retenus

| Réglage | Valeur | Effet |
|---|---|---|
| Renfort défensif | × 1,5 | 28,7 buts par match |
| Réflexe adverse | 2 à 4 h | 38 % de victoires, difficile |
| Agressivité du bot | 0,35 | défend d'abord, attaque quand il peut |
| Coût des actions K | inchangé | production cible respectée |

Deux curseurs de difficulté sont disponibles et se cumulent : la fenêtre de
réflexe, de 2 heures à 4 jours, et l'écart d'effectif, de zéro à trois crans.
