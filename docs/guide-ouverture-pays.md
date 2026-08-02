# Guide d'ouverture des nouvelles sources · marche à suivre

Tout ce qui est marqué « vérifié » a été testé en conditions réelles le
1er août 2026. Ce qui ne l'est pas est signalé comme tel.

Règle de sécurité valable partout : **ne colle jamais une clé dans une
conversation, un fichier du dépôt ou un message.** Le seul chemin est
l'interface de secrets de GitHub, décrite en section 5.

---

## 1. Rien à faire de ton côté : deux pays déjà exploitables

Ces deux sources sont ouvertes, sans clé, sans compte, et j'ai vérifié qu'elles
produisent un signal de retard authentique.

### Norvège · Entur

- Flux : `https://api.entur.io/realtime/v1/gtfs-rt/trip-updates`
- En-tête requis : `ET-Client-Name: blinytz-mercator`
- Vérifié : 4 217 trajets, 90 862 arrêts, fraîcheur 1 seconde, 92 % des arrêts
  portent arrivée **et** départ, 2,8 % de retards au-dessus de 5 minutes,
  1 179 valeurs de retard distinctes. Test anti-parfait réussi.
- Réserve : le flux contient tous les modes. Filtrage ferroviaire à faire sur
  les opérateurs `VYG` (Vy), `GJB` (Go-Ahead), `SJN` (SJ Norge), `FLT` (Flytoget),
  via le paramètre `datasource` ou par le GTFS statique.

### Finlande · Digitraffic

- Flux : `https://rata.digitraffic.fi/api/v1/trains/gtfs-rt-updates`
- En-tête requis : `Digitraffic-User: Blinytz/MercatOr-POC`
- Licence : CC BY 4.0, rafraîchissement annoncé toutes les 10 secondes.
- Vérifié : 67 trajets, 144 gares, retard médian 23 secondes, 144 valeurs
  distinctes, 1,7 % au-dessus de 5 minutes. Test anti-parfait réussi.
- Réserve : réseau petit, et certains arrêts n'ont pas de `stop_id` renseigné.
  À confirmer sur 24 heures de collecte.

---

## 2. Trois comptes gratuits à créer, par ordre de rentabilité

### 2.1 Suisse · opentransportdata.swiss

Le plus simple et le plus rentable : réseau dense, très ponctuel, identité stable.

1. Aller sur **https://opentransportdata.swiss** et créer un compte gratuit.
2. Se rendre sur le gestionnaire d'API : **https://api-manager.opentransportdata.swiss**
3. S'abonner à l'API temps réel GTFS-RT et générer une clé.
4. Vérifier dans l'interface la limite annoncée : elle est de **2 requêtes par
   minute**. Nous en consommons 0,2, donc c'est largement suffisant. Si tu vois
   une limite journalière inférieure à 288 appels, signale-le-moi.
5. Créer le secret GitHub `SWISS_API_KEY` (section 5).

Endpoint confirmé existant : `https://api.opentransportdata.swiss/la/gtfs-rt`
(il répond 401 sans clé, ce qui prouve qu'il est en service).

### 2.2 Irlande · National Transport Authority

Couvre **Iarnród Éireann**, donc le rail et pas seulement les bus.

1. Aller sur **https://developer.nationaltransport.ie** et créer un compte.
2. S'abonner au produit **GTFS-R v2**. L'abonnement est gratuit et annoncé à
   environ quinze minutes.
3. Récupérer la clé, nommée `Ocp-Apim-Subscription-Key`.
4. Vérifier le quota affiché sur ton profil. Il nous faut 288 appels par jour.
5. Créer le secret GitHub `IRELAND_API_KEY`.

Endpoint : `https://api.nationaltransport.ie/gtfsr/v2/TripUpdates`
(confirmé en 401 sans clé).

### 2.3 France · PRIM Île-de-France Mobilités

Ton pays prioritaire, et le plus délicat des trois. Il apporterait Transilien et
les RER, c'est-à-dire les gares les plus fréquentées de France, aujourd'hui
totalement absentes.

1. Aller sur **https://prim.iledefrance-mobilites.fr** et créer un compte.
2. Dans le catalogue, s'abonner au jeu **« Prochains passages (plateforme
   Île-de-France Mobilités) »**, en choisissant la variante **requête globale**,
   qui renvoie tout le réseau en un appel. La variante « unitaire » ne nous sert
   à rien : elle demanderait un appel par gare, ce que nous nous interdisons.
3. Récupérer la clé sur ton espace personnel.
4. **Vérification importante** : ouvrir la page « Mon utilisation des API ». Les
   quotas par défaut ont été abaissés pour les nouveaux comptes depuis mars 2024.
   Il nous faut au moins 288 appels par jour sur cette API. Si le quota affiché
   est inférieur, dis-le-moi : je n'intégrerai pas la source plutôt que de la
   faire tourner en mode dégradé.
5. Créer le secret GitHub `IDFM_API_KEY`.

Point technique à connaître : **Île-de-France Mobilités ne publie pas de
GTFS-RT, seulement du SIRI Lite** (vérifié dans le catalogue du Point d'Accès
National). Il me faudra donc écrire un adaptateur SIRI vers notre format
d'observation. C'est du travail en plus, mais la source vaut l'effort. La licence
est la Licence Mobilités, qui impose de se déclarer réutilisateur lors de
l'inscription.

---

## 3. Compléments sur les pays actuels, sans action de ta part

Je m'en charge au prochain déploiement.

| Complément | Source | État |
|---|---|---|
| Noms de gares LIRR | `https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip` | URL vérifiée, 50 gares récupérables |
| Noms de gares Metro-North | `https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip` | URL vérifiée, 108 gares récupérables |
| Identité allemande | tables d'arrêts `gtfs.de` archivées par jour | correctif interne, débloque plus de 1 000 gares |
| Identité française | code UIC extrait du `stop_id` | correctif interne |
| Retrait de MBTA | ? | 123 gares supprimées, décision actée |

Les deux référentiels MTA sont le meilleur rapport effort sur rendement de toute
la liste : deux URL à ajouter, 158 gares au signal authentique qui passent de
« identité non résolue » à « qualifiables ».

---

## 4. Sources testées et écartées

Ne pas y consacrer de temps sans élément nouveau.

| Source | Verdict | Motif, vérifié le 1er août |
|---|---|---|
| SEPTA, Philadelphie | écartée | 100 % de retards nuls, une seule valeur distincte, 5 % d'arrêts avec arrivée et départ. Même défaut que MBTA |
| iRail, Belgique | introuvable | pas d'endpoint GTFS-RT public identifié |
| Renfe, Espagne | à instruire | le portail répond mais ne semble exposer que du statique |
| Rejseplanen, Danemark | introuvable | 404 sur l'endpoint candidat |
| peatus.ee, Estonie | introuvable | domaine non résolu |

Piste non testée qui reste ouverte : **Suède, Trafiklab**, qui demande aussi une
clé gratuite. Si tu veux un pays de plus, c'est le prochain que je sonderais.

---

## 5. Comment me transmettre une clé sans la révéler

Le collecteur tourne dans GitHub Actions, sur un dépôt public. Les secrets de
dépôt ne sont **pas** exposés dans un dépôt public : ils sont masqués dans les
journaux et ne sont pas transmis aux exécutions déclenchées depuis un fork.

1. Ouvrir **https://github.com/Blinytz/mercator/settings/secrets/actions**
2. Cliquer sur **New repository secret**
3. Renseigner exactement le nom attendu :
   - `SWISS_API_KEY` pour la Suisse
   - `IRELAND_API_KEY` pour l'Irlande
   - `IDFM_API_KEY` pour la France
4. Coller la valeur, puis enregistrer.
5. Me dire simplement « la clé suisse est en place ». Je n'ai pas besoin de la
   voir et je ne dois pas la voir.

Ne mets jamais ces valeurs dans `src/config.json`, dans un commit, dans un
message ou dans un fichier du dépôt.

---

## 6. Ce que je fais dès qu'une clé est posée

Pour chaque source, dans cet ordre, sans exception :

1. Lecture de la licence et des conditions de stockage.
2. Sondage unique : décodage, fraîcheur d'en-tête, volume, présence simultanée
   des retards d'arrivée et de départ.
3. **Test anti-parfait sur observations consolidées**, jamais sur une capture
   brute. C'est la leçon du sondage norvégien : sur un instantané, la plupart
   des arrêts sont futurs et prédits à zéro, ce qui ferait échouer à tort une
   source saine.
4. Vérification du statique : types ferroviaires, noms et coordonnées d'arrêts.
5. Collecte de 24 heures avant toute intégration durable.
6. Verdict écrit dans `docs/catalogue-sources.md`, avec motif.

Aucune source ne sera présentée comme validée sur la foi d'une documentation.
