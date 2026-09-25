const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
let fails=0;const ok=(c,m)=>{if(c)console.log('  ok  '+m);else{fails++;console.log('  FAIL '+m)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// mock GitHub
function mockGH(){const st={files:{},repoExists:true,branches:['main'],forceStatus:null,puts:0};
  const fetch=async(url,opt={})=>{const u=new URL(url);const m=opt.method||'GET';const res=(s,j)=>({status:s,ok:s>=200&&s<300,json:async()=>j,headers:{get:()=>null}});
    if(st.forceStatus){return res(st.forceStatus,{message:'forced'})}
    const parts=u.pathname.split('/');// /repos/o/r/...
    if(!st.repoExists)return res(404,{message:'Not Found'});
    const rest=parts.slice(4).join('/');
    if(rest==='')return res(200,{});
    if(rest.startsWith('branches')){const b=decodeURIComponent(parts[5]||'');if(!b)return res(200,st.branches.map(n=>({name:n})));return st.branches.includes(b)?res(200,{}):res(404,{message:'Branch not found'})}
    if(rest.startsWith('contents/')){const path=decodeURIComponent(rest.slice(9));const ref=u.searchParams.get('ref')||JSON.parse(opt.body||'{}').branch;
      if(!st.branches.includes(ref))return res(404,{message:'No commit found for the ref'});
      if(m==='GET'){const f=st.files[path];return f?res(200,{sha:f.sha,content:f.content}):res(404,{message:'Not Found'})}
      if(m==='PUT'){const b=JSON.parse(opt.body);const f=st.files[path];if(f&&b.sha!==f.sha)return res(409,{message:'sha mismatch'});if(!f&&b.sha)return res(422,{message:'sha given for new file'});st.puts++;st.files[path]={sha:'s'+st.puts,content:b.content};return res(f?200:201,{})}}
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
  ok(d.querySelectorAll('.vcard').length===2,'two example visits on today’s board');
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
  type(w,'input[data-k="v.dental.teeth.204.codes.P"]','5');ok(biscuit.dental.teeth['204'].codes.P==='5','pocket depth saved');
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
  const pr=w.__printed||'';ok(pr.includes('Anesthesia Record')&&pr.includes('Canine Dental Chart')&&pr.includes('Dental with Extractions')&&pr.includes('CPR Directive'),'full visit print has all sections');
  ok((pr.match(/class="pp"/g)||[]).length===6,'six printed pages');

  console.log('New visit flow');
  P.go('visits');click(w,'[data-act="new-visit"]');click(w,'.modal [data-act="pick-patient"][data-id=""]');
  ok(P.ui.view==='visit'&&P.ui.step==='checkin'&&P.data.visits.length===3,'new patient visit opens on check-in');
  click(w,'#f_p_species_1');ok(d.querySelector('[data-k="p.species"]:checked').value==='Cat','species radio');
  type(w,'#f_p_name','Pickle');await sleep(80);d.getElementById('f_p_name').dispatchEvent(new w.FocusEvent('focusout',{bubbles:true}));await sleep(80);
  ok(d.querySelector('.summary h1').textContent==='Pickle','summary name updates after leaving the field');

  console.log('Signature pad draws and saves');
  P.go('visit',P.ui.id,'auth');ok(!!d.getElementById('sigpad'),'signature pad present');

  console.log('Sync (GitHub mock)');
  const gh=mockGH();const cfgBase={owner:'example-user',repo:'private-data',branch:'main',path:'pdc/visits.json',backend:'github',baseRev:0,device:'Mac · a1'};
  dom=await boot(gh,{'pdc-sync-v1':JSON.stringify(cfgBase),'pdc-token-v1':'tok'});let A=dom.window;
  await A.__pdc.push();console.log('    toast:',(A.document.querySelector('.toast')||{}).textContent);ok(gh.st.puts===1,'device A first push creates the file');
  const snap={};for(let i=0;i<A.localStorage.length;i++){const k=A.localStorage.key(i);if(k!=='pdc-data-v1')snap[k]=A.localStorage.getItem(k)}
  let dB=await boot(gh,{'pdc-sync-v1':JSON.stringify(Object.assign({},cfgBase,{device:'iPad · b2'})),'pdc-token-v1':'tok'});let B=dB.window;
  // B has its own seeded data rev 0; pulling should adopt A's (remote rev > base 0, B not dirty)
  await B.__pdc.pull();ok(B.__pdc.data.visits.length===A.__pdc.data.visits.length&&B.__pdc.data.visits[0].id===A.__pdc.data.visits[0].id,'device B pull adopts GitHub copy');
  B.__pdc.data.visits[0].dvm='Dr. B';B.__pdc.saveNow();await B.__pdc.push();ok(gh.st.puts===2,'B pushes its edit');
  A.__pdc.data.visits[0].dvm='Dr. A';A.__pdc.saveNow();await A.__pdc.push();
  ok(A.document.querySelector('.modal')&&/Both copies changed/.test(A.document.querySelector('.modal').textContent),'A push after B edit raises conflict');
  ok(gh.st.puts===2,'conflict blocks the write');
  A.document.querySelector('[data-act="conflict"][data-keep="local"]').dispatchEvent(new A.MouseEvent('click',{bubbles:true}));await sleep(30);
  ok(gh.st.puts===3&&(A.__downloads||[]).some(n=>/github/.test(n)),'keep local: backup downloaded then pushed');
  await B.__pdc.pull();ok(B.__pdc.data.visits[0].dvm==='Dr. A','B pulls resolved copy');
  await B.__pdc.pull();ok(/up to date/.test(B.document.querySelector('.toast').textContent),'second pull says up to date');
  // errors
  gh.st.forceStatus=401;await B.__pdc.pull();ok(/rejected the token/.test(B.document.querySelector('.toast').textContent),'401 message');
  gh.st.forceStatus=409;B.__pdc.data.visits[0].dvm='x';B.__pdc.saveNow();await B.__pdc.push();ok(/changed on GitHub while saving|rejected|returned 409/.test(B.document.querySelector('.toast').textContent),'409 message: '+B.document.querySelector('.toast').textContent.slice(0,60));
  gh.st.forceStatus=null;gh.st.branches=['master'];await B.__pdc.pull();ok(/Branch “main” doesn’t exist.*master/.test(B.document.querySelector('.toast').textContent),'missing branch names real branches');
  gh.st.branches=['main'];gh.st.repoExists=false;await B.__pdc.pull();ok(/Can’t see example-user\/private-data/.test(B.document.querySelector('.toast').textContent),'missing repo explained');

  console.log(fails?`\n${fails} FAILED`:'\nAll passed');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
