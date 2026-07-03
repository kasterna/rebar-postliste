const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const tableBody = document.querySelector("#rebar-table tbody");
const countEl = document.getElementById("count");
const refreshBtn = document.getElementById("refresh-btn");

let API = null;
let rows = []; // grouped rebar rows currently shown
let sortKey = "postnr";
let sortDir = 1;

const REBAR_CLASSES = ["IfcReinforcingBar", "IfcReinforcingMesh"];
const REBAR_COMMON_TYPES = ["REINFORCINGBAR", "REINFORCINGMESH"];

function log(msg) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || "";
}

function findProperty(propertySets, name) {
  if (!propertySets) return undefined;
  for (const pset of propertySets) {
    if (!pset.properties) continue;
    for (const prop of pset.properties) {
      if (prop.name === name) return prop.value;
    }
  }
  // fallback: case-insensitive match
  for (const pset of propertySets) {
    if (!pset.properties) continue;
    for (const prop of pset.properties) {
      if (prop.name && prop.name.toLowerCase() === name.toLowerCase()) return prop.value;
    }
  }
  return undefined;
}

function isRebar(obj) {
  if (obj.class && REBAR_CLASSES.some((c) => c.toLowerCase() === obj.class.toLowerCase())) {
    return true;
  }
  const commonType = findProperty(obj.properties, "Common Type");
  if (commonType && REBAR_COMMON_TYPES.includes(String(commonType).toUpperCase())) {
    return true;
  }
  return false;
}

async function fetchRebarList() {
  refreshBtn.disabled = true;
  setStatus("Henter synlige objekter...", "busy");
  tableBody.innerHTML = "";
  countEl.textContent = "";

  try {
    const modelObjectsList = await API.viewer.getObjects(undefined, { visible: true });

    const groups = new Map(); // postnr -> group
    let totalVisible = 0;
    let rebarCount = 0;
    let missingPostnr = 0;

    for (const modelObjects of modelObjectsList) {
      const modelId = modelObjects.modelId;
      const runtimeIds = modelObjects.objects.map((o) => o.id);
      if (runtimeIds.length === 0) continue;
      totalVisible += runtimeIds.length;

      const fullProps = await API.viewer.getObjectProperties(modelId, runtimeIds);

      for (const obj of fullProps) {
        if (!isRebar(obj)) continue;
        rebarCount++;

        const postnr = findProperty(obj.properties, "Posisjonsnummer");
        const diameter = findProperty(obj.properties, "Diameter jern");
        const lengde = findProperty(obj.properties, "Armeringslengde");
        const formkode = findProperty(obj.properties, "Formkode");
        const segment = findProperty(obj.properties, "Segment");

        const key = postnr !== undefined ? String(postnr) : "(mangler postnr)";
        if (postnr === undefined) missingPostnr++;

        if (!groups.has(key)) {
          groups.set(key, {
            postnr: key,
            diameter,
            lengde,
            formkode,
            segment,
            count: 0,
            entries: [], // { modelId, runtimeId }
          });
        }
        const group = groups.get(key);
        group.count++;
        group.entries.push({ modelId, runtimeId: obj.id });
      }
    }

    rows = Array.from(groups.values());
    sortRows();
    renderTable();

    countEl.textContent = `${rebarCount} armeringselementer (${rows.length} unike postnr) av ${totalVisible} synlige objekter totalt.`;
    if (missingPostnr > 0) {
      countEl.textContent += ` OBS: ${missingPostnr} elementer manglet "Posisjonsnummer".`;
    }

    setStatus("Tilkoblet Trimble Connect ✔", "ok");
    log(`Hentet ${rebarCount} armeringselementer, ${rows.length} unike postnr.`);
  } catch (err) {
    setStatus("Feil ved henting av armering ✘", "error");
    log("Feil: " + err.message);
  } finally {
    refreshBtn.disabled = false;
  }
}

function sortRows() {
  rows.sort((a, b) => {
    let av = a[sortKey];
    let bv = b[sortKey];
    const an = parseFloat(av);
    const bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) {
      return (an - bn) * sortDir;
    }
    return String(av).localeCompare(String(bv)) * sortDir;
  });
}

function renderTable() {
  tableBody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.postnr}</td>
      <td>${row.count}</td>
      <td>${row.diameter ?? ""}</td>
      <td>${row.lengde ?? ""}</td>
      <td>${row.formkode ?? ""}</td>
      <td>${row.segment ?? ""}</td>
    `;
    tr.addEventListener("click", () => selectAndZoom(row));
    tableBody.appendChild(tr);
  }
}

async function selectAndZoom(row) {
  const byModel = new Map();
  for (const entry of row.entries) {
    if (!byModel.has(entry.modelId)) byModel.set(entry.modelId, []);
    byModel.get(entry.modelId).push(entry.runtimeId);
  }
  const selector = {
    modelObjectIds: Array.from(byModel.entries()).map(([modelId, objectRuntimeIds]) => ({
      modelId,
      objectRuntimeIds,
    })),
  };

  try {
    await API.viewer.setSelection(selector, "set");
    await API.viewer.setCamera(selector);
    log(`Valgt og zoomet til postnr ${row.postnr} (${row.count} stk).`);
  } catch (err) {
    log("Feil ved valg/zoom: " + err.message);
  }
}

document.querySelectorAll("#rebar-table th[data-key]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.key;
    if (sortKey === key) {
      sortDir *= -1;
    } else {
      sortKey = key;
      sortDir = 1;
    }
    sortRows();
    renderTable();
  });
});

refreshBtn.addEventListener("click", fetchRebarList);

async function main() {
  try {
    API = await TrimbleConnectWorkspace.connect(
      window.parent,
      (event, args) => {
        // Events are logged only for debugging; not otherwise handled yet.
      },
      30000
    );
    window.API = API;
    setStatus("Tilkoblet Trimble Connect ✔", "ok");
    log("WorkspaceAPI.connect() lyktes.");
    refreshBtn.disabled = false;
  } catch (err) {
    setStatus("Kunne ikke koble til Trimble Connect ✘", "error");
    log("Feil: " + err.message);
  }
}

main();
