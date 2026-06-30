// SAFC tracker — function definitions load immediately (global scope).

const DEFAULT = {
  month:'June',year:2026,workingDays:27,
  states:{
    'Maharashtra':{cities:{'Pune':{leads:100},'Solapur':{leads:200},'Ratnagiri':{leads:100},'Sindhudurg':{leads:100},'Raigad':{leads:100},'Buldhana':{leads:100},'Washim':{leads:100},'Yavatmal':{leads:100},'Wardha':{leads:100}}},
    'Karnataka':{cities:{'Bengaluru Urban':{leads:100},'Bengaluru Rural':{leads:100},'Mysuru':{leads:100},'Belagavi':{leads:100},'Dharwad':{leads:100},'Vijayapura':{leads:100},'Ballari':{leads:100},'Udupi':{leads:100},'Haveri':{leads:100},'Bagalkot':{leads:100}}},
    'Tamil Nadu':{cities:{'Chennai':{leads:100},'Dindigul':{leads:100},'Trichy':{leads:100},'Madurai':{leads:100},'Erode':{leads:100},'Namakkal':{leads:100}}},
    'AP & Telangana':{cities:{'Kurnool':{leads:100},'Rajahmundry':{leads:100},'Kakinada':{leads:100},'Nizamabad':{leads:100},'Satya Sai':{leads:100},'Ongole':{leads:100},'Bapatla':{leads:100},'Eluru':{leads:100},'Krishna':{leads:100},'Amalapuram':{leads:100}}},
    'Gujarat':{cities:{'Ahmedabad':{leads:100}}}
  }
};
let CFG = JSON.parse(JSON.stringify(DEFAULT));
let ENTRIES = [];
let indiaOpen = false;
let openStates = new Set();
let LOG = [];
// ---- Franchise managers: one manager owns a whole state ----
let MGRS={}; // city-level: { 'Karnataka||Hubli':'Ravi', 'Karnataka||Belagavi':'Mahesh', ... }
let MGRLIST=[]; // master list of franchise manager names, chosen per city via dropdown
function loadMgrs(){
  try{const m=store.getItem('safc_mgr4'); MGRS=m?JSON.parse(m):{};}catch(e){MGRS={};}
  try{const l=store.getItem('safc_mgrlist4'); MGRLIST=l?JSON.parse(l):[];}catch(e){MGRLIST=[];}
  // seed the list with any manager names already assigned to cities (so nothing is lost)
  Object.values(MGRS).forEach(n=>{ if(n && !MGRLIST.includes(n)) MGRLIST.push(n); });
}
function saveMgrs(){ store.setItem('safc_mgr4',JSON.stringify(MGRS)); }
function saveMgrList(){ store.setItem('safc_mgrlist4',JSON.stringify(MGRLIST)); }
function mgrKey(state,city){ return state+'||'+city; }
function getCityMgr(state,city){ return MGRS[mgrKey(state,city)]||''; }
function setCityMgr(state,city,name){ name=(name||'').trim(); const k=mgrKey(state,city); if(name) MGRS[k]=name; else delete MGRS[k]; saveMgrs(); logAction('Set franchise manager','Setup',`${city} (${state}) → ${name||'(cleared)'}`); }
function addMgrName(){
  const inp=document.getElementById('setup-newmgr'); const n=(inp.value||'').trim();
  if(!n){showToast('Enter a manager name','err');return;}
  if(MGRLIST.includes(n)){showToast('Already in the list','err');return;}
  askName(function(){ MGRLIST.push(n); saveMgrList(); logAction('Added franchise manager','Setup',n); inp.value=''; renderSetup(); showToast('Manager added'); });
}
function delMgrName(n){
  const uid=snapshot('mgrname',`Manager name: ${n}`);
  MGRLIST=MGRLIST.filter(x=>x!==n); saveMgrList();
  logAction('Removed franchise manager','Setup',n,uid);
  renderSetup(); toastUndo('Manager removed from list',uid);
}
function loadLog(){ try{const l=store.getItem('safc_log4'); if(l) LOG=JSON.parse(l);}catch(e){LOG=[];} }
function saveLog(){ try{ if(LOG.length>2000) LOG=LOG.slice(0,2000); store.setItem('safc_log4',JSON.stringify(LOG)); }catch(e){} }
function whoAmI(){ return (window._lastUser||store.getItem('safc_user4')||'').trim()||'Unknown'; }
function setUser(name){ if(name&&name.trim()){ window._lastUser=name.trim(); store.setItem('safc_user4',name.trim()); } }
function logAction(action,page,detail,undoId){
  LOG.unshift({ts:Date.now(),who:whoAmI(),action,page,detail,undoId:undoId||null});
  saveLog();
  if(document.getElementById('view-log')?.classList.contains('active')) renderLog();
}

// ===== Two-click delete confirmation =====
// First click: button shows "Sure?" and arms. Second click within 4s: runs fn. Auto-resets otherwise.
function confirmBtn(btn, fn){
  if(btn._armed){ clearTimeout(btn._armTimer); btn._armed=false; fn(); return; }
  btn._armed=true;
  btn._origHTML=btn.innerHTML; btn._origColor=btn.style.color;
  btn.innerHTML='Sure?'; btn.style.color='var(--red)'; btn.style.fontWeight='700';
  btn._armTimer=setTimeout(()=>{ if(btn&&btn._armed){ btn._armed=false; btn.innerHTML=btn._origHTML; btn.style.color=btn._origColor; btn.style.fontWeight=''; } },4000);
}

// ===== Undo system =====
// Each delete snapshots the affected localStorage key(s). Undo restores them.
const UNDO_KEYS={
  entry:['safc_e4'], city:['safc_c4'], state:['safc_c4'], isentry:['safc_bot4','safc_spend4'],
  franchise:['safc_fr4','safc_bot4','safc_spend4','safc_frtgt4'], hr:['safc_hr4'],
  module:['safc_modlist4','safc_mod4'], awareness:['safc_aw4'], cdmgr:['safc_cdmgr4'],
  cd:['safc_cd4'], mgrname:['safc_mgrlist4','safc_mgr4']
};
// Ensure the relevant localStorage keys reflect current in-memory state before snapshotting.
const SAVE_FOR_TYPE={
  entry:['saveE'], city:['saveCfg'], state:['saveCfg'], isentry:['saveBot'],
  franchise:['saveBot'], hr:['saveHr'], module:['saveMod'], awareness:['saveAw'],
  cdmgr:['saveCDMgrs'], cd:['saveCDstore'], mgrname:['saveMgrList','saveMgrs']
};
let UNDOSTACK={}; // undoId -> {keys:{k:val}, label, ts}
function snapshot(type,label){
  // persist current state so the snapshot captures the pre-delete data even on first change
  (SAVE_FOR_TYPE[type]||[]).forEach(fn=>{ if(typeof window[fn]==='function'){ try{window[fn]();}catch(e){} } });
  const keys=UNDO_KEYS[type]||[];
  const snap={}; keys.forEach(k=>{ snap[k]=store.getItem(k); });
  const id='u'+Date.now()+Math.floor(Math.random()*1000);
  UNDOSTACK[id]={keys:snap,label:label,ts:Date.now(),type:type};
  return id;
}
function performUndo(undoId){
  const u=UNDOSTACK[undoId]; if(!u){ showToast('Nothing to undo','err'); return; }
  Object.entries(u.keys).forEach(([k,v])=>{ if(v===null) store.removeItem(k); else store.setItem(k,v); });
  delete UNDOSTACK[undoId];
  // reload all data from the restored storage and re-render
  loadData(); if(typeof loadBot==='function')loadBot(); if(typeof loadHr==='function')loadHr(); if(typeof loadMod==='function')loadMod(); if(typeof loadAw==='function')loadAw(); if(typeof loadCD==='function')loadCD(); if(typeof loadMgrs==='function')loadMgrs();
  logAction('Undid deletion','Log',u.label);
  // refresh whichever views exist
  ['renderDash','renderEntry','renderVerify','renderSetup','renderIS','renderISDash','renderHR','renderHRDash','renderMod','renderMAODash','renderAw','renderCD','renderLog'].forEach(fn=>{ if(typeof window[fn]==='function'){ try{window[fn]();}catch(e){} } });
  showToast('Restored: '+u.label);
}
function toastUndo(msg,undoId){
  const t=document.getElementById('toast');
  t.innerHTML=`${msg} &nbsp;<span style="text-decoration:underline;cursor:pointer;font-weight:700;" onclick="performUndo('${undoId}');document.getElementById('toast').classList.remove('show');">UNDO</span>`;
  t.className='toast toast-ok show';
  clearTimeout(t._timer); t._timer=setTimeout(()=>t.classList.remove('show'),6000);
}
const INDIA={"Andhra Pradesh":["Anantapur","Annamayya","Bapatla","Chittoor","East Godavari","Eluru","Guntur","Kakinada","Konaseema","Krishna","Kurnool","Nandyal","NTR","Palnadu","Prakasam","Nellore","Sri Sathya Sai","Srikakulam","Tirupati","Visakhapatnam","Vizianagaram","West Godavari","Anakapalli"],"Arunachal Pradesh":["Tawang","West Kameng","East Kameng","Papum Pare","Lower Subansiri","Upper Subansiri","West Siang","East Siang","Lohit","Namsai","Changlang","Tirap","Longding"],"Assam":["Barpeta","Bongaigaon","Cachar","Darrang","Dhemaji","Dhubri","Dibrugarh","Goalpara","Golaghat","Hailakandi","Jorhat","Kamrup","Kamrup Metropolitan","Karimganj","Kokrajhar","Lakhimpur","Morigaon","Nagaon","Nalbari","Sivasagar","Sonitpur","Tinsukia","Udalguri"],"Bihar":["Araria","Arwal","Aurangabad","Banka","Begusarai","Bhagalpur","Bhojpur","Buxar","Darbhanga","East Champaran","Gaya","Gopalganj","Jamui","Jehanabad","Katihar","Khagaria","Kishanganj","Madhepura","Madhubani","Munger","Muzaffarpur","Nalanda","Nawada","Patna","Purnia","Rohtas","Saharsa","Samastipur","Saran","Sitamarhi","Siwan","Supaul","Vaishali","West Champaran"],"Chhattisgarh":["Balod","Baloda Bazar","Balrampur","Bastar","Bemetara","Bijapur","Bilaspur","Dantewada","Dhamtari","Durg","Gariaband","Janjgir-Champa","Jashpur","Kabirdham","Kanker","Kondagaon","Korba","Koriya","Mahasamund","Mungeli","Narayanpur","Raigarh","Raipur","Rajnandgaon","Sukma","Surajpur","Surguja"],"Goa":["North Goa","South Goa"],"Gujarat":["Ahmedabad","Amreli","Anand","Aravalli","Banaskantha","Bharuch","Bhavnagar","Botad","Chhota Udaipur","Dahod","Dang","Devbhoomi Dwarka","Gandhinagar","Gir Somnath","Jamnagar","Junagadh","Kheda","Kutch","Mahisagar","Mehsana","Morbi","Narmada","Navsari","Panchmahal","Patan","Porbandar","Rajkot","Sabarkantha","Surat","Surendranagar","Tapi","Vadodara","Valsad"],"Haryana":["Ambala","Bhiwani","Charkhi Dadri","Faridabad","Fatehabad","Gurugram","Hisar","Jhajjar","Jind","Kaithal","Karnal","Kurukshetra","Mahendragarh","Nuh","Palwal","Panchkula","Panipat","Rewari","Rohtak","Sirsa","Sonipat","Yamunanagar"],"Himachal Pradesh":["Bilaspur","Chamba","Hamirpur","Kangra","Kinnaur","Kullu","Lahaul and Spiti","Mandi","Shimla","Sirmaur","Solan","Una"],"Jharkhand":["Bokaro","Chatra","Deoghar","Dhanbad","Dumka","East Singhbhum","Garhwa","Giridih","Godda","Gumla","Hazaribagh","Jamtara","Khunti","Koderma","Latehar","Lohardaga","Pakur","Palamu","Ramgarh","Ranchi","Sahibganj","Seraikela Kharsawan","Simdega","West Singhbhum"],"Karnataka":["Bagalkot","Ballari","Belagavi","Bengaluru Rural","Bengaluru Urban","Bidar","Chamarajanagar","Chikkaballapur","Chikkamagaluru","Chitradurga","Dakshina Kannada","Davanagere","Dharwad","Gadag","Hassan","Haveri","Kalaburagi","Kodagu","Kolar","Koppal","Mandya","Mysuru","Raichur","Ramanagara","Shivamogga","Tumakuru","Udupi","Uttara Kannada","Vijayapura","Yadgir"],"Kerala":["Alappuzha","Ernakulam","Idukki","Kannur","Kasaragod","Kollam","Kottayam","Kozhikode","Malappuram","Palakkad","Pathanamthitta","Thiruvananthapuram","Thrissur","Wayanad"],"Madhya Pradesh":["Agar Malwa","Alirajpur","Anuppur","Ashoknagar","Balaghat","Barwani","Betul","Bhind","Bhopal","Burhanpur","Chhatarpur","Chhindwara","Damoh","Datia","Dewas","Dhar","Dindori","Guna","Gwalior","Harda","Indore","Jabalpur","Jhabua","Katni","Khandwa","Khargone","Mandla","Mandsaur","Morena","Narsinghpur","Neemuch","Panna","Raisen","Rajgarh","Ratlam","Rewa","Sagar","Satna","Sehore","Seoni","Shahdol","Shajapur","Sheopur","Shivpuri","Sidhi","Singrauli","Tikamgarh","Ujjain","Umaria","Vidisha"],"Maharashtra":["Ahmednagar","Akola","Amravati","Aurangabad","Beed","Bhandara","Buldhana","Chandrapur","Dhule","Gadchiroli","Gondia","Hingoli","Jalgaon","Jalna","Kolhapur","Latur","Mumbai City","Mumbai Suburban","Nagpur","Nanded","Nandurbar","Nashik","Osmanabad","Palghar","Parbhani","Pune","Raigad","Ratnagiri","Sangli","Satara","Sindhudurg","Solapur","Thane","Wardha","Washim","Yavatmal"],"Manipur":["Bishnupur","Chandel","Churachandpur","Imphal East","Imphal West","Jiribam","Kakching","Kamjong","Kangpokpi","Noney","Pherzawl","Senapati","Tamenglong","Tengnoupal","Thoubal","Ukhrul"],"Meghalaya":["East Garo Hills","East Jaintia Hills","East Khasi Hills","North Garo Hills","Ri Bhoi","South Garo Hills","South West Garo Hills","South West Khasi Hills","West Garo Hills","West Jaintia Hills","West Khasi Hills"],"Mizoram":["Aizawl","Champhai","Hnahthial","Khawzawl","Kolasib","Lawngtlai","Lunglei","Mamit","Saiha","Saitual","Serchhip"],"Nagaland":["Dimapur","Kiphire","Kohima","Longleng","Mokokchung","Mon","Peren","Phek","Tuensang","Wokha","Zunheboto"],"Odisha":["Angul","Balangir","Balasore","Bargarh","Bhadrak","Boudh","Cuttack","Deogarh","Dhenkanal","Gajapati","Ganjam","Jagatsinghpur","Jajpur","Jharsuguda","Kalahandi","Kandhamal","Kendrapara","Kendujhar","Khordha","Koraput","Malkangiri","Mayurbhanj","Nabarangpur","Nayagarh","Nuapada","Puri","Rayagada","Sambalpur","Subarnapur","Sundargarh"],"Punjab":["Amritsar","Barnala","Bathinda","Faridkot","Fatehgarh Sahib","Fazilka","Ferozepur","Gurdaspur","Hoshiarpur","Jalandhar","Kapurthala","Ludhiana","Mansa","Moga","Mohali","Muktsar","Pathankot","Patiala","Rupnagar","Sangrur","Shaheed Bhagat Singh Nagar","Tarn Taran"],"Rajasthan":["Ajmer","Alwar","Banswara","Baran","Barmer","Bharatpur","Bhilwara","Bikaner","Bundi","Chittorgarh","Churu","Dausa","Dholpur","Dungarpur","Hanumangarh","Jaipur","Jaisalmer","Jalore","Jhalawar","Jhunjhunu","Jodhpur","Karauli","Kota","Nagaur","Pali","Pratapgarh","Rajsamand","Sawai Madhopur","Sikar","Sirohi","Sri Ganganagar","Tonk","Udaipur"],"Sikkim":["East Sikkim","North Sikkim","South Sikkim","West Sikkim"],"Tamil Nadu":["Ariyalur","Chengalpattu","Chennai","Coimbatore","Cuddalore","Dharmapuri","Dindigul","Erode","Kallakurichi","Kanchipuram","Kanyakumari","Karur","Krishnagiri","Madurai","Mayiladuthurai","Nagapattinam","Namakkal","Nilgiris","Perambalur","Pudukkottai","Ramanathapuram","Ranipet","Salem","Sivaganga","Tenkasi","Thanjavur","Theni","Thoothukudi","Tiruchirappalli","Tirunelveli","Tirupathur","Tiruppur","Tiruvallur","Tiruvannamalai","Tiruvarur","Vellore","Viluppuram","Virudhunagar"],"Telangana":["Adilabad","Bhadradri Kothagudem","Hyderabad","Jagtial","Jangaon","Jayashankar Bhupalpally","Jogulamba Gadwal","Kamareddy","Karimnagar","Khammam","Komaram Bheem","Mahabubabad","Mahabubnagar","Mancherial","Medak","Medchal Malkajgiri","Mulugu","Nagarkurnool","Nalgonda","Narayanpet","Nirmal","Nizamabad","Peddapalli","Rajanna Sircilla","Ranga Reddy","Sangareddy","Siddipet","Suryapet","Vikarabad","Wanaparthy","Warangal","Hanamkonda","Yadadri Bhuvanagiri"],"Tripura":["Dhalai","Gomati","Khowai","North Tripura","Sepahijala","South Tripura","Unakoti","West Tripura"],"Uttar Pradesh":["Agra","Aligarh","Prayagraj","Ambedkar Nagar","Amethi","Amroha","Auraiya","Ayodhya","Azamgarh","Baghpat","Bahraich","Ballia","Balrampur","Banda","Barabanki","Bareilly","Basti","Bijnor","Budaun","Bulandshahr","Chandauli","Chitrakoot","Deoria","Etah","Etawah","Farrukhabad","Fatehpur","Firozabad","Gautam Buddha Nagar","Ghaziabad","Ghazipur","Gonda","Gorakhpur","Hamirpur","Hapur","Hardoi","Hathras","Jalaun","Jaunpur","Jhansi","Kannauj","Kanpur Dehat","Kanpur Nagar","Kasganj","Kaushambi","Kushinagar","Lakhimpur Kheri","Lalitpur","Lucknow","Maharajganj","Mahoba","Mainpuri","Mathura","Mau","Meerut","Mirzapur","Moradabad","Muzaffarnagar","Pilibhit","Pratapgarh","Rae Bareli","Rampur","Saharanpur","Sambhal","Sant Kabir Nagar","Shahjahanpur","Shamli","Shravasti","Siddharthnagar","Sitapur","Sonbhadra","Sultanpur","Unnao","Varanasi"],"Uttarakhand":["Almora","Bageshwar","Chamoli","Champawat","Dehradun","Haridwar","Nainital","Pauri Garhwal","Pithoragarh","Rudraprayag","Tehri Garhwal","Udham Singh Nagar","Uttarkashi"],"West Bengal":["Alipurduar","Bankura","Birbhum","Cooch Behar","Dakshin Dinajpur","Darjeeling","Hooghly","Howrah","Jalpaiguri","Jhargram","Kalimpong","Kolkata","Malda","Murshidabad","Nadia","North 24 Parganas","Paschim Bardhaman","Paschim Medinipur","Purba Bardhaman","Purba Medinipur","Purulia","South 24 Parganas","Uttar Dinajpur"],"Andaman and Nicobar Islands":["Nicobar","North and Middle Andaman","South Andaman"],"Chandigarh":["Chandigarh"],"Dadra and Nagar Haveli and Daman and Diu":["Dadra and Nagar Haveli","Daman","Diu"],"Delhi":["Central Delhi","East Delhi","New Delhi","North Delhi","North East Delhi","North West Delhi","Shahdara","South Delhi","South East Delhi","South West Delhi","West Delhi"],"Jammu and Kashmir":["Anantnag","Bandipora","Baramulla","Budgam","Doda","Ganderbal","Jammu","Kathua","Kishtwar","Kulgam","Kupwara","Poonch","Pulwama","Rajouri","Ramban","Reasi","Samba","Shopian","Srinagar","Udhampur"],"Ladakh":["Kargil","Leh"],"Lakshadweep":["Lakshadweep"],"Puducherry":["Karaikal","Mahe","Puducherry","Yanam"]};
function dInRange(dateStr){
  const mode=document.getElementById('f-mode')?.value||'all';
  const mo=parseInt(document.getElementById('f-month')?.value??5);
  const yr=parseInt(document.getElementById('f-year')?.value??2026);
  if(!dateStr) return false;
  const p=dateStr.split('-'); const dy=new Date(+p[0],+p[1]-1,+p[2]);
  if(mode==='day'){ const fd=document.getElementById('f-day')?.value; return fd?dateStr===fd:false; }
  if(mode==='range'){ const f=document.getElementById('f-from')?.value, t=document.getElementById('f-to')?.value; if(f&&dateStr<f) return false; if(t&&dateStr>t) return false; return true; }
  // all month
  return dy.getMonth()===mo && dy.getFullYear()===yr;
}
function onFilterMode(){
  const m=document.getElementById('f-mode').value;
  document.getElementById('fg-day').style.display=m==='day'?'':'none';
  document.getElementById('fg-from').style.display=m==='range'?'':'none';
  document.getElementById('fg-to').style.display=m==='range'?'':'none';
  renderDash(); renderISDash();
}
function resetFilter(){
  document.getElementById('f-mode').value='all';
  document.getElementById('f-day').value=''; document.getElementById('f-from').value=''; document.getElementById('f-to').value='';
  onFilterMode();
}
function filterLabel(){
  const m=document.getElementById('f-mode')?.value||'all';
  const moN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(document.getElementById('f-month')?.value??5)];
  const yr=document.getElementById('f-year')?.value||'2026';
  if(m==='day'){ const d=document.getElementById('f-day')?.value; return d?'Showing: '+d:'Pick a day'; }
  if(m==='range'){ const f=document.getElementById('f-from')?.value,t=document.getElementById('f-to')?.value; return 'Showing range: '+(f||'start')+' to '+(t||'end'); }
  return 'Showing: all of '+moN+' '+yr;
}
function loadData(){
  try{ const c=store.getItem('safc_c4'); if(c) CFG=JSON.parse(c); }catch(e){}
  try{ const e=store.getItem('safc_e4'); if(e){ ENTRIES=JSON.parse(e); return; } }catch(e){}
  ENTRIES=[];
  store.setItem('safc_e4', JSON.stringify(ENTRIES));
}
function saveE(){ store.setItem('safc_e4', JSON.stringify(ENTRIES)); }
function dayN(){ return new Date().getDate(); }
// Per-day target = monthly target / working days (flat daily number, from Setup's working-days value).
function dTgt(mTgt){ const wd=CFG.workingDays||25; return Math.round(mTgt/wd); }
// ---- Master/Unit classification (set per city in Setup) ----
function ftypeFilter(){ return document.getElementById('f-ftype')?.value || 'all'; }
function cityType(state,city){ return (CFG.states[state]?.cities[city]?.type)==='master' ? 'master' : 'unit'; }
function isTargeted(state,city){ return !!(CFG.states[state]&&CFG.states[state].cities[city]); }
function cityPasses(state,city){ const f=ftypeFilter(); if(f==='all') return true; if(!isTargeted(state,city)) return false; return cityType(state,city)===f; }
// Does this state have ANY city matching the current filter? (controls whether its rows show)
function statePasses(state){ const f=ftypeFilter(); if(f==='all') return true; return Object.keys(CFG.states[state]?.cities||{}).some(c=>cityType(state,c)===f); }
// ---- Dashboard counts only MIS-approved entries ----
// Agency enters (status 'pending') -> MIS approves on Verify -> only then counted here.
function isApproved(e){ return e.status==='approved'; }
// ---- Lead source filter (Meta / Google / Website / IVR / Manual) ----
function srcFilter(){ return document.getElementById('f-source')?.value || 'all'; }
function srcPasses(e){ const f=srcFilter(); if(f==='all') return true; return (e.source||'Manual')===f; }
// ---- Others include/exclude toggle (default exclude = clean targeted numbers) ----
// ---- Targeted / Non-targeted / Both filter (lead gen) ----
function othersMode(){ return document.getElementById('f-others')?.value || 'both'; }
function othersIncluded(){ return othersMode()!=='targeted'; } // back-compat: non-targeted visible unless 'targeted'
function statesToTotal(){
  const set=new Set(Object.keys(CFG.states));
  if(othersMode()!=='targeted'){ ENTRIES.filter(e=>isApproved(e)&&srcPasses(e)&&dInRange(e.date)).forEach(e=>set.add(e.state)); }
  return [...set];
}
function priTotals(state){
  const cities=Object.keys(CFG.states[state]?.cities||{}).filter(c=>cityPasses(state,c));
  const mode=othersMode();
  return ENTRIES.filter(e=>{
    if(!(isApproved(e)&&srcPasses(e)&&e.state===state&&dInRange(e.date))) return false;
    const isT=isTargeted(state,e.city) && cities.includes(e.city);
    if(mode==='targeted') return isT;
    if(mode==='nontargeted') return !isTargeted(state,e.city);
    return isTargeted(state,e.city)?cities.includes(e.city):true; // both
  }).reduce((a,e)=>({l:a.l+(e.leads||0),el:a.el+(e.eligible||0),mv:a.mv+(e.mv||0),s:a.s+(e.sales||0)}),{l:0,el:0,mv:0,s:0});
}
function totals(state, city){
  // When a specific city is requested (drilldown), return its raw totals (type filter doesn't apply to a single district).
  if(city){
    return ENTRIES.filter(e=>isApproved(e)&&srcPasses(e)&&e.state===state&&e.city===city&&dInRange(e.date))
      .reduce((a,e)=>({l:a.l+(e.leads||0),el:a.el+(e.eligible||0),mv:a.mv+(e.mv||0),s:a.s+(e.sales||0)}),{l:0,el:0,mv:0,s:0});
  }
  return ENTRIES.filter(e=>isApproved(e)&&srcPasses(e)&&(!state||e.state===state)&&dInRange(e.date)&&cityPasses(e.state,e.city))
    .reduce((a,e)=>({l:a.l+(e.leads||0),el:a.el+(e.eligible||0),mv:a.mv+(e.mv||0),s:a.s+(e.sales||0)}),{l:0,el:0,mv:0,s:0});
}
function otTotals(state){
  // Non-targeted districts: entries in this state whose city is NOT in the Setup targeted list.
  const targeted=Object.keys(CFG.states[state]?.cities||{});
  return ENTRIES.filter(e=>isApproved(e)&&srcPasses(e)&&e.state===state&&!targeted.includes(e.city)&&dInRange(e.date))
    .reduce((a,e)=>({l:a.l+(e.leads||0),el:a.el+(e.eligible||0),mv:a.mv+(e.mv||0),s:a.s+(e.sales||0)}),{l:0,el:0,mv:0,s:0});
}
function stateMTgt(state){ return Object.entries(CFG.states[state]?.cities||{}).filter(([c,cfg])=>cityPasses(state,c)).reduce((a,[c,cfg])=>a+(cfg.leads||0),0); }
function row(t, lTgt, level, label, onclick, cityClick){
  const mvTgt=Math.floor(t.l/20), salTgt=Math.floor(t.mv/5);
  const lDef=lTgt!==null?Math.max(0,lTgt-t.l):null;
  const mvDef=Math.max(0,mvTgt-t.mv), salDef=Math.max(0,salTgt-t.s);
  const ePct=t.l>0?Math.round(t.el/t.l*100)+'%':'-';
  const lCol=lDef===null?'c-grey':lDef===0?'c-ok':'c-bad';
  const mvAchCol=t.mv>=mvTgt&&mvTgt>0?'c-ok':t.mv>0?'c-burnt':'c-dim';
  const mvDefCol=mvDef===0?'c-ok':'c-bad';
  const salAchCol=t.s>=salTgt&&salTgt>0?'c-ok':t.s>0?'c-burnt':'c-dim';
  const salDefCol=salDef===0?'c-ok':'c-bad';
  const lAchCol=lTgt!==null&&t.l>=lTgt?'c-ok':t.l>0?'c-blue':'c-dim';
  const nm = level==='india'?'ind':level==='state'?'st':level==='city'?'ci':'ot';
  const rc = level==='india'?'r-india':level==='state'?'r-state':level==='city'?'r-city':'r-others';
  const oc = onclick?`onclick="${onclick}"`:'';
  const arr = (level==='india'||level==='state')?`<span class="arrow">&#9654;</span>`:'';
  const link = cityClick?`<span class="city-link">&#8599;</span>`:'';
  return `<div class="dr ${rc}" ${oc}>
    <div class="dc-name ${nm}">${arr}${label}${link}</div>
    <div class="dc bg-leads n-tgt">${lTgt!==null?lTgt:'-'}</div>
    <div class="dc bg-leads n-ach ${lAchCol}">${t.l}</div>
    <div class="dc bg-leads n-def ${lCol}">${lDef===null?'-':lDef===0?'\u2713':'-'+lDef}</div>
    <div class="dr-sep"></div>
    <div class="dc bg-elig n-ach c-teal">${t.el}</div>
    <div class="dc bg-elig n-tgt">${ePct}</div>
    <div class="dr-sep"></div>
    <div class="dc bg-mv n-tgt">${mvTgt}</div>
    <div class="dc bg-mv n-ach ${mvAchCol}">${t.mv}</div>
    <div class="dc bg-mv n-def ${mvDefCol}">${mvDef===0?'\u2713':'-'+mvDef}</div>
    <div class="dr-sep"></div>
    <div class="dc bg-sales n-tgt">${salTgt}</div>
    <div class="dc bg-sales n-ach ${salAchCol}">${t.s}</div>
    <div class="dc bg-sales n-def ${salDefCol}">${salDef===0?'\u2713':'-'+salDef}</div>
  </div>`;
}
function _dl(filename, text, mime){ const blob=new Blob([text],{type:mime||'text/plain'}); const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(u);},100); }
function _today(){ return new Date().toISOString().split('T')[0]; }
function dashTab(name, el){
  document.querySelectorAll('.dash-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.dash-subtab').forEach(t=>t.classList.remove('active'));
  const panel=document.querySelector('.dash-panel[data-panel="'+name+'"]'); if(panel) panel.classList.add('active');
  if(el&&el.classList) el.classList.add('active');
}
function exportCSV(){
  // Current lead-gen view (approved + active filters), one row per state→city.
  const rows=[['State','City','Type','Manager','Source filter','Leads','Eligible','Market Visits','Sales']];
  const srcLbl=srcFilter()==='all'?'All':srcFilter();
  Object.keys(CFG.states).forEach(st=>{
    if(!statePasses(st)) return;
    Object.keys(CFG.states[st].cities||{}).forEach(c=>{
      if(!cityPasses(st,c)) return;
      const t=totals(st,c);
      if(t.l||t.el||t.mv||t.s) rows.push([st,c,cityType(st,c),getCityMgr(st,c)||'',srcLbl,t.l,t.el,t.mv,t.s]);
    });
    const o=otTotals(st); if(o.l||o.el||o.mv||o.s) rows.push([st,'(non-targeted districts)','-','-',srcLbl,o.l,o.el,o.mv,o.s]);
  });
  const csv=rows.map(r=>r.map(v=>{ const s=String(v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }).join(',')).join('\n');
  _dl(`SAFC_leadgen_${_today()}.csv`, csv, 'text/csv');
  showToast('CSV downloaded');
}
function copySummary(){
  let iL=0,iEl=0,iMV=0,iS=0,iPTgt=0;
  statesToTotal().forEach(st=>{ iPTgt+=dTgt(stateMTgt(st)); const p=priTotals(st); iL+=p.l;iEl+=p.el;iMV+=p.mv;iS+=p.s; });
  const lines=[];
  lines.push(`*SAFC Lead Gen — ${filterLabel()}*`);
  lines.push(`Leads: ${iL}/${iPTgt} (day target)`);
  lines.push(`Eligible: ${iEl}${iL>0?' ('+Math.round(iEl/iL*100)+'%)':''}`);
  lines.push(`Market Visits: ${iMV}`);
  lines.push(`Sales Closed: ${iS}`);
  if(ftypeFilter()!=='all') lines.push(`Filter: ${ftypeFilter()} franchises`);
  if(srcFilter()!=='all') lines.push(`Source: ${srcFilter()}`);
  // per-manager line
  const byMgr={};
  Object.entries(CFG.states).forEach(([st,sc])=>Object.keys(sc.cities||{}).forEach(c=>{ const m=getCityMgr(st,c).trim(); if(!m||!cityPasses(st,c))return; const t=totals(st,c); if(!byMgr[m])byMgr[m]={l:0,s:0}; byMgr[m].l+=t.l; byMgr[m].s+=t.s; }));
  const mk=Object.keys(byMgr); if(mk.length){ lines.push(''); lines.push('*By manager:*'); mk.sort().forEach(m=>lines.push(`${m}: ${byMgr[m].l} leads, ${byMgr[m].s} sales`)); }
  const text=lines.join('\n');
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(()=>showToast('Summary copied — paste into WhatsApp')).catch(()=>{ _dl(`SAFC_summary_${_today()}.txt`,text); showToast('Summary downloaded'); }); }
  else { _dl(`SAFC_summary_${_today()}.txt`,text); showToast('Summary downloaded'); }
}
function backupData(){
  const keys=['safc_c4','safc_e4','safc_bot4','safc_spend4','safc_frtgt4','safc_fr4','safc_hr4','safc_modlist4','safc_mod4','safc_aw4','safc_log4','safc_cd4','safc_cdmgr4','safc_mgr4','safc_mgrlist4','safc_user4'];
  const dump={_app:'SAFC India Tracker',_backupDate:new Date().toISOString(),data:{}};
  keys.forEach(k=>{ const v=store.getItem(k); if(v!==null) dump.data[k]=v; });
  _dl(`SAFC_backup_${_today()}.json`, JSON.stringify(dump,null,2), 'application/json');
  showToast('Full backup downloaded');
}
function renderSettings(){
  const m=document.getElementById('set-month'); if(m) m.value=String(parseInt(store.getItem('safc_month')??(CFG.monthIdx??new Date().getMonth())));
  const y=document.getElementById('set-year'); if(y) y.value=String(CFG.year||new Date().getFullYear());
  const wd=document.getElementById('set-wd'); if(wd) wd.value=CFG.workingDays||25;
  // reflect actual month index if stored on CFG
  if(m && typeof CFG.monthIdx==='number') m.value=String(CFG.monthIdx);
}
function saveSettings(){
  const mi=parseInt(document.getElementById('set-month').value);
  const yr=parseInt(document.getElementById('set-year').value);
  const wd=Math.max(1,Math.min(31,parseInt(document.getElementById('set-wd').value)||25));
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  CFG.monthIdx=mi; CFG.month=months[mi]; CFG.year=yr; CFG.workingDays=wd;
  saveCfg();
  // keep the dashboard's month/year filter selectors in sync if present
  const fm=document.getElementById('f-month'); if(fm) fm.value=String(mi);
  const fy=document.getElementById('f-year'); if(fy) fy.value=String(yr);
  logAction('Updated settings','Settings',`${months[mi]} ${yr}, ${wd} working days`);
  showToast('Settings saved');
  renderDash();
}
function restoreData(ev){
  const file=ev.target.files&&ev.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(){
    try{
      const parsed=JSON.parse(reader.result);
      const data=parsed&&parsed.data?parsed.data:parsed;
      if(!data||typeof data!=='object'){ showToast('Not a valid backup file','err'); return; }
      const keys=['safc_c4','safc_e4','safc_bot4','safc_spend4','safc_frtgt4','safc_fr4','safc_hr4','safc_modlist4','safc_mod4','safc_aw4','safc_log4','safc_cd4','safc_cdmgr4','safc_mgr4','safc_mgrlist4','safc_user4'];
      let n=0; keys.forEach(k=>{ if(data[k]!==undefined&&data[k]!==null){ store.setItem(k,data[k]); n++; } });
      if(!n){ showToast('No tracker data found in file','err'); return; }
      showToast('Backup restored — reloading…');
      logAction('Restored from backup','Settings',`${n} data sets`);
      setTimeout(()=>location.reload(),700);
    }catch(e){ showToast('Could not read backup file','err'); }
  };
  reader.readAsText(file);
  ev.target.value='';
}
function resetAllData(){
  if(window._resetArmed){
    const keys=['safc_c4','safc_e4','safc_bot4','safc_spend4','safc_frtgt4','safc_fr4','safc_hr4','safc_modlist4','safc_mod4','safc_aw4','safc_log4','safc_cd4','safc_cdmgr4','safc_mgr4','safc_mgrlist4'];
    keys.forEach(k=>store.removeItem(k));
    showToast('All data reset — reloading…');
    setTimeout(()=>location.reload(),700);
  } else {
    window._resetArmed=true;
    showToast('Click "Reset all data" again to confirm','err');
    setTimeout(()=>{window._resetArmed=false;},4000);
  }
}
function renderDash(){
  const wd=CFG.workingDays||27, d=Math.min(dayN(),wd);
  document.getElementById('dayPill').textContent=`Day ${d} of ${wd} \u00b7 ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}`;
  document.getElementById('dash-sub').textContent=`${CFG.month} ${CFG.year} \u00b7 ${wd} working days \u00b7 Per-day target = Monthly / ${wd}`;
  const fl=document.getElementById('f-label'); if(fl) fl.textContent=filterLabel();
  let iPTgt=0, iL=0, iEl=0, iMV=0, iS=0;
  statesToTotal().forEach(st=>{
    iPTgt+=dTgt(stateMTgt(st));
    const p=priTotals(st); iL+=p.l; iEl+=p.el; iMV+=p.mv; iS+=p.s;
  });
  const iMVTgt=Math.floor(iL/20), iSTgt=Math.floor(iMV/5);
  const iLDef=Math.max(0,iPTgt-iL), iMVDef=Math.max(0,iMVTgt-iMV), isDef=Math.max(0,iSTgt-iS);
  // headline strip — calm, plain, approved-only top-line numbers
  const hs=document.getElementById('headline-strip');
  if(hs){
    const pct=iPTgt>0?Math.min(100,Math.round(iL/iPTgt*100)):0;
    const cell=(lbl,val,sub,col)=>`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px;"><div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:6px;">${lbl}</div><div style="font-size:30px;font-weight:700;color:${col};line-height:1;">${val}</div><div style="font-size:11px;color:var(--text2);margin-top:5px;">${sub}</div></div>`;
    hs.innerHTML=cell('Approved Leads',iL,'vs '+iPTgt+'/day target',(iLDef===0?'var(--sage)':'var(--blue)'))
      +cell('Eligible',iEl,(iL>0?Math.round(iEl/iL*100)+'% of leads':'—'),'var(--teal)')
      +cell('Market Visits',iMV,(iMVDef===0?'on track':iMVDef+' to target'),'var(--burnt)')
      +cell('Sales Closed',iS,(isDef===0?'on track':isDef+' to target'),'var(--sage)');
  }
  // ---- Today's entries vs missing (which active cities haven't been entered) ----
  const es=document.getElementById('entry-status');
  if(es){
    // the date we check: the selected specific day, else today (only meaningful for the current month/year)
    const mode=document.getElementById('f-mode')?.value||'all';
    let checkDate;
    if(mode==='day' && document.getElementById('f-day')?.value) checkDate=document.getElementById('f-day').value;
    else checkDate=new Date().toISOString().split('T')[0];
    // build list of active cities (respecting Master/Unit filter), then see which have an entry that date
    const active=[]; const missing=[];
    Object.keys(CFG.states).forEach(st=>{ if(!statePasses(st)) return; Object.keys(CFG.states[st].cities||{}).forEach(c=>{ if(!cityPasses(st,c)) return; active.push({st,c}); }); });
    active.forEach(({st,c})=>{ const has=ENTRIES.some(e=>e.state===st&&e.city===c&&e.date===checkDate); if(!has) missing.push(c+' ('+st+')'); });
    const done=active.length-missing.length;
    const allDone=missing.length===0 && active.length>0;
    const niceDate=new Date(checkDate+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'});
    es.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${allDone?'var(--sage)':'var(--burnt)'};border-radius:var(--radius);padding:14px 18px;">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);">Entries for ${niceDate}</div>
        <div style="font-size:14px;font-weight:600;color:${allDone?'var(--sage)':'var(--text)'};">${done} of ${active.length} cities entered${allDone?' ✓':''}</div>
        ${missing.length?`<div style="font-size:12px;color:var(--burnt);background:var(--burnt-dim);padding:3px 10px;border-radius:20px;">${missing.length} missing</div>`:''}
      </div>
      ${missing.length?`<div style="font-size:12px;color:var(--text2);margin-top:8px;line-height:1.6;"><span style="color:var(--text3);">Not yet entered:</span> ${missing.slice(0,12).join(' · ')}${missing.length>12?' · +'+(missing.length-12)+' more':''}</div>`:(active.length?'':'<div style="font-size:12px;color:var(--text3);margin-top:6px;">Add cities in Setup to track daily entry coverage.</div>')}
    </div>`;
  }
  // small progress bar helper for the scorecard
  const bar=(cur,tgt,col)=>{ const p=tgt>0?Math.min(100,Math.round(cur/tgt*100)):0; return `<div style="height:5px;background:var(--surface3);border-radius:3px;margin-top:10px;overflow:hidden;"><div style="height:100%;width:${p}%;background:${col};border-radius:3px;"></div></div>`; };
  document.getElementById('metric-row').innerHTML=`
    <div class="mc mc-leads">
      <div class="mc-lbl">Fresh Leads</div>
      <div class="mc-val">${iL}</div>
      <div class="mc-meta">Per-day target: ${iPTgt} \u00b7 Monthly: ${Object.keys(CFG.states).reduce((a,s)=>a+stateMTgt(s),0)}</div>
      ${bar(iL,iPTgt,'var(--blue)')}
      <span class="mc-status ${iLDef===0?'st-ok':iL/Math.max(iPTgt,1)>0.5?'st-warn':'st-bad'}" style="margin-top:8px;">${iLDef===0?'\u2713 On track':'-'+iLDef+' behind'}</span>
    </div>
    <div class="mc mc-elig">
      <div class="mc-lbl">Eligible &amp; Interested</div>
      <div class="mc-val">${iEl}</div>
      <div class="mc-meta">${iL>0?Math.round(iEl/iL*100)+'% of leads are eligible':'No leads yet'}</div>
      <span class="mc-status st-neutral">No target</span>
    </div>
    <div class="mc mc-mv">
      <div class="mc-lbl">Market Visits</div>
      <div class="mc-val">${iMV}</div>
      <div class="mc-meta">Needed: ${iMVTgt} &nbsp;(leads / 20)</div>
      ${bar(iMV,iMVTgt,'var(--burnt)')}
      <span class="mc-status ${iMVDef===0?'st-ok':iMV>0?'st-warn':'st-bad'}" style="margin-top:8px;">${iMVDef===0?'\u2713 On track':'-'+iMVDef+' behind'}</span>
    </div>
    <div class="mc mc-sales">
      <div class="mc-lbl">Sales Closed</div>
      <div class="mc-val">${iS}</div>
      <div class="mc-meta">Needed: ${iSTgt} &nbsp;(MV / 5)</div>
      ${bar(iS,iSTgt,'var(--sage)')}
      <span class="mc-status ${isDef===0?'st-ok':iS>0?'st-warn':'st-bad'}" style="margin-top:8px;">${isDef===0?'\u2713 On track':'-'+isDef+' behind'}</span>
    </div>
  `;
  // ---- Non-targeted breakdown row: shows district leads not in the Setup targeted list ----
  let oL=0,oEl=0,oMV=0,oS=0;
  const allDataStates=new Set(Object.keys(CFG.states));
  ENTRIES.filter(e=>isApproved(e)&&srcPasses(e)&&dInRange(e.date)).forEach(e=>allDataStates.add(e.state));
  allDataStates.forEach(st=>{ const o=otTotals(st); oL+=o.l; oEl+=o.el; oMV+=o.mv; oS+=o.s; });
  const oMode2=othersMode();
  const counted=(oMode2!=='targeted'); // non-targeted counted in 'both' and 'nontargeted'
  const modeTag=oMode2==='targeted'?'<span style="color:var(--burnt);">excluded (showing Targeted only)</span>':oMode2==='nontargeted'?'<span style="color:var(--sage);">this is the only data shown</span>':'<span style="color:var(--sage);">included in totals above</span>';
  const lbl=document.getElementById('others-row-label'); if(lbl) lbl.innerHTML=`Non-targeted districts — ${modeTag}`;
  const oCard=(name,val,col)=>`<div class="mc" style="opacity:${counted?'1':'0.85'};"><div class="mc-lbl">Non-targeted · ${name}</div><div class="mc-val" style="color:${col};">${val}</div><div class="mc-meta">${counted?'counted above':'not counted'}</div></div>`;
  document.getElementById('metric-row-total').innerHTML=
    oCard('Leads',oL,'var(--blue)')+oCard('Eligible',oEl,'var(--teal)')+oCard('Market Visits',oMV,'var(--burnt)')+oCard('Sales',oS,'var(--sage)');
  const iT={l:iL,el:iEl,mv:iMV,s:iS};
  const ftype=ftypeFilter();
  const indiaLabel = ftype==='master' ? 'India Total — Master franchises' : ftype==='unit' ? 'India Total — Unit franchises' : 'India Total (all districts with data)';
  let html = row(iT,iPTgt,'india',indiaLabel,'toggleIndia()',null);
  if(indiaOpen){
    // Build the set of states to show: any with targeted cities OR with entries this period.
    const statesWithData={};
    ENTRIES.filter(e=>isApproved(e)&&srcPasses(e)&&dInRange(e.date)).forEach(e=>{ (statesWithData[e.state]=statesWithData[e.state]||new Set()).add(e.city); });
    const allStates=new Set([...Object.keys(CFG.states), ...Object.keys(statesWithData)]);
    // order: states with targeted cities first (alpha), then the rest (alpha)
    const ordered=[...allStates].sort((a,b)=>{ const at=CFG.states[a]?1:0, bt=CFG.states[b]?1:0; if(at!==bt) return bt-at; return a.localeCompare(b); });
    ordered.forEach(state=>{
      if(!statePasses(state)) return;
      const mt=stateMTgt(state), dt=dTgt(mt), pt=priTotals(state);
      // skip empty non-targeted states under a type filter
      if(pt.l===0 && pt.mv===0 && pt.s===0 && !CFG.states[state]) return;
      const isOpen=openStates.has(state);
      const sf=state.replace(/'/g,"\\'");
      html+=row(pt,dt,'state',state,`toggleState('${sf}')`,null);
      if(isOpen){
        // districts to show: targeted (from Setup) ∪ those with entries this period
        const targeted=Object.keys(CFG.states[state]?.cities||{});
        const withData=statesWithData[state]?[...statesWithData[state]]:[];
        let districts=[...new Set([...targeted,...withData])];
        // apply the targeted/non-targeted/both mode
        const oMode=othersMode();
        if(oMode==='targeted') districts=districts.filter(c=>isTargeted(state,c));
        else if(oMode==='nontargeted') districts=districts.filter(c=>!isTargeted(state,c));
        // type filter only applies to targeted districts (non-targeted have no type)
        const visible=districts.filter(c=>{ const isT=CFG.states[state]&&CFG.states[state].cities[c]; if(ftype==='all') return true; return isT && cityType(state,c)===ftype; });
        // sort: targeted first, then alpha
        visible.sort((a,b)=>{ const at=(CFG.states[state]&&CFG.states[state].cities[a])?1:0, bt=(CFG.states[state]&&CFG.states[state].cities[b])?1:0; if(at!==bt) return bt-at; return a.localeCompare(b); });
        visible.forEach(city=>{
          const cfg=CFG.states[state]?.cities[city];
          const ct=totals(state,city), cT=cfg?dTgt(cfg.leads||0):null;
          const cf=city.replace(/'/g,"\\'");
          let tag='';
          if(cfg){ tag=' <span style="font-size:9px;color:var(--sage);font-family:\'Space Mono\',monospace;">★ TARGETED</span>'; if(cityType(state,city)==='master') tag+=' <span style="font-size:9px;color:var(--burnt);font-family:\'Space Mono\',monospace;">MASTER</span>'; }
          else { tag=' <span style="font-size:9px;color:var(--text3);font-family:\'Space Mono\',monospace;">non-targeted</span>'; }
          html+=row(ct,cT,'city',city+tag,`openCity('${sf}','${cf}',event)`,true);
        });
      }
    });
  }
  document.getElementById('drill-tree').innerHTML=html;
  if(indiaOpen) document.querySelector('.r-india')?.classList.add('open');
  openStates.forEach(s=>{
    document.querySelectorAll('.r-state').forEach(r=>{ if(r.querySelector('.dc-name.st')?.textContent.trim()===s) r.classList.add('open'); });
  });
}
function toggleIndia(){ indiaOpen=!indiaOpen; renderDash(); }
function toggleState(s){ event.stopPropagation(); openStates.has(s)?openStates.delete(s):openStates.add(s); renderDash(); }
let rfOpenStates=new Set();
function renderFlags(){
  // ---- Lead red flags grouped by state ----
  const leadByState={};
  Object.keys(CFG.states).forEach(state=>{
    const cityFlags=[];
    Object.entries(CFG.states[state].cities).forEach(([city,cfg])=>{
      const t=totals(state,city), lT=dTgt(cfg.leads||0);
      const mvT=Math.floor(t.l/20), sT=Math.floor(t.mv/5);
      let issues=[];
      if(lT>0&&t.l<lT) issues.push({type:'Lead',def:lT-t.l,note:`target ${lT}, got ${t.l}`});
      if(mvT>0&&t.mv<mvT) issues.push({type:'MV',def:mvT-t.mv,note:`${t.l} leads need ${mvT} MV, got ${t.mv}`});
      if(sT>0&&t.s<sT) issues.push({type:'Sales',def:sT-t.s,note:`${t.mv} MV need ${sT} sales, got ${t.s}`});
      if(issues.length) cityFlags.push({city,issues});
    });
    if(cityFlags.length) leadByState[state]=cityFlags;
  });

  // ---- Inside sales bottle + cost/bottle flags grouped by state ----
  const isByState={};
  Object.keys(FRANCHISES).forEach(st=>{
    const fr=[];
    FRANCHISES[st].forEach(f=>{
      const ach=botTotal(st,f), wk=frWeek(st,f);
      const cpb=costPerBottle(st,f);
      let issues=[];
      if(wk>0&&ach<wk) issues.push({type:'Bottles',def:wk-ach,note:`target ${wk.toLocaleString('en-IN')}, sold ${ach.toLocaleString('en-IN')}`});
      if(cpb>BOT_CAP) issues.push({type:'Cost/bottle',def:0,note:`Rs.${cpb.toFixed(2)} exceeds Rs.${BOT_CAP} cap`});
      if(issues.length) fr.push({city:f,issues});
    });
    if(fr.length) isByState[st]=fr;
  });

  // ---- HR flags grouped by position -> state -> city ----
  const hrByRole={};
  (HRDATA||[]).forEach(p=>{ if(p.leads<HR_TARGET){ if(!hrByRole[p.role]) hrByRole[p.role]={}; if(!hrByRole[p.role][p.state]) hrByRole[p.role][p.state]=[]; hrByRole[p.role][p.state].push(p); } });
  const hrFlagCount=(HRDATA||[]).filter(p=>p.leads<HR_TARGET).length;

  // ---- Module overdue flags ----
  const modFlags=(MODULES||[]).filter(m=>modOverdue(m));

  function stateGroup(state,flags,colorClass,kind){
    const open=rfOpenStates.has(kind+'|'+state);
    const totalIssues=flags.reduce((a,c)=>a+c.issues.length,0);
    const inner=flags.map(cf=>`<div class="rf-row"><div><div class="rf-city">${cf.city}</div><div class="rf-meta">${cf.issues.map(i=>i.type+': '+i.note).join(' · ')}</div></div><div class="rf-num c-bad">${cf.issues.map(i=>i.def>0?'-'+i.def.toLocaleString('en-IN'):'!').join(' ')}</div></div>`).join('');
    return `<div class="setup-block" style="padding:0;overflow:hidden;margin-bottom:8px;"><div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;cursor:pointer;background:var(--surface2);" onclick="toggleRf('${kind}','${state.replace(/'/g,"")}')"><div style="font-size:14px;font-weight:600;color:var(--amber);"><span class="arrow" style="display:inline-block;${open?'transform:rotate(90deg);':''}">&#9654;</span> ${state}</div><div style="font-size:12px;color:var(--red-tx,#ff8b8b);">${totalIssues} red flag${totalIssues>1?'s':''}</div></div><div style="${open?'':'display:none;'}">${inner}</div></div>`;
  }
  // HR: position -> state(dropdown) -> cities
  function hrRoleGroup(role){
    const open=rfOpenStates.has('hrrole|'+role);
    const states=hrByRole[role];
    let count=0; Object.keys(states).forEach(st=>count+=states[st].length);
    let inner='';
    Object.keys(states).forEach(st=>{
      const skey='hrst|'+role+'|'+st; const sopen=rfOpenStates.has(skey);
      const rowsCity=states[st].map(p=>`<div class="rf-row"><div><div class="rf-city">${p.city}</div><div class="rf-meta">needs ${HR_TARGET-p.leads} more qualified leads (${p.leads}/${HR_TARGET})</div></div><div class="rf-num c-bad">-${HR_TARGET-p.leads}</div></div>`).join('');
      inner+=`<div style="margin:0 0 6px;border:1px solid var(--border);border-radius:8px;overflow:hidden;"><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;background:var(--surface3);" onclick="toggleRfKey('${skey.replace(/'/g,"")}')"><div style="font-size:13px;font-weight:600;color:var(--blue);"><span class="arrow" style="display:inline-block;${sopen?'transform:rotate(90deg);':''}">&#9654;</span> ${st}</div><div style="font-size:11px;color:var(--red-tx,#ff8b8b);">${states[st].length} behind</div></div><div style="${sopen?'':'display:none;'}padding:0 16px 8px;">${rowsCity}</div></div>`;
    });
    return `<div class="setup-block" style="padding:0;overflow:hidden;margin-bottom:8px;"><div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;cursor:pointer;background:var(--surface2);" onclick="toggleRfKey('hrrole|${role.replace(/'/g,"")}')"><div style="font-size:14px;font-weight:600;color:var(--amber);"><span class="arrow" style="display:inline-block;${open?'transform:rotate(90deg);':''}">&#9654;</span> ${role}</div><div style="font-size:12px;color:var(--red-tx,#ff8b8b);">${count} position${count>1?'s':''} behind</div></div><div style="${open?'':'display:none;'}padding:12px 18px;">${inner}</div></div>`;
  }

  let html='';
  // Leads section
  html+=`<div class="rf-block"><div class="rf-hdr rf-hdr-lead"><span style="font-size:20px;">\ud83d\udcc9</span><div class="rf-hdr-title">Lead Generation Red Flags</div><span class="rf-badge ${Object.keys(leadByState).length?'rf-badge-lead':'rf-badge-ok'}">${Object.keys(leadByState).length?Object.keys(leadByState).length+' states':'All clear \u2713'}</span></div><div style="padding:12px 16px;">`;
  html+= Object.keys(leadByState).length? Object.keys(leadByState).map(st=>stateGroup(st,leadByState[st],'c-blue','lead')).join('') : '<div class="rf-ok">No lead issues - great work!</div>';
  html+=`</div></div>`;
  // Inside sales section
  html+=`<div class="rf-block"><div class="rf-hdr rf-hdr-sales"><span style="font-size:20px;">\ud83e\uddf4</span><div class="rf-hdr-title">Inside Sales Red Flags (bottles & cost/bottle)</div><span class="rf-badge ${Object.keys(isByState).length?'rf-badge-sales':'rf-badge-ok'}">${Object.keys(isByState).length?Object.keys(isByState).length+' states':'All clear \u2713'}</span></div><div style="padding:12px 16px;">`;
  html+= Object.keys(isByState).length? Object.keys(isByState).map(st=>stateGroup(st,isByState[st],'c-sage','is')).join('') : '<div class="rf-ok">No bottle or cost issues!</div>';
  html+=`</div></div>`;
  // HR section (position -> state -> city)
  html+=`<div class="rf-block"><div class="rf-hdr" style="border-left:4px solid #f06aa0;"><span style="font-size:20px;">\ud83d\udc65</span><div class="rf-hdr-title">HR Recruitment Red Flags</div><span class="rf-badge ${hrFlagCount?'rf-badge-sales':'rf-badge-ok'}">${hrFlagCount?hrFlagCount+' positions':'All clear \u2713'}</span></div><div style="padding:12px 16px;">`;
  html+= Object.keys(hrByRole).length? Object.keys(hrByRole).map(r=>hrRoleGroup(r)).join('') : '<div class="rf-ok">All positions on track!</div>';
  html+=`</div></div>`;
  // Module section
  html+=`<div class="rf-block"><div class="rf-hdr" style="border-left:4px solid var(--amber);"><span style="font-size:20px;">\ud83d\udcda</span><div class="rf-hdr-title">L&amp;D Module Red Flags (overdue)</div><span class="rf-badge ${modFlags.length?'rf-badge-mv':'rf-badge-ok'}">${modFlags.length?modFlags.length+' overdue':'All clear \u2713'}</span></div>`;
  html+= modFlags.length? modFlags.map(m=>`<div class="rf-row"><div><div class="rf-city">${m.name}</div><div class="rf-meta">Deadline ${m.deadline} passed, not completed</div></div><div class="rf-num c-bad">overdue</div></div>`).join('') : '<div class="rf-ok">No overdue modules!</div>';
  html+=`</div>`;

  // Call Discipline section — flag manager-days where 15-min SLA missed or leads left uncalled
  const cdFlags=[];
  (typeof CALLDISC!=='undefined'?CALLDISC:[]).filter(r=>cdInRange(r.date)).forEach(r=>{
    const s=(typeof cdSLA==='function')?cdSLA(r):{sla15:r.sla15||0};
    const sla15pct=r.total>0? s.sla15/r.total : 1;
    const issues=[];
    if(r.notcalled>0) issues.push(r.notcalled+' never called');
    if(r.total>0 && sla15pct<CD_SLA15_TARGET) issues.push(Math.round(sla15pct*100)+'% in 15-min SLA (need '+Math.round(CD_SLA15_TARGET*100)+'%)');
    if(issues.length) cdFlags.push({label:(r.mgr||'Unknown')+' · '+r.date, note:issues.join(' · '), bad:r.notcalled>0});
  });
  cdFlags.sort((a,b)=>(b.bad?1:0)-(a.bad?1:0));
  html+=`<div class="rf-block"><div class="rf-hdr" style="border-left:4px solid var(--blue);"><span style="font-size:20px;">\u260e\ufe0f</span><div class="rf-hdr-title">Call Discipline Red Flags</div><span class="rf-badge ${cdFlags.length?'rf-badge-lead':'rf-badge-ok'}">${cdFlags.length?cdFlags.length+' manager-days':'All clear \u2713'}</span></div>`;
  html+= cdFlags.length? cdFlags.map(f=>`<div class="rf-row"><div><div class="rf-city">${f.label}</div><div class="rf-meta">${f.note}</div></div><div class="rf-num ${f.bad?'c-bad':'c-burnt'}">${f.bad?'uncalled':'slow'}</div></div>`).join('') : '<div class="rf-ok">Leads are being called on time!</div>';
  html+=`</div>`;

  document.getElementById('rf-content').innerHTML=html;
}
function toggleRf(kind,state){ const k=kind+'|'+state; rfOpenStates.has(k)?rfOpenStates.delete(k):rfOpenStates.add(k); renderFlags(); }
function toggleRfKey(k){ rfOpenStates.has(k)?rfOpenStates.delete(k):rfOpenStates.add(k); renderFlags(); }
function openCity(state,city,evt){
  if(evt) evt.stopPropagation();
  const cfg=CFG.states[state]?.cities[city], mTgt=cfg?cfg.leads:0, wd=CFG.workingDays||25;
  const dm={};
  // respect the dashboard's selected month/year (and source filter) so the detail matches the scorecard
  ENTRIES.filter(e=>isApproved(e)&&srcPasses(e)&&e.state===state&&e.city===city&&dInRange(e.date)).forEach(e=>{
    const d=parseInt(e.date.split('-')[2]);
    if(!dm[d]) dm[d]={l:0,el:0,mv:0,s:0};
    dm[d].l+=e.leads||0; dm[d].el+=e.eligible||0; dm[d].mv+=e.mv||0; dm[d].s+=e.sales||0;
  });
  // label the period being shown (selected month/year, or the active filter)
  const moN=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const selMo=moN[parseInt(document.getElementById('f-month')?.value??5)];
  const selYr=document.getElementById('f-year')?.value||CFG.year;
  const periodLabel=(document.getElementById('f-mode')?.value==='all')?`${selMo} ${selYr}`:filterLabel().replace('Showing: ','');
  let cL=0,cE=0,cM=0,cS=0, rows='';
  const tod=dayN();
  for(let d=1;d<=31;d++){
    const dd=dm[d]||null, has=!!dd;
    if(has){cL+=dd.l;cE+=dd.el;cM+=dd.mv;cS+=dd.s;}
    const lT=mTgt>0?Math.round(mTgt/wd*d):null;
    const mvT=Math.floor(cL/20), sT=Math.floor(cM/5);
    rows+=`<tr class="${d===tod?'today':''}">
      <td>${String(d).padStart(2,'0')}</td>
      <td style="color:var(--text2);">${selMo.slice(0,3)} ${String(d).padStart(2,'0')}</td>
      <td style="color:var(--blue);${has?'font-weight:600;':''}">${has?dd.l:'-'}</td>
      <td style="color:var(--teal);">${has?dd.el:'-'}</td>
      <td style="color:var(--burnt);">${has?dd.mv:'-'}</td>
      <td style="color:var(--sage);${has&&dd.s>0?'font-weight:700;':''}">${has?dd.s:'-'}</td>
      <td style="color:${has&&lT&&cL>=lT?'var(--sage)':'var(--text)'};">${has?cL:'-'}</td>
      <td style="color:var(--text3);">${lT||'-'}</td>
      <td style="color:${cM>=mvT&&mvT>0?'var(--sage)':cM>0?'var(--burnt)':'var(--text3)'};">${has?cM+'/'+mvT:'-'}</td>
      <td style="color:${cS>=sT&&sT>0?'var(--sage)':cS>0?'var(--burnt)':'var(--text3)'};">${has?cS+'/'+sT:'-'}</td>
    </tr>`;
  }
  const m=document.createElement('div');
  m.id='cmodal'; m.className='modal-overlay';
  m.innerHTML=`<div class="modal-box">
    <div class="modal-hdr">
      <div>
        <div style="font-size:11px;color:var(--text2);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">${state}</div>
        <div style="font-size:22px;font-weight:700;">${city}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:5px;">${periodLabel} \u00b7 ${cfg?('Monthly target: '+mTgt+' leads'):'Non-targeted district'} \u00b7 ${wd} working days</div>
      </div>
      <button onclick="document.getElementById('cmodal').remove()" style="background:var(--surface3);border:1px solid var(--border);color:var(--text2);padding:9px 18px;cursor:pointer;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1px;border-radius:8px;">CLOSE</button>
    </div>
    <div class="modal-body">
      <div class="city-summary">
        <div class="cs-card" style="background:var(--blue-dim);border-color:rgba(86,168,245,0.2);">
          <div class="cs-lbl">Total Leads</div><div class="cs-val c-blue">${cL}</div><div class="cs-meta">Target: ${mTgt}</div>
        </div>
        <div class="cs-card" style="background:var(--teal-dim);border-color:rgba(47,214,168,0.2);">
          <div class="cs-lbl">Eligible &amp; Int</div><div class="cs-val c-teal">${cE}</div><div class="cs-meta">${cL>0?Math.round(cE/cL*100)+'% rate':'-'}</div>
        </div>
        <div class="cs-card" style="background:var(--burnt-dim);border-color:rgba(245,166,35,0.2);">
          <div class="cs-lbl">Market Visits</div><div class="cs-val c-burnt">${cM}</div><div class="cs-meta">Needed: ${Math.floor(cL/20)}</div>
        </div>
        <div class="cs-card" style="background:var(--sage-dim);border-color:rgba(95,214,111,0.2);">
          <div class="cs-lbl">Sales</div><div class="cs-val c-sage">${cS}</div><div class="cs-meta">Needed: ${Math.floor(cM/5)}</div>
        </div>
      </div>
      <table class="day-tbl">
        <thead><tr>
          <th>Day</th><th>Date</th>
          <th style="color:var(--blue);">Leads</th><th style="color:var(--teal);">Elig</th>
          <th style="color:var(--burnt);">MV</th><th style="color:var(--sage);">Sales</th>
          <th style="color:var(--text);">Cum.Leads</th><th>Day Tgt</th>
          <th style="color:var(--burnt);">MV Done/Need</th><th style="color:var(--sage);">Sales Done/Need</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
  document.body.appendChild(m);
}
function renderEntry(){
  const sel=document.getElementById('e-state');
  sel.innerHTML='<option value="">Select State</option>'+Object.keys(INDIA).sort().map(s=>`<option>${s}</option>`).join('');
  document.getElementById('e-date').value=new Date().toISOString().split('T')[0];
  renderRecent();
}
function populateCities(){
  const s=document.getElementById('e-state').value, sel=document.getElementById('e-city');
  sel.innerHTML='<option value="">Select City</option>';
  if(!s||!INDIA[s]) return;
  // all real districts of the state; targeted ones (in Setup) get a tag
  INDIA[s].forEach(c=>{ const tg=CFG.states[s]&&CFG.states[s].cities[c]; sel.innerHTML+=`<option value="${c}">${c}${tg?' \u2605 targeted':''}</option>`; });
}
function showHints(){
  const s=document.getElementById('e-state').value, c=document.getElementById('e-city').value;
  const cfg=CFG.states[s]?.cities[c];
  document.getElementById('e-leads-hint').textContent=cfg?`Targeted \u00b7 Daily ~${Math.round(cfg.leads/(CFG.workingDays||25))} \u00b7 Month: ${cfg.leads}`:(c?'Non-targeted district':'');
}
function liveCalc(){
  const l=parseInt(document.getElementById('e-leads').value)||0, el=parseInt(document.getElementById('e-elig').value)||0;
  document.getElementById('e-elig-pct').textContent=l>0?`${Math.round(el/l*100)}% of leads are eligible`:'';
  document.getElementById('e-mv-hint').textContent=l>0?`MV needed: ${Math.floor(l/20)} (leads / 20)`:'';
}
function saveEntry(){
  const s=document.getElementById('e-state').value, c=document.getElementById('e-city').value, dt=document.getElementById('e-date').value;
  if(!s||!c||!dt){showToast('Fill state, city & date','err');return;}
  const by=document.getElementById('e-by').value; if(by) setUser(by);
  const le=parseInt(document.getElementById('e-leads').value)||0, el=parseInt(document.getElementById('e-elig').value)||0, mv=parseInt(document.getElementById('e-mv').value)||0, sa=parseInt(document.getElementById('e-sales').value)||0;
  const notes=document.getElementById('e-notes').value;
  const source=document.getElementById('e-source')?document.getElementById('e-source').value:'Manual';
  if(window._editEntryId){
    const e=ENTRIES.find(x=>x.id===window._editEntryId);
    if(e){ e.state=s;e.city=c;e.date=dt;e.by=by;e.leads=le;e.eligible=el;e.mv=mv;e.sales=sa;e.notes=notes;e.source=source;
      saveE(); logAction('Edited daily entry','Daily Entry',`${c} (${s}) on ${dt}: ${le} leads, ${el} elig, ${mv} MV, ${sa} sales · ${source}`); showToast('Entry updated'); }
    window._editEntryId=null;
    const btn=document.getElementById('e-save-btn'); if(btn) btn.textContent='Save Entry';
    const cb=document.getElementById('e-cancel-btn'); if(cb) cb.style.display='none';
  } else {
    ENTRIES.push({id:Date.now(),state:s,city:c,date:dt,by:by,leads:le,eligible:el,mv:mv,sales:sa,notes:notes,source:source,status:'pending'});
    saveE(); logAction('Added daily entry','Daily Entry',`${c} (${s}) on ${dt}: ${le} leads, ${el} elig, ${mv} MV, ${sa} sales · ${source}`); showToast('Entry saved');
  }
  ['e-leads','e-elig','e-mv','e-sales'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('e-notes').value='';
  ['e-elig-pct','e-mv-hint'].forEach(id=>{const x=document.getElementById(id);if(x)x.textContent='';});
  renderRecent();
}
function editEntry(id){
  const e=ENTRIES.find(x=>x.id===id); if(!e) return;
  window._editEntryId=id;
  document.getElementById('e-state').value=e.state;
  if(typeof populateCities==='function'){ try{ populateCities(); }catch(_){} }
  setTimeout(()=>{ const cs=document.getElementById('e-city'); if(cs){ cs.value=e.city; if(typeof showHints==='function'){try{showHints();}catch(_){}} } },30);
  document.getElementById('e-date').value=e.date;
  document.getElementById('e-by').value=e.by||'';
  document.getElementById('e-leads').value=e.leads;
  document.getElementById('e-elig').value=e.eligible;
  document.getElementById('e-mv').value=e.mv;
  document.getElementById('e-sales').value=e.sales;
  document.getElementById('e-notes').value=e.notes||'';
  if(document.getElementById('e-source')) document.getElementById('e-source').value=e.source||'Manual';
  const btn=document.getElementById('e-save-btn'); if(btn) btn.textContent='Update Entry';
  const cb=document.getElementById('e-cancel-btn'); if(cb) cb.style.display='';
  document.getElementById('view-entry').scrollIntoView({behavior:'smooth',block:'start'});
  showToast('Editing entry — change values and Update');
}
function cancelEdit(){
  window._editEntryId=null;
  ['e-leads','e-elig','e-mv','e-sales','e-notes'].forEach(id=>{const x=document.getElementById(id);if(x)x.value='';});
  const btn=document.getElementById('e-save-btn'); if(btn) btn.textContent='Save Entry';
  const cb=document.getElementById('e-cancel-btn'); if(cb) cb.style.display='none';
  showToast('Edit cancelled');
}
function delEntry(id){
  const e=ENTRIES.find(x=>x.id===id);
  const label=e?`Daily entry: ${e.city} (${e.state}) ${e.date}, ${e.leads} leads`:'daily entry';
  const uid=snapshot('entry',label);
  ENTRIES=ENTRIES.filter(x=>x.id!==id);
  saveE();
  if(e) logAction('Deleted daily entry','Daily Entry',`${e.city} (${e.state}) on ${e.date}: was ${e.leads} leads, ${e.eligible} elig, ${e.mv} MV, ${e.sales} sales`,uid);
  if(window._editEntryId===id) cancelEdit();
  renderRecent();
  if(document.getElementById('view-dashboard')?.classList.contains('active')) renderDash();
  toastUndo('Entry deleted',uid);
}
function renderRecent(){
  const r=[...ENTRIES].reverse().slice(0,8);
  document.getElementById('recent-list').innerHTML=r.length?r.map(e=>`
    <div class="ve ${e.status}">
      <div class="ve-hdr">
        <div><strong>${e.city}</strong><span style="color:var(--text2);font-size:12px;"> - ${e.state}</span>
          <span class="pill ${e.status==='approved'?'pill-ok':e.status==='flagged'?'pill-bad':'pill-warn'}" style="margin-left:8px;">${e.status}</span>
        </div>
        <span style="font-size:11px;color:var(--text2);">${e.date}${e.source?' · <span style="color:var(--blue);">'+e.source+'</span>':''}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;margin:8px 0 6px;">
        <span style="font-size:26px;font-weight:700;color:var(--blue);line-height:1;">${e.leads}</span>
        <span style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-family:'Space Mono',monospace;">leads</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2);">entered by <strong style="color:var(--text);">${e.by||'—'}</strong></span>
      </div>
      <div class="ve-nums">
        <span class="ve-num">Elig: <strong style="color:var(--teal);">${e.eligible}</strong></span>
        <span class="ve-num">MV: <strong style="color:var(--burnt);">${e.mv}</strong></span>
        <span class="ve-num">Sales: <strong style="color:var(--sage);">${e.sales}</strong></span>
      </div>
      <div class="ve-actions"><button class="btn btn-ghost btn-sm" onclick="editEntry(${e.id})">Edit</button><button class="btn btn-danger btn-sm" onclick="confirmBtn(this,()=>delEntry(${e.id}))">Delete</button></div>
    </div>`).join(''):'<div class="empty">No entries yet</div>';
}
function renderVerify(){
  const pend=ENTRIES.filter(e=>e.status==='pending').reverse();
  const done=ENTRIES.filter(e=>e.status!=='pending').reverse().slice(0,20);
  let h='';
  if(!pend.length) h+=`<div style="background:var(--sage-dim);border-radius:var(--radius);padding:14px 18px;color:var(--sage);font-weight:600;margin-bottom:16px;border:1px solid rgba(95,214,111,0.2);">\u2713 All entries verified</div>`;
  else{ h+=`<div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--burnt);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Pending (${pend.length})</div>`; pend.forEach(e=>h+=veC(e,false)); h+='<div style="height:16px;"></div>'; }
  h+=`<div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Recently Verified</div>`;
  done.forEach(e=>h+=veC(e,true));
  document.getElementById('verify-list').innerHTML=h||'<div class="empty">No entries</div>';
}
function veC(e,ro){
  return `<div class="ve ${e.status}"><div class="ve-hdr"><div><strong>${e.city}</strong><span style="color:var(--text2);font-size:12px;"> - ${e.state}</span><span class="pill ${e.status==='approved'?'pill-ok':e.status==='flagged'?'pill-bad':'pill-warn'}" style="margin-left:8px;">${e.status}</span></div><span style="font-size:11px;color:var(--text2);">${e.date}${e.by?' \u00b7 '+e.by:''}</span></div><div class="ve-nums"><span class="ve-num">Leads: <strong>${e.leads}</strong></span><span class="ve-num">Elig: <strong style="color:var(--teal);">${e.eligible}</strong></span><span class="ve-num">MV: <strong style="color:var(--burnt);">${e.mv}</strong></span><span class="ve-num">Sales: <strong style="color:var(--sage);">${e.sales}</strong></span>${e.notes?`<span class="ve-num" style="color:var(--text2);">${e.notes}</span>`:''}</div>${!ro?`<div class="ve-actions"><button class="btn btn-amber btn-sm" onclick="doVerify(${e.id},'approved')">Approve</button><button class="btn btn-danger btn-sm" onclick="doVerify(${e.id},'flagged')">Flag</button></div>`:''}</div>`;
}
function doVerify(id,st){ const i=ENTRIES.findIndex(e=>e.id===id); if(i!==-1){ENTRIES[i].status=st;saveE();showToast(st==='approved'?'Approved \u2713':'Flagged',st==='approved'?'ok':'err');renderVerify();} }
let setupOpenStates=new Set();
function toggleSetupState(st){ setupOpenStates.has(st)?setupOpenStates.delete(st):setupOpenStates.add(st); renderSetup(); }
function setupExpandAll(){ Object.keys(CFG.states).forEach(s=>setupOpenStates.add(s)); renderSetup(); }
function setupCollapseAll(){ setupOpenStates.clear(); renderSetup(); }
function renderSetup(){
  document.getElementById('s-month').value=CFG.month;
  document.getElementById('s-year').value=CFG.year;
  document.getElementById('s-wd').value=CFG.workingDays;
  const stateNames=Object.keys(CFG.states);
  let html='';
  if(stateNames.length){
    html+=`<div style="display:flex;gap:8px;margin-bottom:12px;"><button class="btn btn-ghost btn-sm" onclick="setupExpandAll()">Expand all</button><button class="btn btn-ghost btn-sm" onclick="setupCollapseAll()">Collapse all</button></div>`;
  }
  html+=Object.entries(CFG.states).map(([st,sc])=>{
    const sid=st.replace(/[^a-zA-Z]/g,'');
    const open=setupOpenStates.has(st);
    const cityCount=Object.keys(sc.cities).length;
    const header=`<div onclick="toggleSetupState('${st.replace(/'/g,"\\'")}')" style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;color:var(--amber);transition:transform 0.2s;transform:rotate(${open?'90':'0'}deg);display:inline-block;">▶</span>
          <div><div class="setup-title" style="margin:0;">${st}</div><div class="setup-sub" style="margin:0;">${cityCount} ${cityCount===1?'city':'cities'}${open?'':' · click to expand'}</div></div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();confirmBtn(this,()=>delState('${st.replace(/'/g,"")}'))">Remove state</button>
      </div>`;
    if(!open) return `<div class="setup-block">${header}</div>`;
    return `
    <div class="setup-block">
      ${header}
      <div style="margin-top:14px;">
      <table class="city-tbl"><thead><tr><th>City</th><th style="text-align:center;">Leads/Month</th><th style="text-align:center;">Type</th><th>Franchise Manager</th><th></th></tr></thead><tbody>
        ${Object.entries(sc.cities).map(([c,cfg])=>{ const cur=getCityMgr(st,c); const opts=['<option value="">— select —</option>'].concat(MGRLIST.map(n=>`<option${n===cur?' selected':''}>${n}</option>`)); if(cur&&!MGRLIST.includes(cur)) opts.push(`<option selected>${cur}</option>`); return `<tr><td style="font-weight:500;color:var(--text);">${c}</td><td style="text-align:center;"><input class="tgt-input" type="number" value="${cfg.leads||100}" onchange="updTgt('${st.replace(/'/g,"")}','${c.replace(/'/g,"")}',this.value)"/></td><td style="text-align:center;"><select class="finput" style="padding:5px 8px;font-size:12px;width:auto;" onchange="setCityType('${st.replace(/'/g,"")}','${c.replace(/'/g,"")}',this.value)"><option value="unit"${(cfg.type||'unit')==='unit'?' selected':''}>Unit</option><option value="master"${cfg.type==='master'?' selected':''}>Master</option></select></td><td><select class="finput" style="padding:6px 10px;font-size:13px;min-width:160px;" onchange="setCityMgr('${st.replace(/'/g,"")}','${c.replace(/'/g,"")}',this.value);renderDash();">${opts.join('')}</select></td><td><button class="del-btn" onclick="confirmBtn(this,()=>delCity('${st.replace(/'/g,"")}','${c.replace(/'/g,"")}'))">x</button></td></tr>`; }).join('')}
      </tbody></table>
      <div style="display:flex;gap:8px;margin-top:10px;align-items:flex-end;">
        <div class="fg"><label class="flabel">Add city to ${st}</label><select class="finput" id="setup-newcity-${sid}"><option value="">Select district</option>${(INDIA[st]||[]).map(d=>`<option>${d}</option>`).join('')}</select></div>
        <div class="fg" style="max-width:120px;"><label class="flabel">Target</label><input class="finput" id="setup-newtgt-${sid}" type="number" value="100"/></div>
        <div class="fg" style="max-width:120px;"><label class="flabel">Type</label><select class="finput" id="setup-newtype-${sid}"><option value="unit">Unit</option><option value="master">Master</option></select></div>
        <button class="btn btn-ghost" onclick="addCity('${st.replace(/'/g,"")}','${sid}')">+ Add city</button>
      </div>
      </div>
    </div>`;
  }).join('');
  html+=`<div class="setup-block"><div class="setup-title" style="margin-bottom:10px;">Add new state</div><div style="display:flex;gap:8px;align-items:flex-end;"><div class="fg"><label class="flabel">State</label><select class="finput" id="setup-newstate"><option value="">Select state</option>${Object.keys(INDIA).sort().map(s=>`<option>${s}</option>`).join('')}</select></div><button class="btn btn-amber" onclick="addState()">+ Add state</button></div></div>`;
  html+=`<div class="setup-block"><div class="setup-title" style="margin-bottom:4px;">Franchise managers</div><div class="setup-sub">Add a manager once here, then pick them from the dropdown on any city above. New branch joined? Add the manager here.</div>${MGRLIST.length?'<div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px;">'+MGRLIST.map(n=>`<span class="pill" style="background:var(--surface3);color:var(--text);display:inline-flex;align-items:center;gap:8px;padding:6px 10px;">${n}<button class="del-btn" style="font-size:15px;" onclick="confirmBtn(this,()=>delMgrName('${n.replace(/'/g,"\\'")}'))">×</button></span>`).join('')+'</div>':'<div class="fhint" style="margin:6px 0 12px;">No managers added yet.</div>'}<div style="display:flex;gap:8px;align-items:flex-end;"><div class="fg"><label class="flabel">New franchise manager name</label><input class="finput" id="setup-newmgr" placeholder="e.g. Ram Kishore"/></div><button class="btn btn-amber" onclick="addMgrName()">+ Add franchise manager</button></div></div>`;
  document.getElementById('setup-states').innerHTML=html;
}
function updTgt(s,c,v){ if(CFG.states[s]?.cities[c]){ CFG.states[s].cities[c].leads=parseInt(v)||0; saveCfg(); } }
function setCityType(s,c,v){ if(CFG.states[s]?.cities[c]){ CFG.states[s].cities[c].type=(v==='master'?'master':'unit'); saveCfg(); logAction('Set city type','Setup',`${c} (${s}) → ${v}`); renderDash(); } }
function addCity(s,sid){ const sel=document.getElementById('setup-newcity-'+sid); const n=sel.value.trim(); const tg=Math.max(0,parseInt(document.getElementById('setup-newtgt-'+sid).value)||100); const ty=(document.getElementById('setup-newtype-'+sid)||{}).value==='master'?'master':'unit'; if(!n){showToast('Pick a district','err');return;} if(CFG.states[s].cities[n]){showToast('Already added','err');return;} askName(function(){ CFG.states[s].cities[n]={leads:tg,type:ty}; saveCfg(); logAction('Added city','Setup',`${n} in ${s}, target ${tg}, ${ty}`); renderSetup(); showToast('City added'); }); }
function delCity(s,c){ const uid=snapshot('city',`City: ${c} (${s})`); delete CFG.states[s].cities[c]; saveCfg(); logAction('Deleted city','Setup',`${c} from ${s}`,uid); renderSetup(); toastUndo('City removed',uid); }
function addState(){ const n=document.getElementById('setup-newstate').value.trim(); if(!n){showToast('Pick a state','err');return;} if(CFG.states[n]){showToast('State exists','err');return;} askName(function(){ CFG.states[n]={cities:{}}; saveCfg(); logAction('Added state','Setup',n); renderSetup(); showToast('State added'); }); }
function delState(s){ const uid=snapshot('state',`State: ${s}`); delete CFG.states[s]; saveCfg(); logAction('Deleted state','Setup',s,uid); renderSetup(); toastUndo('State removed',uid); }
function saveCfg(){ store.setItem('safc_c4',JSON.stringify(CFG)); }
function saveSetup(){ CFG.month=document.getElementById('s-month').value; CFG.year=parseInt(document.getElementById('s-year').value); CFG.workingDays=parseInt(document.getElementById('s-wd').value); saveCfg(); showToast('Setup saved'); renderSetup(); }
function switchTab(tab,el){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  const view=document.getElementById('view-'+tab); if(view) view.classList.add('active');
  if(el&&el.classList&&el.classList.contains('nav-tab')) el.classList.add('active');
  else { const nt=document.querySelector(".nav-tab[onclick*=\"'"+tab+"'\"]"); if(nt) nt.classList.add('active'); }
  // sync the drawer menu highlight
  document.querySelectorAll('.menu-item').forEach(m=>m.classList.remove('active'));
  const mi=document.querySelector(".menu-item[onclick*=\"'"+tab+"'\"]"); if(mi) mi.classList.add('active');
  if(tab==='dashboard') renderDash();
  if(tab==='redflags'){ if(!HRDATA.length) loadHr(); if(!MODULES.length) loadMod(); renderFlags(); }
  if(tab==='entry') renderEntry();
  if(tab==='verify') renderVerify();
  if(tab==='setup') renderSetup();
  if(tab==='settings') renderSettings();
  if(tab==='insidesales') renderIS();
  if(tab==='modules') renderMod();
  if(tab==='awareness') renderAw();
  if(tab==='hr'){ if(!HRDATA.length) loadHr(); renderHR(); }
  if(tab==='log') renderLog();
  if(tab==='calldisc') renderCD();
}
function toggleMenu(e){ if(e) e.stopPropagation(); const d=document.getElementById('menu-drawer'), b=document.getElementById('menu-backdrop'); const open=d.classList.contains('open'); if(open){ d.classList.remove('open'); b.classList.remove('open'); } else { d.classList.add('open'); b.classList.add('open'); } }
function closeMenu(){ document.getElementById('menu-drawer').classList.remove('open'); document.getElementById('menu-backdrop').classList.remove('open'); }
function menuGo(tab,el){ switchTab(tab,null); closeMenu(); }
function showToast(msg,type='ok'){ const t=document.getElementById('toast'); t.textContent=msg; t.className=`toast toast-${type} show`; setTimeout(()=>t.classList.remove('show'),2500); }

// ============ INSIDE SALES ============
const FR_DEFAULT={
  'Tamil Nadu':['Sivagangai','Salem','Tiruppur','Pallavaram','Vellore','Chennai','Trichy'],
  'Andhra Pradesh':['Nellore','Guntur','Annamaya','Anantapur','Chittoor','Hyderabad','Narasarapet','Visakhapatnam','Nirmal'],
  'Karnataka':['Belgaum','Hubli','Chickaballapur'],
  'Maharashtra':['Kolapur','Nagpur','Satara','Sangli','Akola','Nagpur 2'],
  'Chhattisgarh':['Raipur','Jampeshdpur'],
  'Gujarat':['Ahmedabad']
};
const BOT_WD=6;
let FRANCHISES={};
let FRTGT={};
let BOTTLES={};
let SPEND={};
let openBotStates=new Set();
const BOT_CAP=2;
function loadBot(){
  try{const f=store.getItem('safc_fr4'); FRANCHISES=f?JSON.parse(f):JSON.parse(JSON.stringify(FR_DEFAULT));}catch(e){FRANCHISES=JSON.parse(JSON.stringify(FR_DEFAULT));}
  try{const t=store.getItem('safc_frtgt4'); FRTGT=t?JSON.parse(t):{};}catch(e){FRTGT={};}
  try{const b=store.getItem('safc_bot4'); if(b) BOTTLES=JSON.parse(b);}catch(e){}
  try{const s=store.getItem('safc_spend4'); if(s) SPEND=JSON.parse(s);}catch(e){}
}
function saveBot(){ store.setItem('safc_bot4',JSON.stringify(BOTTLES)); store.setItem('safc_fr4',JSON.stringify(FRANCHISES)); store.setItem('safc_frtgt4',JSON.stringify(FRTGT)); store.setItem('safc_spend4',JSON.stringify(SPEND)); }
function botKey(d,st,f){ return d+'|'+st+'|'+f; }
function botEntryDate(){ return document.getElementById('is-entry-date')?.value || new Date().toISOString().split('T')[0]; }
function botCellVal(st,f){ return BOTTLES[botKey(botEntryDate(),st,f)]||0; }
function spendCellVal(st,f){ return SPEND[botKey(botEntryDate(),st,f)]||0; }
function botTotal(st,f){
  let t=0;
  Object.keys(BOTTLES).forEach(k=>{ const p=k.split('|'); if(p[1]===st && p[2]===f && dInRange(p[0])) t+=BOTTLES[k]||0; });
  return t;
}
function spendTotal(st,f){
  let t=0;
  Object.keys(SPEND).forEach(k=>{ const p=k.split('|'); if(p[1]===st && p[2]===f && dInRange(p[0])) t+=SPEND[k]||0; });
  return t;
}
function costPerBottle(st,f){ const b=botTotal(st,f); const s=spendTotal(st,f); return b>0? s/b : 0; }
function botTotalEntryDate(st,f){ return BOTTLES[botKey(botEntryDate(),st,f)]||0; }
function frWeek(st,f){ return FRTGT[st+'||'+f]||2500; }
function isBadge(a,t){const p=t>0?a/t:0;if(p>=1)return '<span class="pill pill-ok">On track</span>';if(p>=0.5)return '<span class="pill pill-warn">At risk</span>';return '<span class="pill pill-bad">Red flag</span>';}
function cpbBadge(st,f){ const c=costPerBottle(st,f); if(c===0) return '<span class="pill pill-warn">No spend</span>'; if(c<=BOT_CAP) return '<span class="pill pill-ok">Rs.'+c.toFixed(2)+'</span>'; return '<span class="pill pill-bad">Rs.'+c.toFixed(2)+' over</span>'; }
function isCol(a,t){const p=t>0?a/t:0;if(p>=1)return 'var(--sage)';if(p>=0.5)return 'var(--burnt)';return 'var(--red)';}
function isTotals(){
  let totT=0,totA=0,n=0,totSpend=0;
  Object.keys(FRANCHISES).forEach(st=>FRANCHISES[st].forEach(f=>{totT+=frWeek(st,f);totA+=botTotal(st,f);totSpend+=spendTotal(st,f);n++;}));
  return {totT,totA,n,budget:totT*2,totSpend,avgCpb:totA>0?totSpend/totA:0};
}
function renderIS(){
  const T=isTotals();
  const def=Math.max(0,T.totT-T.totA);
  const dayTgt=Math.round(T.totT/BOT_WD);
  document.getElementById('is-metrics').innerHTML=`
    <div class="mc mc-leads"><div class="mc-lbl">Weekly Target</div><div class="mc-val">${T.totT.toLocaleString('en-IN')}</div><div class="mc-meta">${T.n} franchises</div><span class="mc-status st-neutral">bottles</span></div>
    <div class="mc mc-sales"><div class="mc-lbl">Bottles (filtered)</div><div class="mc-val">${T.totA.toLocaleString('en-IN')}</div><div class="mc-meta">Day target: ${dayTgt.toLocaleString('en-IN')}</div><span class="mc-status ${def===0?'st-ok':T.totA/Math.max(T.totT,1)>0.5?'st-warn':'st-bad'}">${def===0?'On track':'-'+def.toLocaleString('en-IN')+' behind'}</span></div>
    <div class="mc mc-mv"><div class="mc-lbl">Avg Cost / Bottle</div><div class="mc-val" style="color:${T.avgCpb===0?'var(--text2)':T.avgCpb<=BOT_CAP?'var(--sage)':'var(--red)'};">Rs.${T.avgCpb.toFixed(2)}</div><div class="mc-meta">Cap: Rs.${BOT_CAP.toFixed(2)}</div><span class="mc-status ${T.avgCpb===0?'st-neutral':T.avgCpb<=BOT_CAP?'st-ok':'st-bad'}">${T.avgCpb===0?'no spend':T.avgCpb<=BOT_CAP?'within cap':'over cap'}</span></div>
    <div class="mc mc-elig"><div class="mc-lbl">Total Mktg Spend</div><div class="mc-val">Rs.${(T.totSpend/100000).toFixed(2)}L</div><div class="mc-meta">${T.totSpend.toLocaleString('en-IN')} spent</div><span class="mc-status st-neutral">filtered</span></div>`;
  // form dropdowns + defaults
  if(!document.getElementById('is-entry-date').value) document.getElementById('is-entry-date').value=new Date().toISOString().split('T')[0];
  if(!document.getElementById('is-by').value && store.getItem('safc_user4')) document.getElementById('is-by').value=store.getItem('safc_user4');
  fillStateDropdown('is-state');
  // franchise management grid (targets + status + delete)
  let html='';
  Object.keys(FRANCHISES).forEach(st=>{
    const open=openBotStates.has(st);
    let sA=0;
    let rows='<table class="city-tbl"><thead><tr><th>Franchise</th><th style="text-align:center;">Bottles (filtered)</th><th style="text-align:center;">Cost/Bottle</th><th style="text-align:center;">Day Tgt</th><th style="text-align:center;">Wk Tgt</th><th style="text-align:center;">Status</th><th></th></tr></thead><tbody>';
    FRANCHISES[st].forEach(f=>{
      const a=botTotal(st,f);const wk=frWeek(st,f);sA+=a;
      rows+=`<tr><td style="color:var(--text);font-weight:500;cursor:pointer;" onclick="openFranchise('${st.replace(/'/g,"")}','${f.replace(/'/g,"")}')">${f} <span class="city-link">↗</span></td><td style="text-align:center;color:var(--sage);font-weight:600;">${a.toLocaleString('en-IN')}</td><td style="text-align:center;">${cpbBadge(st,f)}</td><td style="text-align:center;color:var(--text3);">${Math.round(wk/BOT_WD)}</td><td style="text-align:center;"><input class="tgt-input" type="number" min="0" value="${wk}" style="color:var(--text3);width:80px;" onchange="setFrTgt('${st.replace(/'/g,"")}','${f.replace(/'/g,"")}',this.value)"/></td><td style="text-align:center;">${isBadge(a,frWeek(st,f))}</td><td><button class="del-btn" onclick="confirmBtn(this,()=>delFr('${st.replace(/'/g,"")}','${f.replace(/'/g,"")}'))">x</button></td></tr>`;
    });
    rows+='</tbody></table>';
    html+=`<div class="setup-block" style="padding:0;overflow:hidden;"><div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;cursor:pointer;background:var(--surface2);" onclick="toggleBotState('${st.replace(/'/g,"")}')"><div style="font-size:14px;font-weight:600;color:var(--amber);"><span class="arrow" style="display:inline-block;${open?'transform:rotate(90deg);':''}">&#9654;</span> ${st}</div><div style="font-size:12px;color:var(--text2);">${sA.toLocaleString('en-IN')} bottles (filtered) - ${FRANCHISES[st].length} franchises</div></div><div style="${open?'':'display:none;'}padding:0 20px 12px;">${rows}</div></div>`;
  });
  html+=`<div class="setup-block"><div class="setup-title" style="margin-bottom:10px;">Add new franchise</div><div class="form-row-4"><div class="fg"><label class="flabel">State</label><select class="finput" id="fr-new-state" onchange="fillDist('fr-new-state','fr-new-name')"><option value="">Select state</option></select></div><div class="fg"><label class="flabel">District / Franchise</label><select class="finput" id="fr-new-name"><option value="">Select state first</option></select></div><div class="fg"><label class="flabel">Weekly target</label><input class="finput" id="fr-new-tgt" type="number" value="2500"/></div><div class="fg"><label class="flabel">&nbsp;</label><button class="btn btn-amber" onclick="addFr()">+ Add</button></div></div></div>`;
  document.getElementById('is-states').innerHTML=html;
  fillStateDropdown('fr-new-state');
  renderISRecent();
}
function isFormCost(){
  const b=parseInt(document.getElementById('is-bottles').value)||0;
  const s=parseInt(document.getElementById('is-spend').value)||0;
  const el=document.getElementById('is-cost-preview');
  if(b<=0){ el.textContent='—'; el.style.color='var(--text2)'; return; }
  const c=s/b; el.textContent='Rs.'+c.toFixed(2); el.style.color=c<=BOT_CAP?'var(--sage)':'var(--red)';
}
function isFormPrefill(){
  // when picking an existing entry's franchise+date, show current stored value
  const st=document.getElementById('is-state').value, f=document.getElementById('is-franchise').value, d=document.getElementById('is-entry-date').value;
  if(st&&f&&d){
    const b=BOTTLES[botKey(d,st,f)], sp=SPEND[botKey(d,st,f)];
    if(b!==undefined){ document.getElementById('is-bottles').value=b; }
    if(sp!==undefined){ document.getElementById('is-spend').value=sp; }
    isFormCost();
  }
}
function saveISEntry(){
  const by=document.getElementById('is-by').value.trim();
  const d=document.getElementById('is-entry-date').value;
  const st=document.getElementById('is-state').value;
  const f=document.getElementById('is-franchise').value;
  const b=parseInt(document.getElementById('is-bottles').value);
  const sp=parseInt(document.getElementById('is-spend').value);
  if(!by){showToast('Enter your name (Entered by)','err');return;}
  if(!d){showToast('Pick a date','err');return;}
  if(!st||!f){showToast('Pick state & franchise','err');return;}
  if(isNaN(b)&&isNaN(sp)){showToast('Enter bottles or spend','err');return;}
  setUser(by);
  // ensure franchise exists in the list
  if(!FRANCHISES[st]) FRANCHISES[st]=[];
  if(!FRANCHISES[st].includes(f)) FRANCHISES[st].push(f);
  const bv=Math.max(0,b||0), sv=Math.max(0,sp||0);
  const prevB=BOTTLES[botKey(d,st,f)], prevS=SPEND[botKey(d,st,f)];
  BOTTLES[botKey(d,st,f)]=bv; SPEND[botKey(d,st,f)]=sv;
  saveBot();
  const cpb=bv>0?(sv/bv):0;
  const action=(prevB!==undefined||prevS!==undefined)?'Edited':'Added';
  logAction(action+' inside-sales entry','Inside Sales',`${f} (${st}) on ${d}: ${bv} bottles, Rs.${sv} spend, cost/bottle Rs.${cpb.toFixed(2)}${cpb>BOT_CAP?' (OVER CAP)':''}`);
  // reset numeric inputs
  document.getElementById('is-bottles').value=''; document.getElementById('is-spend').value=''; isFormCost();
  renderIS(); renderISDash();
  showToast('Entry saved by '+by);
}
function renderISRecent(){
  const el=document.getElementById('is-recent'); if(!el) return;
  // gather all bottle/spend entries, newest dates first
  const rows=[];
  Object.keys(BOTTLES).forEach(k=>{ const p=k.split('|'); rows.push({date:p[0],state:p[1],fr:p[2],b:BOTTLES[k]||0,s:SPEND[k]||0}); });
  Object.keys(SPEND).forEach(k=>{ if(BOTTLES[k]===undefined){ const p=k.split('|'); rows.push({date:p[0],state:p[1],fr:p[2],b:0,s:SPEND[k]||0}); } });
  rows.sort((a,b)=>b.date.localeCompare(a.date));
  const show=rows.slice(0,15);
  if(!show.length){ el.innerHTML='<div class="empty">No entries yet. Use the form above to add bottles &amp; spend.</div>'; return; }
  let h='<table class="city-tbl"><thead><tr><th>Date</th><th>Franchise</th><th>State</th><th style="text-align:center;">Bottles</th><th style="text-align:center;">Spend</th><th style="text-align:center;">Cost/Bottle</th><th></th></tr></thead><tbody>';
  show.forEach(r=>{
    const c=r.b>0?(r.s/r.b):0;
    h+=`<tr><td style="color:var(--text2);">${r.date}</td><td style="color:var(--text);font-weight:500;">${r.fr}</td><td style="color:var(--text3);">${r.state}</td><td style="text-align:center;color:var(--sage);">${r.b}</td><td style="text-align:center;color:var(--burnt);">Rs.${r.s}</td><td style="text-align:center;color:${c===0?'var(--text3)':c<=BOT_CAP?'var(--sage)':'var(--red)'};">${c===0?'-':'Rs.'+c.toFixed(2)}</td><td><button class="del-btn" onclick="confirmBtn(this,()=>delISEntry('${r.date}','${r.state.replace(/'/g,"")}','${r.fr.replace(/'/g,"")}'))">x</button></td></tr>`;
  });
  h+='</tbody></table>';
  el.innerHTML=h;
}
function delISEntry(d,st,f){
  const b=BOTTLES[botKey(d,st,f)]||0, s=SPEND[botKey(d,st,f)]||0;
  const uid=snapshot('isentry',`Inside Sales: ${f} (${st}) ${d}`);
  delete BOTTLES[botKey(d,st,f)]; delete SPEND[botKey(d,st,f)];
  saveBot();
  logAction('Deleted inside-sales entry','Inside Sales',`${f} (${st}) on ${d}: was ${b} bottles, Rs.${s} spend`,uid);
  renderIS(); renderISDash(); toastUndo('Entry deleted',uid);
}
function toggleBotState(st){ openBotStates.has(st)?openBotStates.delete(st):openBotStates.add(st); renderIS(); }
function setBot(st,f,v){ BOTTLES[botKey(botEntryDate(),st,f)]=Math.max(0,parseInt(v)||0); saveBot(); renderIS(); renderISDash(); }
function setSpend(st,f,v){ SPEND[botKey(botEntryDate(),st,f)]=Math.max(0,parseInt(v)||0); saveBot(); renderIS(); renderISDash(); }
function setFrTgt(st,f,v){ FRTGT[st+'||'+f]=Math.max(0,parseInt(v)||0); saveBot(); logAction('Edited weekly target','Inside Sales',`${f} (${st}) target set to ${v}`); renderIS(); renderISDash(); }
function delFr(st,f){ const uid=snapshot('franchise',`Franchise: ${f} (${st})`); FRANCHISES[st]=FRANCHISES[st].filter(x=>x!==f); Object.keys(BOTTLES).forEach(k=>{const p=k.split('|');if(p[1]===st&&p[2]===f)delete BOTTLES[k];}); Object.keys(SPEND).forEach(k=>{const p=k.split('|');if(p[1]===st&&p[2]===f)delete SPEND[k];}); delete FRTGT[st+'||'+f]; if(FRANCHISES[st].length===0) delete FRANCHISES[st]; saveBot(); logAction('Deleted franchise','Inside Sales',`${f} (${st}) and all its bottle/spend data`,uid); renderIS(); renderISDash(); toastUndo('Franchise removed',uid); }
function openFranchise(st,f){
  const wk=frWeek(st,f); const dayT=Math.round(wk/BOT_WD);
  const mo=parseInt(document.getElementById('f-month')?.value??5); const yr=parseInt(document.getElementById('f-year')?.value??2026);
  const dim=new Date(yr,mo+1,0).getDate();
  let cumB=0,cumS=0,rows='';
  const tod=new Date().toISOString().split('T')[0];
  for(let d=1;d<=dim;d++){
    const ds=yr+'-'+String(mo+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const b=BOTTLES[botKey(ds,st,f)]; const sp=SPEND[botKey(ds,st,f)];
    const has=(b!==undefined||sp!==undefined);
    if(has){cumB+=(b||0);cumS+=(sp||0);}
    const cpb=(b||0)>0?((sp||0)/(b||0)):null;
    rows+=`<tr class="${ds===tod?'today':''}"><td>${String(d).padStart(2,'0')}</td><td style="color:var(--text2);">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo]} ${String(d).padStart(2,'0')}</td><td style="color:var(--sage);${has?'font-weight:600;':''}">${has?(b||0):'-'}</td><td style="color:var(--burnt);">${has?(sp||0):'-'}</td><td style="color:${cpb===null?'var(--text3)':cpb<=BOT_CAP?'var(--sage)':'var(--red)'};">${cpb===null?'-':'Rs.'+cpb.toFixed(2)}</td><td style="color:var(--text);">${has?cumB:'-'}</td><td style="color:var(--text3);">${dayT}</td></tr>`;
  }
  const totCpb=cumB>0?(cumS/cumB):0;
  const m=document.createElement('div'); m.id='cmodal'; m.className='modal-overlay';
  m.innerHTML=`<div class="modal-box"><div class="modal-hdr"><div><div style="font-size:11px;color:var(--text2);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">${st} - Inside Sales</div><div style="font-size:22px;font-weight:700;">${f}</div><div style="font-size:12px;color:var(--text2);margin-top:5px;">Weekly target: ${wk.toLocaleString('en-IN')} bottles - day target ${dayT}</div></div><button onclick="document.getElementById('cmodal').remove()" style="background:var(--surface3);border:1px solid var(--border);color:var(--text2);padding:9px 18px;cursor:pointer;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1px;border-radius:8px;">CLOSE</button></div><div class="modal-body"><div class="city-summary"><div class="cs-card" style="background:var(--sage-dim);border-color:rgba(95,214,111,0.2);"><div class="cs-lbl">Bottles (month)</div><div class="cs-val c-sage">${cumB.toLocaleString('en-IN')}</div><div class="cs-meta">Target: ${wk.toLocaleString('en-IN')}/wk</div></div><div class="cs-card" style="background:var(--burnt-dim);border-color:rgba(245,166,35,0.2);"><div class="cs-lbl">Mktg Spend</div><div class="cs-val c-burnt">Rs.${cumS.toLocaleString('en-IN')}</div><div class="cs-meta">this month</div></div><div class="cs-card" style="background:${totCpb<=BOT_CAP?'var(--sage-dim)':'var(--red-dim)'};border-color:rgba(95,214,111,0.2);"><div class="cs-lbl">Cost / Bottle</div><div class="cs-val" style="color:${totCpb===0?'var(--text2)':totCpb<=BOT_CAP?'var(--sage)':'var(--red)'};">Rs.${totCpb.toFixed(2)}</div><div class="cs-meta">Cap: Rs.${BOT_CAP.toFixed(2)}</div></div><div class="cs-card" style="background:var(--blue-dim);border-color:rgba(86,168,245,0.2);"><div class="cs-lbl">Status</div><div class="cs-val c-blue" style="font-size:18px;">${totCpb===0?'No spend':totCpb<=BOT_CAP?'Within cap':'Over cap'}</div><div class="cs-meta">vs Rs.2 cap</div></div></div><table class="day-tbl"><thead><tr><th>Day</th><th>Date</th><th style="color:var(--sage);">Bottles</th><th style="color:var(--burnt);">Spend</th><th>Cost/Bottle</th><th style="color:var(--text);">Cum.Bottles</th><th>Day Tgt</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  document.body.appendChild(m);
}
function addFr(){
  const st=document.getElementById('fr-new-state').value.trim();
  const nm=document.getElementById('fr-new-name').value.trim();
  const tg=Math.max(0,parseInt(document.getElementById('fr-new-tgt').value)||2500);
  if(!st||!nm){showToast('Fill state & name','err');return;}
  if(!FRANCHISES[st]) FRANCHISES[st]=[];
  if(FRANCHISES[st].includes(nm)){showToast('Already exists','err');return;}
  askName(function(){ FRANCHISES[st].push(nm); FRTGT[st+'||'+nm]=tg;
  saveBot(); logAction('Added franchise','Inside Sales',`${nm} (${st}), weekly target ${tg}`); renderIS(); renderISDash(); showToast('Franchise added'); });
}

// ============ HR ============
const HR_TARGET=15;
const HR_DEFAULT=[
  {id:'h1',role:'BDE',state:'Tamil Nadu',city:'Chennai',star:true,leads:0},
  {id:'h2',role:'BDE',state:'Tamil Nadu',city:'Trichy',star:true,leads:0},
  {id:'h3',role:'BDE',state:'Tamil Nadu',city:'Tiruvallur',star:true,leads:0},
  {id:'h4',role:'BDE',state:'Tamil Nadu',city:'Tiruvanamalai',star:true,leads:0},
  {id:'h5',role:'BDE',state:'Tamil Nadu',city:'Coimbatore',star:true,leads:0},
  {id:'h6',role:'BDE',state:'Karnataka',city:'Hubli',star:false,leads:0},
  {id:'h7',role:'BDE',state:'Andhra Pradesh',city:'Rayachoti',star:false,leads:0},
  {id:'h8',role:'BDE',state:'Andhra Pradesh',city:'Anantapur',star:false,leads:0},
  {id:'h9',role:'BDE',state:'Andhra Pradesh',city:'Palnadu',star:false,leads:0},
  {id:'h10',role:'Production Executive',state:'Andhra Pradesh',city:'Guntur',star:false,leads:0},
  {id:'h11',role:'Production Supervisor',state:'Andhra Pradesh',city:'Narasaraopet',star:false,leads:0},
  {id:'h12',role:'BDE',state:'Maharashtra',city:'Chandrapur',star:false,leads:0},
  {id:'h13',role:'BDE',state:'Maharashtra',city:'Sangli',star:false,leads:0}
];
let HRDATA=[];
let openHrRoles=new Set();
let openHrStates=new Set();
function loadHr(){ try{const h=store.getItem('safc_hr4'); HRDATA=h?JSON.parse(h):JSON.parse(JSON.stringify(HR_DEFAULT));}catch(e){HRDATA=JSON.parse(JSON.stringify(HR_DEFAULT));} }
function saveHr(){ store.setItem('safc_hr4',JSON.stringify(HRDATA)); }
function hrBadge(a,t){const p=t>0?a/t:0;if(p>=1)return '<span class="pill pill-ok">Filled pipeline</span>';if(p>=0.5)return '<span class="pill pill-warn">In progress</span>';return '<span class="pill pill-bad">Needs leads</span>';}
function renderHR(){
  if(!HRDATA.length) loadHr();
  const roles={};
  HRDATA.forEach(p=>{ if(!roles[p.role]) roles[p.role]={}; if(!roles[p.role][p.state]) roles[p.role][p.state]=[]; roles[p.role][p.state].push(p); });
  let html='';
  Object.keys(roles).forEach(role=>{
    const open=openHrRoles.has(role);
    let rTotalPos=0,rA=0;
    Object.keys(roles[role]).forEach(st=>{ rTotalPos+=roles[role][st].length; roles[role][st].forEach(p=>rA+=p.leads); });
    let inner='';
    Object.keys(roles[role]).forEach(st=>{
      const skey=role+'||'+st; const sopen=openHrStates.has(skey);
      const items=roles[role][st];
      let rows='<table class="city-tbl"><thead><tr><th>City / District</th><th style="text-align:center;">Leads</th><th style="text-align:center;">Target</th><th style="text-align:center;">Status</th><th style="text-align:center;">Focus</th><th></th></tr></thead><tbody>';
      items.forEach(p=>{
        rows+=`<tr><td style="color:var(--text);font-weight:500;">${p.city}</td><td style="text-align:center;"><input class="tgt-input" type="number" min="0" value="${p.leads}" style="color:#f06aa0;width:70px;" onchange="setHrLeads('${p.id}',this.value)"/></td><td style="text-align:center;color:var(--text3);">${HR_TARGET}</td><td style="text-align:center;">${hrBadge(p.leads,HR_TARGET)}</td><td style="text-align:center;cursor:pointer;font-size:16px;color:${p.star?'var(--amber)':'var(--text3)'};" onclick="toggleHrStar('${p.id}')">${p.star?'★':'☆'}</td><td><button class="del-btn" onclick="confirmBtn(this,()=>delHr('${p.id}'))">x</button></td></tr>`;
      });
      rows+='</tbody></table>';
      let sA=0; items.forEach(p=>sA+=p.leads);
      inner+=`<div style="margin:0 0 6px;border:1px solid var(--border);border-radius:8px;overflow:hidden;"><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;background:var(--surface3);" onclick="toggleHrState('${skey.replace(/'/g,"")}')"><div style="font-size:13px;font-weight:600;color:var(--blue);"><span class="arrow" style="display:inline-block;${sopen?'transform:rotate(90deg);':''}">&#9654;</span> ${st}</div><div style="font-size:11px;color:var(--text2);">${items.length} ${items.length>1?'cities':'city'} - ${sA}/${items.length*HR_TARGET} leads</div></div><div style="${sopen?'':'display:none;'}padding:0 16px 10px;">${rows}</div></div>`;
    });
    html+=`<div class="setup-block" style="padding:0;overflow:hidden;"><div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;cursor:pointer;background:var(--surface2);" onclick="toggleHrRole('${role.replace(/'/g,"")}')"><div style="font-size:14px;font-weight:600;color:var(--amber);"><span class="arrow" style="display:inline-block;${open?'transform:rotate(90deg);':''}">&#9654;</span> ${role}</div><div style="font-size:12px;color:var(--text2);">${Object.keys(roles[role]).length} states - ${rTotalPos} positions - ${rA}/${rTotalPos*HR_TARGET} leads</div></div><div style="${open?'':'display:none;'}padding:12px 20px;">${inner}</div></div>`;
  });
  html+=`<div class="setup-block"><div class="setup-title" style="margin-bottom:10px;">Add new position</div><div class="form-row-4"><div class="fg"><label class="flabel">Role</label><input class="finput" id="hr-new-role" placeholder="e.g. BDE"/></div><div class="fg"><label class="flabel">State</label><select class="finput" id="hr-new-state" onchange="fillDist('hr-new-state','hr-new-city')"><option value="">Select state</option></select></div><div class="fg"><label class="flabel">District</label><select class="finput" id="hr-new-city"><option value="">Select state first</option></select></div><div class="fg"><label class="flabel">&nbsp;</label><button class="btn btn-amber" onclick="addHr()">+ Add</button></div></div></div>`;
  html+=`<div style="font-size:11px;color:var(--text2);margin:10px 2px;"><span style="color:var(--amber);">★</span> = focus position this week - target ${HR_TARGET} qualified leads each</div>`;
  document.getElementById('hr-states').innerHTML=html;
  fillStateDropdown('hr-new-state');
  // tab scorecard
  const tm=document.getElementById('hr-tab-metrics');
  if(tm){
    let hrA=0,hrT=0,filled=0; HRDATA.forEach(p=>{hrA+=p.leads;hrT+=HR_TARGET;if(p.leads>=HR_TARGET)filled++;});
    const stars=HRDATA.filter(p=>p.star).length;
    tm.innerHTML=`
    <div class="mc mc-sales" style="border-top-color:#f06aa0;"><div class="mc-lbl">Leads Generated</div><div class="mc-val" style="color:#f06aa0;">${hrA}</div><div class="mc-meta">Target: ${hrT}</div><span class="mc-status ${hrA>=hrT?'st-ok':hrA/Math.max(hrT,1)>0.5?'st-warn':'st-bad'}">${Math.round(hrA/Math.max(hrT,1)*100)}%</span></div>
    <div class="mc" style="border-top:3px solid var(--amber);"><div class="mc-lbl">★ Focus / Priority</div><div class="mc-val" style="color:var(--amber);">${stars}</div><div class="mc-meta">starred this week</div><span class="mc-status st-neutral">of ${HRDATA.length}</span></div>
    <div class="mc mc-mv"><div class="mc-lbl">Open Positions</div><div class="mc-val">${HRDATA.length}</div><div class="mc-meta">across ${new Set(HRDATA.map(p=>p.state)).size} states</div><span class="mc-status st-neutral">roles</span></div>
    <div class="mc mc-sales"><div class="mc-lbl">Pipeline Filled</div><div class="mc-val">${filled}</div><div class="mc-meta">at 15+ leads</div><span class="mc-status st-neutral">of ${HRDATA.length}</span></div>`;
  }
}
function toggleHrRole(r){ openHrRoles.has(r)?openHrRoles.delete(r):openHrRoles.add(r); renderHR(); }
function toggleHrState(k){ openHrStates.has(k)?openHrStates.delete(k):openHrStates.add(k); renderHR(); }
function setHrLeads(id,v){ const p=HRDATA.find(x=>x.id===id); if(p){p.leads=Math.max(0,parseInt(v)||0);saveHr();logAction('Updated HR leads','HR',`${p.role} - ${p.city}: ${p.leads} leads`);renderHR();renderHRDash();} }
function toggleHrStar(id){ const p=HRDATA.find(x=>x.id===id); if(p){p.star=!p.star;saveHr();logAction(p.star?'Marked HR focus':'Unmarked HR focus','HR',`${p.role} - ${p.city}`);renderHR();renderHRDash();} }
function delHr(id){ const p=HRDATA.find(x=>x.id===id); const uid=snapshot('hr',p?`HR: ${p.role} - ${p.city} (${p.state})`:'HR position'); HRDATA=HRDATA.filter(x=>x.id!==id); saveHr(); if(p)logAction('Deleted HR position','HR',`${p.role} - ${p.city} (${p.state})`,uid); renderHR(); renderHRDash(); toastUndo('Position removed',uid); }
function addHr(){
  const role=document.getElementById('hr-new-role').value.trim();
  const state=document.getElementById('hr-new-state').value.trim();
  const city=document.getElementById('hr-new-city').value.trim();
  if(!role||!state||!city){showToast('Fill role, state & city','err');return;}
  askName(function(){
    HRDATA.push({id:'h'+Date.now(),role,state,city,star:false,leads:0});
    saveHr(); logAction('Added HR position','HR',`${role} - ${city} (${state})`); renderHR(); renderHRDash(); showToast('Position added');
    document.getElementById('hr-new-role').value=''; document.getElementById('hr-new-state').value=''; document.getElementById('hr-new-city').innerHTML='<option value="">Select state first</option>';
  });
}

// ============ MODULES ============
const MOD_DEFAULT=[{id:'mod1',name:'Module 1 - About the Company',deadline:'2026-06-27'},{id:'mod2',name:'Module 2 - Milestones',deadline:'2026-06-27'}];
let MODULES=[];
let MODDONE={};
function loadMod(){
  try{const ml=store.getItem('safc_modlist4'); MODULES=ml?JSON.parse(ml):JSON.parse(JSON.stringify(MOD_DEFAULT));}catch(e){MODULES=JSON.parse(JSON.stringify(MOD_DEFAULT));}
  try{const m=store.getItem('safc_mod4'); if(m) MODDONE=JSON.parse(m);}catch(e){}
}
function saveMod(){ store.setItem('safc_mod4',JSON.stringify(MODDONE)); store.setItem('safc_modlist4',JSON.stringify(MODULES)); }
function modOverdue(m){ if(MODDONE[m.id]||!m.deadline) return false; return new Date().toISOString().split('T')[0] > m.deadline; }
function modStats(){
  const today=new Date().toISOString().split('T')[0];
  let total=MODULES.length, done=0, beforeDeadline=0, overdue=0;
  MODULES.forEach(m=>{ if(MODDONE[m.id]){ done++; if(!m.deadline || today<=m.deadline) beforeDeadline++; } else if(modOverdue(m)) overdue++; });
  return {total,done,beforeDeadline,overdue};
}
function renderMod(){
  if(!MODULES.length) loadMod();
  const today=new Date().toISOString().split('T')[0];
  document.getElementById('mod-list').innerHTML=MODULES.map(m=>{
    const done=MODDONE[m.id];
    const over=modOverdue(m);
    const ddlTxt=m.deadline?('Deadline: '+m.deadline+(over?' — OVERDUE':'')):'No deadline set';
    return `<div class="setup-block" style="display:flex;align-items:center;justify-content:space-between;${over?'border-left:3px solid var(--red);':''}"><div><div class="setup-title">${m.name}</div><div class="setup-sub" style="${over?'color:var(--red);':''}">${ddlTxt}</div><div style="margin-top:6px;"><input type="date" class="finput" style="max-width:170px;padding:6px 10px;" value="${m.deadline||''}" onchange="setModDeadline('${m.id}',this.value)"/></div></div><div style="display:flex;gap:8px;align-items:center;"><button class="btn ${done?'btn-amber':'btn-ghost'}" onclick="toggleMod('${m.id}')">${done?'✓ Completed':'Mark complete'}</button><button class="del-btn" onclick="confirmBtn(this,()=>delMod('${m.id}'))">x</button></div></div>`;
  }).join('')+`<div class="setup-block"><div class="setup-title" style="margin-bottom:10px;">Add new module</div><div class="form-row-4"><div class="fg"><label class="flabel">Module name</label><input class="finput" id="mod-new-name" placeholder="e.g. Module 3 - Sales Process"/></div><div class="fg"><label class="flabel">Deadline</label><input class="finput" id="mod-new-ddl" type="date" value="${today}"/></div><div class="fg"><label class="flabel">&nbsp;</label><button class="btn btn-amber" onclick="addMod()">+ Add module</button></div></div></div>`;
  const tm=document.getElementById('mod-tab-metrics');
  if(tm){
    const s=modStats();
    tm.innerHTML=`
    <div class="mc" style="border-top:3px solid var(--amber);"><div class="mc-lbl">Modules This Week</div><div class="mc-val" style="color:var(--amber);">${s.total}</div><div class="mc-meta">total target</div><span class="mc-status st-neutral">modules</span></div>
    <div class="mc mc-sales"><div class="mc-lbl">Achieved</div><div class="mc-val">${s.done}</div><div class="mc-meta">of ${s.total} completed</div><span class="mc-status ${s.done>=s.total&&s.total>0?'st-ok':s.done>0?'st-warn':'st-bad'}">${Math.round(s.done/Math.max(s.total,1)*100)}%</span></div>
    <div class="mc mc-mv" style="border-top-color:var(--sage);"><div class="mc-lbl">Before Deadline</div><div class="mc-val" style="color:var(--sage);">${s.beforeDeadline}</div><div class="mc-meta">on-time completions</div><span class="mc-status st-neutral">of ${s.done}</span></div>
    <div class="mc mc-elig" style="border-top-color:var(--red);"><div class="mc-lbl">Overdue</div><div class="mc-val" style="color:${s.overdue>0?'var(--red)':'var(--text)'};">${s.overdue}</div><div class="mc-meta">past deadline</div><span class="mc-status ${s.overdue>0?'st-bad':'st-ok'}">${s.overdue>0?'attention':'clear'}</span></div>`;
  }
}
function toggleMod(id){ MODDONE[id]=!MODDONE[id]; saveMod(); const m=MODULES.find(x=>x.id===id); if(m)logAction(MODDONE[id]?'Marked module complete':'Reopened module','L&D',m.name); renderMod(); renderMAODash(); }
function delMod(id){ const m=MODULES.find(x=>x.id===id); const uid=snapshot('module',m?`Module: ${m.name}`:'module'); MODULES=MODULES.filter(x=>x.id!==id); delete MODDONE[id]; saveMod(); if(m)logAction('Deleted module','L&D',m.name,uid); renderMod(); renderMAODash(); toastUndo('Module removed',uid); }
function setModDeadline(id,v){ const m=MODULES.find(x=>x.id===id); if(m){m.deadline=v;saveMod();logAction('Changed module deadline','L&D',`${m.name} -> ${v}`);renderMod();} }
function addMod(){ const n=document.getElementById('mod-new-name').value.trim(); const ddl=document.getElementById('mod-new-ddl').value; if(!n){showToast('Enter module name','err');return;} askName(function(){ MODULES.push({id:'mod'+Date.now(),name:n,deadline:ddl}); saveMod(); logAction('Added module','L&D',`${n}, deadline ${ddl||'none'}`); renderMod(); renderMAODash(); showToast('Module added'); document.getElementById('mod-new-name').value=''; }); }

// ============ AWARENESS ============
let AWARE={};
function loadAw(){ try{const a=store.getItem('safc_aw4'); if(a) AWARE=JSON.parse(a);}catch(e){} }
function saveAw(){ store.setItem('safc_aw4',JSON.stringify(AWARE)); }
function renderAw(){
  const cities=Object.keys(AWARE);
  let rows=cities.map(c=>{
    const sc=AWARE[c]||0;
    const col=sc>=8?'var(--sage)':sc>=5?'var(--burnt)':'var(--red)';
    return `<div class="setup-block" style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;"><div><div style="font-weight:600;color:var(--text);">${c}</div><div style="font-size:12px;color:var(--text2);">Brand recall: ${sc} / 10</div></div><div style="display:flex;align-items:center;gap:12px;"><input class="tgt-input" type="number" min="0" max="10" value="${sc}" style="color:${col};" onchange="setAw('${c}',this.value)"/><button class="del-btn" onclick="confirmBtn(this,()=>delAw('${c}'))">x</button></div></div>`;
  }).join('');
  document.getElementById('aw-list').innerHTML=(rows||'<div class="empty">No launch cities added yet</div>')+`<div class="setup-block" style="margin-top:8px;"><div class="setup-title" style="margin-bottom:10px;">Add launch city</div><div class="form-row-4"><div class="fg"><label class="flabel">State</label><select class="finput" id="aw-new-state" onchange="fillDist('aw-new-state','aw-new-city')"><option value="">Select state</option></select></div><div class="fg"><label class="flabel">District</label><select class="finput" id="aw-new-city"><option value="">Select state first</option></select></div><div class="fg"><label class="flabel">Recall (0-10)</label><input class="finput" id="aw-new-score" type="number" min="0" max="10" value="0"/></div><div class="fg"><label class="flabel">&nbsp;</label><button class="btn btn-amber" onclick="addAw()">+ Add</button></div></div></div><div style="font-size:11px;color:var(--text2);margin:10px 2px;">Target: Month 1 = 2/10 - Month 3 = 5/10 - Month 6 = 8/10 people know the brand when FM arrives</div>`;
  fillStateDropdown('aw-new-state');
  const tm=document.getElementById('aw-tab-metrics');
  if(tm){
    const n=cities.length;
    const avg=n>0?(cities.reduce((a,c)=>a+(AWARE[c]||0),0)/n):0;
    const ready=cities.filter(c=>(AWARE[c]||0)>=8).length;
    tm.innerHTML=`
    <div class="mc" style="border-top:3px solid var(--burnt);"><div class="mc-lbl">Launch Cities</div><div class="mc-val" style="color:var(--burnt);">${n}</div><div class="mc-meta">being made aware</div><span class="mc-status st-neutral">tracked</span></div>
    <div class="mc mc-mv"><div class="mc-lbl">Avg Recall</div><div class="mc-val">${avg.toFixed(1)} / 10</div><div class="mc-meta">across all cities</div><span class="mc-status ${avg>=8?'st-ok':avg>=5?'st-warn':'st-bad'}">${avg>=8?'strong':avg>=5?'building':'early'}</span></div>
    <div class="mc mc-sales"><div class="mc-lbl">Launch-Ready</div><div class="mc-val">${ready}</div><div class="mc-meta">at 8+/10 recall</div><span class="mc-status st-neutral">of ${n}</span></div>`;
  }
}
function addAw(){ const st=document.getElementById('aw-new-state').value.trim(); const c=document.getElementById('aw-new-city').value.trim(); const sc=Math.max(0,Math.min(10,parseInt(document.getElementById('aw-new-score').value)||0)); if(!st||!c){showToast('Pick state & district','err');return;} const key=c+' ('+st+')'; askName(function(){ AWARE[key]=sc; saveAw(); logAction('Added awareness city','Awareness',`${key}, recall ${sc}/10`); renderAw(); renderMAODash(); showToast('City added'); }); }
function setAw(c,v){ AWARE[c]=Math.max(0,Math.min(10,parseInt(v)||0)); saveAw(); logAction('Updated recall score','Awareness',`${c}: ${AWARE[c]}/10`); renderAw(); renderMAODash(); }
function delAw(c){ const uid=snapshot('awareness',`Awareness city: ${c}`); delete AWARE[c]; saveAw(); logAction('Deleted awareness city','Awareness',c,uid); renderAw(); renderMAODash(); toastUndo('City removed',uid); }

// ===== State/District dropdown helpers =====
function fillStateDropdown(id){
  const el=document.getElementById(id); if(!el) return;
  const cur=el.value;
  el.innerHTML='<option value="">Select state</option>'+Object.keys(INDIA).sort().map(s=>`<option${s===cur?' selected':''}>${s}</option>`).join('');
}
function fillDist(stateId,distId){
  const st=document.getElementById(stateId).value;
  const d=document.getElementById(distId);
  if(!st||!INDIA[st]){ d.innerHTML='<option value="">Select state first</option>'; return; }
  d.innerHTML='<option value="">Select district</option>'+INDIA[st].map(x=>`<option>${x}</option>`).join('');
}

// ===== Inside Sales dashboard scorecard + drilldown =====
function isRow(label,tgt,ach,level,onclick,open){
  const def=Math.max(0,tgt-ach);
  const achCol=ach>=tgt&&tgt>0?'c-ok':ach>0?'c-sage':'c-dim';
  const defCol=def===0?'c-ok':'c-bad';
  const nm=level==='all'?'ind':level==='state'?'st':'ci';
  const rc=level==='all'?'r-india':level==='state'?'r-state':'r-city';
  const arr=(level==='all'||level==='state')?`<span class="arrow" style="${open?'transform:rotate(90deg);':''}">&#9654;</span>`:'';
  const oc=onclick?`onclick="${onclick}"`:'';
  return `<div class="dr ${rc}" style="grid-template-columns:1fr 1fr 1fr 1fr;" ${oc}>
    <div class="dc-name ${nm}">${arr}${label}</div>
    <div class="dc bg-sales n-tgt">${tgt.toLocaleString('en-IN')}</div>
    <div class="dc bg-sales n-ach ${achCol}">${ach.toLocaleString('en-IN')}</div>
    <div class="dc bg-sales n-def ${defCol}">${def===0?'\u2713':'-'+def.toLocaleString('en-IN')}</div>
  </div>`;
}
let isDashOpen=false; let isDashStates=new Set();
function renderISDash(){
  const T=isTotals();
  const def=Math.max(0,T.totT-T.totA);
  document.getElementById('is-dash-metrics').innerHTML=`
    <div class="mc mc-sales"><div class="mc-lbl">Bottles (filtered)</div><div class="mc-val">${T.totA.toLocaleString('en-IN')}</div><div class="mc-meta">Target: ${T.totT.toLocaleString('en-IN')}</div><span class="mc-status ${def===0?'st-ok':T.totA/Math.max(T.totT,1)>0.5?'st-warn':'st-bad'}">${def===0?'On track':'-'+def.toLocaleString('en-IN')+' behind'}</span></div>
    <div class="mc mc-leads"><div class="mc-lbl">Weekly Target</div><div class="mc-val">${T.totT.toLocaleString('en-IN')}</div><div class="mc-meta">${T.n} franchises</div><span class="mc-status st-neutral">bottles</span></div>
    <div class="mc mc-mv"><div class="mc-lbl">Deficit</div><div class="mc-val">${def.toLocaleString('en-IN')}</div><div class="mc-meta">to reach target</div><span class="mc-status st-neutral">bottles</span></div>
    <div class="mc mc-elig"><div class="mc-lbl">Budget @Rs.2</div><div class="mc-val">Rs.${(T.budget/100000).toFixed(2)}L</div><div class="mc-meta">${T.budget.toLocaleString('en-IN')}</div><span class="mc-status st-neutral">weekly</span></div>`;
  let html=isRow('All Franchises Total',T.totT,T.totA,'all','toggleISDash()',isDashOpen);
  if(isDashOpen){
    Object.keys(FRANCHISES).forEach(st=>{
      let sT=0,sA=0; FRANCHISES[st].forEach(f=>{sT+=frWeek(st,f);sA+=botTotal(st,f);});
      const so=isDashStates.has(st);
      html+=isRow(st,sT,sA,'state',`toggleISDashState('${st.replace(/'/g,"")}')`,so);
      if(so){ FRANCHISES[st].forEach(f=>{ html+=isRow(f+' <span class="city-link">↗</span>',frWeek(st,f),botTotal(st,f),'city',`openFranchise('${st.replace(/'/g,"")}','${f.replace(/'/g,"")}')`,false); }); }
    });
  }
  document.getElementById('is-drill-tree').innerHTML=html;
}
function toggleISDash(){ isDashOpen=!isDashOpen; renderISDash(); }
function toggleISDashState(st){ isDashStates.has(st)?isDashStates.delete(st):isDashStates.add(st); renderISDash(); }

// ===== HR dashboard scorecard =====
let hrDashOpen=false, hrDashRoles=new Set(), hrDashStates=new Set();
function hrDashRow(label,tgt,leads,level,onclick,open){
  const gap=Math.max(0,tgt-leads);
  const achCol=leads>=tgt&&tgt>0?'c-ok':leads>0?'c-sage':'c-dim';
  const gapCol=gap===0?'c-ok':'c-bad';
  // levels: all (top) -> role -> state -> city (deepest)
  let nm,rc,nameStyle='';
  if(level==='all'){ nm='ind'; rc='r-india'; }
  else if(level==='role'){ nm='st'; rc='r-state'; nameStyle='font-size:14px;font-weight:700;color:var(--amber);'; }
  else if(level==='state'){ nm='ci'; rc='r-state'; nameStyle='font-weight:600;color:var(--blue);padding-left:30px;'; }
  else { nm='ci'; rc='r-city'; nameStyle='padding-left:48px;'; }
  const hasArrow=(level==='all'||level==='role'||level==='state');
  const arr=hasArrow?`<span class="arrow" style="${open?'transform:rotate(90deg);':''}">&#9654;</span>`:'';
  const oc=onclick?`onclick="${onclick}"`:'';
  return `<div class="dr ${rc}" style="grid-template-columns:1fr 1fr 1fr 1fr;" ${oc}><div class="dc-name ${nm}" style="${nameStyle}">${arr}${label}</div><div class="dc bg-sales n-tgt">${tgt}</div><div class="dc bg-sales n-ach ${achCol}">${leads}</div><div class="dc bg-sales n-def ${gapCol}">${gap===0?'\u2713':'-'+gap}</div></div>`;
}
function renderHRDash(){
  if(!HRDATA.length) loadHr();
  let hrA=0,hrT=0,filled=0; HRDATA.forEach(p=>{hrA+=p.leads;hrT+=HR_TARGET;if(p.leads>=HR_TARGET)filled++;});
  const stars=HRDATA.filter(p=>p.star).length;
  document.getElementById('hr-dash-metrics').innerHTML=`
    <div class="mc mc-sales" style="border-top-color:#f06aa0;"><div class="mc-lbl">Leads Generated</div><div class="mc-val" style="color:#f06aa0;">${hrA}</div><div class="mc-meta">Target: ${hrT}</div><span class="mc-status ${hrA>=hrT?'st-ok':hrA/Math.max(hrT,1)>0.5?'st-warn':'st-bad'}">${Math.round(hrA/Math.max(hrT,1)*100)}%</span></div>
    <div class="mc" style="border-top:3px solid var(--amber);"><div class="mc-lbl">★ Focus / Priority</div><div class="mc-val" style="color:var(--amber);">${stars}</div><div class="mc-meta">starred this week</div><span class="mc-status st-neutral">of ${HRDATA.length}</span></div>
    <div class="mc mc-mv"><div class="mc-lbl">Open Positions</div><div class="mc-val">${HRDATA.length}</div><div class="mc-meta">${new Set(HRDATA.map(p=>p.state)).size} states</div><span class="mc-status st-neutral">roles</span></div>
    <div class="mc mc-sales"><div class="mc-lbl">Pipeline Filled</div><div class="mc-val">${filled}</div><div class="mc-meta">positions at target</div><span class="mc-status st-neutral">of ${HRDATA.length}</span></div>`;
  // drilldown: All positions -> role -> state -> city
  const roles={};
  HRDATA.forEach(p=>{ if(!roles[p.role]) roles[p.role]={}; if(!roles[p.role][p.state]) roles[p.role][p.state]=[]; roles[p.role][p.state].push(p); });
  let html=hrDashRow('All Positions',hrT,hrA,'all','toggleHrDash()',hrDashOpen);
  if(hrDashOpen){
    Object.keys(roles).forEach(role=>{
      let rA=0,rT=0; Object.keys(roles[role]).forEach(st=>roles[role][st].forEach(p=>{rA+=p.leads;rT+=HR_TARGET;}));
      const ro=hrDashRoles.has(role);
      html+=hrDashRow(role,rT,rA,'role',`toggleHrDashRole('${role.replace(/'/g,"")}')`,ro);
      if(ro){
        Object.keys(roles[role]).forEach(st=>{
          const skey=role+'||'+st; const so=hrDashStates.has(skey);
          let sA=0,sT=0; roles[role][st].forEach(p=>{sA+=p.leads;sT+=HR_TARGET;});
          html+=hrDashRow(st,sT,sA,'state',`toggleHrDashState('${skey.replace(/'/g,"")}')`,so);
          if(so){ roles[role][st].forEach(p=>{ html+=hrDashRow(p.city+(p.star?' ★':''),HR_TARGET,p.leads,'city',null,false); }); }
        });
      }
    });
  }
  document.getElementById('hr-drill-tree').innerHTML=html;
}
function toggleHrDash(){ hrDashOpen=!hrDashOpen; renderHRDash(); }
function toggleHrDashRole(r){ hrDashRoles.has(r)?hrDashRoles.delete(r):hrDashRoles.add(r); renderHRDash(); }
function toggleHrDashState(k){ hrDashStates.has(k)?hrDashStates.delete(k):hrDashStates.add(k); renderHRDash(); }

// ===== Modules + Awareness dashboard =====
let modDashOpen=false, awDashOpen=false, awDashStates=new Set();
function renderMAODash(){
  if(!MODULES.length) loadMod();
  const s=modStats();
  const modPct=Math.round(s.done/Math.max(s.total,1)*100);
  document.getElementById('mod-dash-metrics').innerHTML=`
    <div class="mc" style="border-top:3px solid var(--amber);"><div class="mc-lbl">Modules This Week</div><div class="mc-val" style="color:var(--amber);">${s.total}</div><div class="mc-meta">total target</div><span class="mc-status st-neutral">modules</span></div>
    <div class="mc mc-sales"><div class="mc-lbl">Achieved</div><div class="mc-val">${s.done}</div><div class="mc-meta">completed</div><span class="mc-status ${modPct>=100?'st-ok':modPct>0?'st-warn':'st-bad'}">${modPct}%</span></div>
    <div class="mc mc-mv" style="border-top-color:var(--sage);"><div class="mc-lbl">Before Deadline</div><div class="mc-val" style="color:var(--sage);">${s.beforeDeadline}</div><div class="mc-meta">on-time</div><span class="mc-status st-neutral">of ${s.done}</span></div>
    <div class="mc mc-elig" style="border-top-color:var(--red);"><div class="mc-lbl">Overdue</div><div class="mc-val" style="color:${s.overdue>0?'var(--red)':'var(--text)'};">${s.overdue}</div><div class="mc-meta">past deadline</div><span class="mc-status ${s.overdue>0?'st-bad':'st-ok'}">${s.overdue>0?'attention':'clear'}</span></div>`;
  // module drilldown
  const today=new Date().toISOString().split('T')[0];
  let mhtml=`<div class="dr r-india" onclick="toggleModDash()"><div class="dc-name ind" style="grid-column:1/-1;"><span class="arrow" style="${modDashOpen?'transform:rotate(90deg);':''}">&#9654;</span> All Modules (${s.done}/${s.total} done)</div></div>`;
  if(modDashOpen){
    MODULES.forEach(m=>{
      const done=MODDONE[m.id]; const over=modOverdue(m);
      const status=done?(m.deadline&&today<=m.deadline?'Done on time':'Done'):(over?'OVERDUE':'Pending');
      const col=done?(m.deadline&&today<=m.deadline?'var(--sage)':'var(--text)'):(over?'var(--red)':'var(--text2)');
      mhtml+=`<div class="dr r-city"><div class="dc-name ci" style="grid-column:1/-1;display:flex;justify-content:space-between;"><span>${m.name}</span><span style="color:${col};font-size:11px;">${status}${m.deadline?' · '+m.deadline:''}</span></div></div>`;
    });
  }
  document.getElementById('mod-drill-tree').innerHTML=mhtml;
  // awareness
  const cities=Object.keys(AWARE);
  const n=cities.length;
  const awAvg=n>0?(cities.reduce((a,c)=>a+(AWARE[c]||0),0)/n):0;
  const ready=cities.filter(c=>(AWARE[c]||0)>=8).length;
  document.getElementById('aw-dash-metrics').innerHTML=`
    <div class="mc" style="border-top:3px solid var(--burnt);"><div class="mc-lbl">Launch Cities</div><div class="mc-val" style="color:var(--burnt);">${n}</div><div class="mc-meta">being made aware</div><span class="mc-status st-neutral">tracked</span></div>
    <div class="mc mc-mv"><div class="mc-lbl">Avg Recall</div><div class="mc-val">${awAvg.toFixed(1)} / 10</div><div class="mc-meta">across all</div><span class="mc-status ${awAvg>=8?'st-ok':awAvg>=5?'st-warn':'st-bad'}">${awAvg>=8?'strong':awAvg>=5?'building':'early'}</span></div>
    <div class="mc mc-sales"><div class="mc-lbl">Launch-Ready</div><div class="mc-val">${ready}</div><div class="mc-meta">at 8+/10</div><span class="mc-status st-neutral">of ${n}</span></div>`;
  // awareness drilldown by state -> city
  const byState={};
  cities.forEach(c=>{ const m=c.match(/\(([^)]+)\)\s*$/); const st=m?m[1]:'Other'; if(!byState[st])byState[st]=[]; byState[st].push(c); });
  let ahtml=`<div class="dr r-india" onclick="toggleAwDash()"><div class="dc-name ind"><span class="arrow" style="${awDashOpen?'transform:rotate(90deg);':''}">&#9654;</span> All Awareness Cities</div><div class="dc bg-mv n-ach">${awAvg.toFixed(1)}</div></div>`;
  if(awDashOpen){
    Object.keys(byState).sort().forEach(st=>{
      const list=byState[st]; const savg=list.reduce((a,c)=>a+(AWARE[c]||0),0)/list.length;
      const so=awDashStates.has(st);
      ahtml+=`<div class="dr r-state" onclick="toggleAwDashState('${st.replace(/'/g,"")}')"><div class="dc-name st"><span class="arrow" style="${so?'transform:rotate(90deg);':''}">&#9654;</span> ${st}</div><div class="dc bg-mv n-ach ${savg>=8?'c-ok':savg>=5?'c-burnt':'c-bad'}">${savg.toFixed(1)}</div></div>`;
      if(so){ list.forEach(c=>{ const sc=AWARE[c]||0; const nm=c.replace(/\s*\([^)]+\)\s*$/,''); ahtml+=`<div class="dr r-city"><div class="dc-name ci">${nm}</div><div class="dc bg-mv n-ach ${sc>=8?'c-ok':sc>=5?'c-burnt':'c-bad'}">${sc}/10</div></div>`; }); }
    });
  }
  document.getElementById('aw-drill-tree').innerHTML=ahtml;
}
function toggleModDash(){ modDashOpen=!modDashOpen; renderMAODash(); }
function toggleAwDash(){ awDashOpen=!awDashOpen; renderMAODash(); }
function toggleAwDashState(st){ awDashStates.has(st)?awDashStates.delete(st):awDashStates.add(st); renderMAODash(); }

// ============ CALL DISCIPLINE ============
// Per franchise manager, per lead-date. Manual entry now; designed so the SLA
// numbers can later be auto-fed from TeleCRM by swapping ONE function: cdSLA().
const CD_SLA15_TARGET=0.90;   // expect 90%+ of leads called within 15 min
const CD_SLA5_TARGET=0.50;    // aim for 50%+ within 5 min
let CALLDISC=[];
let CDMGRS=[];
function loadCD(){
  try{const c=store.getItem('safc_cd4'); CALLDISC=c?JSON.parse(c):[];}catch(e){CALLDISC=[];}
  try{const m=store.getItem('safc_cdmgr4'); CDMGRS=m?JSON.parse(m):[];}catch(e){CDMGRS=[];}
}
function saveCDstore(){ store.setItem('safc_cd4', JSON.stringify(CALLDISC)); }
function saveCDMgrs(){ store.setItem('safc_cdmgr4', JSON.stringify(CDMGRS)); }
function cdInRange(dateStr){ return dInRange(dateStr); }
function cdNum(id){ const el=document.getElementById(id); return el?Math.max(0,parseInt(el.value)||0):0; }

// ---- THE TELECRM SEAM ----
// Today these just return what was typed. When TeleCRM is connected, this is the
// only function that changes: for source==='crm' records it will read the real
// lead-arrival and first-call timestamps from TeleCRM and compute the SLA counts.
function cdSLA(rec){
  return { sla5: rec.sla5||0, sla15: rec.sla15||0, source: rec.source||'manual' };
}

// ---- manager list ----
function fillMgrDropdown(){
  const el=document.getElementById('cd-mgr'); if(!el) return;
  const cur=el.value;
  el.innerHTML='<option value="">Select manager</option>'+CDMGRS.map(m=>`<option${m===cur?' selected':''}>${m}</option>`).join('');
}
function renderCDMgrs(){
  const el=document.getElementById('cd-mgr-list'); if(!el) return;
  if(!CDMGRS.length){ el.innerHTML='<div class="fhint" style="margin:6px 0;">No managers yet. Add one below to start.</div>'; }
  else{
    el.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0;">'+CDMGRS.map(m=>`<span class="pill" style="background:var(--surface3);color:var(--text);display:inline-flex;align-items:center;gap:8px;padding:6px 10px;">${m}<button class="del-btn" style="font-size:15px;" onclick="confirmBtn(this,()=>delCDMgr('${m.replace(/'/g,"\\'")}'))">×</button></span>`).join('')+'</div>';
  }
  fillMgrDropdown();
}
function addCDMgr(){
  const inp=document.getElementById('cd-mgr-new'); const n=(inp.value||'').trim();
  if(!n){showToast('Enter a manager name','err');return;}
  if(CDMGRS.includes(n)){showToast('Already added','err');return;}
  askName(function(){
    CDMGRS.push(n); saveCDMgrs(); logAction('Added franchise manager','Call Discipline',n);
    inp.value=''; renderCDMgrs(); showToast('Manager added');
  });
}
function delCDMgr(n){
  const uid=snapshot('cdmgr',`Call-discipline manager: ${n}`);
  CDMGRS=CDMGRS.filter(x=>x!==n); saveCDMgrs(); logAction('Removed franchise manager','Call Discipline',n,uid);
  renderCDMgrs(); toastUndo('Manager removed',uid);
}

function cdLiveCalc(){
  const tot=cdNum('cd-total'), s5=cdNum('cd-sla5'), s15=cdNum('cd-sla15'), nc=cdNum('cd-notcalled');
  const pct=(n)=> tot>0? Math.round(n/tot*100)+'%':'-';
  const setHint=(id,txt)=>{const el=document.getElementById(id); if(el) el.textContent=txt;};
  setHint('cd-sla5-hint', tot>0? pct(s5)+' of leads':'');
  setHint('cd-sla15-hint', tot>0? pct(s15)+' of leads':'');
  setHint('cd-notcalled-hint', tot>0? pct(nc)+' untouched':'');
  const fc=cdNum('cd-fastconv'), cl=cdNum('cd-closed');
  setHint('cd-fastconv-hint', cl>0? Math.round(fc/cl*100)+'% of closed were fast-called':'of your closed leads');
  let msgs=[];
  if(s5>tot||s15>tot||nc>tot) msgs.push('Counts cannot exceed total leads.');
  if(s5>s15 && s15>0) msgs.push('5-min count is usually within the 15-min count.');
  if(fc>s15 && s15>0) msgs.push('Fast-converted cannot exceed leads called in 15 min.');
  if(fc>cl && cl>0) msgs.push('Fast-converted cannot exceed total closed.');
  const statusSum=cdNum('cd-fresh')+cdNum('cd-inprog')+cdNum('cd-closed')+cdNum('cd-lost');
  if(statusSum>tot) msgs.push('Status counts add up to more than total leads.');
  const v=document.getElementById('cd-validate');
  if(v){ v.textContent=msgs.join(' '); v.style.color=msgs.length?'var(--burnt)':'var(--text2)'; }
}
const CD_FIELDS=['total','sla5','sla15','notcalled','connected','tried','fresh','inprog','closed','lost','fastconv'];
function cdPrefill(){
  const mgr=document.getElementById('cd-mgr').value, d=document.getElementById('cd-date').value;
  if(mgr&&d){
    const e=CALLDISC.find(x=>x.mgr===mgr&&x.date===d);
    if(e){ CD_FIELDS.forEach(k=>{const el=document.getElementById('cd-'+k); if(el) el.value=e[k]||0;}); document.getElementById('cd-notes').value=e.notes||''; if(document.getElementById('cd-source')) document.getElementById('cd-source').value=e.source||'manual'; cdLiveCalc(); }
  }
}
function saveCD(){
  const by=document.getElementById('cd-by').value.trim();
  const d=document.getElementById('cd-date').value;
  const mgr=document.getElementById('cd-mgr').value;
  if(!by){showToast('Enter your name (Entered by)','err');return;}
  if(!d){showToast('Pick the lead date','err');return;}
  if(!mgr){showToast('Pick a franchise manager','err');return;}
  setUser(by);
  const rec={
    mgr:mgr, date:d, by:by, source:(document.getElementById('cd-source')?document.getElementById('cd-source').value:'manual'),
    total:cdNum('cd-total'), sla5:cdNum('cd-sla5'), sla15:cdNum('cd-sla15'),
    notcalled:cdNum('cd-notcalled'), connected:cdNum('cd-connected'), tried:cdNum('cd-tried'),
    fresh:cdNum('cd-fresh'), inprog:cdNum('cd-inprog'), closed:cdNum('cd-closed'), lost:cdNum('cd-lost'),
    fastconv:cdNum('cd-fastconv'),
    notes:document.getElementById('cd-notes').value
  };
  const existing=CALLDISC.find(x=>x.mgr===mgr&&x.date===d);
  if(window._editCDId){
    const e=CALLDISC.find(x=>x.id===window._editCDId);
    if(e){ Object.assign(e,rec); logAction('Edited call review','Call Discipline',`${mgr} for ${d}: ${rec.total} leads, ${rec.sla15} in 15-min SLA, ${rec.notcalled} not called`); showToast('Call review updated'); }
    window._editCDId=null;
    document.getElementById('cd-save-btn').textContent='Save Call Review';
    document.getElementById('cd-cancel-btn').style.display='none';
  } else if(existing){
    Object.assign(existing,rec);
    logAction('Updated call review','Call Discipline',`${mgr} for ${d}: ${rec.total} leads, ${rec.sla15} in 15-min SLA, ${rec.notcalled} not called`);
    showToast('Updated existing review for that day');
  } else {
    rec.id=Date.now();
    CALLDISC.push(rec);
    logAction('Added call review','Call Discipline',`${mgr} for ${d}: ${rec.total} leads, ${rec.sla15} in 15-min SLA, ${rec.notcalled} not called`);
    showToast('Call review saved by '+by);
  }
  saveCDstore();
  CD_FIELDS.forEach(k=>{const el=document.getElementById('cd-'+k); if(el) el.value='';});
  document.getElementById('cd-notes').value='';
  document.getElementById('cd-validate').textContent='';
  renderCD();
}
function editCD(id){
  const e=CALLDISC.find(x=>x.id===id); if(!e) return;
  window._editCDId=id;
  document.getElementById('cd-by').value=e.by||'';
  document.getElementById('cd-date').value=e.date;
  fillMgrDropdown();
  document.getElementById('cd-mgr').value=e.mgr;
  if(document.getElementById('cd-source')) document.getElementById('cd-source').value=e.source||'manual';
  CD_FIELDS.forEach(k=>{const el=document.getElementById('cd-'+k); if(el) el.value=e[k]||0;});
  document.getElementById('cd-notes').value=e.notes||'';
  document.getElementById('cd-save-btn').textContent='Update Call Review';
  document.getElementById('cd-cancel-btn').style.display='';
  document.getElementById('view-calldisc').scrollIntoView({behavior:'smooth',block:'start'});
  cdLiveCalc();
  showToast('Editing review — change values and Update');
}
function cdCancelEdit(){
  window._editCDId=null;
  CD_FIELDS.forEach(k=>{const el=document.getElementById('cd-'+k); if(el) el.value='';});
  document.getElementById('cd-notes').value='';
  document.getElementById('cd-save-btn').textContent='Save Call Review';
  document.getElementById('cd-cancel-btn').style.display='none';
  showToast('Edit cancelled');
}
function delCD(id){
  const e=CALLDISC.find(x=>x.id===id);
  const uid=snapshot('cd',e?`Call review: ${e.mgr} ${e.date}`:'call review');
  CALLDISC=CALLDISC.filter(x=>x.id!==id);
  saveCDstore();
  if(e) logAction('Deleted call review','Call Discipline',`${e.mgr} for ${e.date}: was ${e.total} leads`,uid);
  if(window._editCDId===id) cdCancelEdit();
  renderCD();
  toastUndo('Call review deleted',uid);
}
function cdTotals(){
  const rows=CALLDISC.filter(x=>cdInRange(x.date));
  const t={total:0,sla5:0,sla15:0,notcalled:0,connected:0,tried:0,fresh:0,inprog:0,closed:0,lost:0,fastconv:0};
  rows.forEach(r=>{ const s=cdSLA(r); for(const k in t){ if(k==='sla5')t.sla5+=s.sla5; else if(k==='sla15')t.sla15+=s.sla15; else t[k]+=r[k]||0; } });
  return t;
}
function renderCD(){
  if(!document.getElementById('cd-date').value){ const y=new Date(); y.setDate(y.getDate()-1); document.getElementById('cd-date').value=y.toISOString().split('T')[0]; }
  if(!document.getElementById('cd-by').value && store.getItem('safc_user4')) document.getElementById('cd-by').value=store.getItem('safc_user4');
  renderCDMgrs();
  const t=cdTotals();
  const sla5p=t.total>0?Math.round(t.sla5/t.total*100):0;
  const sla15p=t.total>0?Math.round(t.sla15/t.total*100):0;
  const ncp=t.total>0?Math.round(t.notcalled/t.total*100):0;
  document.getElementById('cd-metrics').innerHTML=`
    <div class="mc mc-leads"><div class="mc-lbl">Leads Reviewed</div><div class="mc-val">${t.total}</div><div class="mc-meta">${CALLDISC.filter(x=>cdInRange(x.date)).length} manager-days</div><span class="mc-status st-neutral">in range</span></div>
    <div class="mc mc-sales"><div class="mc-lbl">Called in 5 min</div><div class="mc-val">${sla5p}%</div><div class="mc-meta">${t.sla5} of ${t.total}</div><span class="mc-status ${sla5p>=50?'st-ok':sla5p>=30?'st-warn':'st-bad'}">5-min SLA</span></div>
    <div class="mc mc-elig"><div class="mc-lbl">Called in 15 min</div><div class="mc-val">${sla15p}%</div><div class="mc-meta">${t.sla15} of ${t.total}</div><span class="mc-status ${sla15p>=90?'st-ok':sla15p>=70?'st-warn':'st-bad'}">15-min SLA</span></div>
    <div class="mc mc-mv"><div class="mc-lbl">Not Called</div><div class="mc-val" style="color:${t.notcalled>0?'var(--red)':'var(--text)'};">${t.notcalled}</div><div class="mc-meta">${ncp}% untouched</div><span class="mc-status ${t.notcalled===0?'st-ok':'st-bad'}">${t.notcalled===0?'all actioned':'follow up'}</span></div>`;

  // ---- Fast-vs-slow conversion insight (does fast calling improve outcomes?) ----
  const ins=document.getElementById('cd-insight');
  if(ins){
    if(t.total>0 && t.closed>0){
      const fastConv=t.fastconv;                       // closed that were called within 15 min
      const slowConv=Math.max(0,t.closed-t.fastconv);  // closed that were NOT called within 15 min
      const fastBase=t.sla15;                          // leads called within 15 min
      const slowBase=Math.max(0,t.total-t.sla15);      // leads called late / not at all
      const fastRate=fastBase>0?Math.round(fastConv/fastBase*100):0;
      const slowRate=slowBase>0?Math.round(slowConv/slowBase*100):0;
      const better=fastRate>slowRate;
      const diff=Math.abs(fastRate-slowRate);
      ins.innerHTML=`<div class="form-card" style="border-left:3px solid ${better?'var(--sage)':'var(--burnt)'};margin-bottom:20px;">
        <div style="font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${better?'var(--sage)':'var(--burnt)'};margin-bottom:10px;">Does fast calling improve results?</div>
        <div style="display:flex;gap:28px;flex-wrap:wrap;align-items:center;">
          <div><div style="font-size:30px;font-weight:700;color:var(--sage);">${fastRate}%</div><div style="font-size:12px;color:var(--text2);">conversion when called in 15 min<br>(${fastConv} of ${fastBase})</div></div>
          <div style="font-size:22px;color:var(--text3);">vs</div>
          <div><div style="font-size:30px;font-weight:700;color:var(--text2);">${slowRate}%</div><div style="font-size:12px;color:var(--text2);">conversion when called late / not at all<br>(${slowConv} of ${slowBase})</div></div>
          <div style="flex:1;min-width:200px;font-size:13px;color:var(--text);background:var(--surface2);border-radius:8px;padding:12px 14px;">
            ${better? `✅ Fast-called leads convert <b style="color:var(--sage);">${diff} points higher</b>. Speed is paying off — keep the 15-min SLA tight.` : (fastRate===slowRate? `Fast and slow convert about the same here. Add more days of data to see the trend.` : `⚠️ Slower calls converted higher in this sample — likely too little data. Keep logging to get a reliable read.`)}
          </div>
        </div>
      </div>`;
    } else {
      ins.innerHTML='';
    }
  }

  // ---- recent table (grouped newest first) ----
  const rows=[...CALLDISC].sort((a,b)=>b.date.localeCompare(a.date)||(b.id||0)-(a.id||0)).slice(0,30);
  if(!rows.length){ document.getElementById('cd-recent').innerHTML='<div class="empty">No call reviews yet. Add a manager, then log how yesterday\'s leads were handled.</div>'; return; }
  let h='<table class="city-tbl"><thead><tr><th>Lead Date</th><th>Manager</th><th style="text-align:center;">Leads</th><th style="text-align:center;">5-min</th><th style="text-align:center;">15-min</th><th style="text-align:center;">Spoke</th><th style="text-align:center;">Tried</th><th style="text-align:center;">Not called</th><th style="text-align:center;">Closed</th><th style="text-align:center;">Source</th><th></th></tr></thead><tbody>';
  rows.forEach(r=>{
    const s=cdSLA(r);
    const p=(n)=> r.total>0? Math.round(n/r.total*100)+'%':'-';
    const s15col=r.total>0&&(s.sla15/r.total)>=CD_SLA15_TARGET?'var(--sage)':'var(--burnt)';
    const srcTag=(r.source==='crm')?'<span class="pill pill-ok">CRM</span>':'<span class="pill" style="background:var(--surface3);color:var(--text2);">manual</span>';
    h+=`<tr>
      <td style="color:var(--text2);">${r.date}</td>
      <td style="color:var(--text);font-weight:500;cursor:pointer;" onclick="editCD(${r.id})">${r.mgr} <span class="city-link">✎</span></td>
      <td style="text-align:center;color:var(--blue);font-weight:600;">${r.total}</td>
      <td style="text-align:center;color:var(--sage);">${s.sla5} <span style="color:var(--text3);font-size:11px;">${p(s.sla5)}</span></td>
      <td style="text-align:center;color:${s15col};font-weight:600;">${s.sla15} <span style="color:var(--text3);font-size:11px;">${p(s.sla15)}</span></td>
      <td style="text-align:center;color:var(--teal);">${r.connected}</td>
      <td style="text-align:center;color:var(--text2);">${r.tried}</td>
      <td style="text-align:center;color:${r.notcalled>0?'var(--red)':'var(--text3)'};font-weight:${r.notcalled>0?'600':'400'};">${r.notcalled}</td>
      <td style="text-align:center;color:var(--sage);">${r.closed}</td>
      <td style="text-align:center;">${srcTag}</td>
      <td style="display:flex;gap:4px;"><button class="btn btn-ghost btn-sm" onclick="editCD(${r.id})">Edit</button><button class="btn btn-danger btn-sm" onclick="confirmBtn(this,()=>delCD(${r.id}))">Del</button></td>
    </tr>`;
    if(r.notes){ h+=`<tr><td colspan="11" style="color:var(--text2);font-size:12px;font-style:italic;padding-top:0;border-bottom:1px solid var(--border2);">📝 ${r.notes}</td></tr>`; }
  });
  h+='</tbody></table>';
  document.getElementById('cd-recent').innerHTML=h;
}

const _origRenderDash=renderDash;
renderDash=function(){ _origRenderDash(); renderISDash(); renderHRDash(); renderMAODash(); renderMgrPerf(); };

// ===== Franchise Manager performance (by state, approved entries only) =====
function renderMgrPerf(){
  const el=document.getElementById('mgr-perf'); if(!el) return;
  // The Manager section has its OWN filters, independent of the Lead Gen ones.
  const mType=document.getElementById('m-ftype')?.value||'all';
  const mSrc=document.getElementById('m-source')?.value||'all';
  const mMode=document.getElementById('m-others')?.value||'both';
  const typeOK=(st,c)=> mType==='all' || cityType(st,c)===mType;
  const srcOK=(e)=> mSrc==='all' || (e.source||'Manual')===mSrc;
  // sum a manager's cities under these filters
  function mgrTotals(st,cities){
    const targeted=Object.keys(CFG.states[st]?.cities||{});
    return ENTRIES.filter(e=>{
      if(!(isApproved(e)&&srcOK(e)&&e.state===st&&dInRange(e.date))) return false;
      const isAssigned=cities.includes(e.city);
      const isNonT=!targeted.includes(e.city);
      if(mMode==='targeted') return isAssigned;
      if(mMode==='nontargeted') return isNonT;
      return isAssigned||isNonT; // both
    }).reduce((a,e)=>({l:a.l+(e.leads||0),el:a.el+(e.eligible||0),mv:a.mv+(e.mv||0),s:a.s+(e.sales||0)}),{l:0,el:0,mv:0,s:0});
  }
  const byMgr={};
  Object.entries(CFG.states).forEach(([st,sc])=>{
    Object.keys(sc.cities||{}).forEach(c=>{
      const mgr=getCityMgr(st,c).trim(); if(!mgr) return;
      if(!typeOK(st,c)) return; // respect the Manager section's type filter
      if(!byMgr[mgr]) byMgr[mgr]={areas:[],byState:{}};
      byMgr[mgr].areas.push(c);
      (byMgr[mgr].byState[st]=byMgr[mgr].byState[st]||[]).push(c);
    });
  });
  // compute per-manager totals from their cities (Others added once per state if included)
  const names=Object.keys(byMgr).sort();
  // ---- Unassigned: leads whose district has NO manager (non-targeted, or targeted-but-unassigned) ----
  // respects the Manager section's type filter (mType) and source (mSrc); non-targeted excluded under a type filter
  const unByState={}; let uL=0,uEl=0,uMV=0,uS=0;
  ENTRIES.filter(e=>isApproved(e)&&srcOK(e)&&dInRange(e.date)).forEach(e=>{
    const hasMgr=getCityMgr(e.state,e.city).trim()!=='';
    if(hasMgr) return; // belongs to a manager
    if(mType!=='all'){ // type filter: only targeted cities have a type; non-targeted can't match
      if(!isTargeted(e.state,e.city)) return;
      if(cityType(e.state,e.city)!==mType) return;
    }
    (unByState[e.state]=unByState[e.state]||{})[e.city]=(unByState[e.state][e.city]||{l:0,el:0,mv:0,s:0});
    const d=unByState[e.state][e.city]; d.l+=e.leads||0; d.el+=e.eligible||0; d.mv+=e.mv||0; d.s+=e.sales||0;
    uL+=e.leads||0; uEl+=e.eligible||0; uMV+=e.mv||0; uS+=e.sales||0;
  });
  window._unassignedData=unByState;
  const hasUnassigned=uL>0||uEl>0||uMV>0||uS>0;

  if(!names.length && !hasUnassigned){ el.innerHTML='<div class="empty">No franchise managers assigned for this filter, and no unassigned leads. Assign managers to cities in Setup.</div>'; return; }
  let h='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">';
  let cardsRendered=0;
  names.forEach(mgr=>{
    let l=0,elg=0,mv=0,s=0;
    Object.entries(byMgr[mgr].byState).forEach(([st,cities])=>{ const t=mgrTotals(st,cities); l+=t.l;elg+=t.el;mv+=t.mv;s+=t.s; });
    // area line depends on mode
    let areaLine;
    if(mMode==='nontargeted'){
      // collect the actual non-targeted districts (with leads in period) in this manager's states
      const ntSet=new Set();
      Object.keys(byMgr[mgr].byState).forEach(st=>{
        const targeted=Object.keys(CFG.states[st]?.cities||{});
        ENTRIES.filter(e=>isApproved(e)&&srcOK(e)&&e.state===st&&dInRange(e.date)&&!targeted.includes(e.city)).forEach(e=>ntSet.add(e.city));
      });
      // if this manager has NO non-targeted leads, hide the card entirely
      if(ntSet.size===0 || l===0) return;
      areaLine=[...ntSet].sort().join(', ');
    } else {
      areaLine=byMgr[mgr].areas.join(', ');
    }
    const elig=l>0?Math.round(elg/l*100):0;
    h+=`<div class="setup-block" style="margin:0;border-left:3px solid var(--blue);">
      <div style="font-size:15px;font-weight:700;color:var(--text);">${mgr}</div>
      <div style="font-size:11px;color:var(--text2);margin:2px 0 12px;">${mMode==='nontargeted'?'<span style="color:var(--burnt);">Non-targeted: </span>':''}${areaLine}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-family:'Space Mono',monospace;">Fresh Leads</div><div style="font-size:24px;font-weight:700;color:var(--blue);">${l}</div></div>
        <div><div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-family:'Space Mono',monospace;">Eligible</div><div style="font-size:24px;font-weight:700;color:var(--teal);">${elg}<span style="font-size:12px;color:var(--text3);"> ${elig?'· '+elig+'%':''}</span></div></div>
        <div><div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-family:'Space Mono',monospace;">Market Visits</div><div style="font-size:24px;font-weight:700;color:var(--burnt);">${mv}</div></div>
        <div><div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-family:'Space Mono',monospace;">Sales Closed</div><div style="font-size:24px;font-weight:700;color:var(--sage);">${s}</div></div>
      </div>
    </div>`;
    cardsRendered++;
  });
  if(hasUnassigned){
    const uElig=uL>0?Math.round(uEl/uL*100):0;
    const distCount=Object.values(unByState).reduce((a,o)=>a+Object.keys(o).length,0);
    h+=`<div class="setup-block" style="margin:0;border-left:3px solid var(--burnt);cursor:pointer;" onclick="openUnassigned()">
      <div style="display:flex;align-items:center;justify-content:space-between;"><div style="font-size:15px;font-weight:700;color:var(--text);">Unassigned</div><span class="city-link" style="opacity:1;">view ▸</span></div>
      <div style="font-size:11px;color:var(--text2);margin:2px 0 12px;">${distCount} district${distCount===1?'':'s'} with no manager · click to break down</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-family:'Space Mono',monospace;">Fresh Leads</div><div style="font-size:24px;font-weight:700;color:var(--blue);">${uL}</div></div>
        <div><div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-family:'Space Mono',monospace;">Eligible</div><div style="font-size:24px;font-weight:700;color:var(--teal);">${uEl}<span style="font-size:12px;color:var(--text3);"> ${uElig?'· '+uElig+'%':''}</span></div></div>
        <div><div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-family:'Space Mono',monospace;">Market Visits</div><div style="font-size:24px;font-weight:700;color:var(--burnt);">${uMV}</div></div>
        <div><div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-family:'Space Mono',monospace;">Sales Closed</div><div style="font-size:24px;font-weight:700;color:var(--sage);">${uS}</div></div>
      </div>
    </div>`;
  }
  h+='</div>';
  if(cardsRendered===0 && !hasUnassigned){
    if(mMode==='nontargeted') h='<div class="empty">No non-targeted leads have been generated for any manager\'s districts in this period.</div>';
    else h='<div class="empty">No manager data for this filter.</div>';
  }
  el.innerHTML=h;
}
function openUnassigned(){
  const data=window._unassignedData||{};
  let rows='';
  Object.keys(data).sort().forEach(st=>{
    const cities=data[st];
    let sl=0,sel=0,smv=0,ss=0; Object.values(cities).forEach(d=>{sl+=d.l;sel+=d.el;smv+=d.mv;ss+=d.s;});
    rows+=`<tr style="background:var(--surface2);"><td style="font-weight:700;color:var(--amber);">${st}</td><td style="text-align:center;color:var(--blue);font-weight:600;">${sl}</td><td style="text-align:center;color:var(--teal);">${sel}</td><td style="text-align:center;color:var(--burnt);">${smv}</td><td style="text-align:center;color:var(--sage);">${ss}</td></tr>`;
    Object.keys(cities).sort().forEach(c=>{ const d=cities[c]; rows+=`<tr><td style="padding-left:28px;color:var(--text);">${c}</td><td style="text-align:center;color:var(--blue);">${d.l}</td><td style="text-align:center;color:var(--teal);">${d.el}</td><td style="text-align:center;color:var(--burnt);">${d.mv}</td><td style="text-align:center;color:var(--sage);">${d.s}</td></tr>`; });
  });
  if(!rows) rows='<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;">No unassigned leads in this period.</td></tr>';
  const m=document.createElement('div'); m.id='umodal'; m.className='modal-overlay';
  m.innerHTML=`<div class="modal-box"><div class="modal-hdr"><div><div style="font-size:11px;color:var(--text2);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Manager Performance</div><div style="font-size:22px;font-weight:700;">Unassigned leads</div><div style="font-size:12px;color:var(--text2);margin-top:5px;">${filterLabel().replace('Showing: ','')} · districts with no franchise manager, by state → district</div></div><button onclick="document.getElementById('umodal').remove()" style="background:var(--surface3);border:1px solid var(--border);color:var(--text2);padding:9px 18px;cursor:pointer;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1px;border-radius:8px;">CLOSE</button></div><div class="modal-body"><table class="day-tbl"><thead><tr><th style="text-align:left;">State / District</th><th>Leads</th><th>Eligible</th><th>Market Visits</th><th>Sales</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  document.body.appendChild(m);
}

// ===== Activity Log (audit trail) =====
function renderLog(){
  const el=document.getElementById('log-content'); if(!el) return;
  const pf=document.getElementById('log-filter')?.value||'';
  const q=(document.getElementById('log-search')?.value||'').toLowerCase();
  let items=LOG.slice();
  if(pf) items=items.filter(x=>x.page===pf);
  if(q) items=items.filter(x=>((x.who||'')+' '+(x.action||'')+' '+(x.detail||'')+' '+(x.page||'')).toLowerCase().includes(q));
  if(!items.length){ el.innerHTML='<div class="empty">No log entries'+(pf||q?' match your filter':' yet')+'.</div>'; return; }
  const pageColor={'Inside Sales':'var(--sage)','Daily Entry':'var(--blue)','HR':'#f06aa0','L&D':'var(--amber)','Awareness':'var(--burnt)','Setup':'var(--teal)'};
  let h='<table class="city-tbl"><thead><tr><th>When</th><th>Who</th><th>Page</th><th>Action</th><th>Details</th><th></th></tr></thead><tbody>';
  items.slice(0,500).forEach(x=>{
    const d=new Date(x.ts);
    const when=d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    const isDel=(x.action||'').toLowerCase().includes('delet');
    const canUndo=x.undoId && UNDOSTACK[x.undoId];
    const undoCell=canUndo?`<button class="btn btn-ghost btn-sm" style="padding:4px 12px;" onclick="performUndo('${x.undoId}')">Undo</button>`:'';
    h+=`<tr><td style="color:var(--text3);white-space:nowrap;font-family:'Space Mono',monospace;font-size:11px;">${when}</td><td style="color:var(--text);font-weight:500;">${x.who||'Unknown'}</td><td><span style="color:${pageColor[x.page]||'var(--text2)'};font-size:11px;font-weight:600;">${x.page||'-'}</span></td><td style="color:${isDel?'var(--red)':'var(--text)'};">${x.action||''}</td><td style="color:var(--text2);font-size:12px;">${x.detail||''}</td><td style="text-align:right;">${undoCell}</td></tr>`;
  });
  h+='</tbody></table>';
  if(items.length>500) h+=`<div class="fhint" style="margin-top:8px;">Showing latest 500 of ${items.length} entries.</div>`;
  el.innerHTML=h;
}
function clearLog(){ LOG=[]; saveLog(); renderLog(); showToast('Log cleared'); }

// ===== Session name: ask once, reuse everywhere =====
function askName(callback){
  const existing=(window._lastUser||store.getItem('safc_user4')||'').trim();
  if(existing){ callback(existing); return; }
  const ov=document.createElement('div'); ov.id='nameModal'; ov.className='modal-overlay';
  ov.innerHTML=`<div class="modal-box" style="max-width:420px;"><div class="modal-hdr"><div><div style="font-size:11px;color:var(--text2);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Who's making this change?</div><div style="font-size:20px;font-weight:700;">Enter your name</div></div></div><div class="modal-body"><div class="fg"><label class="flabel">Your name</label><input type="text" class="finput" id="nameModalInput" placeholder="e.g. Ramesh" autofocus/></div><div class="fhint" style="margin:10px 0;">Saved for this session so you won't be asked again. It's recorded in the activity log.</div><div style="display:flex;gap:10px;"><button class="btn btn-amber" onclick="confirmName()">Continue</button><button class="btn btn-ghost" onclick="document.getElementById('nameModal').remove();window._pendingNameCb=null;">Cancel</button></div></div></div>`;
  document.body.appendChild(ov);
  window._pendingNameCb=callback;
  setTimeout(()=>{ const i=document.getElementById('nameModalInput'); if(i){ i.focus(); i.onkeydown=e=>{ if(e.key==='Enter') confirmName(); }; } },50);
}
function confirmName(){
  const v=(document.getElementById('nameModalInput')?.value||'').trim();
  if(!v){ showToast('Please enter your name','err'); return; }
  setUser(v);
  const cb=window._pendingNameCb; window._pendingNameCb=null;
  document.getElementById('nameModal')?.remove();
  if(cb) cb(v);
}

loadLog();
loadMgrs();
loadCD();
loadBot(); loadMod(); loadAw(); loadHr();

// ---- Deferred startup: wait for Supabase data to load, then init ----
(window.__storeReady || Promise.resolve()).then(function(){
  try {
loadData();
renderDash();

// ===== Deep-linking: open a tab directly from the URL =====
// Supports #hr, #redflags, etc. AND ?tab=hr as a fallback for embeds that strip the hash.
function openTabFromUrl(){
  let key='';
  try{
    const h=(window.location.hash||'').replace(/^#/,'').trim().toLowerCase();
    if(h) key=h;
    if(!key){ const u=new URL(window.location.href); const t=(u.searchParams.get('tab')||'').trim().toLowerCase(); if(t) key=t; }
  }catch(e){}
  if(!key) return false;
  // accept a few friendly aliases so links are forgiving
  const alias={'red-flags':'redflags','red_flags':'redflags','dailyentry':'entry','daily-entry':'entry','daily':'entry','inside-sales':'insidesales','inside_sales':'insidesales','sales':'insidesales','ld':'modules','l&d':'modules','module':'modules','recruitment':'hr','prelaunch':'awareness','awareness':'awareness'};
  if(alias[key]) key=alias[key];
  const valid=['dashboard','redflags','entry','verify','insidesales','hr','modules','awareness','setup','log'];
  if(valid.indexOf(key)===-1) return false;
  const tabEl=Array.from(document.querySelectorAll('.nav-tab')).find(t=>(t.getAttribute('onclick')||'').indexOf("switchTab('"+key+"'")!==-1);
  if(tabEl){ switchTab(key,tabEl); return true; }
  return false;
}
openTabFromUrl();
window.addEventListener('hashchange', openTabFromUrl);

  } catch (e) { console.error('init error', e); }
}).catch(function(e){ console.error('store hydrate failed', e);
  // still try to start so the UI isn't blank
  try {loadData();
renderDash();

// ===== Deep-linking: open a tab directly from the URL =====
// Supports #hr, #redflags, etc. AND ?tab=hr as a fallback for embeds that strip the hash.
function openTabFromUrl(){
  let key='';
  try{
    const h=(window.location.hash||'').replace(/^#/,'').trim().toLowerCase();
    if(h) key=h;
    if(!key){ const u=new URL(window.location.href); const t=(u.searchParams.get('tab')||'').trim().toLowerCase(); if(t) key=t; }
  }catch(e){}
  if(!key) return false;
  // accept a few friendly aliases so links are forgiving
  const alias={'red-flags':'redflags','red_flags':'redflags','dailyentry':'entry','daily-entry':'entry','daily':'entry','inside-sales':'insidesales','inside_sales':'insidesales','sales':'insidesales','ld':'modules','l&d':'modules','module':'modules','recruitment':'hr','prelaunch':'awareness','awareness':'awareness'};
  if(alias[key]) key=alias[key];
  const valid=['dashboard','redflags','entry','verify','insidesales','hr','modules','awareness','setup','log'];
  if(valid.indexOf(key)===-1) return false;
  const tabEl=Array.from(document.querySelectorAll('.nav-tab')).find(t=>(t.getAttribute('onclick')||'').indexOf("switchTab('"+key+"'")!==-1);
  if(tabEl){ switchTab(key,tabEl); return true; }
  return false;
}
openTabFromUrl();
window.addEventListener('hashchange', openTabFromUrl);
} catch(_){}
});
