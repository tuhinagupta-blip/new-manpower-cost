import { CADRES } from './calc.js';

const COLUMN_ALIASES = {
  id:         ['employee id','emp id','empid','employee_id','emp_id','id','serial no','sr no'],
  name:       ['employee name','name','emp name','staff name','full name'],
  ctc:        ['annual ctc','ctc','annual_ctc','ctc (annual)','yearly ctc','annual salary','salary'],
  doj:        ['date of joining','doj','joining date','date_of_joining','join date','joining'],
  dol:        ['date of leaving','dol','leaving date','date_of_leaving','exit date','separation date','last working day','lwd'],
  department: ['department','dept','department name','dept name'],
  cohort:     ['cohort','business unit','bu','division','unit'],
  cadre:      ['cadre','employee type','emp type','grade','category','level','designation type'],
};

const REQUIRED_FIELDS = ['id','ctc','doj','department','cadre'];

export function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
}

export function detectMapping(rows) {
  if (!rows.length) return { mapping: {}, unmapped: REQUIRED_FIELDS };
  const headers = Object.keys(rows[0]).map(h => ({ orig: h, norm: h.toLowerCase().trim() }));
  const mapping = {};
  const unmapped = [];
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const match = headers.find(h => aliases.some(a => h.norm.includes(a) || a.includes(h.norm)));
    if (match) mapping[field] = match.orig;
    else if (REQUIRED_FIELDS.includes(field)) unmapped.push(field);
  }
  return { mapping, unmapped };
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) { if (isNaN(val)) return null; const d = new Date(val); d.setHours(0,0,0,0); return d; }
  if (typeof val === 'number') { const d = new Date(Math.round((val - 25569) * 86400 * 1000)); d.setHours(0,0,0,0); return d; }
  const s = String(val).trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) { const [,d,m,y] = dmy; const yr = y.length===2?2000+ +y:+y; return new Date(yr,+m-1,+d); }
  const parsed = new Date(s);
  if (!isNaN(parsed)) { parsed.setHours(0,0,0,0); return parsed; }
  return null;
}

function normaliseCadre(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  for (const c of CADRES) { if (c.toLowerCase()===s.toLowerCase()) return c; }
  const lower = s.toLowerCase();
  if (lower.includes('non')) return 'Non Management';
  if (lower.includes('mgmt')||lower.includes('manage')) return 'Management';
  if (lower.includes('contract')) return 'Contractual';
  if (lower.includes('consult')) return 'Consultant';
  return s;
}

function parseCTC(val) {
  if (val===null||val===undefined||val==='') return null;
  if (typeof val==='number') return val;
  const n = parseFloat(String(val).replace(/[₹,\s]/g,''));
  return isNaN(n) ? null : n;
}

export function mapRows(rows, mapping, cohortMap = {}) {
  const employees = [], validations = [], ids = new Set();
  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const get = (field) => mapping[field] ? row[mapping[field]] : null;
    const id     = String(get('id') ?? `ROW${rowNum}`).trim();
    const name   = String(get('name') ?? '').trim();
    const ctc    = parseCTC(get('ctc'));
    const doj    = parseDate(get('doj'));
    const dol    = parseDate(get('dol'));
    const dept   = String(get('department') ?? '').trim();
    const cohortRaw = String(get('cohort') ?? '').trim();
    const cadre  = normaliseCadre(get('cadre'));
    const cohort = cohortRaw || cohortMap[dept] || 'Unassigned';
    const issues = [];
    if (!ctc && ctc!==0) issues.push(`Row ${rowNum} [${id}]: Missing/invalid Annual CTC`);
    if (!doj)            issues.push(`Row ${rowNum} [${id}]: Missing/invalid Date of Joining`);
    if (!dept)           issues.push(`Row ${rowNum} [${id}]: Missing Department`);
    if (!cadre)          issues.push(`Row ${rowNum} [${id}]: Missing Cadre`);
    if (cadre && !CADRES.includes(cadre)) issues.push(`Row ${rowNum} [${id}]: Unknown cadre "${cadre}"`);
    if (doj && dol && doj > dol) issues.push(`Row ${rowNum} [${id}]: DOJ after DOL`);
    if (ids.has(id)) issues.push(`Row ${rowNum}: Duplicate ID "${id}"`);
    ids.add(id);
    validations.push(...issues);
    employees.push({ id, name, ctc, doj, dol, dept, cohort, cadre, invalid: issues.filter(v=>v.includes('Missing')||v.includes('after')).length>0, warnings: issues });
  });
  return { employees, validations };
}

export function enrichEmployees(employees, fyYear) {
  const today = new Date(); today.setHours(0,0,0,0);
  const fyStart = new Date(fyYear, 3, 1);
  const fyEnd   = new Date(fyYear + 1, 2, 31);
  return employees.map(emp => ({
    ...emp,
    active: !emp.dol || emp.dol >= today,
    joiningInFY: emp.doj >= fyStart && emp.doj <= fyEnd,
    leavingInFY: emp.dol && emp.dol >= fyStart && emp.dol <= fyEnd,
  }));
}
