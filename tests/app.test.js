const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
let fails=0;const ok=(c,m)=>{if(c)console.log('  ok  '+m);else{fails++;console.log('  FAIL '+m)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// mock GitHub
function mockGH(){const st={files:{},blobs:{},repoExists:true,branches:['main'],forceStatus:null,puts:0,gets:0,offline:false,big:false};
  const fetch=async(url,opt={})=>{const u=new URL(url);const m=opt.method||'GET';const res=(s,j,etag)=>({status:s,ok:s>=200&&s<300,json:async()=>j,headers:{get:h=>h.toLowerCase()==='etag'?etag||null:null}});
    if(st.offline)throw new TypeError('Failed to fetch');
    if(st.forceStatus){return res(st.forceStatus,{message:'forced'})}
    const parts=u.pathname.split('/');// /repos/o/r/...
    if(!st.repoExists)return res(404,{message:'Not Found'});
    const rest=parts.slice(4).join('/');
    if(rest==='')return res(200,{});
    if(rest.startsWith('git/blobs/')){const b=st.blobs[decodeURIComponent(parts[6])];return b?res(200,{content:b,encoding:'base64'}):res(404,{message:'Not Found'})}
    if(rest.startsWith('branches')){const b=decodeURIComponent(parts[5]||'');if(!b)return res(200,st.branches.map(n=>({name:n})));return st.branches.includes(b)?res(200,{}):res(404,{message:'Branch not found'})}
    if(rest.startsWith('contents/')){const path=decodeURIComponent(rest.slice(9));const ref=u.searchParams.get('ref')||JSON.parse(opt.body||'{}').branch;
      if(!st.branches.includes(ref))return res(404,{message:'No commit found for the ref'});
      if(m==='GET'){st.gets++;const f=st.files[path];const inm=(opt.headers||{})['If-None-Match'];if(f&&inm==='"'+f.sha+'"'){st.notModified=(st.notModified||0)+1;return res(304,null)}return f?res(200,{sha:f.sha,content:st.big?'':f.content,encoding:st.big?'none':'base64'},'"'+f.sha+'"'):res(404,{message:'Not Found'})}
      if(m==='PUT'){const b=JSON.parse(opt.body);const f=st.files[path];if(f&&b.sha!==f.sha)return res(409,{message:'sha mismatch'});if(!f&&b.sha)return res(422,{message:'sha given for new file'});st.puts++;const sha='s'+st.puts;st.files[path]={sha,content:b.content};st.blobs[sha]=b.content;return res(f?200:201,{content:{sha}})}}
    return res(500,{});};
  return {st,fetch};}

async function boot(gh,storage){
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://example-user.github.io/pdc/',pretendToBeVisual:true,beforeParse(w){
    if(storage)Object.entries(storage).forEach(([k,v])=>w.localStorage.setItem(k,v));
    w.TextEncoder=require('util').TextEncoder;w.TextDecoder=require('util').TextDecoder;w.print=()=>{w.__printed=w.document.getElementById('print').innerHTML};
    if(gh)w.fetch=gh.fetch;
    w.HTMLCanvasElement.prototype.getContext=()=>({scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},drawImage(){}});
    w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){w.__downloads=(w.__downloads||[]).concat(this.download)};
    w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=function(){};
  }});
  await sleep(20);return dom;}
const click=(w,sel)=>{const e=w.document.querySelector(sel);if(!e)throw new Error('no '+sel);e.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))};
const type=(w,sel,val)=>{const e=w.document.querySelector(sel);if(!e)throw new Error('no '+sel);e.value=val;e.dispatchEvent(new w.Event('input',{bubbles:true}));e.dispatchEvent(new w.Event('change',{bubbles:true}))};

(async()=>{
  console.log('Board & seed');
  let dom=await boot();let w=dom.window,d=w.document,P=w.__pdc;
  ok(d.querySelectorAll('.vcard').length===3,'three example visits on today’s board');
  console.log('Complete example (Maple)');
  {const mv=P.data.visits.find(v=>(P.data.patients.find(p=>p.id===v.patientId)||{}).name==='Maple'),mp=P.data.patients.find(p=>p.id===mv.patientId);
   const miss=['checkin','auth','exam','anes','dental','discharge'].map(s=>P.missing(mv,mp,s).length);
   ok(miss.every(n=>n===0)&&['checkin','auth','exam','anes','dental','discharge'].every(s=>mv.done[s]),'every step is filled in and complete');
   ok(mv.auth.signature.startsWith('data:image/png;base64,')&&mv.discharge.rx.length===2&&mv.discharge.rx.every(r=>r.printed)&&P.extractions(mv).join()==='204,208','signature, printed labels and extractions');
   let errs=[];for(const s of ['checkin','auth','exam','anes','dental','discharge']){try{P.go('visit',mv.id,s)}catch(e){errs.push(s+': '+e.message)}}ok(!errs.length,'all steps render: '+errs.join('; '));
   const card=[...d.querySelectorAll('.vcard')];P.go('visits');ok([...d.querySelectorAll('.vcard')].some(c=>/Maple/.test(c.textContent)),'Maple is on the board');}
  console.log('Removing and adding the examples back');
  P.go('settings');click(w,'[data-act="remove-samples"]');click(w,'[data-act="modal-ok"]');
  ok(!P.data.visits.some(v=>v.sample)&&!P.data.patients.some(p=>p.sample),'examples removed');
  P.go('settings');click(w,'[data-act="add-samples"]');
  ok(P.data.visits.filter(v=>v.sample).length===3&&P.ui.view==='visits'&&d.querySelectorAll('.vcard').length===3,'Add example patients brings all three back on today’s board');
  P.go('visits');
  ok(d.querySelector('.banner')&&/Example visits/.test(d.querySelector('.banner').textContent),'example banner shown');
  const errs=[];w.addEventListener('error',e=>errs.push(e.message));

  console.log('Visit steps render for each species');
  const biscuit=P.data.visits.find(v=>P.data.patients.find(p=>p.id===v.patientId).name==='Biscuit');
  for(const sp of ['Dog','Cat','Ferret','Other']){P.data.patients.find(p=>p.id===biscuit.patientId).species=sp;
    for(const s of ['checkin','auth','exam','anes','dental','discharge']){try{P.go('visit',biscuit.id,s);}catch(e){errs.push(sp+'/'+s+': '+e.message)}}
  }
  ok(errs.length===0,'all steps render for Dog/Cat/Ferret/Other'+(errs.length?' '+errs.join('; '):''));
  P.data.patients.find(p=>p.id===biscuit.patientId).species='Dog';

  console.log('Dose math');
  P.go('visit',biscuit.id,'anes');
  const c0=d.getElementById('calc-premed-0').textContent,c1=d.getElementById('calc-premed-1').textContent;
  ok(/0\.354 mL/.test(c0)&&/3\.54 mg/.test(c0),'butorphanol 0.3 mg/kg × 11.8 kg = 0.354 mL ('+c0+')');
  ok(/0\.071 mL/.test(c1)&&/35\.4 mcg/.test(c1),'dexmed 3 mcg/kg × 11.8 kg = 0.071 mL ('+c1+')');
  type(w,'#f_v_anes_premed_0_dose','0.2');ok(/0\.236 mL/.test(d.getElementById('calc-premed-0').textContent),'live recalculation on typing');

  console.log('Monitoring flags');
  ok(P.flag('etco2','47',{species:'Dog'})==='warn','EtCO2 47 warn');ok(P.flag('spo2','89',{})==='crit','SpO2 89 crit');
  ok(P.mapOf('96/50/64')===64&&P.flag('bp','96/50/64',{})==='warn','MAP 64 warn');ok(P.flag('bp','110/60',{})==='','110/60 derived MAP 77 ok');
  ok(P.flag('hr','90',{species:'Cat'})==='warn'&&P.flag('hr','75',{species:'Cat'})==='crit','cat HR 90 warn, 75 crit');
  ok(d.querySelector('td.warn input[data-k="v.anes.grid.vals.etco2.3"]'),'grid cell tinted in DOM');
  type(w,'input[data-k="v.anes.grid.vals.spo2.4"]','88');ok(d.querySelector('input[data-k="v.anes.grid.vals.spo2.4"]').parentElement.className==='crit','cell flag updates live');
  click(w,'[data-act="fill-times"]');ok(biscuit.anes.grid.cols[4].time==='08:58','fill times from Iso on (col 5 = 08:58)');
  click(w,'[data-act="add-cols"]');ok(biscuit.anes.grid.cols.length===15,'+15 min adds 3 columns');

  console.log('Autosave and revisions');
  await sleep(350);const r0=P.data.sync.rev;P.saveNow();ok(P.data.sync.rev===r0,'rev unchanged when nothing changed');
  type(w,'#f_v_anes_etSize','7.5');await sleep(350);ok(P.data.sync.rev===r0+1,'rev +1 after an edit');
  ok(JSON.parse(w.localStorage.getItem('pdc-data-v1')).visits.find(v=>v.id===biscuit.id).anes.etSize==='7.5','edit persisted to storage');

  console.log('Dental chart');
  P.go('visit',biscuit.id,'dental');
  ok(d.querySelectorAll('.arch .tooth').length===42,'canine chart has 42 teeth');
  click(w,'.arch [data-t="204"]');click(w,'[data-act="code"][data-code="M2"]');click(w,'[data-act="code"][data-code="M3"]');
  ok(biscuit.dental.teeth['204'].codes.M3===true&&!biscuit.dental.teeth['204'].codes.M2,'mobility grades are exclusive');
  click(w,'[data-act="t-ext"]');ok(P.extractions(biscuit).join()==='108,204','extractions list 108, 204');
  ok(!d.querySelector('#teditor input[inputmode]'),'measurements need no keyboard');
  click(w,'[data-act="mm-val"][data-val="5"]');ok(biscuit.dental.teeth['204'].codes.P==='5'&&/P5/.test(d.querySelector('[data-act="mm-key"][data-code="P"]').textContent),'tapping 5 records P5');
  click(w,'[data-act="mm-key"][data-code="GR"]');click(w,'[data-act="mm-val"][data-val="3"]');ok(biscuit.dental.teeth['204'].codes.GR==='3'&&biscuit.dental.teeth['204'].codes.P==='5','pick GR, tap 3: recession 3 mm, pocket kept');
  click(w,'[data-act="mm-val"][data-val="3"]');ok(biscuit.dental.teeth['204'].codes.GR===undefined,'tapping the same number again clears it');
  click(w,'[data-act="mm-key"][data-code="P"]');click(w,'[data-act="mm-next"]');ok(P.ui.mmNext===true,'next-tooth option on');
  click(w,'[data-act="mm-val"][data-val="4"]');ok(biscuit.dental.teeth['204'].codes.P==='4'&&P.ui.tooth===205,'with it on, a pocket depth moves to the next tooth (204 → 205)');
  click(w,'[data-act="mm-next"]');click(w,'[data-act="mm-val"][data-val="2"]');ok(biscuit.dental.teeth['205'].codes.P==='2'&&P.ui.tooth===205,'with it off, the panel stays on the tooth');
  click(w,'[data-act="mm-val"][data-val=""]');ok(!biscuit.dental.teeth['205'],'⌫ clears; an empty tooth is not kept');
  click(w,'.arch [data-t="105"]');click(w,'[data-act="p-site"][data-site="M"]');click(w,'[data-act="mm-val"][data-val="4"]');
  click(w,'[data-act="p-site"][data-site="L"]');click(w,'[data-act="mm-val"][data-val="6"]');
  const t105=biscuit.dental.teeth['105'];
  ok(t105.pockets.M==='4'&&t105.pockets.L==='6'&&t105.codes.P===undefined&&P.ui.tooth===105,'pockets by site; a site entry stays on the tooth');
  ok(/Pal/.test(d.querySelector('[data-act="p-site"][data-site="L"]').textContent)&&/P4\(M\) P6\(Pal\)/.test(d.querySelector('.ftable').textContent)&&/P6/.test(d.querySelector('.arch [data-t="105"] .mk').textContent),'upper teeth say palatal; list shows each site; chart shows the deepest');
  click(w,'[data-act="mm-val"][data-val="6"]');click(w,'[data-act="p-site"][data-site="M"]');click(w,'[data-act="mm-val"][data-val=""]');ok(!biscuit.dental.teeth['105'],'clearing every site removes the tooth');
  click(w,'.arch [data-t="405"]');click(w,'[data-act="p-site"][data-site="L"]');ok(/^L/.test(d.querySelector('[data-act="p-site"][data-site="L"]').textContent.trim()),'lower teeth say lingual');
  ok(/^V/.test(d.querySelector('[data-act="p-site"][data-site="B"]').textContent.trim())&&/Vestibular/.test(d.querySelector('[data-act="p-site"][data-site="B"]').title),'buccal site is labelled V (vestibular), as AVDC prefers');
  click(w,'[data-act="p-site"][data-site=""]');
  click(w,'.arch [data-t="204"]');
  ok(d.querySelector('[data-act="dview"][data-view="oral"]').getAttribute('aria-selected')==='true'&&d.querySelector('.mmpad')&&!d.querySelector('[data-act="code"][data-code="PD3"]')&&!d.querySelector('#f_v_dental_stage_0')&&d.querySelector('#f_v_dental_gi_0'),'oral exam view: measurements, GI/CI, no radiograph codes');
  click(w,'[data-act="dview"][data-view="rad"]');
  ok(P.ui.dview==='rad'&&!d.querySelector('.mmpad')&&!d.querySelector('[data-act="code"][data-code="M2"]')&&d.querySelector('[data-act="code"][data-code="PD3"]')&&d.querySelector('#f_v_dental_stage_0')&&!d.querySelector('#f_v_dental_gi_0'),'radiographs view: stage, bone, roots and resorption only');
  ok(/Oral exam:.*P4.*M3/.test(d.querySelector('#teditor').textContent),'radiographs view shows the tooth’s oral exam findings for context');
  click(w,'[data-act="code"][data-code="PD3"]');click(w,'[data-act="code"][data-code="PD4"]');click(w,'[data-act="code"][data-code="VBL"]');
  click(w,'[data-act="code"][data-code="TR4"]');click(w,'[data-act="code"][data-code="TR5"]');ok(biscuit.dental.teeth['204'].codes.TR5===true&&!biscuit.dental.teeth['204'].codes.TR4,'resorption stages go to TR5, one per tooth');click(w,'[data-act="code"][data-code="TR5"]');
  ok(biscuit.dental.teeth['204'].codes.PD4===true&&!biscuit.dental.teeth['204'].codes.PD3&&biscuit.dental.teeth['204'].codes.VBL===true,'radiograph findings: one periodontal stage per tooth, plus bone loss');
  ok(!d.querySelector('[data-k="v.dental.rads"]'),'no radiographs-taken question (always full-mouth)');click(w,'#f_v_dental_stage_3');ok(biscuit.dental.stage==='PD3','overall periodontal stage');
  ok(/PD4/.test(d.querySelector('.arch [data-t="204"]').title)&&/M3/.test(d.querySelector('.arch [data-t="204"]').title),'a tooth’s tooltip lists both oral and radiograph findings');
  click(w,'.arch [data-t="309"]');click(w,'[data-act="code"][data-code="PD2"]');click(w,'[data-act="t-clear"]');
  ok(biscuit.dental.teeth['309']&&!biscuit.dental.teeth['309'].codes.PD2&&biscuit.dental.teeth['309'].codes.P!==undefined,'clearing in the radiographs view keeps the oral exam findings');
  click(w,'[data-act="dview"][data-view="oral"]');click(w,'.arch [data-t="304"]');ok(!d.querySelector('[data-act="om-pos"]'),'no mass location until OM is chosen');
  click(w,'[data-act="code"][data-code="OM"]');click(w,'[data-act="om-pos"][data-pos="R"]');
  ok(biscuit.dental.teeth['304'].omPos==='R'&&/OM\(rostral\)/.test(d.querySelector('.ftable').textContent),'oral mass rostral to 304');
  click(w,'[data-act="om-pos"][data-pos="C"]');click(w,'[data-act="print"][data-sec="dental"]');ok(/OM\(caudal\)/.test(w.__printed),'caudal location prints on the chart');
  click(w,'[data-act="code"][data-code="OM"]');ok(!biscuit.dental.teeth['304'],'removing OM removes its location');
  click(w,'[data-act="dview"][data-view="rad"]');
  console.log('Treatment (procedures per tooth)');
  click(w,'[data-act="dview"][data-view="tx"]');click(w,'.arch [data-t="106"]');
  ok(!d.querySelector('.mmpad')&&!d.querySelector('[data-act="code"][data-code="PD3"]')&&d.querySelector('[data-act="tx"][data-code="XSS"]'),'treatment view shows procedures only');
  click(w,'[data-act="tx"][data-code="XS"]');let t106=biscuit.dental.teeth['106'];ok(t106.tx.XS&&t106.ext===true&&P.extractions(biscuit).includes(106),'choosing an extraction method marks the tooth extracted');
  click(w,'[data-act="tx"][data-code="XSS"]');ok(t106.tx.XSS&&!t106.tx.XS,'one extraction method per tooth');
  click(w,'[data-act="tx"][data-code="ALV"]');
  click(w,'.arch [data-t="309"]');click(w,'[data-act="tx"][data-code="RP/C"]');
  ok(/^Open extraction \(XSS\): 106\. Closed root planing \(RP\/C\): 309\. Alveolectomy \/ alveoloplasty \(ALV\): 106\.$/.test(d.getElementById('procSum').textContent),'procedure summary fills in, grouped by procedure');
  ok(/XSS/.test(d.querySelector('.arch [data-t="106"] .mk').textContent),'chart shows the extraction method');
  click(w,'[data-act="print"][data-sec="dental"]');ok(/Open extraction \(XSS\): 106/.test(w.__printed),'printed chart carries the procedures in the Extractions box');
  click(w,'.arch [data-t="106"]');click(w,'[data-act="tx"][data-code="XSS"]');t106=biscuit.dental.teeth['106'];ok(t106&&t106.ext===false&&t106.tx.ALV,'un-choosing the method un-marks the extraction');
  click(w,'[data-act="t-clear"]');ok(!biscuit.dental.teeth['106'],'clear treatment removes it');
  click(w,'.arch [data-t="309"]');click(w,'[data-act="t-clear"]');ok(biscuit.dental.teeth['309']&&!biscuit.dental.teeth['309'].tx&&biscuit.dental.teeth['309'].codes.P!==undefined,'clearing treatment keeps the exam findings');
  click(w,'[data-act="dview"][data-view="oral"]');ok(P.ui.dview==='oral','back to the oral exam view');
  ok(![...d.querySelectorAll('.arch .mk')].some(m=>/^(PD|HBL|VBL)/.test(m.textContent))&&!/PD4/.test(d.querySelector('.ftable').textContent),'oral exam view hides radiograph findings on the chart and list');
  ok(P.dischargeType(biscuit)==='extractions','discharge sheet switches to extractions');
  P.data.patients.find(p=>p.id===biscuit.patientId).species='Cat';P.go('visit',biscuit.id,'dental');ok(d.querySelectorAll('.arch .tooth').length===30,'feline chart has 30 teeth');
  P.data.patients.find(p=>p.id===biscuit.patientId).species='Ferret';P.go('visit',biscuit.id,'dental');ok(d.querySelectorAll('.arch .tooth').length===34,'ferret chart has 34 teeth');
  ok(P.toothName(409)==='Right mandibular 1st molar'&&P.toothName(108)==='Right maxillary 4th premolar','tooth names');
  P.data.patients.find(p=>p.id===biscuit.patientId).species='Dog';

  console.log('Vitals entry sheet');
  P.data.patients.find(p=>p.id===biscuit.patientId).species='Dog';
  P.go('visit',biscuit.id,'anes');
  const g=biscuit.anes.grid;let last=-1;g.cols.forEach((c,i)=>{if(Object.values(g.vals).some(a=>a[i]))last=i});
  click(w,'[data-act="vitals"]');
  ok(d.querySelector('.modal.wide #vt_hr'),'vitals sheet opens');
  ok(d.getElementById('vt_iso').value===String(g.vals.iso[last]??"")&&d.getElementById('vt_hr').value==='','iso carries over, HR blank');
  type(w,'#vt_spo2','91');ok(d.getElementById('vw_spo2').className.includes('warn'),'sheet flags SpO2 91 live');
  type(w,'#vt_hr','80');d.getElementById('vt_time').value='09:10';
  click(w,'[data-act="save-vitals"]');
  ok(g.vals.hr[last+1]==='80'&&g.vals.spo2[last+1]==='91'&&g.cols[last+1].time==='09:10','reading saved to next column');
  ok(!d.querySelector('.modal'),'sheet closes');

  console.log('Tooth sheet close');
  P.go('visit',biscuit.id,'dental');click(w,'.arch [data-t="105"]');ok(d.body.classList.contains('sheet-open'),'sheet-open when a tooth is selected');
  click(w,'[data-act="tooth-close"]');ok(!d.body.classList.contains('sheet-open')&&P.ui.tooth===null,'Done closes the sheet');

  console.log('Completion & workflow');
  P.go('visit',biscuit.id,'discharge');
  ok(P.missing(biscuit,P.data.patients.find(p=>p.id===biscuit.patientId),'discharge').length===8,'discharge lists 6 checklist items + DVM + tech');
  click(w,'#f_v_discharge_check_sheet');ok(biscuit.discharge.check.sheet===true,'checklist checkbox saves');
  click(w,'[data-act="complete"]');ok(biscuit.done.discharge&&biscuit.discharge.time,'complete discharge stamps time');

  console.log('Printing');
  P.go('visit',biscuit.id,'auth');click(w,'[data-act="print"][data-sec="all"]');
  const pr=w.__printed||'';ok(pr.includes('Treatment Notes')&&pr.includes('Surgery Time')&&pr.includes('Canine Dental Chart')&&pr.includes('Dental with Extractions')&&pr.includes('CPR Directive'),'full visit print has all sections');
  ok((pr.match(/class="pp[" ]/g)||[]).length===7,'seven printed pages (anesthesia is treatment sheet + monitoring form)');

  console.log('Paper-form layouts');
  const pd=new w.DOMParser().parseFromString('<div>'+pr+'</div>','text/html');
  const chart=[...pd.querySelectorAll('svg.paper')].find(s=>s.textContent.includes('Canine Dental Chart'));
  ok(chart&&chart.getAttribute('viewBox').split(' ').length===4&&/data:image\/jpeg;base64,/.test(chart.innerHTML)&&!chart.innerHTML.includes('{LOGO}'),'dental chart is the original drawing with the logo filled in');
  const fvs=[...chart.querySelectorAll('text.fv')].map(t=>t.textContent);
  ok(fvs.includes('Biscuit')&&fvs.some(t=>/11\.8 kg/.test(t))&&fvs.some(t=>/^EXT · T\/FX\/CCF · Pulp exposure$/.test(t))&&fvs.some(t=>t==='P6 F2 M1'),'chart fills name, weight and tooth rows');
  ok(chart.querySelectorAll('ellipse').length===2,'gingivitis and calculus index circled');
  const mon=[...pd.querySelectorAll('svg.paper')].find(s=>s.textContent.includes('Surgery Time'));
  ok(mon&&mon.querySelector('g[transform*="rotate(-90)"]')&&/5 min   08 : 38/.test(mon.textContent),'monitoring form prints sideways with column times');
  ok([...mon.querySelectorAll('text.fv')].some(t=>t.textContent==='112/64/80'),'monitoring values in the grid');
  const ts=[...pd.querySelectorAll('svg.paper')].find(s=>s.textContent.includes('+TIME'));
  const tv=[...ts.querySelectorAll('text.fv')].map(t=>t.textContent);
  ok(ts&&ts.querySelectorAll('ellipse').length===7,'treatment sheet circles 7 choices (SDD, IM, Adequate, 22g, R Ceph, nails Yes, WITH)');
  ok(tv.some(x=>/^\d\.\d+ mL$/.test(x))&&tv.includes('0.071 mL')&&tv.includes('08:05')&&tv.includes('Biscuit'),'treatment sheet fills premed volumes, times and name');
  const bv=P.data.visits.find(x=>x.id===biscuit.id);const gridBak=JSON.stringify(bv.anes.grid);bv.anes.grid.cols.push(...Array.from({length:12},()=>({time:''})));bv.anes.grid.vals.hr[26]='90';
  click(w,'[data-act="print"][data-sec="all"]');ok((w.__printed.match(/Surgery Time/g)||[]).length===2,'more than two hours continues on a second monitoring sheet');
  bv.anes.grid=JSON.parse(gridBak);

  console.log('Word forms as paper layouts');
  const pg=t=>[...pd.querySelectorAll('svg.paper')].find(s=>s.textContent.includes(t));
  const vals=sv=>[...sv.querySelectorAll('text.fv')].map(t=>t.textContent);
  const np=pg('New Patient Form');ok(np&&vals(np).includes('Sample')&&vals(np).includes('100 Example St')&&vals(np).includes('555')&&vals(np).includes('010-0101'),'new patient form fills owner, address and phone (area code in the brackets)');
  ok(np.querySelectorAll('path').length===4,'new patient form ticks Dog, Male, neutered and vaccines');
  const au=pg('Same-Day Dental Cleaning Authorization');ok(au&&vals(au).filter(x=>x==='X').length===5&&vals(au).includes('19:30')&&vals(au).includes('500'),'authorization marks the chosen blanks, last meal and estimate');
  ok(au.querySelectorAll('rect[fill="#ffff00"]').length===13,'authorization keeps its yellow highlights');
  const exs=pg('Patient Exam Sheet');ok(exs&&vals(exs).includes('MN')&&vals(exs).includes('100.8')&&vals(exs).includes('Pink')&&vals(exs).includes('moist'),'exam sheet fills vitals, sex and mucous membranes');
  ok(exs.querySelectorAll('image').length===3,'exam sheet keeps the logo and body diagrams');
  const dsp=pg('Your veterinarian today was');ok(dsp&&dsp.textContent.includes('Dental with Extractions')&&!dsp.textContent.includes('(Routine Dental)'),'discharge prints the with-extractions sheet');

  console.log('Body map (masses)');
  {const bv=P.data.visits.find(x=>x.id===biscuit.id),bpat=P.data.patients.find(p=>p.id===bv.patientId);
   P.go('visit',biscuit.id,'exam');let map=d.querySelector('svg.bmap');
   ok(map&&map.dataset.map==='dog'&&/data:image\/jpeg/.test(map.innerHTML)&&!d.querySelector('.bmrow'),'dog exam shows the exam-sheet dog figures with no marks yet');
   const tap=(fx,fy)=>{const m=d.querySelector('svg.bmap');m.getBoundingClientRect=()=>({left:0,top:0,width:370,height:290});m.dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:fx*370,clientY:fy*290}))};
   tap(0.25,0.5);const ms=bv.exam.masses||[];
   ok(ms.length===1&&ms[0].map==='dog'&&Math.abs(ms[0].x-46.3)<0.2&&ms[0].y>70&&ms[0].y<80&&d.querySelectorAll('.bm-mk').length===1,'tapping the map adds a numbered mark where tapped');
   ok(d.activeElement&&d.activeElement.id==='f_v_exam_masses_0_note','the new mark’s description field gets focus');
   type(w,'#f_v_exam_masses_0_note','2 cm soft SQ');ok(ms[0].note==='2 cm soft SQ','mass description saves');
   tap(0.26,0.51);ok(ms.length===1,'tapping an existing mark selects it instead of adding another');
   tap(0.8,0.4);ok(ms.length===2&&d.querySelectorAll('.bmrow').length===2&&/dorsal/.test(d.querySelectorAll('.bmrow')[1].textContent),'a second mark on the dorsal side');
   click(w,'[data-act="print"][data-sec="exam"]');const ed=new w.DOMParser().parseFromString('<div>'+w.__printed+'</div>','text/html');
   ok(ed.querySelectorAll('svg.paper circle[r="6.5"]').length===2&&/Masses: 1 ventral – 2 cm soft SQ · 2 dorsal/.test(ed.body.textContent),'exam printout rings each mass on the dog figure and lists them under C/S');
   bpat.species='Ferret';P.go('visit',biscuit.id,'exam');map=d.querySelector('svg.bmap');
   ok(map&&map.dataset.map==='ferret'&&/FERRET/.test(map.textContent)&&!d.querySelector('.bm-mk')&&/on the dog map/.test(d.querySelector('.bmrow').textContent),'ferrets get a ferret map; dog marks stay listed');
   tap(0.3,0.5);click(w,'[data-act="print"][data-sec="exam"]');const fd=new w.DOMParser().parseFromString('<div>'+w.__printed+'</div>','text/html');
   ok(/FERRET/.test(fd.body.textContent)&&fd.querySelectorAll('svg.paper circle[r="6.5"]').length===1,'ferret printout draws the ferret figure with its mark');
   bpat.species='Cat';P.go('visit',biscuit.id,'exam');ok(d.querySelector('svg.bmap').dataset.map==='cat','cats get the cat figures');
   bpat.species='Other';P.go('visit',biscuit.id,'exam');ok(!d.querySelector('svg.bmap')&&/dogs, cats and ferrets/.test(d.querySelector('main').textContent),'other species: no map, just a note');
   bpat.species='Dog';P.go('visit',biscuit.id,'exam');
   while((bv.exam.masses||[]).length)click(w,'[data-act="mass-del"]');ok(bv.exam.masses===undefined&&!d.querySelector('.bmrow'),'marks can be removed');}

  console.log('Printing waits for pictures');
  {const pend=[];w.Image.prototype.decode=function(){return new Promise(r=>pend.push(r))};w.__printed='';
   click(w,'[data-act="print"][data-sec="exam"]');ok(!w.__printed&&d.getElementById('print').classList.contains('prep'),'print waits while the diagrams decode');
   pend.forEach(r=>r());await sleep(120);ok(/Patient Exam Sheet/.test(w.__printed),'then prints');
   w.dispatchEvent(new w.Event('afterprint'));ok(!d.getElementById('print').classList.contains('prep')&&!d.getElementById('print').innerHTML,'print area cleared after printing');
   delete w.Image.prototype.decode;}

  console.log('Printing from the Home Screen app (share sheet)');
  {P.printViaShare=true;w.__printed='';click(w,'[data-act="print"][data-sec="exam"]');
   ok(!w.__printed&&/Preparing the printout/.test(d.getElementById('modalRoot').textContent),'the Home Screen app makes a PDF instead of calling print (a no-op there)');
   await sleep(50);click(w,'[data-act="close-modal"]');P.printViaShare=false;
   ok(!d.getElementById('print').innerHTML&&!d.getElementById('print').classList.contains('prep'),'print area cleared afterwards');
   const blob=P.buildPDF([{w:612,h:792,pw:2,ph:3,jpg:new Uint8Array([255,216,255,217])},{w:252,h:81,pw:2,ph:1,jpg:new Uint8Array([255,216,255,217])}]);
   const txt=await new Promise(r=>{const fr=new w.FileReader();fr.onload=()=>r(Buffer.from(fr.result).toString('latin1'));fr.readAsArrayBuffer(blob)});const sx=+txt.match(/startxref\n(\d+)/)[1];
   const offs=[...txt.slice(sx).matchAll(/(\d{10}) 00000 n/g)].map(m=>+m[1]);
   ok(txt.startsWith('%PDF-1.4')&&/\/Count 2/.test(txt)&&txt.slice(sx,sx+4)==='xref'&&offs.length===8&&offs.every((o,i)=>txt.startsWith((i+1)+' 0 obj',o)),'PDF has two pages, the right page sizes and a valid cross-reference table');
   ok(/MediaBox \[0 0 612 792\]/.test(txt)&&/MediaBox \[0 0 252 81\]/.test(txt),'letter pages and 3.5 × 1.125 in label pages');}

  console.log('Medication labels');
  const bp=P.data.patients.find(p=>p.id===biscuit.patientId);
  await sleep(350);let r1=P.data.sync.rev;P.go('visit',biscuit.id,'discharge');P.go('settings');P.go('visit',biscuit.id,'discharge');P.saveNow();
  ok(P.data.sync.rev===r1&&P.data.settings.formulary===undefined,'viewing discharge and settings stores nothing (starter formulary stays built-in)');
  ok(P.formulary().length===40,'starter formulary has 40 drugs');
  click(w,'[data-act="rx-add"]');const rx=()=>P.rxList(biscuit)[0];
  ok(P.rxList(biscuit).length===1&&rx().discard===P.addMonthsISO(biscuit.date,12)&&rx().refills==='0','add medication: discard date 12 months out, 0 refills');
  type(w,'.rxfind','Carprofen 75 mg tablet');
  ok(rx().drug==='Carprofen'&&rx().strength==='75 mg'&&rx().form==='tablet'&&rx().qtyUnit==='tablets','formulary pick fills drug, strength, form and unit');
  ok(P.missing(biscuit,bp,'discharge').includes('Directions for Carprofen'),'missing lists directions for the drug');
  d.getElementById('sb-dur-0').value='10';click(w,'[data-act="rx-sig"]');
  ok(rx().sig==='Give 1 tablet by mouth every 12 hours for 10 days.','directions builder writes the sig');
  ok(d.getElementById(d.querySelector('[data-k="v.discharge.rx.0.sig"]').id).value===rx().sig,'directions box shows the sig');
  ok(P.buildSig('2','tablet','by mouth','once daily','1')==='Give 2 tablets by mouth once daily for 1 day.','sig plural and singular day');
  click(w,'input[data-k="v.discharge.rx.0.c.food"]');ok(rx().c.food===true,'caution chip saves');
  const prev=d.getElementById('rxs-0').textContent;
  ok(/Biscuit/.test(prev)&&/Canine/.test(prev)&&/Owner: Sample, Owner/.test(prev)&&/Give with food/.test(prev)&&/Keep out of reach of children/.test(prev)&&/Carprofen 75 mg tablet/.test(prev),'label preview shows patient, species, owner, drug and cautions');
  type(w,'[data-k="v.discharge.rx.0.qty"]','20');ok(/Qty 20 tablets/.test(d.getElementById('rxs-0').textContent),'preview updates as you type');
  biscuit.dvm='';w.__printed='';click(w,'[data-act="rx-print"]');
  ok(!w.__printed&&/veterinarian/.test((d.querySelector('.toast')||{}).textContent),'printing needs the veterinarian');
  type(w,'#f_v_dvm','Dr. Example');click(w,'[data-act="rx-copies"][data-d="1"]');ok(rx().copies==='2','copies +1');
  click(w,'[data-act="rx-print-all"]');
  ok((w.__printed.match(/class="rxl"/g)||[]).length===2&&w.__printed.includes('Dr. Example')&&!w.__printed.includes('class="ph"'),'prints 2 copies with the vet and no placeholders');
  ok([...d.querySelectorAll('style')].some(s=>s.textContent.includes('size:3.5in 1.125in')),'label page size set for printing');
  ok(!!rx().printed&&!P.missing(biscuit,bp,'discharge').some(x=>/Carprofen/.test(x)),'printed stamp clears the missing item');
  ok(/Take-home medications/.test(d.querySelector('.doc').innerHTML)&&/Carprofen 75 mg tablet/.test(d.querySelector('.doc').textContent),'owner sheet lists the medication');
  w.dispatchEvent(new w.Event('afterprint'));ok(![...d.querySelectorAll('style')].some(s=>s.textContent.includes('3.5in 1.125in')),'page size reset after printing');
  const sel=d.querySelector('select[data-k="v.discharge.rx.0.schedule"]');sel.value='C-IV';sel.dispatchEvent(new w.Event('change',{bubbles:true}));
  ok(/Federal law prohibits/.test(d.getElementById('rxs-0').textContent)&&!d.getElementById('rxcs-0').hidden,'controlled drug adds the federal caution and a warning');
  P.go('visit',biscuit.id,'discharge');click(w,'[data-act="print"][data-sec="discharge"]');ok(/Carprofen/.test(w.__printed)&&![...d.querySelectorAll('style')].some(s=>s.textContent.includes('size:3.5in')),'discharge form prints on normal pages with the medication');

  console.log('Label settings & formulary');
  P.go('settings');type(w,'[data-k="s.labels.practice"]','Example Clinic');type(w,'[data-k="s.labels.mLeft"]','0.2');
  ok(P.lblSet().practice==='Example Clinic'&&P.lblSet().mLeft===0.2&&P.lblSet().mTop===0.06,'label settings save, blanks use defaults');
  ok(/Example Clinic/.test(P.labelHTML(biscuit,bp,rx(),false)),'label uses the practice name');
  click(w,'[data-k="s.labels.kids"][value="off"]');ok(!/out of reach/.test(P.labelHTML(biscuit,bp,rx(),false)),'children caution can be turned off');
  ok(!d.querySelector('.fmrow')&&/Show list/.test(d.querySelector('[data-act="fm-toggle"]').textContent)&&/40 drugs/.test(d.getElementById('fmPanel').textContent),'formulary starts collapsed, with its drug count');
  click(w,'[data-act="fm-toggle"]');ok(d.querySelectorAll('.fmrow').length===40&&JSON.parse(w.localStorage.getItem('pdc-ui-v1')).fmOpen===true,'Show list opens it and is remembered');
  type(w,'[data-k="s.formulary.0.sig"]','Give 1 tablet by mouth every 12 hours.');
  ok(Array.isArray(P.data.settings.formulary)&&P.data.settings.formulary.length===40&&P.data.settings.formulary[0].sig,'editing the formulary stores a copy');
  P.importFormularyCSV('name,strength,form,schedule,directions\nZoodrug,5 mg,tablet,civ,Give 1 daily.\nCarprofen,75 mg,tablet,,');
  ok(P.formulary().length===41&&P.formulary().find(x=>x.name==='Zoodrug').schedule==='C-IV','CSV import adds and normalizes schedule');
  type(w,'#rxfq','zoo');ok(d.querySelectorAll('.fmrow:not([hidden])').length===1,'formulary filter');
  click(w,'[data-act="fm-reset"]');click(w,'[data-act="modal-ok"]');ok(P.data.settings.formulary===undefined&&P.formulary().length===40,'restore starter list');
  click(w,'[data-act="fm-toggle"]');ok(!d.querySelector('.fmrow')&&JSON.parse(w.localStorage.getItem('pdc-ui-v1')).fmOpen===false,'Hide list collapses it again');

  console.log('New visit flow');
  P.go('visits');click(w,'[data-act="new-visit"]');click(w,'.modal [data-act="pick-patient"][data-id=""]');
  ok(P.ui.view==='visit'&&P.ui.step==='checkin'&&P.data.visits.length===4,'new patient visit opens on check-in');
  click(w,'#f_p_species_1');ok(d.querySelector('[data-k="p.species"]:checked').value==='Cat','species radio');
  type(w,'#f_p_name','Pickle');await sleep(80);d.getElementById('f_p_name').dispatchEvent(new w.FocusEvent('focusout',{bubbles:true}));await sleep(80);
  ok(d.querySelector('.summary h1').textContent==='Pickle','summary name updates after leaving the field');

  console.log('Signature pad draws and saves');
  P.go('visit',P.ui.id,'auth');ok(!!d.getElementById('sigpad'),'signature pad present');

  console.log('Sync (GitHub mock), merged field by field');
  const gh=mockGH();const cfgBase={owner:'example-user',repo:'private-data',branch:'main',path:'pdc/visits.json',backend:'github',baseRev:0,device:'Mac · a1',auto:false};
  const remote=()=>JSON.parse(Buffer.from(gh.st.files['pdc/visits.json'].content,'base64').toString());
  const toastOf=W=>(W.document.querySelector('.toast')||{}).textContent||'';
  dom=await boot(gh,{'pdc-sync-v1':JSON.stringify(cfgBase),'pdc-token-v1':'tok'});let A=dom.window,PA=A.__pdc;
  // make A's two example patients real clinic data
  {const maple=PA.data.patients.find(p=>p.name==='Maple');PA.data.patients=PA.data.patients.filter(p=>p!==maple);PA.data.visits=PA.data.visits.filter(v=>v.patientId!==maple.id)}
  PA.data.patients.forEach(p=>delete p.sample);PA.data.visits.forEach(v=>delete v.sample);PA.saveNow();
  await PA.syncNow({manual:true});ok(gh.st.puts===1&&remote().visits.length===2,'device A creates the shared file');
  let dB=await boot(gh,{'pdc-sync-v1':JSON.stringify(Object.assign({},cfgBase,{device:'iPad · b2'})),'pdc-token-v1':'tok'});let B=dB.window,PB=B.__pdc;
  await PB.syncNow({manual:true});
  ok(PB.data.visits.filter(v=>!v.sample).length===2&&PB.data.visits.filter(v=>v.sample).length===3,'device B gets the shared visits and keeps its own examples');
  ok(remote().visits.length===2&&gh.st.puts===1,'examples are never uploaded');
  const vid=PA.data.visits[0].id,vid2=PA.data.visits[1].id;
  const vA=id=>PA.data.visits.find(v=>v.id===id),vB=id=>PB.data.visits.find(v=>v.id===id);
  vA(vid).dvm='Dr. A';PA.saveNow();vB(vid2).tech='Tech B';PB.saveNow();
  await PA.syncNow({manual:true});await PB.syncNow({manual:true});await PA.syncNow({manual:true});
  ok(vA(vid).dvm==='Dr. A'&&vA(vid2).tech==='Tech B'&&vB(vid).dvm==='Dr. A'&&vB(vid2).tech==='Tech B','edits to different visits on two devices are both kept');
  vA(vid).anes.notes='Smooth induction';PA.saveNow();vB(vid).dental.notes='Heavy calculus';vB(vid).anes.grid.vals.hr[5]='90';PB.saveNow();
  await PA.syncNow({manual:true});await PB.syncNow({manual:true});await PA.syncNow({manual:true});
  ok(vA(vid).anes.notes==='Smooth induction'&&vA(vid).dental.notes==='Heavy calculus'&&vA(vid).anes.grid.vals.hr[5]==='90'&&vB(vid).anes.notes==='Smooth induction','different fields of the same visit on two devices are both kept');
  const rev0=remote().sync.rev,puts0=gh.st.puts;await PA.syncNow({manual:true});await PB.syncNow({manual:true});
  ok(gh.st.puts===puts0&&remote().sync.rev===rev0&&/Up to date/.test(toastOf(B)),'nothing changed: no upload, revision unchanged');
  ok((gh.st.notModified||0)>=2,'an unchanged file is not downloaded again (not-modified check)');
  vA(vid).exam.assessment='Stage 2 PD';PA.saveNow();await PA.syncNow({manual:true});
  vB(vid).exam.assessment='Stage 3 PD';PB.saveNow();await PB.syncNow({manual:true});
  ok(vB(vid).exam.assessment==='Stage 3 PD'&&remote().visits.find(v=>v.id===vid).exam.assessment==='Stage 3 PD','same field on both devices: the syncing device keeps its value');
  const cf=PB.loadConflicts();ok(cf.length===1&&cf[0].other==='Stage 2 PD'&&/exam › assessment/.test(cf[0].label)&&/two devices/.test(toastOf(B)),'the other value is listed for review');
  PB.go('settings');B.document.querySelector('[data-act="cf-use"]').dispatchEvent(new B.MouseEvent('click',{bubbles:true}));await PB.syncNow({manual:true});
  ok(vB(vid).exam.assessment==='Stage 2 PD'&&PB.loadConflicts().length===0&&remote().visits.find(v=>v.id===vid).exam.assessment==='Stage 2 PD','“Use other” switches to the other value and syncs it');
  await PA.syncNow({manual:true});
  PA.data.visits=PA.data.visits.filter(v=>v.id!==vid2);PA.saveNow();await PA.syncNow({manual:true});await PB.syncNow({manual:true});
  ok(!vB(vid2)&&remote().visits.length===1,'a visit deleted on one device is deleted on the other');
  // delete on A while B edits the same visit: the edit wins
  PA.data.visits=[];PA.saveNow();vB(vid).dvm='Dr. Keep';PB.saveNow();
  await PA.syncNow({manual:true});await PB.syncNow({manual:true});await PA.syncNow({manual:true});
  ok(vA(vid)&&vA(vid).dvm==='Dr. Keep'&&vB(vid),'deleted on one device but edited on the other: the visit is kept');
  // incoming changes wait while someone is typing
  PB.go('visit',vid,'exam');const inp=B.document.getElementById('f_v_exam_T');inp.focus();
  vA(vid).exam.P='120';PA.saveNow();await PA.syncNow({manual:true});await PB.syncNow({manual:true});
  ok(B.document.getElementById('f_v_exam_T')===inp&&vB(vid).exam.P==='120','an update arriving while typing does not redraw the screen');
  inp.blur();inp.dispatchEvent(new B.FocusEvent('focusout',{bubbles:true}));await sleep(200);
  ok(B.document.getElementById('f_v_exam_T')!==inp&&B.document.getElementById('f_v_exam_P').value==='120','it redraws after leaving the field');
  // settings sync too
  PA.data.settings.techs='Sam';PA.saveNow();await PA.syncNow({manual:true});await PB.syncNow({manual:true});ok(PB.data.settings.techs==='Sam','staff lists sync');
  // automatic: an edit syncs by itself a few seconds later
  PA.cfg.auto=true;const puts1=gh.st.puts;vA(vid).exam.R='30';PA.saveNow();await sleep(4600);
  ok(gh.st.puts===puts1+1&&remote().visits.find(v=>v.id===vid).exam.R==='30','with automatic sync on, an edit uploads by itself');
  PA.cfg.auto=false;
  // big file: GitHub omits the content, the app reads it as a blob
  gh.st.big=true;vA(vid).exam.R='32';PA.saveNow();await PA.syncNow({manual:true});gh.st.big=false;ok(remote().visits.find(v=>v.id===vid).exam.R==='32'&&!/problem/.test(A.document.getElementById('syncChip').textContent),'files over 1 MB still sync');
  // offline
  gh.st.offline=true;vA(vid).exam.R='33';PA.saveNow();await PA.syncNow({manual:true});ok(/Offline/.test(A.document.getElementById('syncChip').textContent),'offline shows on the chip and waits');
  gh.st.offline=false;await PA.syncNow({manual:true});ok(remote().visits.find(v=>v.id===vid).exam.R==='33','back online, the change uploads');
  // erase turns sync off on that device
  PB.go('settings');B.document.querySelector('[data-act="wipe"]').dispatchEvent(new B.MouseEvent('click',{bubbles:true}));B.document.querySelector('[data-act="modal-ok"]').dispatchEvent(new B.MouseEvent('click',{bubbles:true}));
  ok(PB.cfg.auto===false&&PB.data.visits.length===0&&remote().visits.length===1,'erasing a device turns its sync off and leaves GitHub alone');
  // errors
  gh.st.forceStatus=401;await PB.syncNow({manual:true});ok(/rejected the token/.test(toastOf(B)),'401 message');
  gh.st.forceStatus=null;gh.st.branches=['master'];await PB.syncNow({manual:true});ok(/Branch “main” doesn’t exist.*master/.test(toastOf(B)),'missing branch names real branches');
  gh.st.branches=['main'];gh.st.repoExists=false;await PB.syncNow({manual:true});ok(/Can’t see example-user\/private-data/.test(toastOf(B)),'missing repo explained');

  console.log(fails?`\n${fails} FAILED`:'\nAll passed');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
