import { fmtINR } from './calc.js';

const PALETTE = ['#c9940d','#e5ae20','#a87409','#6b460f','#857868','#6d6050','#574c3f','#3f3730'];
const PALETTE_LIGHT = ['#edc44a','#f3d98a','#c9940d','#a87409','#85590a','#6b460f','#3f3730','#2a2420'];

Chart.defaults.color = '#9e937f';
Chart.defaults.font.family = "'DM Mono', monospace";
Chart.defaults.font.size = 11;

const _charts = {};
function getOrCreate(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  return document.getElementById(id)?.getContext('2d');
}

export function renderBarH(id, labels, values, formatFn = v => v) {
  const ctx = getOrCreate(id); if (!ctx) return;
  _charts[id] = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ data:values, backgroundColor:PALETTE, borderRadius:4, borderSkipped:false }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>formatFn(ctx.raw)}} }, scales:{ x:{grid:{color:'#2a2420'},ticks:{callback:v=>formatFn(v)}}, y:{grid:{display:false}} } } });
}

export function renderBarV(id, labels, datasets) {
  const ctx = getOrCreate(id); if (!ctx) return;
  _charts[id] = new Chart(ctx, { type:'bar', data:{ labels, datasets:datasets.map((ds,i)=>({ label:ds.label, data:ds.data, backgroundColor:PALETTE[i], borderRadius:3, borderSkipped:false })) }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'bottom',labels:{boxWidth:10,padding:12}}, tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmtINR(ctx.raw)}`}} }, scales:{ x:{grid:{display:false}}, y:{grid:{color:'#2a2420'},ticks:{callback:v=>fmtINR(v)}} } } });
}

export function renderDoughnut(id, labels, values, formatFn = v => v) {
  const ctx = getOrCreate(id); if (!ctx) return;
  _charts[id] = new Chart(ctx, { type:'doughnut', data:{ labels, datasets:[{ data:values, backgroundColor:PALETTE_LIGHT, borderWidth:0, hoverOffset:4 }] }, options:{ responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{position:'bottom',labels:{boxWidth:10,padding:12}}, tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${formatFn(ctx.raw)}`}} } } });
}

export function renderLine(id, labels, datasets) {
  const ctx = getOrCreate(id); if (!ctx) return;
  _charts[id] = new Chart(ctx, { type:'line', data:{ labels, datasets:datasets.map((ds,i)=>({ label:ds.label, data:ds.data, borderColor:PALETTE[i], backgroundColor:PALETTE[i]+'22', pointBackgroundColor:PALETTE[i], pointRadius:4, tension:0.4, fill:true })) }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'bottom',labels:{boxWidth:10,padding:12}}, tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmtINR(ctx.raw)}`}} }, scales:{ x:{grid:{display:false}}, y:{grid:{color:'#2a2420'},ticks:{callback:v=>fmtINR(v)}} } } });
}

export function destroyAll() {
  for (const k of Object.keys(_charts)) { _charts[k].destroy(); delete _charts[k]; }
}
