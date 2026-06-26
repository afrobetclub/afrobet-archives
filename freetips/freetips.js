
const CSV_URL="https://docs.google.com/spreadsheets/d/e/2PACX-1vRJH1dw4bmYwPC5Yxf8zKEeQvOb7aWKnxoZ-XTuPfBn_tOVyPQjQdE-kcBcOGRzQ-Iy_1FaDvGoPjV_/pub?gid=1888219940&single=true&output=csv";
fetch(CSV_URL).then(r=>r.text()).then(t=>{
const rows=t.trim().split(/\r?\n/).slice(1).map(l=>l.split(","));
rows.sort((a,b)=>new Date(b[0].split(/[./]/).reverse().join("-"))-new Date(a[0].split(/[./]/).reverse().join("-")));
document.getElementById("tipsRows").innerHTML=rows.slice(0,12).map(r=>`<div class="tip-row"><div class=date>${r[0]}</div><div class=match>${r[1]}</div><div class=pick>${r[2]}</div><div class=odd>${r[3]}</div></div>`).join("");
}).catch(()=>document.getElementById("tipsRows").innerHTML="Erreur");
