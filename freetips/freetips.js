const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRJH1dw4bmYwPC5Yxf8zKEeQvOb7aWKnxoZ-XTuPfBn_tOVyPQjQdE-kcBcOGRzQ-Iy_1FaDvGoPjV_/pub?gid=1888219940&single=true&output=csv";
const MAX_ROWS = 12;

document.addEventListener("DOMContentLoaded", () => {
  loadTips().catch(() => {
    document.getElementById("tipsRows").innerHTML = '<div class="loading">Impossible de charger les sélections.</div>';
  });
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

function toDate(value){
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);

  if(m){
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }

  return new Date(s);
}

function formatDate(value){
  const d = toDate(value);
  if(isNaN(d)) return String(value ?? "");
  return d.toLocaleDateString("fr-FR", {day:"2-digit", month:"2-digit", year:"numeric"}).replaceAll("/", ".");
}

function escapeHTML(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function loadTips(){
  const response = await fetch(CSV_URL, {cache:"no-store"});
  const parsed = parseCSV(await response.text());
  parsed.shift();

  const rows = parsed
    .filter(row => row[0] || row[1] || row[2] || row[3])
    .map(row => ({
      date: row[0],
      match: row[1],
      pick: row[2],
      odd: String(row[3] ?? "").trim().replace(",", ".")
    }))
    .sort((a,b) => toDate(b.date) - toDate(a.date))
    .slice(0, MAX_ROWS);

  document.getElementById("tipsRows").innerHTML = rows.map(row => `
    <article class="tip-row">
      <div class="date">${escapeHTML(formatDate(row.date))}</div>
      <div class="match">${escapeHTML(row.match)}</div>
      <div class="pick">${escapeHTML(row.pick)}</div>
      <div class="odd">${escapeHTML(row.odd)}</div>
    </article>
  `).join("");
}
