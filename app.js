"use strict";
const $ = (s) => document.querySelector(s);
const model = {token:"", section:"", sections:[], categories:{}, total:0, stats:{seen:0,applied:0}, category:"", limit:60, active:"", doc:null, items:[], request:0, documentRequest:0, entries:new Map()};
let searchTimer, noticeTimer;
function element(tag, cls, text) { const node=document.createElement(tag); if(cls)node.className=cls; if(text!==undefined)node.textContent=text; return node; }
function clean(text) { return text.replace(/\\([_*[\]|])/g,"$1").replaceAll("&amp;","&").replaceAll("&lt;","<").replaceAll("&gt;",">"); }
function shortLabel(full,maxLen=40) {
 const seps=[";","(",". "].map(sep=>full.indexOf(sep)).filter(i=>i>=0);
 let cut=seps.length?Math.min(...seps):full.length;
 if(cut>maxLen){const wordCut=full.lastIndexOf(" ",maxLen);cut=wordCut>10?wordCut:maxLen;}
 return full.slice(0,cut).trim();
}
function notify(message,error=false) { const box=$("#notice");box.textContent=message;box.className="notice"+(error?" error":"");box.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>box.hidden=true,error?9000:3500); }
async function api(url,options={}) { return publicApi(url,options); }
function sectionInfo(id=model.section) { return model.sections.find(section=>section.id===id); }
function searchSection() { return $("#search-domain").value==="all" ? "" : model.section; }
function renderStats() {
 const section=sectionInfo(searchSection());
 $("#catalog-count").textContent=(section?section.count:model.total).toLocaleString("nl-NL");
 $("#progress-summary").textContent="Raadplegen zonder voortgangsregistratie";
}
function updateContext() {
 const section=sectionInfo();
 $("#section-switch").value=model.section;
 $("#section-heading").textContent=section?section.title:"Kennisbank";
 $("#search-domain").options[0].disabled=!section;
 if(!section)$("#search-domain").value="all";
 $("#search").placeholder=searchSection()?"Zoek in "+section.title+"…":"Zoek in de hele kennisbank…";
 document.querySelectorAll("[data-browse]").forEach(button=>button.hidden=!section?.commands);
 $("#sources").hidden=!section?.commands;
 const showCategories=!!section&&(!!section.commands||Object.keys(model.categories).some(id=>id.startsWith(section.id+"/")));
 $("#categories").hidden=!showCategories;
 $(".sidebar>.category").hidden=!showCategories;
 $(".sidebar>.browse-shortcuts").hidden=!section?.commands;
 $("#section-links").hidden=showCategories;
 $("#section-links").querySelectorAll("button").forEach(button=>button.classList.toggle("active",button.dataset.section===model.section));
 categoryButtons();renderStats();
}
function categoryButtons() {
 const current=searchSection();
 const categories=Object.entries(model.categories).filter(([id])=>!current||id.startsWith(current+"/"));
 const nav=$("#categories");nav.replaceChildren();
 let select=$("#mobile-category");
 if(!select){
  const label=element("label","search-category","Categorie");select=element("select");select.id="mobile-category";label.append(select);$(".filters").prepend(label);
  select.addEventListener("change",()=>chooseCategory(select.value));
 }
 select.replaceChildren(new Option("Alle categorieën",""));
 for(const [id,name] of categories){
  const label=current?name.split(" · ").slice(1).join(" · "):name;
  const button=element("button","category",label);button.dataset.category=id;nav.append(button);
  select.append(new Option(label,id));
 }
 select.value=model.category;
 document.querySelectorAll(".category").forEach(button=>{
  button.classList.toggle("active",button.dataset.category===model.category);
  button.onclick=()=>chooseCategory(button.dataset.category);
 });
}
function showResults() { $(".workspace").classList.remove("overview-mode","reading"); }
function closeSidebar(){$("#sidebar").classList.remove("open");$("#sidebar-backdrop").hidden=true;$("#sidebar-toggle").setAttribute("aria-expanded","false");}
function chooseCategory(id) {
 model.category=id;model.limit=60;$("#mobile-category").value=id;
 document.querySelectorAll(".category").forEach(button=>button.classList.toggle("active",button.dataset.category===id));
 showResults();search();closeSidebar();
}
async function switchSection(id) {
 model.section=id;model.category="";$("#search").value="";$("#search-domain").value=id?"current":"all";
 updateContext();await resetFilters();await openDocument(sectionInfo()?.index||"README.md");closeSidebar();
}
function homeContent() {
 const wrapper=element("div","home-content");
 wrapper.append(element("p","home-intro","Je centrale naslagwerk voor cybersecurity. Kies een onderdeel om te bladeren, of zoek bovenaan door de hele kennisbank."));
 const grid=element("div","section-grid");
 for(const section of model.sections){
  const card=element("button","section-card");
  card.append(element("h2","",section.title),element("p","",section.description));
  card.append(element("span","section-meta",section.commands?section.worked+" uitgewerkt · "+section.count.toLocaleString("nl-NL")+" commando’s":"Basis ingericht · inhoud groeit tijdens de cursus"));
  card.addEventListener("click",()=>switchSection(section.id));grid.append(card);
 }
 wrapper.append(grid,element("p","home-note","Dit is de openbare leesversie. Persoonlijke notities en voortgang blijven in de private kennisbank."));
 return wrapper;
}
function selectedScopes() { return [...document.querySelectorAll("#search-scopes input:checked")].map(input=>input.value); }
function updateAdvancedLabel() {
 const scoped=selectedScopes().length!==Object.keys(model.search_scopes||{}).length;
 const count=Number(scoped)+Number(!!model.category)+["#command-type","#application-area","#status","#progress"].filter(id=>$(id).value).length;
 $("#advanced-toggle").textContent="Uitgebreid zoeken"+(count?" · "+count:"");
}
function setScopes(tasksOnly=false) {
 document.querySelectorAll("#search-scopes input").forEach(input=>input.checked=!tasksOnly||input.value==="tasks");
 model.limit=60;search();
}
async function search() {
 const request=++model.request;
 const scopes=selectedScopes();updateAdvancedLabel();
 const scopeValue=scopes.length===Object.keys(model.search_scopes||{}).length?"all":scopes.join(",")||"none";
 const params=new URLSearchParams({section:searchSection(),scopes:scopeValue,q:$("#search").value,category:model.category,command_type:$("#command-type").value,application_area:$("#application-area").value,status:$("#status").value,progress:$("#progress").value,limit:String(model.limit)});
 try {
  const data=await api("/api/search?"+params);
  if(request!==model.request)return;
  model.items=data.items;
  for(const item of data.items)model.entries.set(item.id,item);
  $("#result-count").textContent=scopes.length?data.total.toLocaleString("nl-NL")+(data.total===1?" resultaat":" resultaten"):"Kies minstens één zoekgebied";
  $("#result-count").title=(data.commands||0)+" commando’s · "+(data.tasks||0)+" taken · "+(data.documents||0)+" kennispagina’s";
  $("#show-results").textContent="Toon "+data.total.toLocaleString("nl-NL")+(data.total===1?" resultaat":" resultaten");
  $("#more").hidden=data.items.length>=data.total;
  renderResults();
 } catch(error) { if(request===model.request){$("#result-count").textContent="Zoeken niet gelukt";notify(error.message,true);} }
}
function renderResults() {
 const list=$("#results");list.replaceChildren();
 if(!model.items.length){const empty=element("div","empty-state");empty.append(element("h2","","Geen resultaten"),element("p","","Probeer een andere zoekterm of wis de filters."));list.append(empty);return;}
 for(const item of model.items) {
  const isTask=item.kind==="task";
  const isDocument=item.kind==="document";
  const selected=item.id===model.active&&(!isTask||item.anchor===(model.activeAnchor||""));
  const button=element("button","result"+(selected?" selected":""));button.dataset.id=item.id;
  button.setAttribute("aria-label",isTask?"Taak: "+item.task_title+" — "+item.name:item.name+" — "+item.description);
  const top=element("div","result-top");
  top.append(element("span",isTask?"task-name":"command-name",isTask?item.task_title:item.name),
   element("span","pill"+(isTask?" task":item.status==="Uitgewerkt"?" full":""),isTask?"Taak":item.status==="Geregistreerd"?"Catalogus":item.status==="Document"?"Kennispagina":item.status));
  button.append(top);
  if(isTask){
   button.append(element("code","task-command",item.command),element("p","task-source",item.name+(item.anchor?" · Naar voorbeeld":" · Naar commandopagina")));
  }else button.append(element("p","",clean(item.description)||"Open de entry voor de brondocumentatie."));
  button.append(element("span","result-domain",sectionInfo(item.section)?.title||item.section));
  if(item.seen&&item.status!=="Uitgewerkt"){const flags=element("div","result-flags");flags.append(element("span","","✓ Uitwerken"));button.append(flags);}
  button.addEventListener("click",()=>openDocument(item.id,item.anchor||""));list.append(button);
 }
}
function setSection(section, open=true) {
 const article=section.closest("article");
 if(open)article.querySelectorAll(".reader-section").forEach(other=>{if(other!==section)other.open=false;});
 section.open=open;
}
function revealAnchor(article, anchor) {
 // Keep old quick-choice links working after the heading rename.
 if(anchor==="snelle-keuze"&&!article.querySelector('[id="snelle-keuze"]'))anchor="overzicht";
 const target=article.querySelector('[id="'+CSS.escape(anchor)+'"]');
 if(!target)return;
 const section=target.closest(".reader-section");
 if(section)setSection(section);
 target.scrollIntoView({block:"start"});
}
function makeSections(article) {
 let section=null,body=null;
 for(const node of Array.from(article.children)){
  if(node.tagName==="H2"){
   section=element("details","reader-section");
   section.setAttribute("name","command-sections");
   const summary=element("summary");
   if(node.textContent.trim()==="Snelle keuze")node.textContent="Overzicht";
   node.before(section);summary.append(node);section.append(summary);
   body=element("div","section-body");section.append(body);
   summary.addEventListener("click",event=>{event.preventDefault();setSection(sectionFor(summary),!summary.parentElement.open);});
  }else if(body){body.append(node);}
 }
 const first=article.querySelector(".reader-section");
 if(first)setSection(first);
}
function sectionFor(summary) { return summary.parentElement; }
function slug(text) { return text.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu,"").replaceAll(" ","-"); }
async function openDocument(id,anchor="",updateHistory=true) {
 const request=++model.documentRequest;
 try {
  const data=await api("/api/document?"+new URLSearchParams({id}));
  if(request!==model.documentRequest)return;
  model.active=id;model.activeAnchor=anchor;model.doc=data;if(data.entry)model.entries.set(id,data.entry);
  const targetSection=model.sections.find(section=>id.startsWith(section.id+"/"));
  const nextSection=targetSection?.id||"";
  if(nextSection!==model.section){model.section=nextSection;model.category="";updateContext();search();}
  const overview=id==="README.md";
  $(".workspace").classList.toggle("overview-mode",overview);
  if(updateHistory)history.pushState({id,anchor},"","#"+new URLSearchParams(anchor?{doc:id,anchor}:{doc:id}));
  const detail=$("#detail");detail.replaceChildren();
  const back=element("button","mobile-back","← Zoekresultaten");back.addEventListener("click",()=>$(".workspace").classList.remove("reading"));detail.append(back);
  const top=element("header","document-top");
  const name=data.entry?data.entry.name:(data.markdown.split("\n")[0].replace(/^#+ /,""));
  top.append(element("div","eyebrow",data.entry?(model.categories[data.entry.category]||sectionInfo()?.title||"Kennisbank"):"Kennisbank"),element("h1","",name));
  if(data.entry){
   top.append(element("p","document-subtitle",clean(data.entry.description)));
   const classification=element("dl","classification");
   const fields=data.entry.kind==="command"
    ?[["Commandotype",data.entry.command_types],["Toepassingsgebied",data.entry.application_areas],["Omgeving",data.entry.environment?[data.entry.environment]:["Zie vereisten"]]]
    :(data.entry.category?[["Categorie",[(model.categories[data.entry.category]||"").split(" · ").slice(1).join(" · ")||"Niet geclassificeerd"]]]:[]);
   for(const [label,values] of fields){
    const full=(values||["Niet geclassificeerd"]).join(" · ");
    const short=shortLabel(full);
    const dd=element("dd","",short);if(short!==full)dd.title=full;
    const pair=element("div");pair.append(element("dt","",label),dd);classification.append(pair);
   }
   if(fields.length)top.append(classification);
   if(data.entry.status!=="Uitgewerkt"){
 
  }
  detail.append(top);
  if(id==="README.md"){
   top.querySelector("h1").textContent="Cybersecurity-kennisbank";
   detail.append(homeContent());$(".workspace").classList.add("reading");detail.scrollTop=0;renderResults();return;
  }
  const article=element("article","markdown");
  article.innerHTML=DOMPurify.sanitize(marked.parse(data.markdown,{gfm:true}),{USE_PROFILES:{html:true},FORBID_TAGS:["style","form"]});
  const slugs=new Map();
  article.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach(heading=>{
   const key=slug(heading.textContent);const count=slugs.get(key)||0;slugs.set(key,count+1);heading.id=key+(count?"-"+count:"");
  });
  if(data.entry){
   // Metadata is already in the reader header; the main progress controls are above it.
   let initial=true,skip=false;
   for(const node of Array.from(article.children)){
    if(node.tagName==="H2"){initial=false;skip=node.textContent.trim()==="Toegepast"||node.textContent.trim()==="Gebruiksstatus";}
    if(initial||skip)node.remove();
   }
  } else {const h1=article.querySelector("h1");if(h1)h1.remove();}
  article.querySelectorAll("table").forEach(table=>{
   const wrap=element("div","table-scroll");table.before(wrap);wrap.append(table);
   const headers=[...table.querySelectorAll("thead th")].map(th=>th.textContent.trim().toLowerCase());
   if(headers.length===3 && /wat wil ik doen|ik wil/.test(headers[0]) && /opdracht|commando/.test(headers[1])){
    wrap.classList.add("task-table-wrap");table.classList.add("task-table");table.setAttribute("role","table");
    table.querySelectorAll("thead,tbody").forEach(group=>group.setAttribute("role","rowgroup"));
    table.querySelectorAll("tr").forEach(row=>row.setAttribute("role","row"));
    table.querySelectorAll("th").forEach(th=>th.setAttribute("role","columnheader"));
    table.querySelectorAll("tbody tr").forEach(row=>{
     const cells=[...row.cells];cells.forEach(cell=>cell.setAttribute("role","cell"));
     if(cells.length!==3)return;
     const command=cells[1].textContent.trim(),button=element("button","task-copy","Kopieer opdracht");
     button.type="button";button.setAttribute("aria-label","Kopieer opdracht: "+command);
     button.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(command);button.textContent="Gekopieerd";setTimeout(()=>button.textContent="Kopieer opdracht",1600);}catch{notify("Kopiëren is niet beschikbaar. Selecteer de opdracht om deze te kopiëren.",true);}});
     cells[1].append(button);
    });
   }
  });
  article.querySelectorAll("pre").forEach(pre=>{
   const code=pre.querySelector("code");if(!code)return;
   const button=element("button","copy-button","Kopieer");button.setAttribute("aria-label","Kopieer dit voorbeeld");
   button.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(code.textContent);button.textContent="Gekopieerd";setTimeout(()=>button.textContent="Kopieer",1600);}catch{notify("Kopiëren is niet beschikbaar. Selecteer de opdracht en gebruik Ctrl+C.",true);}});
   pre.prepend(button);
  });
  if(data.entry && data.entry.status==="Uitgewerkt")makeSections(article);
  article.querySelectorAll("a[href]").forEach(link=>{
   const href=link.getAttribute("href");
   if(href.startsWith("#")){link.addEventListener("click",event=>{event.preventDefault();revealAnchor(article,decodeURIComponent(href.slice(1)));});return;}
   const url=new URL(href,location.origin+"/"+id);
   if(url.origin===location.origin&&url.pathname.endsWith(".md")){
    const targetId=decodeURIComponent(url.pathname.slice(1)), targetAnchor=decodeURIComponent(url.hash.slice(1));
    link.href="#"+new URLSearchParams(targetAnchor?{doc:targetId,anchor:targetAnchor}:{doc:targetId});
    link.addEventListener("click",event=>{event.preventDefault();openDocument(targetId,targetAnchor);});
   }else if(url.protocol==="https:"||url.protocol==="http:"){link.target="_blank";link.rel="noopener noreferrer";}
  });
  detail.append(article);$(".workspace").classList.add("reading");detail.scrollTop=0;renderResults();
  if(anchor)revealAnchor(article,anchor);
 } catch(error){notify(error.message,true);}
}
function resetFilters() {
 $("#command-type").value="";$("#application-area").value="";$("#status").value="";$("#progress").value="";model.category="";model.limit=60;
 $("#mobile-category").value="";
 document.querySelectorAll("#search-scopes input").forEach(input=>input.checked=true);
 document.querySelectorAll(".category").forEach(b=>b.classList.toggle("active",b.dataset.category===""));
 return search();
}
$("#search").addEventListener("input",()=>{showResults();clearTimeout(searchTimer);model.limit=60;searchTimer=setTimeout(search,160);});
$("#search").addEventListener("search",()=>$("#search").blur());
$("#search").addEventListener("keydown",event=>{if(event.key==="Enter")$("#search").blur();});
$("#status").addEventListener("change",()=>{model.limit=60;showResults();search();});
$("#progress").addEventListener("change",()=>{model.limit=60;showResults();search();});
for(const id of ["#command-type","#application-area"])$(id).addEventListener("change",()=>{model.limit=60;showResults();search();});
$("#reset").addEventListener("click",resetFilters);
$("#more").addEventListener("click",()=>{model.limit+=60;search();});
const advanced=$("#advanced-search");
$("#advanced-toggle").addEventListener("click",()=>{advanced.showModal();$("#advanced-toggle").setAttribute("aria-expanded","true");});
function closeAdvanced(){advanced.close();$("#advanced-toggle").focus();}
$("#close-advanced").addEventListener("click",closeAdvanced);
$("#show-results").addEventListener("click",()=>{closeAdvanced();showResults();});
advanced.addEventListener("close",()=>$("#advanced-toggle").setAttribute("aria-expanded","false"));
advanced.addEventListener("click",event=>{if(event.target===advanced){const rect=advanced.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeAdvanced();}});
$("#scope-all").addEventListener("click",()=>setScopes(false));
$("#scope-tasks").addEventListener("click",()=>setScopes(true));
$("#reset-advanced").addEventListener("click",resetFilters);

document.querySelectorAll("[data-browse]").forEach(button=>button.addEventListener("click",()=>{
 const root=sectionInfo()?.commands;if(root)openDocument(root+(button.dataset.browse==="tasks"?"/tasks.md":"/README.md"));
}));
$("#sources").addEventListener("click",()=>{const root=sectionInfo()?.commands;if(root)openDocument(root+"/sources.md");});
$("#home").addEventListener("click",()=>switchSection(""));
$(".brand").addEventListener("click",event=>{event.preventDefault();switchSection("");});
$("#section-switch").addEventListener("change",event=>switchSection(event.target.value));
$("#sidebar-toggle").addEventListener("click",()=>{const open=$("#sidebar").classList.toggle("open");$("#sidebar-backdrop").hidden=!open;$("#sidebar-toggle").setAttribute("aria-expanded",String(open));});
$("#sidebar-backdrop").addEventListener("click",closeSidebar);
$("#search-domain").addEventListener("change",()=>{model.category="";model.limit=60;updateContext();showResults();search();});
document.addEventListener("keydown",event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();$("#search").focus();$("#search").select();}});
window.addEventListener("popstate",()=>{const params=new URLSearchParams(location.hash.slice(1));openDocument(params.get("doc")||"README.md",params.get("anchor")||"",false);});
async function init() {
 try {
  const data=await api("/api/bootstrap");Object.assign(model,data);
  for(const [id,values] of [["#command-type",data.command_types],["#application-area",data.application_areas]])
   for(const value of values)$(id).append(new Option(value,value));
  for(const [value,label] of Object.entries(data.search_scopes)){
   const wrap=element("label","scope-choice");const input=document.createElement("input");input.type="checkbox";input.value=value;input.checked=true;
   input.addEventListener("change",()=>{model.limit=60;showResults();search();});wrap.append(input,document.createTextNode(label));$("#search-scopes").append(wrap);
  }
  for(const section of data.sections){
   $("#section-switch").append(new Option(section.title,section.id));
   const button=element("button","section-link",section.title);button.dataset.section=section.id;
   button.addEventListener("click",()=>switchSection(section.id));$("#section-links").append(button);
  }
  const id=new URLSearchParams(location.hash.slice(1)).get("doc")||"README.md";
  model.section=data.sections.find(section=>id.startsWith(section.id+"/"))?.id||"";
  $("#search-domain").value=model.section?"current":"all";
  updateContext();await search();
  await openDocument(id,new URLSearchParams(location.hash.slice(1)).get("anchor")||"",false);
  // Optional agent access uses the same search controls as the visible interface.
  if(document.modelContext?.registerTool){
   try{await document.modelContext.registerTool({name:"search_knowledge_bank",title:"Kennisbank doorzoeken",description:"Zoek in de lokale kennisbank en toon dezelfde resultaten als het zoekveld.",inputSchema:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false},annotations:{readOnlyHint:true},execute:async(input)=>{if(typeof input?.query!=="string")throw Error("query moet tekst zijn");$("#search").value=input.query;await search();return model.items.slice(0,20).map(({id,name,status,kind,anchor,task_title})=>({id,name,status,kind,anchor,task_title}));}});}catch{/* Optional browser capability; the visible interface remains available. */}
  }
 } catch(error) {$("#result-count").textContent="Niet bereikbaar";$("#detail").replaceChildren(element("div","empty-state","De kennisbank kon niet laden. Vernieuw de pagina en controleer je internetverbinding."));notify(error.message,true);}
}
init();




// PUBLISHED ON DATE START
(async function checkPublishedOn(){
 const label=$("#published-on");
 try{
  const response=await fetch("./published.json",{cache:"no-store"});
  if(!response.ok)throw new Error();
  const data=await response.json();
  label.textContent="Laatst gepubliceerd op "+data.published_at;
  label.hidden=false;
 }catch{label.hidden=true;}
})();
// PUBLISHED ON DATE END
