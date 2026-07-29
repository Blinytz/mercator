# sim · simulateur d'equilibrage du moteur d'actions

Scripts d'analyse ayant produit `docs/moteur-actions-analyse.md`. Ils lisent les
observations de `data/` et ne modifient rien.

- `extract.mjs` : profils de gare (N, ponctualite par seuil, donnees manquantes,
  repartition horaire) vers stations.json.gz et timelines.json.gz.
- `moteur.mjs` : simulateur du moteur d'actions (catalogue des consignes, etats,
  resolution des frappes, blocs, passes, centres, seconds ballons).
- `run.mjs` / `run2.mjs` : echantillon, valeurs de K, temps de charge, duels.
- `equilibrage.mjs` / `equilibrage2.mjs` : variantes d'equilibrage.
- `analyse.mjs`, `diag.mjs`, `diag2.mjs` : diagnostics du POC ferroviaire.

Usage : `node sim/extract.mjs .` puis `node sim/run2.mjs`.
Les fichiers intermediaires (stations.json.gz, timelines.json.gz) ne sont pas
versionnes : ils se regenerent depuis data/.
