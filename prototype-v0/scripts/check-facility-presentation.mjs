// Node 24: render the actual React panels without a browser or network access.
// This verifies content and escaping, not interactive/visual phone acceptance.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      for (const ext of ['.ts', '.tsx']) {
        const url = new URL(base.href + ext);
        if (existsSync(url)) return { url: url.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (/\.tsx?$/.test(url)) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { fileName: fileURLToPath(url),
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});

const [ParkingChoices, FacilityChoices, RefillCoverage, FacilityStopSummary, JourneyPlan, JourneyTimeSummary] = await Promise.all([
  '../src/ParkingChoices.tsx', '../src/FacilityChoices.tsx', '../src/RefillCoverage.tsx', '../src/FacilityStopSummary.tsx', '../src/JourneyPlan.tsx', '../src/ui/JourneyTimeSummary.tsx',
].map(async path => (await import(path)).default));
const { zeroCycling } = await import('../src/cycling.ts');
const { detourStages } = await import('../src/cyclingDetour.ts');
const { applyFacilityStop } = await import('../src/facilityStops.ts');
const { DEFAULT_OPTIONS } = await import('../src/model.ts');
const { journeyTiming } = await import('../src/journeyTiming.ts');
const origin = { lat: 47, lon: 8, label: 'Start' }, destination = { lat: 47.1, lon: 8, label: 'End' };
const at = new Date('2026-10-05T08:00:00+02:00'), noop = () => {};
const render = (component, props) => renderToStaticMarkup(h(component, props));
const publicParking = { id: 'p', name: '<script>Parking</script>', ...origin, type: 'BIKE_PARKING', operator: 'Source', capacity: 10, covered: null, publicAccess: true, traits: [], openingHours: '24/7', tags: { level: '-1' } };
let markup = render(ParkingChoices, { facilities: [publicParking, { ...publicParking, id: 'private', name: 'Private rack', access: 'private' }], targets: [{ key: 'destination', place: destination }], mapPoint: null, at, alongJourney: true, onLocate: noop });
assert.match(markup, /No parking matches/);
// Use a close target so public parking is in the initial two-kilometre search.
markup = render(ParkingChoices, { facilities: [publicParking, { ...publicParking, id: 'private', name: 'Private rack', access: 'private' }], targets: [{ key: 'destination', place: origin }], mapPoint: null, at, alongJourney: true, onLocate: noop });
assert.match(markup, /&lt;script&gt;Parking&lt;\/script&gt;/);
assert.doesNotMatch(markup, /Private rack|<script>/);
assert.match(markup, /Collect bicycle/); assert.match(markup, /Mapped floor: -1/); assert.match(markup, /Price unknown/);

const repair = { id: 'repair', ...origin, name: 'Repair source', url: 'https://example.org', categories: ['repairs'], area: false, potable: 'unknown', tags: { shop: 'bicycle', 'service:bicycle:pump': 'yes', 'service:bicycle:pump:operational_status': 'broken' } };
markup = render(FacilityChoices, { records: [repair], category: 'repairs', kinds: ['pump'], origin, destination, at, onLocate: noop });
assert.doesNotMatch(markup, /<h4>Repair source/); assert.match(markup, /No eligible facility/);
const water = { ...repair, id: 'water', name: 'Station fountain', categories: ['water'], potable: 'yes', lat: 47.05, tags: { opening_hours: '24/7' }, location: { floorLabel: 'F', directions: 'Use the signed passage', precision: 'building' } };
markup = render(FacilityChoices, { records: [water], category: 'water', origin, destination, at, onLocate: noop, onDetour: noop });
assert.match(markup, /Use the signed passage/); assert.match(markup, /Preview \/ add stop/); assert.match(markup, /Current flow and water quality are not checked/);

const route = (a, b, minutes) => ({ ...zeroCycling(a, b), minutes, distanceKm: 1, points: [a, b] });
const cycling = { routes: [route(origin, destination, 20)], minutes: 20, distanceKm: 1, arrival: new Date(+at + 1200000) };
const context = { journey: null, cycling, origin, destination, start: at, options: DEFAULT_OPTIONS };
const facility = { ...water, category: 'water', openingHours: '24/7' }, via = { ...water, label: water.name };
const edited = applyFacilityStop(context, detourStages(null, cycling, origin, destination, at)[0], [route(origin, via, 10), route(via, destination, 10)], facility, 5);
markup = render(FacilityStopSummary, { ...context, ...edited, onRestore: noop });
assert.match(markup, /Station fountain · 5 min/); assert.match(markup, /08:10/); assert.match(markup, /08:15/); assert.match(markup, /Restore original/);
assert.match(markup, /not saved/);
markup = render(RefillCoverage, { stages: detourStages(null, cycling, origin, destination, at), facilities: [water], radius: 100, partial: true, onWiden: noop, onDetour: noop });
assert.match(markup, /largest mapped gap 0.5 km/); assert.match(markup, /coverage is incomplete/); assert.match(markup, /Search within 1 km/);

const station = { ...destination, id: 'station', name: 'Station', bikeMinutes: 0, distanceKm: 0 };
const stop = { mode: 'stop', facilityVisit: { ...facility, minutes: 5 }, from: facility.name, to: facility.name, departure: at, arrival: new Date(+at + 300000), service: 'Stop at Station fountain', serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null };
const journey = { id: 'render', startTime: at, departure: at, arrival: stop.arrival, totalMinutes: 5, trainMinutes: 0, waitMinutes: 0, changes: 0, services: [], originStation: station, destinationStation: station, legsIncludeEndpoints: true, transitLegs: [stop] };
markup = render(JourneyPlan, { id: 'itinerary', journey, origin, destination });
assert.match(markup, /plan-step-stop/); assert.match(markup, /Stop at Station fountain/); assert.match(markup, /5 min/);
markup = render(JourneyTimeSummary, { timing: journeyTiming(journey), requestedStart: at, details: true });
assert.match(markup, /Facility stops 5 min/); assert.match(markup, /Cycling ≈ 0 min/);
console.log(JSON.stringify({ passed: true, panels: 6, checks: 'Parking restrictions/escaping, selected repair availability, floor directions, applied visit times/restore, refill gaps/partial source, itinerary and duration breakdown', limitation: 'Server rendering only; browser interaction and visual phone checks remain separate.' }, null, 2));
