# Les noms de joueurs · règles et arbitrages

15 août 2026. Effectif porté à 360 joueurs, prénoms supprimés, noms simplifiés.

**Résultat : 360 noms, 360 uniques, 7,7 caractères en moyenne, 353 en un seul
mot.** Le nom complet de la gare est conservé dans chaque fiche.

## Les six règles

1. **Retirer ce qui dit « gare »** : Hauptbahnhof, Centraal, Centrum, station,
   stasjon, Straße, Street, et les marqueurs de réseau S, U, S+U.
2. **Couper aux particules de lieu et ne garder qu'un morceau.**
   Saint-Étienne-de-Montluc donne Montluc, Banyuls-sur-Mer donne Banyuls,
   Saint-Saturnin-lès-Avignon donne Saturnin. Le morceau retenu est le plus
   rare, car le plus fréquent désigne l'agglomération, pas la gare.
3. **Retirer les orientations**, Nord, Süd, West, Oost, sauf si c'est le seul
   mot qui reste debout.
4. **Retirer le « Saint » initial**, comme vous l'avez tranché sur Saturnin.
5. **Plusieurs lieux accolés : n'en garder qu'un**, le plus rare.
   Wolterdingen Soltau donne Wolterdingen, Bornel Belle-Église donne Bornel.
6. **Composé français seulement**, et rare : Part-Dieu se tient, pas
   Belle-Église.

## Les arbitrages, cas par cas

### Une règle que j'ai déduite de votre exemple « New Haven »

Vous vouliez éviter le découpage en prénom New et nom Haven, pour obtenir un
joueur nommé New Haven. J'en ai tiré une distinction que les règles seules ne
font pas : **un nom propre en deux mots reste entier, deux villes accolées
n'en donnent qu'une.** Fortitude Valley et Kew Gardens sont des noms ;
Wolterdingen Soltau est une juxtaposition.

Sept noms sur 360 gardent deux mots à ce titre : Fortitude Valley, Grand
Central, Kew Gardens, Hempstead Gardens, West Hempstead, Central Islip,
Wynnum Central, Veenendaal West.

### Les homonymes, où le qualificatif devient nécessaire

Quatre paires de gares distinctes du même réseau portent le même nom de base.
Retirer le qualificatif les confondrait, je l'ai donc gardé.

| Gare | Nom retenu | |
|---|---|---|
| Wynnum station | Wynnum | |
| Wynnum Central station | Wynnum Central | même banlieue, deux gares |
| Islip | Islip | |
| Central Islip | Central Islip | deux gares du LIRR |
| West Hempstead | West Hempstead | |
| Hempstead Gardens | Hempstead Gardens | |
| Veenendaal Centrum | Veenendaal | |
| Veenendaal West | Veenendaal West | |

### Les patronymes irlandais

| Gare | Nom retenu | Motif |
|---|---|---|
| Drogheda Mac Bride | **MacBride** | l'usage colle le préfixe, et c'est lui qui fait le nom |
| Dun Laoghaire (Mallin) | **Mallin** | même logique, le patronyme prime sur la ville |
| Tara Street | **Tara** | « Street » est un générique |

### Les décisions françaises

| Gare | Nom retenu | Motif |
|---|---|---|
| Brive-la-Gaillarde | **Brive** | « la Gaillarde » est un surnom de ville |
| Castelnau-d'Estrétefonds | **Castelnau** | 24 caractères, trop long |
| Tain-l'Hermitage - Tournon | **Tain** | deux communes accolées |
| Lamotte-Beuvron | **Lamotte** | |
| Les Sables-d'Olonne | **Olonne** | |
| Saint-Médard-d'Eyrans | **Médard** | |
| Saint-Sulpice-Laurière | **Laurière** | |
| La Ferté-Saint-Aubin | **Aubin** | |
| Lyon Part Dieu | **Part-Dieu** | composé gardé, c'est le nom et non la situation |

### Trois cas où la règle produisait un non-mot

| Gare | Ce que donnait la règle | Nom retenu |
|---|---|---|
| Pas des Lanciers | *Pas* | **Lanciers** |
| Saint-Cyr-en-Val | *Val* | **Cyr** |
| Eygelshoven Markt | *Eygelshoven Markt* | **Eygelshoven** |

## Ce dont je ne suis pas sûr

**Saint-Dié-des-Vosges donne Dié**, et c'est le nom qui me satisfait le moins.
Votre règle sur Saturnin impose de retirer le « Saint », mais « Dié » seul ne
veut rien dire en français, là où Saturnin ou Médard restent des prénoms. Les
alternatives seraient Saint-Dié, qui rouvre le préfixe, ou Vosges, qui est un
massif et non une ville. J'ai suivi la règle. **Dites-moi si vous préférez une
exception.**

**Saint-Sulpice-Laurière donne Laurière et non Sulpice.** C'est une commune
double : les deux moitiés sont des noms de lieux réels. J'ai pris Laurière
parce qu'il est plus distinctif et évite un énième nom de saint, mais Sulpice
serait aussi défendable et plus conforme à la règle du Saint retiré.

**Les Sables-d'Olonne donne Olonne et non Sables.** Olonne est plus
distinctif, Sables plus reconnaissable. J'ai privilégié la distinction.

**La Ferté-Saint-Aubin donne Aubin.** « Ferté » aurait été mon premier choix,
mais il est déjà ambigu : La Ferté-sous-Jouarre figure aussi dans l'effectif,
sous le nom de Jouarre.

**Bordeaux Saint-Jean donne Jean, Marseille Saint-Charles donne Charles.**
C'est l'application stricte de la règle du Saint retiré. Ces deux noms sont
très banals pour des gares aussi importantes, mais l'alternative rouvrirait le
préfixe partout.

**Hempstead Gardens reste en deux mots** faute d'alternative : West Hempstead
occupe déjà la forme courte.

## Une découverte au passage

Mon module de noms indexait les gares par leur seul identifiant, sans le
réseau. **Dix gares frontalières existent dans deux réseaux à la fois**,
Aix-la-Chapelle, Düsseldorf, Duisbourg, Herzogenrath, Hengelo, Eygelshoven :
elles sont vues par l'opérateur allemand et par le néerlandais. L'index par
identifiant seul les confondait, la seconde écrasant la première.

Corrigé : l'index porte désormais sur le couple réseau et gare. **Vérification
faite, l'effectif ne contient aucune gare physique en double.** À surveiller
au mercato : ces dix gares pourraient un jour être proposées deux fois si la
sélection changeait, une fois sous chaque pavillon.
