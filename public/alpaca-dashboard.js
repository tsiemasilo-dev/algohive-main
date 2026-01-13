const tabs = [
  { key: "class", label: "Asset Class" },
  { key: "symbol", label: "Symbol" },
  { key: "exchange", label: "Exchange" },
  { key: "fractionable", label: "Fractionable" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
];

const tabBar = document.getElementById("tabBar");
const table = document.getElementById("assetTable");
const tbody = table.querySelector("tbody");
const loading = document.getElementById("loading");
const error = document.getElementById("error");
const summaryCards = document.getElementById("summaryCards");
const searchInput = document.getElementById("search");
const classFilter = document.getElementById("classFilter");
const statusFilter = document.getElementById("statusFilter");

let rawAssets = [];
let activeTab = tabs[0].key;

const formatter = new Intl.NumberFormat();

function setActiveTab(key) {
  activeTab = key;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.key === key);
  });
  renderRows();
}

function createTabs() {
  tabs.forEach(({ key, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = `tab${key === activeTab ? " active" : ""}`;
    button.dataset.key = key;
    button.addEventListener("click", () => setActiveTab(key));
    tabBar.appendChild(button);
  });
}

function buildFilters(assets) {
  const classes = new Set();
  const statuses = new Set();
  assets.forEach((asset) => {
    if (asset.class) classes.add(asset.class);
    if (asset.status) statuses.add(asset.status);
  });

  [...classes].sort().forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    classFilter.appendChild(option);
  });

  [...statuses].sort().forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    statusFilter.appendChild(option);
  });
}

function renderSummary(assets) {
  if (!assets.length) {
    summaryCards.innerHTML = "";
    return;
  }

  const totalTradable = assets.filter((a) => a.tradable).length;
  const fractionable = assets.filter((a) => a.fractionable).length;
  const exchanges = new Set(assets.map((a) => a.exchange));

  summaryCards.innerHTML = `
    <article class="card">
      <div class="card-label">Total Symbols</div>
      <div class="card-value">${formatter.format(assets.length)}</div>
    </article>
    <article class="card">
      <div class="card-label">Tradable</div>
      <div class="card-value">${formatter.format(totalTradable)}</div>
    </article>
    <article class="card">
      <div class="card-label">Fractionable</div>
      <div class="card-value">${formatter.format(fractionable)}</div>
    </article>
    <article class="card">
      <div class="card-label">Exchanges Covered</div>
      <div class="card-value">${formatter.format(exchanges.size)}</div>
    </article>
  `;
}

function getFilteredAssets() {
  const query = searchInput.value.trim().toLowerCase();
  return rawAssets.filter((asset) => {
    if (classFilter.value && asset.class !== classFilter.value) return false;
    if (statusFilter.value && asset.status !== statusFilter.value) return false;
    if (!query) return true;
    return [asset.symbol, asset.name, asset.exchange]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  });
}

function renderRows() {
  const filtered = getFilteredAssets();
  const key = activeTab;
  const sorted = [...filtered].sort((a, b) => {
    const valueA = a[key];
    const valueB = b[key];

    if (typeof valueA === "boolean" && typeof valueB === "boolean") {
      return Number(valueB) - Number(valueA);
    }

    return String(valueA ?? "").localeCompare(String(valueB ?? ""));
  });

  tbody.innerHTML = sorted
    .map((asset) => {
      const tradeUrl = `https://www.tradingview.com/symbols/${asset.exchange}-${asset.symbol}/`;
      return `
        <tr>
          <td>${asset.class ?? "-"}</td>
          <td>${asset.symbol}</td>
          <td>${asset.exchange ?? "-"}</td>
          <td>
            <span class="badge boolean-${asset.fractionable}">
              ${asset.fractionable ? "Yes" : "No"}
            </span>
          </td>
          <td>${asset.name ?? "-"}</td>
          <td>
            <span class="badge ${asset.status === "active" ? "active" : "inactive"}">
              ${asset.status}
            </span>
          </td>
          <td>
            <a class="trade-link" href="${tradeUrl}" target="_blank" rel="noopener noreferrer">Trade ↗</a>
          </td>
        </tr>
      `;
    })
    .join("");

  table.hidden = false;
  renderSummary(filtered);
}

function attachFilterListeners() {
  [searchInput, classFilter, statusFilter].forEach((input) =>
    input.addEventListener("input", renderRows)
  );
}

async function loadAssets() {
  try {
    const response = await fetch("alpaca-assets.json");
    if (!response.ok) throw new Error("Unable to load alpaca-assets.json");
    const data = await response.json();
    rawAssets = Array.isArray(data) ? data : data.assets ?? [];

    if (!rawAssets.length) {
      throw new Error("No asset records found in alpaca-assets.json");
    }

    buildFilters(rawAssets);
    renderSummary(rawAssets);
    renderRows();
    attachFilterListeners();
    loading.hidden = true;
  } catch (err) {
    console.error(err);
    loading.hidden = true;
    error.hidden = false;
    error.textContent = err.message;
  }
}

createTabs();
loadAssets();
