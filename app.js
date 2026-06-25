let allRows = [];
let chartInstance = null;

function parseCSV(text){
  const rows = [];
  let row = [], cell = "", quote = false;
  for(let i=0;i<text.length;i++){
    const c = text[i], n = text[i+1];
    if(c === '"' && quote && n === '"'){ cell += '"'; i++; continue; }
    if(c === '"'){ quote = !quote; continue; }
    if(c === "," && !quote){ row.push(cell); cell = ""; continue; }
    if((c === "\n" || c === "\r") && !quote){
      if(cell || row.length){ row.push(cell); rows.push(row); row=[]; cell=""; }
      if(c === "\r" && n === "\n") i++;
      continue;
    }
    cell += c;
  }
  if(cell || row.length){ row.push(cell); rows.push(row); }
  return rows;
}

function toNumber(v){
  return Number(String(v ?? "").replace(/\s/g,"").replace("%","").replace(",", ".")) || 0;
}

function toDate(v){
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
  return new Date(s);
}

function dateDisplay(v){
  const d = toDate(v);
  return isNaN(d) ? String(v ?? "") : d.toLocaleDateString("fr-FR", {day:"2-digit", month:"short", year:"numeric"});
}

function profitDisplay(v){
  const n = toNumber(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(2).replace(".", ",")}u`;
}

async function loadData(){
  const res = await fetch(CONFIG.CSV_URL, {cache:"no-store"});
  if(!res.ok) throw new Error("CSV fetch failed");
  const csv = await res.text();
  const parsed = parseCSV(csv);
  parsed.shift();

  allRows = parsed.filter(r => r[0]).map(r => ({
    date:r[0],
    team1:r[1],
    score:r[2],
    team2:r[3],
    prediction:r[4],
    odd:toNumber(r[5]),
    result:String(r[6] || "").trim().toUpperCase(),
    profit:toNumber(r[7]),
    cumulative:toNumber(r[8]),
    roi:r[9]
  }));

  allRows.sort((a,b)=> toDate(b.date) - toDate(a.date));
  populateYears();
  render();
}

function populateYears(){
  const years = [...new Set(allRows.map(r => toDate(r.date).getFullYear()).filter(Boolean))].sort((a,b)=>b-a);
  const select = document.getElementById("year");
  years.forEach(y => {
    const option = document.createElement("option");
    option.value = String(y);
    option.textContent = String(y);
    select.appendChild(option);
  });
}

function getFilteredRows(){
  const q = document.getElementById("search").value.trim().toLowerCase();
  const year = document.getElementById("year").value;
  const result = document.getElementById("result").value;

  return allRows.filter(r => {
    const haystack = `${r.date} ${r.team1} ${r.score} ${r.team2} ${r.prediction} ${r.result}`.toLowerCase();
    const y = String(toDate(r.date).getFullYear());
    return (!q || haystack.includes(q)) &&
           (!year || y === year) &&
           (!result || r.result === result);
  });
}

function render(){
  const rows = getFilteredRows();
  renderStats(rows);
  renderChart(rows);
  renderArchive(rows);
}

function renderStats(rows){
  const bets = rows.length;
  const wins = rows.filter(r => r.result.includes("WIN")).length;
  const profit = rows.reduce((sum,r)=>sum+r.profit,0);
  const avgOdd = bets ? rows.reduce((sum,r)=>sum+r.odd,0)/bets : 0;
  const roi = bets ? (profit / bets) * 100 : 0;

  document.getElementById("bets").textContent = bets.toLocaleString("fr-FR");
  document.getElementById("winrate").textContent = bets ? `${(wins/bets*100).toFixed(2).replace(".", ",")}%` : "—";
  document.getElementById("avgodd").textContent = avgOdd ? avgOdd.toFixed(2).replace(".", ",") : "—";
  document.getElementById("profit").textContent = profitDisplay(profit);
  document.getElementById("roi").textContent = bets ? `${roi.toFixed(2).replace(".", ",")}%` : "—";
}

function renderChart(rows){
  const ordered = [...rows].sort((a,b)=>toDate(a.date)-toDate(b.date));
  let cumulative = 0;
  const labels = [];
  const values = [];

  ordered.forEach(r => {
    cumulative += r.profit;
    labels.push(dateDisplay(r.date));
    values.push(Number(cumulative.toFixed(2)));
  });

  const ctx = document.getElementById("profitChart");
  if(chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type:"line",
    data:{
      labels,
      datasets:[{
        data:values,
        borderColor:"#123b2a",
        borderWidth:2,
        pointRadius:0,
        tension:.24
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:"index", intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:"#10100e",
          titleColor:"#f3eee4",
          bodyColor:"#f3eee4",
          borderColor:"#d6cec1",
          borderWidth:1,
          displayColors:false,
          callbacks:{label:(ctx)=>` Profit: ${profitDisplay(ctx.parsed.y)}`}
        }
      },
      scales:{
        x:{ticks:{color:"#69645d", maxTicksLimit:6}, grid:{display:false}},
        y:{ticks:{color:"#69645d"}, grid:{color:"#d6cec1"}}
      }
    }
  });
}

function renderArchive(rows){
  const container = document.getElementById("archiveRows");
  const visible = rows.slice(0, CONFIG.MAX_ROWS);
  if(!visible.length){
    container.innerHTML = `<div class="loading">No selection found.</div>`;
    return;
  }

  container.innerHTML = visible.map(r => {
    const resultClass = r.result.includes("WIN") ? "win" : r.result.includes("LOSS") ? "loss" : "void";
    const profitClass = r.profit >= 0 ? "win" : "loss";
    const match = `${r.team1 || ""} — ${r.team2 || ""}`;
    return `
      <article class="row">
        <div class="date">${dateDisplay(r.date)}</div>
        <div class="match"><strong>${match}</strong><div class="score">${r.score || ""}</div></div>
        <div class="pick">${r.prediction || "—"}</div>
        <div class="odds">${r.odd ? r.odd.toFixed(2).replace(".", ",") : "—"}</div>
        <div class="result ${resultClass}">${r.result || "—"}</div>
        <div class="profit ${profitClass}">${profitDisplay(r.profit)}</div>
      </article>
    `;
  }).join("");
}

document.getElementById("search").addEventListener("input", render);
document.getElementById("year").addEventListener("change", render);
document.getElementById("result").addEventListener("change", render);

loadData().catch(err => {
  console.error(err);
  document.getElementById("archiveRows").innerHTML = `<div class="loading">Unable to load archives. Check the CSV publication URL in config.js.</div>`;
});
