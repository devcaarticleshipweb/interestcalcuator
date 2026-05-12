const SESSION_KEY = "lendingUserSession";
const GOOGLE_SCRIPT_URL = window.APP_CONFIG?.googleScriptUrl || "";
const INDIAN_INTEGER_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});

const logoutButtons = document.querySelectorAll("[data-logout]");
const sidebarUsername = document.getElementById("sidebarUsername");
const welcomeTitle = document.getElementById("welcomeTitle");
const interestDateField = document.getElementById("interestDateField");
const homeNote = document.getElementById("homeNote");
const homeTableBody = document.getElementById("homeTableBody");
const homeCardList = document.getElementById("homeCardList");
const viewModalBackdrop = document.getElementById("viewModalBackdrop");
const closeViewModalButton = document.getElementById("closeViewModal");
const detailGrid = document.getElementById("detailGrid");

let entryHeaders = [];
let entryRows = [];

const session = getSession();

if (!session) {
  window.location.href = "index.html";
}

if (session) {
  const displayName = session.fullName || getUsername(session.username || session.email || "User");
  sidebarUsername.textContent = displayName;
  welcomeTitle.textContent = `Welcome ${displayName}`;
}

interestDateField.value = getTodayInputValue();

logoutButtons.forEach((button) => {
  button.addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "index.html";
  });
});

interestDateField.addEventListener("change", () => {
  renderHomeTable();
});

closeViewModalButton.addEventListener("click", () => {
  closeViewModal();
});

viewModalBackdrop.addEventListener("click", (event) => {
  if (event.target === viewModalBackdrop) {
    closeViewModal();
  }
});

void loadEntries();

async function loadEntries() {
  setHomeNote("Loading saved loan records...", "");

  try {
    const result = await loadEntriesJsonp();
    if (!result.success || !Array.isArray(result.headers) || !Array.isArray(result.data)) {
      throw new Error(result.message || "Entries are unavailable.");
    }

    entryHeaders = result.headers;
    entryRows = normalizeEntryRows(result.data);
    renderHomeTable();
  } catch (error) {
    entryHeaders = [];
    entryRows = [];
    homeTableBody.innerHTML = "";
    setHomeNote(error.message || "Could not load saved loan records.", "is-error");
  }
}

function loadEntriesJsonp() {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_SCRIPT_URL) {
      reject(new Error("Add your Google Apps Script web app URL in config.js before loading loan records."));
      return;
    }

    const callbackName = `homeEntriesCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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
      reject(new Error("Entries request timed out. Redeploy the Apps Script and try again."));
    }, 10000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Could not reach the entries service."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function normalizeEntryRows(rows) {
  return rows.map((row, index) => {
    if (row && typeof row === "object" && Array.isArray(row.values)) {
      return {
        rowNumber: Number(row.rowNumber) || index + 2,
        values: row.values
      };
    }

    return {
      rowNumber: index + 2,
      values: Array.isArray(row) ? row : []
    };
  });
}

function renderHomeTable() {
  homeTableBody.innerHTML = "";
  homeCardList.innerHTML = "";

  if (!entryRows.length) {
    setHomeNote("No loan records found yet.", "");
    return;
  }

  const selectedDate = interestDateField.value || getTodayInputValue();
  const idIndex = getHeaderIndex(["ID", "PAN / ID"]);
  const nameIndex = getHeaderIndex(["Name", "Borrower Name"]);
  const amountIndex = getHeaderIndex(["Amount", "Principal Amount"]);
  const marginIndex = getHeaderIndex(["Margin %", "Margin"]);
  const depositDateIndex = getHeaderIndex(["Deposit Date", "Loan Start Date", "Date"]);
  const articlesIndex = getHeaderIndex(["Articles", "Loan Notes", "Work Details"]);

  entryRows.forEach((rowEntry) => {
    const row = rowEntry.values;
    const tr = document.createElement("tr");
    const cells = [
      idIndex === -1 ? "" : row[idIndex],
      nameIndex === -1 ? "" : row[nameIndex],
      amountIndex === -1 ? "" : formatIndianInteger(parseIndianNumber(row[amountIndex])),
      formatIndianInteger(calculateInterest(row, selectedDate)),
      marginIndex === -1 ? "" : formatIndianNumber(parseIndianNumber(row[marginIndex])),
      depositDateIndex === -1 ? "" : formatDateValue(row[depositDateIndex]),
      articlesIndex === -1 ? "" : row[articlesIndex]
    ];

    cells.forEach((cellValue) => {
      const td = document.createElement("td");
      td.textContent = cellValue || "";
      tr.appendChild(td);
    });

    const actionCell = document.createElement("td");
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "secondary-btn table-action-btn";
    viewButton.textContent = "View";
    viewButton.setAttribute("aria-label", "View loan details");
    viewButton.addEventListener("click", () => {
      openViewModal(rowEntry);
    });
    actionCell.appendChild(viewButton);
    tr.appendChild(actionCell);

    homeTableBody.appendChild(tr);
    homeCardList.appendChild(buildHomeCard(rowEntry, {
      id: cells[0],
      name: cells[1],
      amount: cells[2],
      interest: cells[3],
      margin: cells[4],
      depositDate: cells[5],
      articles: cells[6]
    }));
  });

  setHomeNote(`${entryRows.length} loan record${entryRows.length === 1 ? "" : "s"} shown.`, "is-success");
}

function buildHomeCard(rowEntry, values) {
  const card = document.createElement("article");
  card.className = "home-loan-card";

  const top = document.createElement("div");
  top.className = "home-loan-card-top";

  const titleWrap = document.createElement("div");
  const id = document.createElement("span");
  id.textContent = values.id || "No ID";
  const name = document.createElement("strong");
  name.textContent = values.name || "Unnamed";
  titleWrap.append(id, name);

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "secondary-btn table-action-btn";
  viewButton.textContent = "View";
  viewButton.addEventListener("click", () => {
    openViewModal(rowEntry);
  });

  top.append(titleWrap, viewButton);
  card.appendChild(top);

  [
    ["Amount", values.amount],
    ["Interest", values.interest],
    ["Margin %", values.margin],
    ["Deposit Date", values.depositDate],
    ["Articles", values.articles]
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    item.className = "home-loan-card-row";
    const label = document.createElement("span");
    label.textContent = labelText;
    const value = document.createElement("strong");
    value.textContent = valueText || "";
    item.append(label, value);
    card.appendChild(item);
  });

  return card;
}

function calculateInterest(row, selectedDate) {
  const amountIndex = getHeaderIndex(["Amount", "Principal Amount"]);
  const rateIndex = getHeaderIndex(["Interest Rate", "Interest Rate %"]);
  const depositDateIndex = getHeaderIndex(["Deposit Date", "Loan Start Date", "Date"]);
  const amount = amountIndex === -1 ? 0 : parseIndianNumber(row[amountIndex]);
  const rate = rateIndex === -1 ? 0 : parseIndianNumber(row[rateIndex]);
  const depositDate = depositDateIndex === -1 ? "" : normalizeInputDateValue(row[depositDateIndex]);
  const duration = getInterestDuration(depositDate, selectedDate);
  const monthlyInterest = amount * (rate / 100);
  const interest = (monthlyInterest * duration.months) + ((monthlyInterest / 30) * duration.days);

  return roundToNearestTen(interest);
}

function roundToNearestTen(value) {
  return Math.round(value / 10) * 10;
}

function getInterestDuration(fromDateValue, toDateValue) {
  if (!fromDateValue || !toDateValue) {
    return { months: 0, days: 0 };
  }

  const fromDate = new Date(`${fromDateValue}T00:00:00`);
  const toDate = new Date(`${toDateValue}T00:00:00`);

  if (toDate <= fromDate) {
    return { months: 0, days: 0 };
  }

  let months = (toDate.getFullYear() - fromDate.getFullYear()) * 12;
  months += toDate.getMonth() - fromDate.getMonth();

  if (toDate.getDate() < fromDate.getDate()) {
    months -= 1;
  }

  months = Math.max(months, 0);

  const monthAnchor = new Date(fromDate);
  monthAnchor.setMonth(monthAnchor.getMonth() + months);

  const dayDiff = toDate.getTime() - monthAnchor.getTime();
  const days = Math.max(Math.floor(dayDiff / 86400000), 0);

  return { months, days };
}

function openViewModal(rowEntry) {
  const row = rowEntry.values;
  detailGrid.innerHTML = "";

  const interestItem = document.createElement("article");
  interestItem.className = "detail-item";
  const interestLabel = document.createElement("span");
  interestLabel.textContent = "Interest";
  const interestValue = document.createElement("strong");
  interestValue.textContent = formatIndianInteger(calculateInterest(row, interestDateField.value || getTodayInputValue()));
  interestItem.append(interestLabel, interestValue);
  detailGrid.appendChild(interestItem);

  const durationItem = document.createElement("article");
  durationItem.className = "detail-item";
  const durationLabel = document.createElement("span");
  durationLabel.textContent = "Time";
  const durationValue = document.createElement("strong");
  durationValue.textContent = getDurationLabel(row, interestDateField.value || getTodayInputValue());
  durationItem.append(durationLabel, durationValue);
  detailGrid.appendChild(durationItem);

  entryHeaders.forEach((header, index) => {
    const detailItem = document.createElement("article");
    detailItem.className = "detail-item";

    const label = document.createElement("span");
    label.textContent = header;

    const value = document.createElement("strong");
    value.textContent = formatDetailValue(header, row[index]);

    detailItem.append(label, value);
    detailGrid.appendChild(detailItem);
  });

  viewModalBackdrop.classList.remove("hidden");
}

function getDurationLabel(row, selectedDate) {
  const depositDateIndex = getHeaderIndex(["Deposit Date", "Loan Start Date", "Date"]);
  const depositDate = depositDateIndex === -1 ? "" : normalizeInputDateValue(row[depositDateIndex]);
  const duration = getInterestDuration(depositDate, selectedDate);
  const years = Math.floor(duration.months / 12);
  const months = duration.months % 12;
  const parts = [];

  if (years) {
    parts.push(`${years} year${years === 1 ? "" : "s"}`);
  }

  if (months) {
    parts.push(`${months} month${months === 1 ? "" : "s"}`);
  }

  if (duration.days) {
    parts.push(`${duration.days} day${duration.days === 1 ? "" : "s"}`);
  }

  return parts.length ? parts.join(" ") : "0 days";
}

function closeViewModal() {
  viewModalBackdrop.classList.add("hidden");
}

function formatDetailValue(header, value) {
  const stringValue = String(value ?? "").trim();

  if (["Deposit Date", "Expiry Date", "Timestamp"].includes(header)) {
    return formatDateValue(stringValue);
  }

  if (["Amount", "Value"].includes(header)) {
    return formatIndianInteger(parseIndianNumber(stringValue));
  }

  if (["Interest Rate", "Gold Weight", "Silver Weight", "Gold Purity", "Silver Purity", "Margin %"].includes(header)) {
    return formatIndianNumber(parseIndianNumber(stringValue));
  }

  return stringValue;
}

function getHeaderIndex(names) {
  return names.map((name) => entryHeaders.indexOf(name)).find((index) => index !== -1) ?? -1;
}

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeInputDateValue(value) {
  const stringValue = String(value ?? "").trim();

  if (!stringValue) {
    return "";
  }

  const isoMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return stringValue;
  }

  const displayMatch = stringValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (displayMatch) {
    return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
  }

  const slashMatch = stringValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    return `${slashMatch[3]}-${month}-${day}`;
  }

  return stringValue;
}

function formatDateValue(value) {
  const normalized = normalizeInputDateValue(value);
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }

  return value || "";
}

function parseIndianNumber(value) {
  const cleaned = String(value || "").replaceAll(",", "").trim();
  const numericValue = Number.parseFloat(cleaned);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatIndianInteger(value) {
  return INDIAN_INTEGER_FORMATTER.format(Math.round(value));
}

function formatIndianNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function setHomeNote(message, state = "") {
  homeNote.textContent = message;
  homeNote.classList.remove("is-error", "is-success");

  if (state) {
    homeNote.classList.add(state);
  }
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
