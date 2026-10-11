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



const { default: OfficialPanel } = await import('../src/OfficialCyclingPanel.tsx');
const { default: Privacy } = await import('../src/PrivacyNotice.tsx');
const { default: CyclingDetails } = await import('../src/CyclingDetails.tsx');
const { default: FareDetails } = await import('../src/FareDetails.tsx');
const { default: Header } = await import('../src/ui/AppHeader.tsx');
const { zeroCycling } = await import('../src/cycling.ts');
const { DEFAULT_OPTIONS } = await import('../src/model.ts');
const { DEFAULT_FARE_PROFILE } = await import('../src/fares.ts');
const render = (component, props) => renderToStaticMarkup(h(component, props));
const noop = () => {}, start = new Date('2026-10-12T08:00:00Z');
const origin = {lat:47,lon:8,label:'Start <script>'}, destination={lat:47.01,lon:8.02,label:'Finish'};
const route = {...zeroCycling(origin,destination), distanceKm:2,minutes:10,source:'BRouter'};
const context={journey:null,cycling:{routes:[route],minutes:10,distanceKm:2,arrival:new Date(+start+600000)},origin,destination,start,options:DEFAULT_OPTIONS};
const stages=[{id:'a',label:'Start <script> → Finish',from:origin,to:destination,route,departure:start,originalMinutes:10,following:[],originalArrival:context.cycling.arrival}];
let panels=0;
for (const maxBikeMinutes of [30,150]) {
 const html=render(OfficialPanel,{stages,context:{...context,options:{...DEFAULT_OPTIONS,maxBikeMinutes}},onApply:noop,onClose:noop,onPreview:noop});panels++;
 assert.match(html,/Find official routes/); assert.match(html,/Bundesamt für Strassen/); assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/not the complete published tour/); assert.match(html,/does not guarantee/);
}
let html=render(Privacy,{});panels++;
for (const expected of ['legal operator name','IP-related fields','signed-in account','processing countries','Delete this device','BRouter','two weeks','Trafimage','No project-wide software reuse licence']) assert.ok(html.includes(expected),expected);
assert.doesNotMatch(html,/all data stays on your device|no personal data is collected/i);
html=render(Header,{profile:h('button',null,'Profile')});panels++;
assert.match(html,/Privacy, sources/);assert.match(html,/Re.route home/);
const evidence={number:32,title:'Route <img>',url:'https://schweizmobil.ch/en/cycling-in-switzerland/route-32/stage-2',sectionKm:2,matchedPercent:99,checkedAt:start.toISOString(),closuresCheckedAt:start.toISOString()};
html=render(CyclingDetails,{routes:[{label:'Official section',route:{...route,officialRoute:evidence}}],focus:null,onFocus:noop});panels++;
assert.match(html,/Re.route itinerary using/);assert.match(html,/recheck before travel/);assert.match(html,/&lt;img&gt;/);assert.doesNotMatch(html,/<img>/);
const transit={mode:'transit',from:'Zürich',to:'Laax',fromId:'8503000',toId:'8509368',departure:start,arrival:new Date(+start+3600000),service:'Unknown service',category:'IR',operator:'Unknown'};
html=render(FareDetails,{journey:{transitLegs:[transit]},profile:DEFAULT_FARE_PROFILE});panels++;
assert.match(html,/Integration-system fare estimates are hidden/);assert.doesNotMatch(html,/Checking online fare|Estimated additional cost/);
console.log(JSON.stringify({panels,status:'passed',browserInteraction:'not-tested'}));
