// app.js  —  Main application orchestrator
import { parseExcelBuffer, detectMapping, mapRows, enrichEmployees } from './parser.js';
import {
  CADRES, getCurrentFY, getFYBounds, fyLabel,
  calcActualCost, calcProjectedCost, calcIncrementedCost,
  groupBy, calcMonthlyTrend, fmtINR, fmtINRFull
} from './calc.js';
import { renderBarH, renderBarV, renderDoughnut, renderLine, destroyAll } from './charts.js';
import { exportToExcel } from './export.js';
import { generateSampleData } from './sampleData.js';

const state = {
  rawEmployees: [], employees: [], fyYear: getCurrentFY(),
  incrementMap: Object.fromEntries(CADRES.map(c => [c, { base: 0, market: 0 }])),
  columnMapping: {}, cohortMap: {}, detailPage: 1,
  detailSort: { col: 'id', dir: 1 }, detailSearch: '',
  filters: { cohort: '', department: '', cadre: '', status: '' },
};

function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function showLoading(msg = 'Processing…') { document.getElementById('loading-msg').textContent = msg; show('loading'); }
function hideLoading() { hide('loading'); }

async function ingestFile(file) {
  showLoading('Reading Excel file…');
  try {
    const buffer = await file.arrayBuffer();
    const rows = parseExcelBuffer(new Uint8Array(buffer));
    if (!rows.length) throw new Error('No data rows found in the Excel file.');
    const { mapping, unmapped } = detectMapping(rows);
    state.columnMapping = mapping;
    if (unmapped.length > 0) { hideLoading(); await showMappingModal(rows, mapping, unmapped); }
    else { processRows(rows, mapping); }
  } catch (err) { hideLoading(); showUploadError(err.message); }
}

function processRows(rows, mapping) {
  showLoading('Calculating costs…');
  setTimeout(() => {
    const { employees, validations } = mapRows(rows, mapping, state.cohortMap);
    state.rawEmployees = enrichEmployees(employees, state.fyYear);
    applyFilters(); populateFYSelector(); populateFilterOptions();
    renderDashboard(); showValidations(validations);
    hideLoading(); hide('upload-screen'); show('dashboard');
  }, 50);
}

async function showMappingModal(rows, autoMapping, unmapped) {
  const allHeaders = Object.keys(rows[0]);
  const container = document.getElementById('mapping-fields');
  const fieldLabels = { id:'Employee ID *', ctc:'Annual CTC *', doj:'Date of Joining *', department:'Department *', cadre:'Cadre / Employee Type *', name:'Employee Name', dol:'Date of Leaving', cohort:'Cohort' };
  container.innerHTML = '';
  const requiredFields = ['id','ctc','doj','department','cadre','name','dol','cohort'];
  for (const field of requiredFields) {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between gap-3';
    div.innerHTML = `<label class="text-sm text-ink-300 flex-1">${fieldLabels[field]||field}</label><select id="map-${field}" class="filter-select flex-1"><option value="">— skip —</option>${allHeaders.map(h=>`<option value="${h}" ${autoMapping[field]===h?'selected':''}>${h}</option>`).join('')}</select>`;
    container.appendChild(div);
  }
  show('mapping-modal');
  return new Promise((resolve) => {
    document.getElementById('mapping-confirm-btn').onclick = () => {
      const newMapping = {};
      for (const field of requiredFields) { const val = document.getElementById(`map-${field}`)?.value; if (val) newMapping[field] = val; }
      hide('mapping-modal'); processRows(rows, newMapping); resolve();
    };
    document.getElementById('mapping-cancel-btn').onclick = () => { hide('mapping-modal'); resolve(); };
  });
}

function applyFilters() {
  const { cohort, department, cadre, status } = state.filters;
  state.employees = state.rawEmployees.filter(e => {
    if (cohort && e.cohort !== cohort) return false;
    if (department && e.dept !== department) return false;
    if (cadre && e.cadre !== cadre) return false;
    if (status === 'active' && !e.active) return false;
    if (status === 'exited' && e.active) return false;
    return true;
  });
  state.detailPage = 1;
}

function populateFilterOptions() {
  const cohorts = [...new Set(state.rawEmployees.map(e => e.cohort).filter(Boolean))].sort();
  const depts = [...new Set(state.rawEmployees.map(e => e.dept).filter(Boolean))].sort();
  const cadres = CADRES.filter(c => state.rawEmployees.some(e => e.cadre === c));
  setOptions('filter-cohort', cohorts, 'All Cohorts');
  setOptions('filter-department', depts, 'All Departments');
  setOptions('filter-cadre', cadres, 'All Cadres');
}

function setOptions(id, values, allLabel) {
  const sel = document.getElementById(id); if (!sel) return;
  sel.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option value="${v}">${v}</option>`).join('');
}

function populateFYSelector() {
  const sel = document.getElementById('filter-fy'); if (!sel) return;
  const years = [];
  for (let y = getCurrentFY() - 2; y <= getCurrentFY() + 1; y++) years.push(y);
  sel.innerHTML = years.map(y => `<option value="${y}" ${y===state.fyYear?'selected':''}>${fyLabel(y)}</option>`).join('');
  document.getElementById('nav-fy-label').textContent = fyLabel(state.fyYear);
}

function renderDashboard() {
  renderSummaryCards(); renderIncrementTable(); renderIncrementImpact();
  renderCharts(); renderSummaryTables(); renderJoinersLeavers(); renderDetailTable();
}

function renderSummaryCards() {
  const valid = state.employees.filter(e => !e.invalid);
  const active = valid.filter(e => e.active);
  const exited = valid.filter(e => !e.active);
  const fy = state.fyYear;
  const totalActual = valid.reduce((s,e)=>s+calcActualCost(e,fy),0);
  const totalProjected = valid.reduce((s,e)=>s+calcProjectedCost(e,fy),0);
  const totalIncremented = valid.reduce((s,e)=>s+calcIncrementedCost(e,fy,state.incrementMap),0);
  const totalCTC = valid.reduce((s,e)=>s+(e.ctc||0),0);
  const cards = [
    { label:'Total Headcount', value:state.employees.length, sub:'all employees' },
    { label:'Active', value:active.length, sub:'currently active' },
    { label:'Exited', value:exited.length, sub:'in current view' },
    { label:'Total Annual CTC', value:fmtINR(totalCTC,2), sub:'annualised' },
    { label:'Actual Incurred', value:fmtINR(totalActual,2), sub:'cost till today', gold:true },
    { label:'Projected FY Cost', value:fmtINR(totalProjected,2), sub:fyLabel(fy), gold:true },
    { label:'Inc-Adjusted Projected', value:fmtINR(totalIncremented,2), sub:'with increments', gold:true },
  ];
  document.getElementById('summary-cards').innerHTML = cards.map(c =>
    `<div class="summary-card ${c.gold?'summary-card-gold':''}"><div class="summary-card-label">${c.label}</div><div class="summary-card-value">${c.value}</div><div class="summary-card-sub">${c.sub}</div></div>`
  ).join('');
}

function renderIncrementTable() {
  const tbody = document.getElementById('increment-table-body');
  tbody.innerHTML = CADRES.map(c => {
    const inc = state.incrementMap[c];
    return `<tr><td>${c}</td><td><input class="inc-input" id="inc-base-${c.replace(/\s/g,'_')}" type="number" min="0" max="100" step="0.5" value="${inc.base}" /></td><td><input class="inc-input" id="inc-market-${c.replace(/\s/g,'_')}" type="number" min="0" max="100" step="0.5" value="${inc.market}" /></td><td id="inc-total-${c.replace(/\s/g,'_')}" class="text-gold-400">${inc.base+inc.market}%</td></tr>`;
  }).join('');
  CADRES.forEach(c => {
    const key = c.replace(/\s/g,'_');
    ['base','market'].forEach(type => {
      document.getElementById(`inc-${type}-${key}`)?.addEventListener('input', () => {
        const base = +document.getElementById(`inc-base-${key}`)?.value||0;
        const market = +document.getElementById(`inc-market-${key}`)?.value||0;
        document.getElementById(`inc-total-${key}`).textContent = `${base+market}%`;
      });
    });
  });
}

function readIncrementInputs() {
  const map = {};
  CADRES.forEach(c => {
    const key = c.replace(/\s/g,'_');
    map[c] = { base: +document.getElementById(`inc-base-${key}`)?.value||0, market: +document.getElementById(`inc-market-${key}`)?.value||0 };
  });
  return map;
}

function renderIncrementImpact() {
  const valid = state.employees.filter(e => !e.invalid);
  const fy = state.fyYear;
  const projected = valid.reduce((s,e)=>s+calcProjectedCost(e,fy),0);
  const incremented = valid.reduce((s,e)=>s+calcIncrementedCost(e,fy,state.incrementMap),0);
  const impact = incremented - projected;
  document.getElementById('increment-impact-cards').innerHTML = `
    <div class="bg-ink-800 rounded-xl p-4"><div class="summary-card-label">Current Projected FY Cost</div><div class="summary-card-value text-2xl">${fmtINR(projected,2)}</div><div class="summary-card-sub">${fyLabel(fy)}</div></div>
    <div class="bg-ink-800 rounded-xl p-4"><div class="summary-card-label">Inc-Adjusted Projected</div><div class="summary-card-value text-2xl text-gold-400">${fmtINR(incremented,2)}</div><div class="summary-card-sub">after increments</div></div>
    <div class="bg-ink-800 rounded-xl p-4"><div class="summary-card-label">Total Increment Impact</div><div class="summary-card-value text-2xl text-amber-400">${fmtINR(impact,2)}</div><div class="summary-card-sub">${fmtINRFull(impact)}</div></div>
    <div class="bg-ink-800 rounded-xl p-4"><div class="summary-card-label">Impact %</div><div class="summary-card-value text-2xl text-amber-300">${projected>0?((impact/projected)*100).toFixed(1):'0'}%</div><div class="summary-card-sub">of projected cost</div></div>`;
}

function renderCharts() {
  const valid = state.employees.filter(e => !e.invalid);
  const fy = state.fyYear;
  const deptGroup = groupBy(valid,'dept',fy,state.incrementMap);
  const deptsSorted = Object.entries(deptGroup).sort((a,b)=>b[1].headcount-a[1].headcount).slice(0,12);
  renderBarH('chart-hc-dept', deptsSorted.map(([k])=>k), deptsSorted.map(([,v])=>v.headcount));
  renderBarH('chart-cost-dept', deptsSorted.map(([k])=>k), deptsSorted.map(([,v])=>v.projected/100000), v=>`₹${v.toFixed(1)}L`);
  const cadreGroup = groupBy(valid,'cadre',fy,state.incrementMap);
  renderDoughnut('chart-hc-cadre', Object.keys(cadreGroup), Object.values(cadreGroup).map(v=>v.headcount));
  const monthly = calcMonthlyTrend(valid,fy);
  const monthlyInc = calcMonthlyTrend(valid,fy,state.incrementMap);
  renderLine('chart-monthly', monthly.map(m=>m.label), [{ label:'Current', data:monthly.map(m=>m.cost/100000) },{ label:'Inc-Adj.', data:monthlyInc.map(m=>m.cost/100000) }]);
  const incLabels=[],incBase=[],incExtra=[];
  for (const c of CADRES) { const g=cadreGroup[c]; if(!g) continue; incLabels.push(c); incBase.push(g.projected/100000); incExtra.push((g.incremented-g.projected)/100000); }
  renderBarV('chart-increment-impact', incLabels, [{ label:'Projected', data:incBase },{ label:'Increment Impact', data:incExtra }]);
}

function renderSummaryTables() {
  const valid = state.employees.filter(e => !e.invalid);
  const fy = state.fyYear;
  renderSummaryTable('table-cohort', groupBy(valid,'cohort',fy,state.incrementMap));
  renderSummaryTable('table-dept', groupBy(valid,'dept',fy,state.incrementMap));
  renderSummaryTable('table-cadre', groupBy(valid,'cadre',fy,state.incrementMap));
}

function renderSummaryTable(tableId, groupData) {
  const table = document.getElementById(tableId); if (!table) return;
  const entries = Object.entries(groupData).sort((a,b)=>b[1].projected-a[1].projected);
  let totHC=0, totProj=0, totInc=0;
  let html = `<thead><tr><th>Name</th><th>HC</th><th>Projected</th><th>Inc-Adj</th></tr></thead><tbody>`;
  for (const [k,v] of entries) {
    totHC+=v.headcount; totProj+=v.projected; totInc+=v.incremented;
    html += `<tr><td>${k}</td><td>${v.headcount}</td><td>${fmtINR(v.projected)}</td><td>${fmtINR(v.incremented)}</td></tr>`;
  }
  html += `</tbody><tfoot><tr><td>Total</td><td>${totHC}</td><td>${fmtINR(totProj)}</td><td>${fmtINR(totInc)}</td></tr></tfoot>`;
  table.innerHTML = html;
}

function renderJoinersLeavers() {
  const joiners = state.employees.filter(e=>e.joiningInFY&&!e.invalid);
  const leavers = state.employees.filter(e=>e.leavingInFY&&!e.invalid);
  const fmt = (list,type) => {
    if (!list.length) return `<p class="text-ink-600">No ${type} in ${fyLabel(state.fyYear)}</p>`;
    return list.slice(0,30).map(e=>`<div class="flex justify-between"><span>${e.id}${e.name?' · '+e.name:''}</span><span class="text-ink-600">${e.dept}</span></div>`).join('')+(list.length>30?`<p class="text-ink-600 mt-1">+${list.length-30} more</p>`:'');
  };
  document.getElementById('joiners-list').innerHTML = fmt(joiners,'joiners');
  document.getElementById('leavers-list').innerHTML = fmt(leavers,'leavers');
}

function showValidations(validations) {
  const section = document.getElementById('validation-section');
  const list = document.getElementById('validation-list');
  if (!validations.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  list.innerHTML = validations.slice(0,50).map(v=>`<li>⚠ ${v}</li>`).join('');
}

const PAGE_SIZE = 25;

function getDetailRows() {
  const search = state.detailSearch.toLowerCase();
  let rows = state.employees;
  if (search) rows = rows.filter(e=>(e.id&&e.id.toLowerCase().includes(search))||(e.name&&e.name.toLowerCase().includes(search))||(e.dept&&e.dept.toLowerCase().includes(search))||(e.cadre&&e.cadre.toLowerCase().includes(search))||(e.cohort&&e.cohort.toLowerCase().includes(search)));
  const { col, dir } = state.detailSort;
  return [...rows].sort((a,b)=>{ let av=a[col],bv=b[col]; if(typeof av==='string')av=av.toLowerCase(); if(typeof bv==='string')bv=bv.toLowerCase(); return av<bv?-dir:av>bv?dir:0; });
}

function renderDetailTable() {
  const fy = state.fyYear;
  const cols = [
    {key:'id',label:'Emp ID'},{key:'name',label:'Name'},{key:'dept',label:'Dept'},{key:'cohort',label:'Cohort'},
    {key:'cadre',label:'Cadre'},{key:'doj',label:'Joining'},{key:'dol',label:'Leaving'},{key:'active',label:'Status'},
    {key:'ctc',label:'Annual CTC'},{key:'actual',label:'Actual Incurred'},{key:'projected',label:'Projected FY'},
    {key:'incremented',label:'Inc-Adj Projected'},{key:'incImpact',label:'Inc Impact'},
  ];
  const thead = document.getElementById('detail-thead');
  thead.innerHTML = `<tr>${cols.map(c=>`<th data-col="${c.key}" class="${state.detailSort.col===c.key?'text-gold-400':''}">${c.label}</th>`).join('')}</tr>`;
  thead.querySelectorAll('th').forEach(th=>{
    th.addEventListener('click',()=>{ const col=th.dataset.col; if(state.detailSort.col===col)state.detailSort.dir*=-1; else{state.detailSort.col=col;state.detailSort.dir=1;} renderDetailTable(); });
  });
  const allRows = getDetailRows();
  const totalPages = Math.ceil(allRows.length/PAGE_SIZE)||1;
  const page = Math.min(state.detailPage,totalPages);
  const pageRows = allRows.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const tbody = document.getElementById('detail-tbody');
  tbody.innerHTML = pageRows.map(emp=>{
    const actual=emp.invalid?null:calcActualCost(emp,fy);
    const projected=emp.invalid?null:calcProjectedCost(emp,fy);
    const incremented=emp.invalid?null:calcIncrementedCost(emp,fy,state.incrementMap);
    const incImpact=(incremented!=null&&projected!=null)?incremented-projected:null;
    return `<tr><td>${emp.id}</td><td>${emp.name||'—'}</td><td>${emp.dept||'—'}</td><td>${emp.cohort||'—'}</td><td>${emp.cadre||'—'}</td><td>${emp.doj?emp.doj.toLocaleDateString('en-IN'):'—'}</td><td>${emp.dol?emp.dol.toLocaleDateString('en-IN'):'—'}</td><td><span class="${emp.invalid?'badge-invalid':emp.active?'badge-active':'badge-exited'}">${emp.invalid?'Error':emp.active?'Active':'Exited'}</span></td><td>${emp.ctc?fmtINRFull(emp.ctc):'—'}</td><td>${actual!=null?fmtINRFull(actual):'—'}</td><td>${projected!=null?fmtINRFull(projected):'—'}</td><td>${incremented!=null?fmtINRFull(incremented):'—'}</td><td>${incImpact!=null?fmtINRFull(incImpact):'—'}</td></tr>`;
  }).join('');
  document.getElementById('detail-count').textContent = `Showing ${pageRows.length} of ${allRows.length} employees`;
  document.getElementById('page-info').textContent = `${page} / ${totalPages}`;
  document.getElementById('prev-page').disabled = page<=1;
  document.getElementById('next-page').disabled = page>=totalPages;
  state.detailPage = page;
}

function showUploadError(msg) {
  const el = document.getElementById('upload-error');
  el.textContent = `Error: ${msg}`; el.classList.remove('hidden');
}

function wireEvents() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  dropZone.addEventListener('click', ()=>fileInput.click());
  dropZone.addEventListener('dragover', e=>{e.preventDefault();dropZone.classList.add('border-gold-500');});
  dropZone.addEventListener('dragleave', ()=>dropZone.classList.remove('border-gold-500'));
  dropZone.addEventListener('drop', e=>{e.preventDefault();dropZone.classList.remove('border-gold-500');const file=e.dataTransfer.files[0];if(file)ingestFile(file);});
  fileInput.addEventListener('change', e=>{const file=e.target.files[0];if(file)ingestFile(file);});
  document.getElementById('load-sample-btn').addEventListener('click',()=>ingestFile(generateSampleData()));
  document.getElementById('toggle-assumptions-btn').addEventListener('click',()=>document.getElementById('assumptions-panel').classList.toggle('hidden'));
  document.getElementById('export-btn').addEventListener('click',()=>exportToExcel(state.employees,state.fyYear,state.incrementMap));
  document.getElementById('reset-btn').addEventListener('click',()=>{
    destroyAll(); state.rawEmployees=[]; state.employees=[];
    hide('dashboard'); show('upload-screen');
    document.getElementById('file-input').value='';
    document.getElementById('upload-error').classList.add('hidden');
  });
  document.getElementById('apply-increment-btn').addEventListener('click',()=>{
    state.incrementMap=readIncrementInputs();
    renderSummaryCards(); renderIncrementImpact(); renderCharts(); renderSummaryTables(); renderDetailTable();
  });
  ['filter-cohort','filter-department','filter-cadre','filter-status'].forEach(id=>{
    document.getElementById(id)?.addEventListener('change', e=>{
      if(id==='filter-cohort')     state.filters.cohort=e.target.value;
      if(id==='filter-department') state.filters.department=e.target.value;
      if(id==='filter-cadre')      state.filters.cadre=e.target.value;
      if(id==='filter-status')     state.filters.status=e.target.value;
      applyFilters(); renderDashboard();
    });
  });
  document.getElementById('filter-fy')?.addEventListener('change', e=>{
    state.fyYear=+e.target.value;
    document.getElementById('nav-fy-label').textContent=fyLabel(state.fyYear);
    state.rawEmployees=enrichEmployees(state.rawEmployees,state.fyYear);
    applyFilters(); renderDashboard();
  });
  document.getElementById('clear-filters-btn').addEventListener('click',()=>{
    state.filters={cohort:'',department:'',cadre:'',status:''};
    ['filter-cohort','filter-department','filter-cadre','filter-status'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    applyFilters(); renderDashboard();
  });
  document.getElementById('detail-search')?.addEventListener('input', e=>{state.detailSearch=e.target.value;state.detailPage=1;renderDetailTable();});
  document.getElementById('prev-page')?.addEventListener('click',()=>{if(state.detailPage>1){state.detailPage--;renderDetailTable();}});
  document.getElementById('next-page')?.addEventListener('click',()=>{state.detailPage++;renderDetailTable();});
}

wireEvents();
```

---

## After creating all 8 files

Your repo structure on GitHub should look exactly like this:
```
new-manpower-cost/
├── index.html
├── css/
│   └── app.css
└── js/
    ├── app.js
    ├── calc.js
    ├── charts.js
    ├── export.js
    ├── parser.js
    └── sampleData.js
