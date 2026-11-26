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

const [SavedJourneys, BicycleStatus, JourneyPlan, ParkingChoices, JourneyNavigation] = await Promise.all([
  '../src/ui/SavedJourneys.tsx', '../src/ui/BicycleStatus.tsx', '../src/JourneyPlan.tsx', '../src/ParkingChoices.tsx', '../src/JourneyNavigation.tsx'
].map(async path => (await import(path)).default));
const { DEFAULT_OPTIONS } = await import('../src/model.ts');
const { zeroCycling } = await import('../src/cycling.ts');
const { saveJourney, emptyJourneyLibrary } = await import('../src/savedJourneys.ts');
const { navigationTrip } = await import('../src/navigation.ts');
const { bicycleActionLeg } = await import('../src/bicycleAvailability.ts');
const { navigationStageAdjustmentAllowed } = await import('../src/navigationStageSelection.ts');
const noop = () => {}, render = (c, p) => renderToStaticMarkup(h(c, p));
const nodes = element => !element || typeof element !== 'object' ? []
  : Array.isArray(element) ? element.flatMap(nodes) : [element, ...nodes(element.props?.children)];
const origin = { lat: 47, lon: 8, label: 'Start' }, destination = { lat: 47, lon: 8.01, label: 'Finish' };
const start = new Date('2026-10-10T10:00:00Z'), at = n => new Date(+start + n * 60000);
const route = { ...zeroCycling(origin, destination), minutes: 10, points: [origin, destination], distanceKm: .8 };
const input = { key: 'sample', origin, destination, waypoints: [], start, options: DEFAULT_OPTIONS, mode: 'baseline', journey: null,
  cycling: { routes: [route], minutes: 10, arrival: at(10), distanceKm: .8 } };
const saved = saveJourney(emptyJourneyLibrary(), input, 0, '<script>ride</script>', 'one', start).journeys;
let panels = 0;
for (const busy of [false, true]) {
  const html = render(SavedJourneys, { journeys: saved, selectedName: 'My route', canSave: true, busy, notice: 'Saved on this device.',
    onSave: noop, onOpen: noop, onPlan: noop, onRename: noop, onDelete: noop }); panels++;
  assert.match(html, /Open itinerary/); assert.match(html, /Plan again/); assert.match(html, /do not sync/);
  assert.match(html, /&lt;script&gt;ride&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /2026/); assert.match(html, /GPS starts only when you press Start/);
  if (busy) assert.match(html, /disabled=""/);
}
const facility = { id: 'park', ...origin, name: 'Station parking', type: 'BIKE_PARKING', operator: 'Source', traits: [], covered: null, capacity: null, publicAccess: true,
  openingHours: 'Mo-Fr 08:00-18:00', fee: true, tags: { maxstay: '30 minutes' } };
for (const parked of [null, { place: origin, parkedAt: start, collectionAt: at(90), facility }]) {
  const html = render(BicycleStatus, { parked, busy: false, notice: '', walkingMinutes: 30, onWalkingMinutes: noop, onRecordHere: noop, onReturn: noop, onCollected: noop }); panels++;
  if (parked) { assert.match(html, /walking and passenger public transport/); assert.match(html, /I have collected/); assert.match(html, /Mapped closed/); assert.match(html, /exceeds the mapped maximum/); assert.match(html, /not included in transport ticket prices/); }
  else assert.match(html, /use my location/);
}
const parking = render(ParkingChoices, { facilities: [{ ...facility, openingHours: '24/7', tags: {} }], targets: [{ key: 'destination', place: origin }],
  mapPoint: null, at: start, alongJourney: true, onLocate: noop, onPark: noop }); panels++;
assert.match(parking, /I’ve parked here/);
const station = (p, id) => ({ ...p, id, name: p.label, bikeMinutes: 0, distanceKm: 0 });
const train = { mode: 'transit', service: 'IR 15', from: origin.label, to: destination.label, fromPoint: origin, toPoint: destination,
  departure: at(3), arrival: at(20), departurePlatform: '1', arrivalPlatform: '2', serviceName: null, direction: null };
for (const cancelled of [false, true]) {
  const leg = { ...train, bicycleOnBoard: false, realtime: { checkedAt: start.toISOString(), estimatedDeparture: at(8).toISOString(), estimatedArrival: at(25).toISOString(), departurePlatform: '4', arrivalPlatform: '2',
    cancelled, departureCancelled: false, arrivalCancelled: false, undefinedDelay: false } };
  const journey = { id: 'live', startTime: start, departure: at(3), arrival: at(25), totalMinutes: 25, trainMinutes: 17, waitMinutes: 8, changes: 0, services: ['IR 15'],
    originStation: station(origin, 'a'), destinationStation: station(destination, 'b'), transitLegs: [leg], legsIncludeEndpoints: true };
  const html = render(JourneyPlan, { id: 'live', journey, origin, destination, takeBikeOnTransit: true,
    realtime: { active: true, loading: false, failed: false, issues: [], refresh: noop } }); panels++;
  assert.match(html, /every 30 seconds/); assert.match(html, /Travelling without a bicycle on this service/);
  assert.doesNotMatch(html, /Confirm when you have (?:left|collected)/, 'A passenger service does not invent a bicycle action');
  if (cancelled) assert.match(html, /Cancelled/); else assert.match(html, /(?:Delayed by |Last reported delay: )5 min/);
}
for (const action of ['park', 'collect']) {
  const point = { lat: 47, lon: 8.005, label: 'Chosen bicycle stop', bicycleAction: action };
  const initial = action === 'park', events = [];
  const walk = (from, to, departure, arrival, bicycleWithTraveller) => ({ mode: 'walk', service: 'Walk', from: from.label, to: to.label,
    fromPoint: from, toPoint: to, departure, arrival, bicycleWithTraveller });
  const journey = { id: `action-${action}`, startTime: start, departure: start, arrival: at(10), totalMinutes: 10,
    trainMinutes: 0, waitMinutes: 0, changes: 0, services: [], originStation: station(origin, 'a'), destinationStation: station(destination, 'b'),
    legsIncludeEndpoints: true, transitLegs: [walk(origin, point, start, at(3), initial), bicycleActionLeg(action, point, +at(3)),
      walk(point, destination, at(3), at(10), !initial)] };
  const trip = navigationTrip({ ...input, key: journey.id, cycling: null, journey, waypoints: [point],
    options: { ...DEFAULT_OPTIONS, bicycleAtOrigin: initial } });
  const index = trip.stages.findIndex(stage => stage.leg?.bicycleAction === action);
  assert.ok(index >= 0);
  const html = render(JourneyPlan, { id: journey.id, journey, origin, destination }); panels++;
  assert.match(html, /only at the explicit stops below/);
  assert.match(html, new RegExp(`Confirm when you have ${action === 'park' ? 'left' : 'collected'} the bicycle at this point`));
  assert.match(html, /No handling time is included/);
  const navigation = { following: { trip, index, onboard: false, progress: null }, now: +at(3), notice: '',
    location: { fix: { ...point, accuracy: 5, timestamp: +at(3) }, status: 'ready', message: '' }, map: { following: false },
    keepAwake: false, awake: 'off', stop: noop, retry: noop, recenter: noop, setKeepAwake: noop, setStage: noop,
    canSetStage: target => navigationStageAdjustmentAllowed(trip.stages, index, target), confirm: () => events.push(['confirm']) };
  const props = { navigation, canStart: true, busy: false, realtime: { issues: [], active: false, failed: false, loading: false },
    onStart: noop, onRecalculate: noop, onMap: noop, onBicycleAction: (value, location) => events.push(['bicycle', value, location]) };
  const active = render(JourneyNavigation, props); panels++;
  assert.match(active, new RegExp(action === 'park' ? 'I’ve left the bicycle · Continue' : 'I’ve collected the bicycle · Continue'));
  assert.match(active, /previous bicycle status until you confirm/);
  const tree = nodes(JourneyNavigation(props));
  const confirm = tree.find(el => el.type === 'button' && el.props.className === 'navigation-primary');
  const afterAction = tree.find(el => el.type === 'option' && el.props.value === index + 1);
  assert.equal(afterAction.props.disabled, true, 'Stage adjustment cannot skip a pending bicycle action');
  assert.deepEqual(events, [], 'Inspecting the itinerary does not confirm a physical action');
  confirm.props.onClick();
  assert.deepEqual(events, [['bicycle', action, { lat: point.lat, lon: point.lon, label: point.label }], ['confirm']],
    'The physical action is recorded at the chosen point before navigation advances');
  const busy = render(JourneyNavigation, { ...props, busy: true }); panels++;
  assert.match(busy, /class="navigation-primary" type="button" disabled=""/);
}
assert.equal(navigationTrip(input).stages.length, 1);
console.log(JSON.stringify({ passed: true, panels, checks: 'Saved itinerary date/actions/storage disclosure/escaping/busy state; parked bicycle collection, walking, closure and max-stay warnings; map park action; actual per-leg passenger and delay/cancellation markup; explicit park/collect itinerary and navigation confirmation, chosen-point callbacks, busy state and blocked stage skipping.', limitation: 'React server rendering and callback checks only; interactive browser and physical-phone acceptance remain unverified.' }, null, 2));
