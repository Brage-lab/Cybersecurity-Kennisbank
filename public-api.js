"use strict";
const publicData=fetch(new URL("data.json?v=99fcdf0188ae",document.baseURI)).then(r=>{if(!r.ok)throw Error("De leesversie kon niet laden.");return r.json();});
async function publicApi(url, options={}) {
 if(options.method && options.method!=="GET")throw Error("Dit is een leesversie.");
 const data=await publicData, u=new URL(url,location.origin), p=u.searchParams;
 if(u.pathname==="/api/bootstrap")return data.bootstrap;
 if(u.pathname==="/api/document"){
  const id=p.get("id");if(!Object.hasOwn(data.documents,id))throw Error("Deze pagina zit niet in de openbare leesversie.");
  return {markdown:data.documents[id],entry:data.entries[id]||null,checks:[]};
 }
 if(u.pathname!=="/api/search")throw Error("Onbekende leesfunctie.");
 const q=(p.get("q")||"").trim().toLowerCase(),terms=q.split(/\s+/).filter(Boolean);
 const scopes=p.get("scopes")==="all"?Object.keys(data.bootstrap.search_scopes):(p.get("scopes")||"").split(",").filter(s=>Object.hasOwn(data.bootstrap.search_scopes,s));
 const entries=Object.values(data.entries).filter(e=>
  (!p.get("section")||e.section===p.get("section"))&&(!p.get("category")||e.category===p.get("category"))&&
  (!p.get("status")||e.status===p.get("status"))&&(!p.get("command_type")||e.command_types.includes(p.get("command_type")))&&
  (!p.get("application_area")||e.application_areas.includes(p.get("application_area"))));
 const selected=new Map(entries.map(e=>[e.id,e])),matches=[];
 const summarize=e=>{const {fields,...rest}=e;return rest;};
 if(scopes.length && !(scopes.length===1&&scopes[0]==="tasks"))for(const e of entries){
  const hay=scopes.map(s=>e.fields[s]||"").join("\n");if(terms.every(t=>hay.includes(t)))matches.push({...summarize(e),anchor:""});
 }
 if(scopes.includes("tasks")&&(terms.length||scopes.length===1))for(const t of data.tasks){
  if(selected.has(t.id)&&terms.every(term=>t.search.includes(term))){const {search,...task}=t;matches.push({...summarize(selected.get(t.id)),...task,kind:"task"});}
 }
 const rank=i=>{const label=(i.task_title||i.name).toLowerCase();return [q&&i.name.toLowerCase()===q&&i.kind==="command"?0:q&&label===q?1:q&&label.startsWith(q)?2:3,Number(i.status!=="Uitgewerkt"),Number(i.kind!=="task"),Number(i.category.endsWith("/other")),label];};
 matches.sort((a,b)=>{const x=rank(a),y=rank(b);for(let i=0;i<x.length;i++){if(x[i]<y[i])return -1;if(x[i]>y[i])return 1;}return 0;});
 return {total:matches.length,commands:matches.filter(i=>i.kind==="command").length,documents:0,tasks:matches.filter(i=>i.kind==="task").length,items:matches.slice(0,Math.min(3000,Math.max(1,Number(p.get("limit"))||60)))};
}
