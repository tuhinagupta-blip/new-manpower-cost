export function generateSampleData() {
  const depts = [
    {dept:'Finance',cohort:'Corporate'},{dept:'Legal',cohort:'Corporate'},{dept:'IT',cohort:'Corporate'},
    {dept:'Womenswear Design',cohort:'Design'},{dept:'Accessories Design',cohort:'Design'},
    {dept:'Jewellery Making',cohort:'Jewellery Production'},{dept:'Embroidery',cohort:'Jewellery Production'},
    {dept:'HR & Admin',cohort:'Corporate'},
  ];
  const cadres = ['Management','Non Management','Contractual','Consultant'];
  const ctcRanges = {'Management':[1200000,4500000],'Non Management':[360000,900000],'Contractual':[240000,600000],'Consultant':[600000,1800000]};
  const rows = [];
  let empNum = 1001;
  function rnd(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
  function rndDate(y,m,d,y2,m2,d2){const d1=new Date(y,m-1,d).getTime(),d2ms=new Date(y2,m2-1,d2).getTime(),dt=new Date(d1+Math.random()*(d2ms-d1));return`${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;}
  for (const {dept,cohort} of depts) {
    for (let i=0;i<rnd(4,10);i++) {
      const cadre=cadres[rnd(0,3)];
      const [lo,hi]=ctcRanges[cadre];
      const ctc=Math.round(rnd(lo,hi)/12000)*12000;
      const doj=rndDate(2022,1,1,2025,10,1);
      const isLeaver=Math.random()<0.15;
      const dol=isLeaver?rndDate(2024,6,1,2025,11,30):'';
      rows.push({'Employee ID':`EMP${empNum++}`,'Employee Name':`Employee ${empNum-1001}`,'Department':dept,'Cohort':cohort,'Cadre':cadre,'Annual CTC':ctc,'Date of Joining':doj,'Date of Leaving':dol});
    }
  }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Employees');
  const buf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  return new File([buf],'sample_manpower_data.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
