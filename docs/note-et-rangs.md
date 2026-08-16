# La note, le rang, et pourquoi ils se chevauchent

16 août 2026. Question du concepteur : comment une star peut-elle afficher 89
quand une superstar affiche 78 ?

## Le mécanisme, en une ligne

**K est calculé comme si la gare était ponctuelle à 90 %.**

```
K = 0,8 * N / A        et 0,8 = 2 * 0,90 - 1
jauge par jour = N * (2p - 1)
rythme réel    = N(2p-1) / (0,8 N / A) = A * (2p - 1) / 0,8
```

Le trafic s'annule. Le rythme réel ne dépend que du rang, par A, et de la
ponctualité. **Il vaut exactement A quand p vaut 90 %**, plus au-dessus, moins
en dessous.

| Joueur | Rang | Ponctualité | Promis | Réel | Tenue |
|---|---|---:|---:|---:|---:|
| Tikkurila | superstar | 97,9 % | 3 | 3,59 | **120 %** |
| Ostkreuz | superstar | 96,4 % | 3 | 3,48 | 116 % |
| Connolly | star | 94,7 % | 2,5 | 2,79 | 112 % |
| Nationaltheatret | superstar | 80,4 % | 3 | 2,28 | **76 %** |

Nationaltheatret ne tient que 76 % de ce que son rang promet, Connolly en
délivre 112 %. La star agit donc plus souvent que la superstar, et la note,
qui mesure le rythme réel, le dit.

## Ce n'est pas un défaut, c'est le prix de la ponctualité

Pour supprimer le chevauchement, il faudrait calculer K sur la ponctualité
réelle : `K = N(2p-1)/A`. Le rythme vaudrait alors A pour tout le monde, et
**la ponctualité cesserait complètement de compter**. Une gare à 55 % et une à
98 % délivreraient le même nombre d'actions.

Autrement dit : soit la ponctualité compte et les rangs se chevauchent, soit
les rangs sont étanches et la ponctualité ne sert à rien. Le chevauchement est
le prix à payer, et il est modeste.

| Rang | Note | Médiane |
|---|---|---:|
| Superstar | 78 à 97 | 91 |
| Star | 73 à 89 | 83 |
| Titulaire | 56 à 80 | 76 |
| Rotation | 50 à 71 | 68 |
| Petit joueur | 46 à 62 | 59 |

Les médianes se classent proprement. 21 stars dépassent la plus faible des
superstars, sur 370 joueurs.

## L'alternative écartée

On pourrait attribuer le rang d'après la note plutôt que d'après le trafic.
Rangs et notes seraient alors toujours d'accord. Mesuré : **58 joueurs sur 370
changeraient de rang**, et surtout **sept des dix gares emblématiques
demandées par le concepteur perdraient leur statut de superstar** : Part-Dieu,
Saint-Jean, Saint-Charles, Matabiau, Nantes, Lyon et Juvisy. Le haut du
catalogue deviendrait français à cinq places sur douze.

Écarté pour cette raison.

## Ce que la fiche affiche

La carte porte désormais, sous le rang, **la tenue de la promesse** : « tient
76 % de son rang ». C'est l'explication à même l'objet, sans avoir à lire une
formule.
