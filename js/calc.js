export const CADRES = ['Management', 'Non Management', 'Contractual', 'Consultant'];

export function getFYBounds(year) {
  return { start: new Date(year, 3, 1), end: new Date(year + 1, 2, 31) };
}
export function getCurrentFY() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}
export function fyLabel(year) { return `FY ${year}–${String(year + 1).slice(2)}`; }

function clamp(d, lo, hi) { if (d < lo) return lo; if (d > hi) return hi; return d; }
function daysBetween(a, b) { return Math.max(0, Math.round((b - a) / 86400000)); }

export function calcActualCost(emp, fyYear) {
  const { start: fyStart } = getFYBounds(fyYear);
  const today = new Date(); today.setHours(0,0,0,0);
  const s = clamp(new Date(Math.max(fyStart, emp.doj)), fyStart, today);
  const e = clamp(emp.dol ? new Date(Math.min(today, emp.dol)) : today, fyStart, today);
  return (emp.ctc / 365) * daysBetween(s, e);
}

export function calcProjectedCost(emp, fyYear) {
  const { start: fyStart, end: fyEnd } = getFYBounds(fyYear);
  const s = clamp(new Date(Math.max(fyStart, emp.doj)), fyStart, fyEnd);
  const e = clamp(emp.dol ? new Date(Math.min(fyEnd, emp.dol)) : fyEnd, fyStart, fyEnd);
  return (emp.ctc / 365) * daysBetween(s, e);
}

export function calcIncrementedCost(emp, fyYear, incrementMap) {
  const inc = incrementMap[emp.cadre] || { base: 0, market: 0 };
  return calcProjectedCost({ ...emp, ctc: emp.ctc * (1 + (inc.base + inc.market) / 100) }, fyYear);
}

export function calcMonthlyTrend(employees, fyYear, incrementMap = null) {
  const months = [];
  for (let m = 0; m < 12; m++) {
    const monthIdx = (m + 3) % 12;
    const yr = m < 9 ? fyYear : fyYear + 1;
    const mStart = new Date(yr, monthIdx, 1);
    const mEnd   = new Date(yr, monthIdx + 1, 0);
    let cost = 0;
    for (const emp of employees) {
      if (emp.invalid || !emp.ctc) continue;
      const ctc = incrementMap
        ? emp.ctc * (1 + ((incrementMap[emp.cadre]?.base || 0) + (incrementMap[emp.cadre]?.market || 0)) / 100)
        : emp.ctc;
      const s = clamp(new Date(Math.max(mStart, emp.doj)), mStart, mEnd);
      const e = clamp(emp.dol ? new Date(Math.min(mEnd, emp.dol)) : mEnd, mStart, mEnd);
      cost += (ctc / 365) * Math.max(0, daysBetween(s, e) + 1);
    }
    months.push({ label: ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'][m], cost });
  }
  return months;
}

export function groupBy(employees, key, fyYear, incrementMap) {
  const map = {};
  for (const emp of employees) {
    if (emp.invalid) continue;
    const k = emp[key] || 'Unknown';
    if (!map[k]) map[k] = { headcount: 0, actual: 0, projected: 0, incremented: 0 };
    map[k].headcount++;
    map[k].actual      += calcActualCost(emp, fyYear);
    map[k].projected   += calcProjectedCost(emp, fyYear);
    map[k].incremented += incrementMap ? calcIncrementedCost(emp, fyYear, incrementMap) : 0;
  }
  return map;
}

export function fmtINR(n, decimals = 1) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  const lakhs = n / 100000;
  if (Math.abs(lakhs) >= 100) return `₹${(n / 10000000).toFixed(2)} Cr`;
  return `₹${lakhs.toFixed(decimals)}L`;
}
export function fmtINRFull(n) {
  if (!n && n !== 0) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
