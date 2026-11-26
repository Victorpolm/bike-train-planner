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

const [TripPreferences, JourneyObjectives, CyclingAmountControl] = await Promise.all([
  '../src/ui/TripPreferences.tsx', '../src/ui/JourneyObjectives.tsx', '../src/ui/CyclingAmountControl.tsx',
].map(async path => (await import(path)).default));
const { DEFAULT_HILLS } = await import('../src/hills.ts');
const { cyclingAmountForPreset } = await import('../src/cyclingDuration.ts');
const { DEFAULT_OPTIONS } = await import('../src/model.ts');
const { preferenceOptions } = await import('../src/preferences.ts');
const noop = () => {}, render = (component, props) => renderToStaticMarkup(h(component, props));
const defaults = { open: true, onOpenChange: noop, disabled: false, mode: 'baseline', hasWaypoints: false,
  bicycleScope: 'allow-uncertain', routePreference: 'simplest', cyclingAmount: cyclingAmountForPreset('commuter'), endpoint: 'none',
  cyclingPosition: 'anywhere', takeBikeOnTransit: true, bicycleAtOrigin: DEFAULT_OPTIONS.bicycleAtOrigin,
  followSignedRoutes: false, onFollowSignedRoutes: noop, maxWalkingMinutes: 30, hills: DEFAULT_HILLS, climbOptimization: false,
  onMode: noop, onScope: noop, onRoute: noop, onCyclingAmount: noop, onEndpoint: noop, onPosition: noop,
  onBikeOnTransit: noop, onBicycleAtOrigin: noop, onWalkingMinutes: noop, onHills: noop, onClimbOptimization: noop };
let panels = 0;
for (const profile of ['commuter', 'bikepacking', 'personalized']) {
  const html = render(JourneyObjectives, { value: ['fastest', 'fewer-boardings', 'least-cycling'], personalized: profile === 'personalized', disabled: false, onChange: noop });
  panels++;
  if (profile === 'personalized') assert.match(html, /Show alternatives for/);
  else assert.equal(html, '', 'Preset profiles have no alternative selectors');
}
for (const mode of ['at-most', 'at-least', 'none']) {
  const html = render(TripPreferences, { ...defaults, cyclingAmount: { mode, minutes: 73 }, endpoint: 'both',
    hills: { ...DEFAULT_HILLS, mode: 'gentler' }, climbOptimization: true }); panels++;
  assert.match(html, /Extra categories/); assert.doesNotMatch(html, /Endpoint preference|Cycling hills/);
  assert.match(html, /class="inline-help-content" hidden="">This restricts where cycling is allowed/);
  assert.match(html, /class="inline-help-content" hidden="">Choose any combination/);
  assert.match(html, /class="inline-help-content" hidden="">Across the whole journey/);
  assert.match(html, /<details class="extra-categories-menu"><summary>4 selected/);
  assert.doesNotMatch(html, /I would like to cycle|How much cycling\?/);
  assert.equal((html.match(/How much cycling/g) ?? []).length, 1);
  assert.match(html, /do not forbid cycling elsewhere/);
  const extras = html.match(/<fieldset class="extra-categories"[^>]*>([\s\S]*?)<\/fieldset>/)?.[1];
  assert.ok(extras, 'The four independent extra categories remain grouped');
  assert.equal((extras.match(/type="checkbox" checked=""/g) ?? []).length, 4);
  assert.match(html, /Prefer to avoid uphill slopes above/);
  for (const label of ['At most', 'At least', 'No preference']) assert.ok(html.includes(label));
  if (mode === 'none') assert.doesNotMatch(html, /Cycling duration presets|value="73"/);
  else { assert.match(html, /value="73"/); for (const m of [20, 45, 90, 150]) assert.ok(html.includes(`${m} min`)); }
}
const empty = render(CyclingAmountControl, { value: { mode: 'at-least', minutes: NaN }, disabled: false, onChange: noop }); panels++;
assert.doesNotMatch(empty, /NaN/); assert.match(empty, /required="" value=""/);
const disabled = render(TripPreferences, { ...defaults, disabled: true }); panels++;
assert.match(disabled, /class="cycling-amount" disabled=""/); assert.match(disabled, /class="extra-categories" disabled=""/);

// Exercise the pure component callbacks; these are not browser event tests.
const nodes = element => !element || typeof element !== 'object' ? []
  : Array.isArray(element) ? element.flatMap(nodes) : [element, ...nodes(element.props?.children)];
const bicycleControls = props => {
  const tree = nodes(TripPreferences(props));
  const carriageLabel = tree.find(el => el.type === 'label'
    && nodes(el).some(child => child.type === 'span' && child.props.children === 'Allow my bicycle on public transport'));
  const start = tree.find(el => el.type === 'input' && el.props.id === 'bicycle-availability');
  const carriage = nodes(carriageLabel).find(el => el.type === 'input' && el.props.type === 'checkbox');
  const placement = tree.find(el => el.type === 'select' && el.props.id === 'cycling-position');
  assert.ok(start && carriage && placement, 'Starting possession, carriage and riding placement have separate controls');
  return { start, carriage, placement };
};
assert.equal(DEFAULT_OPTIONS.bicycleAtOrigin, true);
assert.equal(preferenceOptions('commuter', 'none').bicycleAtOrigin, true);
assert.equal(bicycleControls(defaults).start.props.checked, true, 'An ordinary new plan starts with the bicycle');
for (const cyclingPosition of ['anywhere', 'start-only', 'end-only']) {
  for (const takeBikeOnTransit of [false, true]) for (const bicycleAtOrigin of [false, true]) {
    const calls = [], props = { ...defaults, cyclingPosition, takeBikeOnTransit, bicycleAtOrigin,
      onBicycleAtOrigin: value => calls.push(['start', value]), onBikeOnTransit: value => calls.push(['carriage', value]),
      onPosition: value => calls.push(['placement', value]) };
    const html = render(TripPreferences, props); panels++;
    assert.match(html, /Bike with me at the start/);
    assert.match(html, /Bike status stays the same throughout the journey/);
    const control = bicycleControls(props);
    assert.equal(control.start.props.checked, bicycleAtOrigin);
    assert.equal(control.carriage.props.checked, takeBikeOnTransit);
    assert.equal(control.placement.props.value, cyclingPosition);
    control.start.props.onChange({ target: { checked: !bicycleAtOrigin } });
    assert.deepEqual(calls.splice(0), [['start', !bicycleAtOrigin]], 'Starting status does not toggle carriage or placement');
    control.carriage.props.onChange({ target: { checked: !takeBikeOnTransit } });
    assert.deepEqual(calls.splice(0), [['carriage', !takeBikeOnTransit]], 'Carriage does not park or collect a bicycle');
    control.placement.props.onChange({ target: { value: 'end-only' } });
    assert.deepEqual(calls.splice(0), [['placement', 'end-only']], 'Riding placement does not change possession');
    if (!takeBikeOnTransit) assert.match(html, /Choose where to leave it if needed/);
  }
}
for (const control of Object.values(bicycleControls({ ...defaults, disabled: true }))) assert.equal(control.props.disabled, true);
const endpointBoxes = endpoint => nodes(TripPreferences({ ...defaults, endpoint, onEndpoint: next => { chosenEndpoint = next; } }))
  .filter(el => el.type === 'fieldset' && el.props.className === 'extra-categories')
  .flatMap(el => nodes(el.props.children)).filter(el => el.type === 'input' && el.props.type === 'checkbox').slice(0, 2);
let chosenEndpoint = 'none';
endpointBoxes(chosenEndpoint)[0].props.onChange({ target: { checked: true } }); assert.equal(chosenEndpoint, 'start');
endpointBoxes(chosenEndpoint)[1].props.onChange({ target: { checked: true } }); assert.equal(chosenEndpoint, 'both');
endpointBoxes(chosenEndpoint)[0].props.onChange({ target: { checked: false } }); assert.equal(chosenEndpoint, 'end');
endpointBoxes(chosenEndpoint)[1].props.onChange({ target: { checked: false } }); assert.equal(chosenEndpoint, 'none');
let amount = { mode: 'at-most', minutes: 45 };
const amountNodes = () => nodes(CyclingAmountControl({ value: amount, disabled: false, onChange: next => { amount = next; } }));
amountNodes().find(el => el.type === 'select').props.onChange({ target: { value: 'at-least' } });
assert.deepEqual(amount, { mode: 'at-least', minutes: 45 });
amountNodes().find(el => el.type === 'button' && el.props.children[0] === 90).props.onClick();
assert.deepEqual(amount, { mode: 'at-least', minutes: 90 });
amountNodes().find(el => el.type === 'input').props.onChange({ target: { valueAsNumber: 73 } });
assert.equal(amount.minutes, 73);
amountNodes().find(el => el.type === 'select').props.onChange({ target: { value: 'none' } });
assert.equal(amountNodes().some(el => el.type === 'input'), false);
const [RouteFields, JourneyNavigation, PlannerForm, TripPresetPicker] = await Promise.all([
  '../src/ui/RouteFields.tsx', '../src/JourneyNavigation.tsx', '../src/ui/PlannerForm.tsx', '../src/ui/TripPresetPicker.tsx',
].map(async path => (await import(path)).default));
const { guestSettings } = await import('../src/travellerProfiles.ts');
const routeProps = { from: { text: 'Start' }, to: { text: 'Finish' }, vias: [], disabled: false, notice: '',
  onFrom: noop, onTo: noop, onVia: noop, onBicycleAction: noop, onReverse: noop, onAdd: noop, onRemove: noop, onMove: noop, onChooseMap: noop,
  currentLocation: { onClick: noop, loading: false, notice: '' } };
for (const loading of [false, true]) {
  const html = render(RouteFields, { ...routeProps, currentLocation: { onClick: noop, loading, notice: loading ? '' : 'Using your location · accuracy ±12 m.' } }); panels++;
  if (loading) assert.match(html, /disabled="" aria-busy="true"/);
  else { assert.equal((html.match(/From your location/g) ?? []).length, 1); assert.match(html, /role="status"/); }
}
const vias = [undefined, 'collect', 'park'].map((bicycleAction, index) => ({ id: `stop-${index}`, bicycleAction,
  value: { text: `Stop ${index + 1}`, place: { label: `Stop ${index + 1}`, lat: 47, lon: 8 + index / 100 } } }));
const originalVias = structuredClone(vias);
for (const disabled of [false, true]) {
  const calls = [], props = { ...routeProps, vias, disabled, onBicycleAction: (id, action) => calls.push([id, action]),
    onVia: () => { throw new Error('Changing a bicycle action must not replace the stop location'); } };
  const html = render(RouteFields, props); panels++;
  assert.match(html, /Bike status stays the same unless you pick up or leave a bike/);
  const selects = nodes(RouteFields(props)).filter(el => el.type === 'select');
  assert.equal(selects.length, vias.length, 'Every intermediate stop has one action selector');
  for (const [index, select] of selects.entries()) {
    assert.equal(select.props['aria-label'], `Bike action at intermediate stop ${index + 1}`);
    assert.equal(select.props.disabled, disabled);
    assert.equal(select.props.value, vias[index].bicycleAction ?? '');
    assert.deepEqual(nodes(select.props.children).map(el => [el.props.value, el.props.children]),
      [['', 'Keep current status'], ['collect', 'Pick up a bike'], ['park', 'Leave a bike']]);
    if (!disabled) for (const value of ['collect', 'park', '']) {
      select.props.onChange({ target: { value } });
      assert.deepEqual(calls.splice(0), [[vias[index].id, value || undefined]], 'Keep clears the action without inventing a transition');
    }
  }
  assert.deepEqual(vias, originalVias, 'Rendering and action callbacks preserve the location values');
}
const form = render(PlannerForm, { sections: { locations: null, departure: null, trip: null, preferences: null }, loading: false, locating: true, onSubmit: noop }); panels++;
assert.match(form, /type="submit" disabled="">Finding your location/);
const nav = render(JourneyNavigation, { navigation: { following: null, notice: '' }, canStart: true, busy: false, realtime: {}, onStart: noop, onRecalculate: noop, onMap: noop, onBicycleAction: noop }); panels++;
assert.match(nav, /Follow your journey/); assert.match(nav, /About following your journey/);
assert.match(nav, /class="inline-help-content" hidden="">Start asks for/);
assert.doesNotMatch(nav, /<details>|<p>Start asks/);
const profile = render(TripPresetPicker, { value: 'commuter', disabled: false, onChange: noop, library: { profiles: [] }, settings: guestSettings(), notice: '', onSelectProfile: noop }); panels++;
assert.match(profile, /Up to 30 min cycling/); assert.doesNotMatch(profile, /45 min cycling/);
const SearchTimingSummary = (await import('../src/ui/SearchTimingSummary.tsx')).default;
assert.equal(render(SearchTimingSummary, { report: null }), ''); panels++;
for (const status of ['running', 'complete', 'limited', 'cancelled', 'failed']) {
  const html = render(SearchTimingSummary, { report: { status, elapsedMs: 1800, firstResultMs: 1200, firstTransitMs: null,
    refreshes: 4, reusedRefreshes: 2, solverCalls: 3, stages: { network: { calls: 2, milliseconds: 1600 }, solving: { calls: 1, milliseconds: 300 } } } }); panels++;
  assert.match(html, /<details class="search-notice search-timing">/); assert.match(html, /1\.20 s/); assert.match(html, /Not reached/);
  assert.match(html, /2 of 4 result updates reused/); assert.match(html, /Stages overlap/); assert.match(html, /before screen rendering/);
  assert.doesNotMatch(html, /<details[^>]* open=/);
}
console.log(JSON.stringify({ passed: true, panels, checks: 'Preset visibility and 30-minute Commuter; 20/45/90/150 quick choices; all cycling modes; hidden question-mark help; four independent extras; default starting bicycle and independent possession/carriage/placement controls; Keep/collect/park stop selectors and callbacks; From-location and pending submission states; compact navigation help; all search-timing states and overlapping-stage disclosure', limitation: 'Server rendering and callback checks only; interactive browser and physical-phone acceptance remain unverified.' }, null, 2));
