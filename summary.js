const SESSION_KEY = "lendingUserSession";
const GOOGLE_SCRIPT_URL = window.APP_CONFIG?.googleScriptUrl || "";
const INDIAN_INTEGER_FORMATTER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const INDIAN_TWO_DECIMAL_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const sidebarUsername = document.getElementById("sidebarUsername");
const logoutButtons = document.querySelectorAll("[data-logout]");
const refreshButton = document.getElementById("refreshButton");
const monthFilter = document.getElementById("monthFilter");
const summaryNote = document.getElementById("summaryNote");
const summaryGrid = document.getElementById("summaryGrid");
const summaryTotalBar = document.getElementById("summaryTotalBar");

let entryHeaders = [];
let entryRows = [];

const session = getSession();

if (!session) {
  window.location.href = "index.html";
}

if (session) {
  sidebarUsername.textContent = session.fullName || getUsername(session.username || session.email || "User");
}

logoutButtons.forEach((button) => {
  button.addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "index.html";
  });
});

refreshButton.addEventListener("click", () => {
  void loadEntries();
});

monthFilter.addEventListener("change", () => {
  renderSummary();
});

void loadEntries();

async function loadEntries() {
  setSummaryNote("Loading summary...", "");
  refreshButton.disabled = true;
  monthFilter.disabled = true;

  try {
    const result = await loadEntriesJsonp();
    if (!result.success || !Array.isArray(result.headers) || !Array.isArray(result.data)) {
      throw new Error(result.message || "Summary data is unavailable.");
    }

    entryHeaders = result.headers;
    entryRows = normalizeEntryRows(result.data);
    populateMonthFilter();
    renderSummary();
  } catch (error) {
    summaryGrid.innerHTML = "";
    summaryTotalBar.innerHTML = "";
    setSummaryNote(error.message || "Could not load summary.", "is-error");
  } finally {
    refreshButton.disabled = false;
    monthFilter.disabled = false;
  }
}

function normalizeEntryRows(rows) {
  return rows.map((row) => {
    if (row && typeof row === "object" && Array.isArray(row.values)) {
      return row.values;
    }

    return Array.isArray(row) ? row : [];
  });
}

function loadEntriesJsonp() {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_SCRIPT_URL) {
      reject(new Error("Add your Google Apps Script web app URL in config.js before loading summary."));
      return;
    }

    const callbackName = `summaryEntriesCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const script = document.createElement("script");
    const url = new URL(GOOGLE_SCRIPT_URL);

    url.searchParams.set("action", "entries");
    url.searchParams.set("callback", callbackName);

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Summary request timed out. Redeploy the Apps Script and try again."));
    }, 10000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Could not reach the summary service."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function populateMonthFilter() {
  const dateIndex = getHeaderIndex(["Deposit Date", "Entry Date", "Date"]);
  const months = new Set();

  if (dateIndex !== -1) {
    entryRows.forEach((row) => {
      const monthKey = getMonthKey(String(row[dateIndex] || ""));
      if (monthKey) {
        months.add(monthKey);
      }
    });
  }

  const sortedMonths = Array.from(months).sort().reverse();
  monthFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "ALL";
  allOption.textContent = "All Months";
  monthFilter.appendChild(allOption);

  sortedMonths.forEach((monthKey) => {
    const option = document.createElement("option");
    option.value = monthKey;
    option.textContent = formatMonthLabel(monthKey);
    monthFilter.appendChild(option);
  });
}

function renderSummary() {
  const nameIndex = getHeaderIndex(["Name", "Borrower Name"]);
  const amountIndex = getHeaderIndex(["Amount", "Principal Amount"]);
  const goldWeightIndex = getHeaderIndex(["Gold Weight"]);
  const silverWeightIndex = getHeaderIndex(["Silver Weight"]);
  const dateIndex = getHeaderIndex(["Deposit Date", "Entry Date", "Date"]);

  if (nameIndex === -1 || amountIndex === -1 || dateIndex === -1) {
    summaryGrid.innerHTML = "";
    summaryTotalBar.innerHTML = "";
    setSummaryNote("The Active Items sheet is missing required columns for summary.", "is-error");
    return;
  }

  const selectedMonth = monthFilter.value || "ALL";
  const filteredRows = entryRows.filter((row) => {
    if (selectedMonth === "ALL") {
      return true;
    }

    return getMonthKey(String(row[dateIndex] || "")) === selectedMonth;
  });

  const summary = new Map();

  filteredRows.forEach((row) => {
    const name = String(row[nameIndex] || "Unnamed").trim() || "Unnamed";
    const current = summary.get(name) || {
      name,
      count: 0,
      amount: 0,
      goldWeight: 0,
      silverWeight: 0
    };

    current.count += 1;
    current.amount += parseIndianNumber(row[amountIndex]);
    current.goldWeight += goldWeightIndex === -1 ? 0 : parseIndianNumber(row[goldWeightIndex]);
    current.silverWeight += silverWeightIndex === -1 ? 0 : parseIndianNumber(row[silverWeightIndex]);
    summary.set(name, current);
  });

  const summaryRows = Array.from(summary.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );

  renderTotalBar(filteredRows, summaryRows);
  renderSummaryCards(summaryRows);

  if (!filteredRows.length) {
    setSummaryNote("No loan records found for the selected month.", "");
    return;
  }

  const selectedLabel = selectedMonth === "ALL" ? "all months" : formatMonthLabel(selectedMonth);
  setSummaryNote(`Showing ${filteredRows.length} loan record${filteredRows.length === 1 ? "" : "s"} for ${selectedLabel}.`, "is-success");
}

function renderTotalBar(filteredRows, summaryRows) {
  const totalAmount = summaryRows.reduce((sum, row) => sum + row.amount, 0);
  const totalGoldWeight = summaryRows.reduce((sum, row) => sum + row.goldWeight, 0);
  const totalSilverWeight = summaryRows.reduce((sum, row) => sum + row.silverWeight, 0);

  summaryTotalBar.innerHTML = `
    <article class="summary-total-card">
      <span>Total Loans</span>
      <strong>${INDIAN_INTEGER_FORMATTER.format(filteredRows.length)}</strong>
    </article>
    <article class="summary-total-card">
      <span>Total Amount</span>
      <strong>${INDIAN_INTEGER_FORMATTER.format(Math.round(totalAmount))}</strong>
    </article>
    <article class="summary-total-card">
      <span>Gold Weight</span>
      <strong>${INDIAN_TWO_DECIMAL_FORMATTER.format(totalGoldWeight)}</strong>
    </article>
    <article class="summary-total-card">
      <span>Silver Weight</span>
      <strong>${INDIAN_INTEGER_FORMATTER.format(Math.round(totalSilverWeight))}</strong>
    </article>
  `;
}

function renderSummaryCards(summaryRows) {
  if (!summaryRows.length) {
    summaryGrid.innerHTML = `<article class="home-card"><h2>No data</h2><p>No name-wise totals are available for this filter.</p></article>`;
    return;
  }

  summaryGrid.innerHTML = summaryRows.map((row) => `
    <article class="summary-card">
      <div class="summary-card-top">
        <p class="eyebrow">Name</p>
        <h2>${escapeHtml(row.name)}</h2>
      </div>
      <div class="summary-metrics">
        <div><span>Loans</span><strong>${INDIAN_INTEGER_FORMATTER.format(row.count)}</strong></div>
        <div><span>Amount</span><strong>${INDIAN_INTEGER_FORMATTER.format(Math.round(row.amount))}</strong></div>
        <div><span>Gold</span><strong>${INDIAN_TWO_DECIMAL_FORMATTER.format(row.goldWeight)}</strong></div>
        <div><span>Silver</span><strong>${INDIAN_INTEGER_FORMATTER.format(Math.round(row.silverWeight))}</strong></div>
      </div>
    </article>
  `).join("");
}

function getHeaderIndex(names) {
  return names.map((name) => entryHeaders.indexOf(name)).find((index) => index !== -1) ?? -1;
}

function getMonthKey(value) {
  const isoMatch = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}`;
  }

  const dashMatch = String(value || "").trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dashMatch) {
    return `${dashMatch[3]}-${dashMatch[2]}`;
  }

  const slashMatch = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}`;
  }

  return "";
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function parseIndianNumber(value) {
  const cleaned = String(value || "").replaceAll(",", "").trim();
  const numericValue = Number(cleaned);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function setSummaryNote(message, state = "") {
  summaryNote.textContent = message;
  summaryNote.classList.remove("is-error", "is-success");

  if (state) {
    summaryNote.classList.add(state);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSession() {
  const rawSession = localStorage.getItem(SESSION_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession);
  } catch {
    return { email: rawSession, username: getUsername(rawSession) };
  }
}

function getUsername(value) {
  const rawValue = String(value || "").trim();
  return rawValue.includes("@") ? rawValue.split("@")[0] : rawValue;
}
