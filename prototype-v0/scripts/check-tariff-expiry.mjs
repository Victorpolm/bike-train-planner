import { monitoredHealth } from '../src/monitoredSources.ts';
const supplied=process.argv.find(a=>a.startsWith('--on='))?.slice(5);
const now=supplied?new Date(supplied+'T12:00:00Z'):new Date();
if(!Number.isFinite(+now))throw new Error('Use --on=YYYY-MM-DD');
const due=monitoredHealth(now).filter(s=>s.state!=='current');
for(const {source,state,daysRemaining,urgency} of due)console.error(`${state} (${urgency}): ${source.title}; coverage through ${source.validThrough}; ${daysRemaining} days remain; ${source.url}`);
if(due.length){console.error('Retrieve current source candidates and review the new effective dates. Do not extend coverage merely to make this check green.');process.exitCode=1;}
else console.log('All reviewed tariff, operator-rule and route-scope sources remain outside their renewal windows.');
