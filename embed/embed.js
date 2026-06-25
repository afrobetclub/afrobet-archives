const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRJH1dw4bmYwPC5Yxf8zKEeQvOb7aWKnxoZ-XTuPfBn_tOVyPQjQdE-kcBcOGRzQ-Iy_1FaDvGoPjV_/pub?gid=622475547&single=true&output=csv";

let chartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  loadData().catch(error => console.error(error));
});

function parseCSV(text){
  const rows = [];
  let row = [], cell = "", quote = false;

  for(let i = 0; i < text.length; i++){
    const c = text[i], n = text[i + 1];

    if(c === '"' && quote && n === '"'){
      cell += '"';
      i++;
      continue;
    }

    if(c === '"'){
      quote = !quote;
      continue;
    }

    if(c === "," && !quote){
      row.push(cell);
      cell = "";
      continue;
    }

    if((c === "\n" || c === "\r") && !quote){
      if(cell || row.length){
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if(c === "\r" && n === "\n") i++;
      continue;
    }

    cell += c;
  }

  if(cell || row.length){
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function toNumber(value){
  return Number(String(value ?? "").replace(/\s/g, "").replace("%", "").replace(",", ".")) || 0;
}

function toDate(value){
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if(m){
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }

  return new Date(s);
}

function formatNumber(value, decimals = 2){
  return Number(value).toFixed(decimals).replace(".", ",");
}

function formatCount(value){
  return Number(value).toLocaleString("fr-FR");
}

function monthKey(date){
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key){
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("fr-FR", {month:"short", year:"numeric"}).replace(".", "");
}

async function loadData(){
  const response = await fetch(CSV_URL, {cache:"no-store"});
  const csv = await response.text();
  const parsed = parseCSV(csv);
  parsed.shift();

  const rows = parsed
    .filter(row => row[0])
    .map(row => ({
      date: toDate(row[0]),
      result: String(row[6] || "").trim().toUpperCase(),
      odd: toNumber(row[5]),
      profit: toNumber(row[7])
    }))
    .filter(row => !isNaN(row.date));

  rows.sort((a,b) => a.date - b.date);

  renderStats(rows);
  renderMonthlyChart(rows);
}

function renderStats(rows){
  const total = rows.length;
  const wins = rows.filter(row => row.result.includes("WIN")).length;
  const profit = rows.reduce((sum, row) => sum + row.profit, 0);
  const averageOdds = total ? rows.reduce((sum, row) => sum + row.odd, 0) / total : 0;
  const roi = total ? (profit / total) * 100 : 0;

  document.getElementById("profitTotal").textContent = `${profit >= 0 ? "+" : ""}${formatNumber(profit, 2)}u`;
  document.getElementById("winRate").textContent = `${formatNumber((wins / total) * 100, 2)}%`;
  document.getElementById("roi").textContent = `${formatNumber(roi, 2)}%`;
  document.getElementById("numberTips").textContent = formatCount(total);
  document.getElementById("averageOdds").textContent = formatNumber(averageOdds, 2);
}

function renderMonthlyChart(rows){
  const monthly = new Map();
  let cumulative = 0;

  rows.forEach(row => {
    cumulative += row.profit;
    const key = monthKey(row.date);
    monthly.set(key, cumulative);
  });

  const data = [...monthly.entries()].map(([key, value]) => ({
    label: monthLabel(key),
    value: Number(value.toFixed(2))
  }));

  const labels = data.map(item => item.label);
  const values = data.map(item => item.value);
  const lastValue = values[values.length - 1];

  const lastPointLabelPlugin = {
    id: "lastPointLabel",
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      const last = meta.data[meta.data.length - 1];

      if(!last) return;

      ctx.save();
      ctx.font = "700 18px Fira Code, monospace";
      ctx.fillStyle = "#10100E";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${lastValue >= 0 ? "+" : ""}${lastValue.toFixed(2).replace(".", ",")}u`, last.x - 8, last.y - 14);
      ctx.restore();
    }
  };

  const ctx = document.getElementById("monthlyChart");

  if(chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type:"line",
    data:{
      labels,
      datasets:[{
        data:values,
        borderColor:"#123B2A",
        borderWidth:2,
        pointRadius:0,
        pointHoverRadius:0,
        tension:0.22,
        fill:false
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      layout:{padding:{top:34,right:28,bottom:4,left:0}},
      plugins:{
        legend:{display:false},
        tooltip:{enabled:false}
      },
      scales:{
        x:{
          grid:{display:false},
          ticks:{
            color:"#726D65",
            font:{family:"Fira Code", size:13, weight:"500"},
            maxTicksLimit:6
          },
          border:{display:false}
        },
        y:{
          grid:{color:"#D6CEC1"},
          ticks:{display:false},
          border:{display:false}
        }
      }
    },
    plugins:[lastPointLabelPlugin]
  });
}
