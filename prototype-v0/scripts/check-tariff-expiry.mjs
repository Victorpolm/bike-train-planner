import { lapsing } from '../src/tariffSources.ts';
const supplied=process.argv.find(a=>a.startsWith('--on='))?.slice(5);
const now=supplied?new Date(supplied+'T12:00:00Z'):new Date();
if(!Number.isFinite(+now))throw new Error('Use --on=YYYY-MM-DD');
const due=lapsing(now,60);
for(const {source,state,daysRemaining} of due)console.error(`${state}: ${source.title}; coverage through ${source.validThrough}; ${daysRemaining} days remain; ${source.url}`);
if(due.length){console.error('Retrieve current source candidates and review the new effective dates. Do not extend coverage merely to make this check green.');process.exitCode=1;}
else console.log('All reviewed tariff sources remain outside the 60-day renewal window.');
