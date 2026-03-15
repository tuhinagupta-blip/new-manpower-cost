import { calcActualCost, calcProjectedCost, calcIncrementedCost, groupBy, fmtINRFull, fyLabel, CADRES } from './calc.js';

function toSheet(data) { return XLSX.utils.aoa_to_sheet(data); }
function currency(n) { return Math.round(n || 0); }

export function exportToExcel(employees, fyYear, incrementMap) {
  const wb = XLSX.utils.book_new();
  const validAll = employees.filter(e => !e.invalid);
  const active = validAll.filter(e => e.active);
  const exited = validAll.filter(e => !e.active);
  const totalActual = validAll.reduce((s,e)=>s+calcActualCost(e,fyYear),0);
  const totalProjected = validAll.reduce((s,e)=>s+calcProjectedCost(e,fyYear),0);
  const totalIncremented = validAll.reduce((s,e)=>s+calcIncrementedCost(e,fyYear,incrementMap),0);

  XLSX.utils.book_append_sheet(wb, toSheet([
    [`Manpower Budget Dashboard — ${fyLabel(fyYear)}`],[],
    ['Metric','Value'],
    ['Total Headcount', employees.length],['Active', active.length],['Exited', exited.length],
    ['Actual Incurred Cost', currency(totalActual)],
    ['Projected FY Cost', currency(totalProjected)],
    ['Inc-Adjusted Projected FY Cost', currency(totalIncremented)],
    ['Increment Impact', currency(totalIncremented-totalProjected)],[],
    ['Generated on', new Date().toLocaleString('en-IN')],
  ]), 'Summary');

  const deptGroup = groupBy(validAll,'dept',fyYear,incrementMap);
  const deptRows = [['Department','Headcount','Actual (₹)','Projected (₹)','Inc-Adj (₹)','Impact (₹)']];
  let dT={hc:0,act:0,proj:0,inc:0};
  for (const [k,v] of Object.entries(deptGroup).sort((a,b)=>b[1].headcount-a[1].headcount)) {
    deptRows.push([k,v.headcount,currency(v.actual),currency(v.projected),currency(v.incremented),currency(v.incremented-v.projected)]);
    dT.hc+=v.headcount;dT.act+=v.actual;dT.proj+=v.projected;dT.inc+=v.incremented;
  }
  deptRows.push(['TOTAL',dT.hc,currency(dT.act),currency(dT.proj),currency(dT.inc),currency(dT.inc-dT.proj)]);
  XLSX.utils.book_append_sheet(wb, toSheet(deptRows), 'Department Summary');

  const cohortGroup = groupBy(validAll,'cohort',fyYear,incrementMap);
  const cohortRows = [['Cohort','Headcount','Actual (₹)','Projected (₹)','Inc-Adj (₹)','Impact (₹)']];
  let cT={hc:0,act:0,proj:0,inc:0};
  for (const [k,v] of Object.entries(cohortGroup)) {
    cohortRows.push([k,v.headcount,currency(v.actual),currency(v.projected),currency(v.incremented),currency(v.incremented-v.projected)]);
    cT.hc+=v.headcount;cT.act+=v.actual;cT.proj+=v.projected;cT.inc+=v.incremented;
  }
  cohortRows.push(['TOTAL',cT.hc,currency(cT.act),currency(cT.proj),currency(cT.inc),currency(cT.inc-cT.proj)]);
  XLSX.utils.book_append_sheet(wb, toSheet(cohortRows), 'Cohort Summary');

  const cadreGroup = groupBy(validAll,'cadre',fyYear,incrementMap);
  const cadreRows = [['Cadre','Headcount','Actual (₹)','Projected (₹)','Inc-Adj (₹)','Base %','Market %','Impact (₹)']];
  let kT={hc:0,act:0,proj:0,inc:0};
  for (const c of CADRES) {
    const v=cadreGroup[c]; if(!v) continue;
    const inc=incrementMap[c]||{base:0,market:0};
    cadreRows.push([c,v.headcount,currency(v.actual),currency(v.projected),currency(v.incremented),inc.base,inc.market,currency(v.incremented-v.projected)]);
    kT.hc+=v.headcount;kT.act+=v.actual;kT.proj+=v.projected;kT.inc+=v.incremented;
  }
  cadreRows.push(['TOTAL',kT.hc,currency(kT.act),currency(kT.proj),currency(kT.inc),'','',currency(kT.inc-kT.proj)]);
  XLSX.utils.book_append_sheet(wb, toSheet(cadreRows), 'Cadre Summary');

  XLSX.utils.book_append_sheet(wb, toSheet([
    ['Cadre','Base %','Market %','Total %'],
    ...CADRES.map(c=>{const i=incrementMap[c]||{base:0,market:0};return[c,i.base,i.market,i.base+i.market];}),
  ]), 'Increment Assumptions');

  const detailRows = [['Employee ID','Name','Department','Cohort','Cadre','DOJ','DOL','Status','Annual CTC (₹)','Actual (₹)','Projected (₹)','Base %','Market %','Inc CTC (₹)','Inc-Adj Projected (₹)','Impact (₹)']];
  for (const emp of validAll) {
    const inc=incrementMap[emp.cadre]||{base:0,market:0};
    const actual=calcActualCost(emp,fyYear),proj=calcProjectedCost(emp,fyYear),incProj=calcIncrementedCost(emp,fyYear,incrementMap);
    detailRows.push([emp.id,emp.name,emp.dept,emp.cohort,emp.cadre,emp.doj?emp.doj.toLocaleDateString('en-IN'):'',emp.dol?emp.dol.toLocaleDateString('en-IN'):'',emp.active?'Active':'Exited',currency(emp.ctc),currency(actual),currency(proj),inc.base,inc.market,currency(emp.ctc*(1+(inc.base+inc.market)/100)),currency(incProj),currency(incProj-proj)]);
  }
  XLSX.utils.book_append_sheet(wb, toSheet(detailRows), 'Employee Detail');

  XLSX.utils.book_append_sheet(wb, toSheet([
    ['Assumption','Value'],
    ['Daily Proration','Annual CTC ÷ 365'],['Financial Year','1 April – 31 March'],
    ['Blank Leaving Date','Active till FY end'],['Actual Incurred','FY Start → Today'],
    ['Projected FY','FY Start → FY End'],['Increment','CTC × (1 + Base% + Market%)'],
  ]), 'Assumptions');

  XLSX.writeFile(wb, `manpower_budget_${fyLabel(fyYear).replace(/\s/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
