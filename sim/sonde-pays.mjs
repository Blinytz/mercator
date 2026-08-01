#!/usr/bin/env node
// Sonde des sources ferroviaires candidates. Un appel par flux, aucune donnée
// stockée durablement. Applique immédiatement le test anti-« trop parfait ».
import GtfsRt from 'gtfs-realtime-bindings';

const UA = 'MercatOr-POC/1.0 (evaluation de faisabilite; contact: github.com/Blinytz/mercator)';

const CANDIDATS = [
  { nom: 'Norvege / Entur (tous)', url: 'https://api.entur.io/realtime/v1/gtfs-rt/trip-updates', headers: { 'ET-Client-Name': 'blinytz-mercator' } },
  { nom: 'Norvege / Entur (Vy VYG)', url: 'https://api.entur.io/realtime/v1/gtfs-rt/trip-updates?datasource=VYG', headers: { 'ET-Client-Name': 'blinytz-mercator' } },
  { nom: 'Finlande / Digitraffic', url: 'https://rata.digitraffic.fi/api/v1/trains/gtfs-rt-updates', headers: { 'Digitraffic-User': 'Blinytz/MercatOr-POC' } },
  { nom: 'Irlande / NTA v2 (sans cle)', url: 'https://api.nationaltransport.ie/gtfsr/v2/TripUpdates' },
  { nom: 'Suisse / opentransportdata (sans cle)', url: 'https://api.opentransportdata.swiss/la/gtfs-rt' },
  { nom: 'Belgique / iRail GTFS-RT', url: 'https://gtfs.irail.be/nmbs/gtfs-realtime' },
  { nom: 'Espagne / Renfe cercanias', url: 'https://data.renfe.com/api/3/action/package_search?q=gtfs' },
  { nom: 'Estonie / peatus.ee', url: 'https://gtfs.peatus.ee/gtfs-rt/trip-updates.pb' },
  { nom: 'Danemark / Rejseplanen GTFS-RT', url: 'https://www.rejseplanen.dk/labs/gtfs-rt/tripupdates.pb' },
];

const pct = (n, d) => d ? (n / d * 100).toFixed(1) + ' %' : 'n/a';

async function sonder(c) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  const debut = Date.now();
  try {
    const rep = await fetch(c.url, { signal: ctl.signal, headers: { 'User-Agent': UA, ...(c.headers || {}) } });
    const buf = Buffer.from(await rep.arrayBuffer());
    const ms = Date.now() - debut;
    if (rep.status !== 200) {
      console.log(`[${String(rep.status).padStart(3)}] ${c.nom} (${ms} ms) : ${buf.toString('utf8').slice(0, 140).replace(/\s+/g, ' ')}`);
      return;
    }
    let feed = null;
    try { feed = GtfsRt.transit_realtime.FeedMessage.decode(buf); } catch { /* pas du protobuf */ }
    if (!feed) {
      const txt = buf.toString('utf8');
      console.log(`[200] ${c.nom} (${ms} ms, ${(buf.length / 1024).toFixed(0)} Ko) : pas du GTFS-RT. Extrait : ${txt.slice(0, 160).replace(/\s+/g, ' ')}`);
      return;
    }
    const age = feed.header.timestamp ? Math.round(Date.now() / 1000 - Number(feed.header.timestamp)) : null;
    const tus = feed.entity.filter(e => e.tripUpdate);
    let arrets = 0, arrEtDep = 0, annules = 0, supprimes = 0;
    const retards = [];
    const gares = new Set();
    for (const e of tus) {
      const tu = e.tripUpdate;
      if ((tu.trip?.scheduleRelationship ?? 0) === 3) annules++;
      for (const stu of tu.stopTimeUpdate || []) {
        arrets++;
        if (stu.stopId) gares.add(stu.stopId);
        if ((stu.scheduleRelationship ?? 0) === 1) supprimes++;
        const a = stu.arrival, d = stu.departure;
        if ((a?.delay != null || a?.time != null) && (d?.delay != null || d?.time != null)) arrEtDep++;
        const r = d?.delay ?? a?.delay;
        if (r != null) retards.push(r);
      }
    }
    // Test anti-« trop parfait »
    const zero = retards.filter(r => r === 0).length;
    const sous60 = retards.filter(r => Math.abs(r) <= 60).length;
    const plus300 = retards.filter(r => r > 300).length;
    const distinctes = new Set(retards).size;
    const alertes = [];
    if (retards.length >= 100) {
      if (zero / retards.length > 0.9) alertes.push('plus de 90 % de retards nuls');
      if (sous60 / retards.length > 0.98) alertes.push('plus de 98 % sous 60 s');
      if (distinctes < 5) alertes.push('moins de 5 valeurs distinctes');
      if (plus300 === 0) alertes.push('aucun retard > 5 min');
    }
    console.log(`[200] ${c.nom} (${ms} ms, ${(buf.length / 1024).toFixed(0)} Ko)`);
    console.log(`      fraicheur ${age} s | ${tus.length} trajets | ${arrets} arrets | ${gares.size} points d'arret | arr+dep ${pct(arrEtDep, arrets)}`);
    console.log(`      annules ${annules} | arrets supprimes ${supprimes} | retards renseignes ${retards.length}`);
    if (retards.length) {
      const tri = [...retards].sort((a, b) => a - b);
      console.log(`      retard median ${tri[tri.length >> 1]} s | nuls ${pct(zero, retards.length)} | <=60 s ${pct(sous60, retards.length)} | >5 min ${pct(plus300, retards.length)} | ${distinctes} valeurs distinctes`);
    }
    console.log(`      test anti-parfait : ${alertes.length ? 'ECHEC -> ' + alertes.join(', ') : retards.length >= 100 ? 'REUSSI' : 'echantillon trop faible pour conclure'}`);
    const ex = tus.find(x => (x.tripUpdate?.stopTimeUpdate || []).length > 1);
    if (ex) console.log(`      exemple : trip=${ex.tripUpdate.trip?.tripId} route=${ex.tripUpdate.trip?.routeId ?? '?'} stop=${ex.tripUpdate.stopTimeUpdate[0]?.stopId}`);
  } catch (e) {
    console.log(`[ERR] ${c.nom} : ${ctl.signal.aborted ? 'timeout 30 s' : e.message}`);
  } finally { clearTimeout(t); }
}

for (const c of CANDIDATS) { await sonder(c); }
