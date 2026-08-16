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

## Ce qui reste à décider

1. **Valider K × 5,5**, ou viser plus bas si 28 buts par match vous semble
   encore trop pour un match de sept jours.
2. **Trouver un vrai curseur de difficulté**, le réflexe n'en étant pas un.
3. Ensuite seulement, développer le jeu.
