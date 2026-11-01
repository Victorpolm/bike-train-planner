import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { knownPrice, unknownPrice, sumPrices, type Priced } from "./priced.ts";

const source={title:"Test tariff",url:"https://example.test",checked:"2026-10-13"};
it("every flexible total equals its qualified parts; a missing or restricted part prevents the total",()=>{
 let seed=417;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let sample=0;sample<1000;sample++){
  const parts:Priced[]=Array.from({length:1+random()%6},()=>{
   const amount=(random()%20000)/100,kind=random()%6;
   return kind===0?unknownPrice("Expired","expired"):kind===1?unknownPrice("Prohibited","prohibited")
    :knownPrice(amount,"Product",source,{flexibility:kind===2?"train-bound":kind===3?"time-bound":"flexible"});
  });
  const total=sumPrices(parts,source),eligible=parts.every(p=>p.known&&p.offer.flexibility==="flexible");
  assert.equal(total.known,eligible);
  if(total.known)assert.equal(Math.round(total.offer.chf*100),parts.reduce((sum,p)=>sum+(p.known?Math.round(p.offer.chf*100):0),0));
 }
});
it("views, exports and objective selection cannot consume legacy unqualified fare amounts",()=>{
 const root=new URL("./",import.meta.url),files:string[]=[];
 function walk(dir:URL,prefix=""){for(const entry of readdirSync(dir,{withFileTypes:true})){
  if(entry.isDirectory())walk(new URL(entry.name+"/",dir),prefix+entry.name+"/");
  else if(entry.name.endsWith(".tsx"))files.push(prefix+entry.name);
 }}walk(root);files.push("journeyDataQuality.ts","journeyObjectives.ts");
 const aliases=new Set(["passengerChf","bikeChf","reservationChf","totalChf","knownBikeTotal"]),failures:string[]=[];
 for(const file of files){const ast=ts.createSourceFile(file,readFileSync(new URL(file,root),"utf8"),ts.ScriptTarget.Latest,true,file.endsWith("x")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const visit=(node:ts.Node)=>{if(ts.isIdentifier(node)&&aliases.has(node.text)||ts.isStringLiteral(node)&&aliases.has(node.text))failures.push(file+":"+node.getText(ast));ts.forEachChild(node,visit);};visit(ast);
 }
 assert.deepEqual(failures,[],"Render/serialize Priced instead of copying a compatibility number.");
});
