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


const { default: Quality } = await import('../src/JourneyDataQuality.tsx');
const { default: FareDetails } = await import('../src/FareDetails.tsx');
const { DEFAULT_FARE_PROFILE } = await import('../src/fares.ts');
const render = (component, props) => renderToStaticMarkup(h(component, props));
const train = {mode:'transit', from:'Zürich HB', to:'Baden', fromId:'8503000',toId:'8503504',
  departure:new Date('2026-10-11T08:00:00Z'),arrival:new Date('2026-10-11T08:30:00Z'),operator:'SBB',category:'IR',service:'IR35'};
let panels=0;
for (const takeBikeOnTransit of [true,false]) {
  const journey={transitLegs:[{...train,operator:'Unknown',service:'<script>service</script>'}]};
  const html=render(Quality,{journey,profile:DEFAULT_FARE_PROFILE,takeBikeOnTransit});panels++;
  assert.match(html,/Download journey report/);assert.match(html,/Nothing is sent automatically/);
  assert.match(html,/Observed cycling minutes/);assert.match(html,/Service-specific GTFS exceptions/);
  if(takeBikeOnTransit) {assert.match(html,/&lt;script&gt;service/);assert.doesNotMatch(html,/<script>/);}
  else assert.doesNotMatch(html,/Bicycle permission needs checking/);
}
for(const passenger of ['full','half-fare','ga']) {
  const html=render(FareDetails,{journey:{transitLegs:[train]},profile:{...DEFAULT_FARE_PROFILE,passenger}});panels++;
  assert.match(html,/Published tariff/);assert.match(html,/Published standard fare/);
  assert.match(html,/Data quality and corrections/);assert.doesNotMatch(html,/Estimated additional cost/);
}
const {default: PriceValue}=await import('../src/ui/PriceValue.tsx');
const {knownPrice,unknownPrice}=await import('../src/priced.ts');
const source={title:'Official tariff',url:'https://example.test',checked:'2026-10-11'};
const restricted=render(PriceValue,{price:knownPrice(12,'Sparbillett',source,{flexibility:'train-bound',environment:'test'})});panels++;
assert.match(restricted,/Only on the quoted train/);assert.match(restricted,/limited availability/);assert.match(restricted,/test fare estimate/);
assert.match(restricted,/Official tariff/);assert.match(restricted,/Quote checked|Source reviewed/);
const timedOffer=render(PriceValue,{price:knownPrice(8,'Time ticket',source,{flexibility:'time-bound',availability:'capacity-limited',basis:'quoted',checkedAt:'2026-10-13T08:30:00Z'})});panels++;
assert.match(timedOffer,/Only within the quoted time window/);assert.match(timedOffer,/limited availability/);assert.match(timedOffer,/Quote checked/);
const denied=render(PriceValue,{price:unknownPrice('Carriage prohibited','prohibited')});panels++;
assert.doesNotMatch(denied,/CHF/);assert.match(denied,/Not permitted/);
const {default:TimeSummary}=await import('../src/ui/JourneyTimeSummary.tsx');
const broken=render(TimeSummary,{timing:{journey:{realtimeStatus:{state:'broken'}}},requestedStart:new Date()});panels++;
assert.match(broken,/Connection no longer feasible/);assert.doesNotMatch(broken,/Arrive <b>|Leave <b>|[0-9]{2}:[0-9]{2}/);
const {default:TransitTime}=await import('../src/ui/TransitTime.tsx');
const early=render(TransitTime,{timing:{at:new Date('2026-10-11T08:16:00Z'),scheduled:new Date('2026-10-11T08:20:00Z'),basis:'estimated',freshness:'stale',delayMinutes:-4,cancelled:false,undefinedDelay:false}});panels++;
assert.match(early,/4 min early/);assert.match(early,/out of date/);assert.match(early,/Scheduled/);
const {departureTiming}=await import('../src/realtime.ts');
const cancelled=render(TransitTime,{timing:departureTiming({...train,realtime:{checkedAt:'2026-10-11T08:00:00Z',estimatedDeparture:'2026-10-11T08:15:00Z',cancelled:true}},Date.parse('2026-10-11T08:01:00Z'))});panels++;
assert.match(cancelled,/Cancelled · original time/);assert.match(cancelled,/10:00/);assert.doesNotMatch(cancelled,/10:15|fresh estimate/);
const failed=render(TransitTime,{timing:{at:new Date('2026-10-11T08:16:00Z'),scheduled:new Date('2026-10-11T08:20:00Z'),basis:'estimated',freshness:'stale',delayMinutes:-4,cancelled:false,undefinedDelay:false,refreshFailed:true}});panels++;
assert.match(failed,/last live check failed/);assert.doesNotMatch(failed,/fresh estimate/);
const indefinite=render(TimeSummary,{timing:{journey:{realtimeStatus:{state:'at-risk'},transitLegs:[{mode:'transit',realtime:{undefinedDelay:true}}]}},requestedStart:new Date()});panels++;
assert.match(indefinite,/Arrival time unknown/);assert.doesNotMatch(indefinite,/Arrive <b>|[0-9]{2}:[0-9]{2}/);
const local={...train,from:'Genève, Plainpalais',to:'Genève, Rive',fromId:'8587907',toId:'8587061',operator:'TPG',category:'T',service:'12'};
const geneva=render(FareDetails,{journey:{transitLegs:[local]},profile:DEFAULT_FARE_PROFILE});panels++;
assert.match(geneva,/CHF 5.00/);assert.match(geneva,/Local operator tickets and conditions/);
assert.match(geneva,/independent Re.route extraction/);assert.match(geneva,/60 minutes/);assert.match(geneva,/short-hop/);
const {default:TariffHealth}=await import('../src/ui/TariffHealth.tsx');
const renewal=render(TariffHealth,{});panels++;
assert.match(renewal,/TPG Zone 10 line 12/);assert.match(renewal,/BERNMOBIL/);assert.match(renewal,/not necessarily the publisher/);
const { default: BicycleDetails } = await import('../src/BicycleCarriageDetails.tsx');
const { withTripInfoRule, interpretBicycleAttributes } = await import('../src/bicycleCarriage.ts');
for (const [code, expected] of [['A__VR','Bikes allowed · Reservation required'], ['A__VN','Bikes not allowed on this section'], ['A__VH','Bikes allowed · No reservation required']]) {
  const evidence = withTripInfoRule({permission:'unknown',fromId:train.fromId,toId:train.toId,departure:train.departure.toISOString(),service:train.service,operator:train.operator,
    source:{title:'Provider',url:'https://example.test',checked:'2026-11-01'},conditions:[]},interpretBicycleAttributes([{code,text:'',scope:'service'}]),'2026-11-01');
  const html = render(BicycleDetails,{leg:{...train,bicycleEvidence:evidence},profile:DEFAULT_FARE_PROFILE}); panels++;
  assert.ok(html.includes(expected)); assert.match(html,/<svg/); assert.doesNotMatch(html,/Unknown — check with the operator/);
}
const missing=render(BicycleDetails,{leg:{...train,operator:'Unmapped'},profile:DEFAULT_FARE_PROFILE});panels++;
assert.match(missing,/Bicycle information missing for this service/);assert.match(missing,/Reservation requirement not verified/);
const checkedTime={at:new Date('2026-11-01T10:00:00Z'),scheduled:new Date('2026-11-01T10:00:00Z'),basis:'estimated',freshness:'fresh',delayMinutes:0,delaySeconds:0,cancelled:false,undefinedDelay:false};
const ontime=render(TransitTime,{timing:checkedTime});panels++; assert.match(ontime,/On time/);assert.doesNotMatch(ontime,/\+0 min/);
for(const timing of [{...checkedTime,basis:'scheduled'},{...checkedTime,freshness:'stale'},{...checkedTime,delaySeconds:20}]) {
  const html=render(TransitTime,{timing});panels++;assert.doesNotMatch(html,/On time/);
}
for (const [status, text] of [['matched','A bicycle-equipped coach runs through your section.'],['no-data','No usable bicycle coach is confirmed for the whole section.'],['auth-failed','The formation API rejected its configured key.']]) {
  const formation={status,message:text,checked:new Date().toISOString(),source:'https://opentransportdata.swiss/en/cookbook/realtime-prediction-cookbook/formationsdaten/',
    ...(status==='matched'?{coaches:['2'],rule:interpretBicycleAttributes([{code:'A__VR',text:'Bicycle reservation required',scope:'segment'}])}:{})};
  const evidence={permission:'unknown',fromId:train.fromId,toId:train.toId,departure:train.departure.toISOString(),service:train.service,operator:train.operator,
    source:{title:'OJP',url:'https://example.test',checked:'2026-11-01'},conditions:[],formation};
  const html=render(BicycleDetails,{leg:{...train,bicycleEvidence:evidence},profile:DEFAULT_FARE_PROFILE});panels++;
  assert.ok(html.includes(text));assert.match(html,/Train formation evidence/);
  if(status==='matched') { assert.match(html,/Reservation required/);assert.match(html,/Bicycle coach: 2/); }
}
console.log(JSON.stringify({panels,status:'passed',browserInteraction:'not-tested'}));
