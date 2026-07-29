#!/usr/bin/env node
// Simulation de matchs avec effectifs disjoints et rôles alternés.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CFG, CATALOGUE, TACTIQUES, composer, simuler } from './moteur.mjs';

const stations = JSON.parse(gunzipSync(readFileSync('mercator/../stations.json.gz')).toString());
const timelines = JSON.parse(gunzipSync(readFileSync('mercator/../timelines.json.gz')).toString());
const avecTl = stations.filter(s => timelines[s.cle]);
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

export function duel(tA, tB, graines = 8, filtre = () => true) {
  const acc = { bA: 0, bB: 0, fr: 0, bl: 0, ec: 0, dec: 0, sec: 0, secU: 0, pcr: 0, pex: 0, ccr: 0, cex: 0, iex: 0, dex: 0, blocs: 0, n: 0, chaines: [] };
  for (let g = 1; g <= graines; g++) {
    for (const sens of [0, 1]) {
      const t1 = sens ? tB : tA, t2 = sens ? tA : tB;
      const eq1 = composer(TACTIQUES[t1], g * 17 + sens * 5, filtre);
      const eq2 = composer(TACTIQUES[t2], g * 31 + 7 + sens * 5, filtre, new Set(eq1.map(j => j.cle)));
      eq2.forEach(j => j.equipe = 1);
      const S = simuler(eq1, eq2, g * 101 + sens);
      acc.bA += sens ? S.buts[1] : S.buts[0]; acc.bB += sens ? S.buts[0] : S.buts[1];
      acc.fr += S.frappes[0] + S.frappes[1]; acc.bl += S.bloquees[0] + S.bloquees[1];
      acc.ec += S.echecsConditionnels[0] + S.echecsConditionnels[1]; acc.dec += S.declenchements[0] + S.declenchements[1];
      acc.sec += S.seconds[0] + S.seconds[1]; acc.secU += S.secondsUtilises[0] + S.secondsUtilises[1];
      acc.pcr += S.passesCreees[0] + S.passesCreees[1]; acc.pex += S.passesExpirees[0] + S.passesExpirees[1];
      acc.ccr += S.centresCrees[0] + S.centresCrees[1]; acc.cex += S.centresExpires[0] + S.centresExpires[1];
      acc.iex += S.interceptionsExpirees[0] + S.interceptionsExpirees[1]; acc.dex += S.dominationsExpirees[0] + S.dominationsExpirees[1];
      acc.blocs += S.blocsActifs.reduce((x, y) => x + y, 0) / Math.max(1, S.blocsActifs.length);
      acc.chaines.push(...S.chaines);
      acc.n++;
    }
  }
  const n = acc.n;
  return { bA: acc.bA / n, bB: acc.bB / n, fr: acc.fr / n, blPct: acc.bl / Math.max(1, acc.fr), ecPct: acc.ec / Math.max(1, acc.dec),
    dec: acc.dec / n, sec: acc.sec / n, secPct: acc.secU / Math.max(1, acc.sec), pcr: acc.pcr / n, pexPct: acc.pex / Math.max(1, acc.pcr),
    ccr: acc.ccr / n, cexPct: acc.cex / Math.max(1, acc.ccr), iex: acc.iex / n, dex: acc.dex / n, blocs: acc.blocs / n, chaineMax: acc.chaines.length ? Math.max(...acc.chaines) : 0 };
}

if (process.argv[1].endsWith('run2.mjs')) {
  const noms = Object.keys(TACTIQUES);
  console.log('===== MATCHS 7 JOURS (effectifs disjoints, roles alternes, 16 simulations par duel) =====');
  console.log('duel'.padEnd(26) + 'score'.padStart(11) + 'frappes'.padStart(9) + 'bloq.'.padStart(7) + 'buts/j/eq'.padStart(11) + 'echec cond'.padStart(11) + 'blocs actifs'.padStart(13));
  const tous = [];
  for (const a of noms) for (const b of noms) {
    if (noms.indexOf(b) < noms.indexOf(a)) continue;
    const r = duel(a, b);
    tous.push({ a, b, ...r });
    console.log(`${a} vs ${b}`.padEnd(26) + `${r.bA.toFixed(1)}-${r.bB.toFixed(1)}`.padStart(11) + r.fr.toFixed(0).padStart(9) +
      `${(r.blPct * 100).toFixed(0)}%`.padStart(7) + ((r.bA + r.bB) / 14).toFixed(2).padStart(11) + `${(r.ecPct * 100).toFixed(0)}%`.padStart(11) + r.blocs.toFixed(1).padStart(13));
  }
  const totaux = tous.map(r => r.bA + r.bB);
  console.log(`\nButs par match (7 jours, 2 equipes) : min ${Math.min(...totaux).toFixed(1)} | median ${med(totaux).toFixed(1)} | max ${Math.max(...totaux).toFixed(1)}`);
  const eq = tous.find(r => r.a === 'equilibree' && r.b === 'equilibree');
  console.log(`\nEquilibree vs equilibree en detail :`);
  console.log(`  actions declenchees par joueur et par jour : ${(eq.dec / 22 / 7).toFixed(2)}`);
  console.log(`  passes creees ${eq.pcr.toFixed(0)} dont ${(eq.pexPct * 100).toFixed(0)} % expirees sans usage`);
  console.log(`  centres crees ${eq.ccr.toFixed(0)} dont ${(eq.cexPct * 100).toFixed(0)} % expires sans usage`);
  console.log(`  seconds ballons produits ${eq.sec.toFixed(0)}, exploites ${(eq.secPct * 100).toFixed(0)} %, chaine max ${eq.chaineMax}`);
  console.log(`  interceptions expirees sans cible ${eq.iex.toFixed(1)} | dominations aeriennes expirees ${eq.dex.toFixed(1)}`);
  const sec = tous.find(r => r.a === 'seconds' && r.b === 'seconds');
  console.log(`  tactique "seconds ballons" : produits ${sec.sec.toFixed(0)}, exploites ${(sec.secPct * 100).toFixed(0)} %, chaine max ${sec.chaineMax}`);

  console.log('\n===== TAILLE DE GARE =====');
  for (const [lib, f] of [['toutes', () => true], ['grandes N>=150', s => s.N >= 150], ['moyennes 40-150', s => s.N >= 40 && s.N < 150], ['petites N<40', s => s.N < 40], ['tres petites N<15', s => s.N < 15]]) {
    const n = avecTl.filter(f).length;
    if (n < 22) { console.log(`  ${lib.padEnd(18)} : ${n} gares disponibles, effectif insuffisant`); continue; }
    const r = duel('equilibree', 'equilibree', 4, f);
    console.log(`  ${lib.padEnd(18)} : ${n} gares | ${(r.bA + r.bB).toFixed(1)} buts/match | ${(r.dec / 22 / 7).toFixed(2)} actions/joueur/jour | ${r.fr.toFixed(0)} frappes | bloquees ${(r.blPct * 100).toFixed(0)} %`);
  }

  console.log('\n===== SENSIBILITE AU SEUIL DE RETARD =====');
  const seuilInitial = CFG.seuilRetardS;
  for (const seuil of [60, 180, 300, 600]) {
    CFG.seuilRetardS = seuil;
    const vivantes = avecTl.filter(s => s.ponct[seuil] >= 0.5).length;
    const r = duel('equilibree', 'equilibree', 3);
    console.log(`  seuil ${String(seuil).padStart(3)} s : ${(vivantes / avecTl.length * 100).toFixed(0)} % de gares capables de charger | ${(r.bA + r.bB).toFixed(1)} buts/match | ${(r.dec / 22 / 7).toFixed(2)} actions/joueur/jour`);
  }
  CFG.seuilRetardS = seuilInitial;
}
