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
const noop = () => {}, render = (component, props) => renderToStaticMarkup(h(component, props));
const defaults = { open: true, onOpenChange: noop, disabled: false, mode: 'baseline', hasWaypoints: false,
  bicycleScope: 'allow-uncertain', routePreference: 'simplest', cyclingAmount: cyclingAmountForPreset('commuter'), endpoint: 'none',
  cyclingPosition: 'anywhere', takeBikeOnTransit: true, maxWalkingMinutes: 30, hills: DEFAULT_HILLS, climbOptimization: false,
  onMode: noop, onScope: noop, onRoute: noop, onCyclingAmount: noop, onEndpoint: noop, onPosition: noop,
  onBikeOnTransit: noop, onWalkingMinutes: noop, onHills: noop, onClimbOptimization: noop };
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
  assert.match(html, /This restricts where cycling is allowed/);
  assert.match(html, /do not forbid cycling elsewhere/);
  assert.equal((html.match(/type="checkbox" checked=""/g) ?? []).length, 4);
  assert.match(html, /Prefer to avoid uphill slopes above/);
  for (const label of ['At most', 'At least', 'No preference']) assert.ok(html.includes(label));
  if (mode === 'none') assert.doesNotMatch(html, /Cycling duration presets|value="73"/);
  else { assert.match(html, /value="73"/); for (const m of [40, 45, 90, 150]) assert.ok(html.includes(`${m} min`)); }
}
const empty = render(CyclingAmountControl, { value: { mode: 'at-least', minutes: NaN }, disabled: false, onChange: noop }); panels++;
assert.doesNotMatch(empty, /NaN/); assert.match(empty, /required="" value=""/);
const disabled = render(TripPreferences, { ...defaults, disabled: true }); panels++;
assert.match(disabled, /class="cycling-amount" disabled=""/); assert.match(disabled, /class="extra-categories" disabled=""/);

// Exercise the pure component callbacks; these are not browser event tests.
const nodes = element => !element || typeof element !== 'object' ? []
  : Array.isArray(element) ? element.flatMap(nodes) : [element, ...nodes(element.props?.children)];
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
console.log(JSON.stringify({ passed: true, panels, checks: 'Preset visibility; all three cycling modes; presets/custom/empty input; Extra grouping and multiple selection; slope controls; disabled states; pure callback transitions', limitation: 'Server rendering and callback checks only; interactive browser and physical-phone acceptance remain unverified.' }, null, 2));
