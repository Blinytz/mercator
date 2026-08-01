# Conception de l'IA des adversaires

Proposition d'architecture pour le pilotage des sept clubs adverses, en match et
au mercato. Rien n'est implémenté à ce stade : ce document est soumis à
validation.

## 1. Contrainte fondatrice : le temps est la monnaie du moteur

Le temps de charge d'une consigne vaut `24 × coefficient / A` heures et ne
dépend pas de la taille de la gare. Une consigne persistante ajoute sa durée
active pendant laquelle le joueur ne produit plus rien. Le coût réel d'une
consigne est donc :

```
cout_horaire = 24 × coefficient / A + duree_active
```

Une IA correcte ne raisonne pas en K mais en **valeur attendue par heure
d'immobilisation**. C'est la métrique unique qui rend comparables une frappe
instantanée, un bloc de 8 heures et un centre de 2 heures.

## 2. Architecture proposée : évaluation à points de décision

Pas d'IA continue. Chaque club adverse réévalue ses onze consignes uniquement :

- toutes les `T` minutes de temps de match, `T` valant 120 à 240 selon le profil ;
- et sur événement significatif : but encaissé ou marqué, bloc consommé, passe
  ou centre adverse créé, entrée dans les dernières 24 heures du match.

Cela borne le calcul, rend chaque décision auditable, et surtout **place les bots
à une cadence de réaction comparable à celle d'un humain attentif**. Un bot qui
réagirait instantanément à chaque état adverse serait imbattable, ce qui est un
problème d'équité et non de difficulté.

## 3. Fonction d'évaluation

Pour chaque joueur et chaque consigne éligible à son poste :

```
score = valeur_attendue(consigne, etat) / cout_horaire(consigne)
```

`valeur_attendue` s'estime avec les seules informations visibles :

| Type de consigne | Estimation |
|---|---|
| Frappe | `P(aucun bloc adverse au declenchement) × 1 + P(bloquee) × valeur_bonus` |
| Bloc | `frappes adverses attendues pendant la duree × P(ce bloc soit le plus tot) × charges` |
| Passe ou centre | `P(un consommateur allie se declenche avant expiration) × valeur_de_la_frappe_induite` |
| Réaction (Renard, Suivi, Jeu de tête) | `P(un second ballon ou un centre survienne pendant la fenetre)` |
| Interception, domination | `P(une passe ou un centre adverse actif ou a venir pendant la duree)` |
| Bonus (Box-to-box, Récupérateur) | `somme des K offerts / cout, pondere par la proximite des seuils allies` |

Les probabilités se calculent à partir de grandeurs mesurables en cours de match :
rythme de frappes adverse observé, nombre de blocs adverses actifs, fréquence
d'apparition des passes et centres adverses sur les dernières 24 heures. Aucune
information cachée n'est utilisée.

## 4. Personnalités

Chaque profil est un vecteur de poids appliqué au score, sans changer la
mécanique. Les sept profils existants du mercato se prolongent naturellement :

| Profil | Traits en match |
|---|---|
| Conservateur | privilégie les blocs longs, réagit peu, protège un avantage |
| Kamikaze | privilégie les frappes, ignore les blocs, prend des risques quand il est mené |
| Galactique | privilégie les consignes coûteuses à fort effet, néglige les petites |
| Scout | favorise les consignes situationnelles, forte réactivité aux états adverses |
| Trader | maximise strictement la valeur par heure, sans biais thématique |
| Météorologue | anticipe les creux de production nocturnes, prépare ses états à l'avance |
| Banquière | minimise le K gaspillé, évite les échecs conditionnels |

Quatre curseurs suffisent à décrire un profil : tolérance au risque, biais
offensif ou défensif, réactivité, et patience envers les longues immobilisations.

## 5. Garde-fous indispensables

1. **Hystérésis** : ne changer de consigne que si le nouveau score dépasse
   l'actuel d'une marge, sinon les bots oscillent à chaque point de décision.
2. **Erreur contrôlée** : avec une probabilité `epsilon` propre au profil, choisir
   le deuxième meilleur score plutôt que le premier. Sans cela les sept clubs
   convergent vers la même tactique optimale et le championnat devient monotone.
3. **Latence de réaction** : délai aléatoire avant de répondre à un état adverse,
   tiré selon la personnalité. Un humain ne voit pas l'information instantanément.
4. **Interdits d'information** : un bot ne voit jamais les jauges adverses, les
   consignes adverses non encore déclenchées, ni aucune donnée ferroviaire future.
5. **Déterminisme** : graine par match, journal de chaque décision avec les trois
   meilleurs scores et le motif retenu. Rejouable à l'identique.

## 6. Niveaux de difficulté

Trois curseurs suffisent, sans changer une ligne de logique : la période `T`
entre deux décisions, la valeur d'`epsilon`, et la profondeur d'anticipation
autorisée (réagir seulement à l'état présent, ou anticiper les expirations à
venir). Cela donne des adversaires faibles à redoutables avec le même code.

## 7. Ce que la simulation impose déjà

Les mesures du 1er août montrent que l'adaptation vaut très cher : dans un duel
centres contre défensif, les bots adaptatifs marquent **70 buts contre 34** aux
bots statiques, et divisent par trois les centres perdus. Deux conséquences :

- **l'équilibrage doit être calibré contre des bots adaptatifs**, sinon le jeu
  sera réglé pour un adversaire qui n'existera pas ;
- la qualité de l'IA devient un paramètre d'équilibre à part entière, au même
  titre que le coût d'une consigne.

## 8. Mercato

Le mercato conserve son IA propre, distincte et déjà cadrée : enchères secrètes,
aucune vision des offres humaines, budget et minima d'effectif respectés,
priorité tournante en cas d'égalité. La seule addition proposée est de relier la
valorisation d'une gare à son utilité dans le moteur d'actions : une gare à forte
ponctualité vaut davantage pour un profil offensif, une gare à gros volume
apporte une jauge plus fine donc plus régulière. Cette valorisation doit rester
explicable en une phrase par enchère.

## 9. Points à trancher

1. Cadence de décision des bots : faut-il l'aligner sur un humain attentif, ou
   assumer que les bots réagissent plus vite au nom de la difficulté ?
2. Les bots doivent-ils utiliser la conservation du K brut pour déclencher au bon
   moment, comme un humain habile ? C'est puissant et cela peut sembler injuste.
3. Faut-il des profils fixes toute la saison, ou une évolution selon le classement ?
4. Niveau de difficulté choisi par le joueur, ou imposé par profil de club ?
