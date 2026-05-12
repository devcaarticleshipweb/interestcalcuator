const SESSION_KEY = "lendingUserSession";
const GOOGLE_SCRIPT_URL = window.APP_CONFIG?.googleScriptUrl || "";

const sidebarUsername = document.getElementById("sidebarUsername");
const logoutButtons = document.querySelectorAll("[data-logout]");
const refreshButton = document.getElementById("refreshButton");
const exportButton = document.getElementById("exportButton");
const nameFilterField = document.getElementById("nameFilterField");
const fromDateFilterField = document.getElementById("fromDateFilterField");
const toDateFilterField = document.getElementById("toDateFilterField");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const dataNote = document.getElementById("dataNote");
const dataTableHead = document.getElementById("dataTableHead");
const dataTableBody = document.getElementById("dataTableBody");
const editModalBackdrop = document.getElementById("editModalBackdrop");
const closeEditModalButton = document.getElementById("closeEditModal");
const editForm = document.getElementById("editForm");
const editRowNumberField = document.getElementById("editRowNumber");
const editNameField = document.getElementById("editNameField");
const editPanField = document.getElementById("editPanField");
const editAmountField = document.getElementById("editAmountField");
const editTaxableAmountField = document.getElementById("editTaxableAmountField");
const editTdsField = document.getElementById("editTdsField");
const editGstField = document.getElementById("editGstField");
const editGoldRateField = document.getElementById("editGoldRateField");
const editSilverRateField = document.getElementById("editSilverRateField");
const editGoldPurityField = document.getElementById("editGoldPurityField");
const editSilverPurityField = document.getElementById("editSilverPurityField");
const editValueField = document.getElementById("editValueField");
const editMarginField = document.getElementById("editMarginField");
const editInvoiceDateField = document.getElementById("editInvoiceDateField");
const editOthersField = document.getElementById("editOthersField");
const editDateField = document.getElementById("editDateField");
const editCategoryField = document.getElementById("editCategoryField");
const editWorkDetailsField = document.getElementById("editWorkDetailsField");
const saveEditButton = document.getElementById("saveEditButton");
const editNote = document.getElementById("editNote");
const editGoldWeightWrapper = editTdsField.closest(".field");
const editSilverWeightWrapper = editGstField.closest(".field");
const editGoldRateWrapper = editGoldRateField.closest(".field");
const editSilverRateWrapper = editSilverRateField.closest(".field");
const editGoldPurityWrapper = editGoldPurityField.closest(".field");
const editSilverPurityWrapper = editSilverPurityField.closest(".field");
const HIDDEN_COLUMNS = new Set(["Timestamp", "Submitted By"]);
const INDIAN_INTEGER_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});
const INDIAN_NUMBER_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const INDIAN_NUMBER_COLUMNS = new Set([
  "Principal Amount",
  "Interest Rate",
  "Interest Rate %",
  "Gold Weight",
  "Silver Weight",
  "Gold Purity",
  "Silver Purity",
  "Value",
  "Margin %",
  "Amount",
  "Taxable Amount",
  "TDS",
  "GST"
]);
const INTEGER_NUMBER_COLUMNS = new Set(["Amount", "Value"]);
const DATE_COLUMNS = new Set(["Deposit Date", "Expiry Date", "Entry Date", "Loan Start Date", "Date", "Invoice Date"]);

let entryHeaders = [];
let entryRows = [];
let entryRowsByRowNumber = new Map();
let filteredEntryRows = [];
let goldRate = 0;
let silverRate = 0;
let goldPurity = 0;
let silverPurity = 0;

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

exportButton.addEventListener("click", () => {
  exportEntriesToExcel();
});

nameFilterField.addEventListener("input", () => {
  applyFilters();
});

fromDateFilterField.addEventListener("change", () => {
  applyFilters();
});

toDateFilterField.addEventListener("change", () => {
  applyFilters();
});

clearFiltersButton.addEventListener("click", () => {
  nameFilterField.value = "";
  fromDateFilterField.value = "";
  toDateFilterField.value = "";
  applyFilters();
});

closeEditModalButton.addEventListener("click", () => {
  closeEditModal();
});

editModalBackdrop.addEventListener("click", (event) => {
  if (event.target === editModalBackdrop) {
    closeEditModal();
  }
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveEditedEntry();
});

[editAmountField, editTaxableAmountField, editTdsField, editGstField, editGoldPurityField, editSilverPurityField].forEach((field) => {
  if (field.tagName === "SELECT") {
    return;
  }

  field.addEventListener("input", () => {
    sanitizeNumericInput(field);
    calculateEditValueAndMargin();
  });

  field.addEventListener("blur", () => {
    applyFormattedValue(field, field === editAmountField);
    calculateEditValueAndMargin();
  });
});

editInvoiceDateField.addEventListener("change", () => {
  updateEditExpiryDateFromDepositDate();
});

editCategoryField.addEventListener("change", () => {
  toggleEditWeightFields();
  calculateEditValueAndMargin();
});

void loadSettings();
void loadEntries();

async function loadEntries() {
  setDataNote("Loading saved loan records...", "");
  refreshButton.disabled = true;
  exportButton.disabled = true;

  try {
    const result = await loadEntriesJsonp();
    if (!result.success || !Array.isArray(result.headers) || !Array.isArray(result.data)) {
      throw new Error(result.message || "Entries are unavailable.");
    }

    entryHeaders = result.headers;
    entryRows = normalizeEntryRows(result.data);
    entryRowsByRowNumber = new Map(entryRows.map((row) => [Number(row.rowNumber), row]));
    applyFilters();
  } catch (error) {
    entryHeaders = [];
    entryRows = [];
    entryRowsByRowNumber = new Map();
    filteredEntryRows = [];
    renderTable();
    setDataNote(error.message || "Could not load saved entries.", "is-error");
  } finally {
    refreshButton.disabled = false;
    exportButton.disabled = filteredEntryRows.length === 0;
  }
}

function loadEntriesJsonp() {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_SCRIPT_URL) {
      reject(new Error("Add your Google Apps Script web app URL in config.js before loading loan records."));
      return;
    }

    const callbackName = `entriesCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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

async function loadSettings() {
  if (!GOOGLE_SCRIPT_URL) {
    populateSelect(editTaxableAmountField, []);
    populateSelect(editCategoryField, []);
    return;
  }

  try {
    const result = await loadSettingsJsonp();
    if (!result.success) {
      throw new Error(result.message || "Settings are unavailable.");
    }

    populateSelect(editTaxableAmountField, result.interestRates || []);
    populateSelect(editCategoryField, result.itemMaterials || []);
    goldRate = parseIndianNumber(result.goldRate);
    silverRate = parseIndianNumber(result.silverRate);
    goldPurity = parseIndianNumber(result.goldPurity);
    silverPurity = parseIndianNumber(result.silverPurity);
    toggleEditWeightFields();
  } catch {
    populateSelect(editTaxableAmountField, []);
    populateSelect(editCategoryField, []);
  }
}

function loadSettingsJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = `dataSettingsCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const script = document.createElement("script");
    const url = new URL(GOOGLE_SCRIPT_URL);

    url.searchParams.set("action", "settings");
    url.searchParams.set("callback", callbackName);

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Settings request timed out."));
    }, 10000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Could not reach settings service."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function populateSelect(select, values) {
  const safeValues = Array.isArray(values) ? values.filter(Boolean) : [];
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = safeValues.length ? "Select" : "No settings found";
  select.appendChild(placeholder);

  safeValues.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function setSelectValue(select, value) {
  const stringValue = String(value || "").trim();
  const exists = Array.from(select.options).some((option) => option.value === stringValue);

  if (stringValue && !exists) {
    const option = document.createElement("option");
    option.value = stringValue;
    option.textContent = stringValue;
    select.appendChild(option);
  }

  select.value = stringValue;
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

function applyFilters() {
  const nameSearch = String(nameFilterField.value || "").trim().toLowerCase();
  const fromDate = fromDateFilterField.value;
  const toDate = toDateFilterField.value;
  const nameIndex = getHeaderIndex(["Name", "Borrower Name"]);
  const dateIndex = getHeaderIndex(["Deposit Date", "Entry Date", "Date"]);

  filteredEntryRows = entryRows.filter((rowEntry) => {
    const rowValues = rowEntry.values || [];
    const nameMatches = nameIndex === -1
      ? true
      : String(rowValues[nameIndex] || "").trim().toLowerCase().includes(nameSearch);

    if (!nameMatches) {
      return false;
    }

    if (dateIndex === -1 || (!fromDate && !toDate)) {
      return true;
    }

    const normalizedDate = normalizeComparableDate(rowValues[dateIndex]);
    if (!normalizedDate) {
      return false;
    }

    if (fromDate && normalizedDate < fromDate) {
      return false;
    }

    if (toDate && normalizedDate > toDate) {
      return false;
    }

    return true;
  });

  renderTable();
  updateDataNote();
  exportButton.disabled = filteredEntryRows.length === 0;
}

function updateDataNote() {
  if (!entryRows.length) {
    setDataNote("No loan records found yet.", "");
    return;
  }

  if (!filteredEntryRows.length) {
    setDataNote("No loan records match the current filters.", "");
    return;
  }

  if (!hasActiveFilters()) {
    setDataNote(`${filteredEntryRows.length} loan record${filteredEntryRows.length === 1 ? "" : "s"} loaded.`, "is-success");
    return;
  }

  setDataNote(`${filteredEntryRows.length} of ${entryRows.length} loan record${entryRows.length === 1 ? "" : "s"} shown.`, "is-success");
}

function hasActiveFilters() {
  return Boolean(
    String(nameFilterField.value || "").trim() ||
    fromDateFilterField.value ||
    toDateFilterField.value
  );
}

function getHeaderIndex(names) {
  return names.map((name) => entryHeaders.indexOf(name)).find((index) => index !== -1) ?? -1;
}

function renderTable() {
  dataTableHead.innerHTML = "";
  dataTableBody.innerHTML = "";

  if (!entryHeaders.length) {
    return;
  }

  const visibleColumns = getVisibleColumns();
  const canEditLoan = hasPermission("canEditLoan");

  const headerRow = document.createElement("tr");
  visibleColumns.forEach(({ header }) => {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.appendChild(th);
  });
  if (canEditLoan) {
    const actionHeader = document.createElement("th");
    actionHeader.textContent = "Actions";
    headerRow.appendChild(actionHeader);
  }
  dataTableHead.appendChild(headerRow);

  if (!filteredEntryRows.length) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = visibleColumns.length + (canEditLoan ? 1 : 0);
    emptyCell.textContent = "No loan records to display.";
    emptyCell.className = "empty-cell";
    emptyRow.appendChild(emptyCell);
    dataTableBody.appendChild(emptyRow);
    return;
  }

  filteredEntryRows.forEach((rowEntry) => {
    const tr = document.createElement("tr");
    visibleColumns.forEach(({ header, index }) => {
      const td = document.createElement("td");
      td.textContent = formatCellValue(header, rowEntry.values[index]);
      tr.appendChild(td);
    });

    if (canEditLoan) {
      const actionCell = document.createElement("td");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "secondary-btn table-action-btn";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        openEditModal(rowEntry.rowNumber);
      });
      actionCell.appendChild(editButton);
      tr.appendChild(actionCell);
    }

    dataTableBody.appendChild(tr);
  });
}

function openEditModal(rowNumber) {
  const rowEntry = entryRowsByRowNumber.get(Number(rowNumber));
  if (!rowEntry) {
    setDataNote("That entry could not be found for editing.", "is-error");
    return;
  }

  const row = rowEntry.values;
  editRowNumberField.value = String(rowEntry.rowNumber);
  editPanField.value = row[2] || "";
  editNameField.value = row[3] || "";
  editAmountField.value = formatNumericInputValue(row[4], true);
  editInvoiceDateField.value = normalizeInputDateValue(row[5]);
  editDateField.value = normalizeInputDateValue(row[6]);
  setSelectValue(editTaxableAmountField, formatNumericInputValue(row[7]));
  setSelectValue(editCategoryField, row[8] || "");
  editTdsField.value = formatNumericInputValue(row[9]);
  editGstField.value = formatNumericInputValue(row[10]);
  editGoldRateField.value = goldRate ? formatIndianInteger(goldRate) : "";
  editSilverRateField.value = silverRate ? formatIndianInteger(silverRate) : "";
  editGoldPurityField.value = formatNumericInputValue(row[11]) || (goldPurity ? formatIndianNumber(goldPurity) : "");
  editSilverPurityField.value = formatNumericInputValue(row[12]) || (silverPurity ? formatIndianNumber(silverPurity) : "");
  editValueField.value = formatNumericInputValue(row[13], true);
  editMarginField.value = formatNumericInputValue(row[14]);
  editWorkDetailsField.value = row[15] || "";
  editOthersField.value = row[16] || "";
  toggleEditWeightFields();
  calculateEditValueAndMargin();
  setEditNote("Update the fields and save the changes.", "");
  editModalBackdrop.classList.remove("hidden");

  window.setTimeout(() => {
    editNameField.focus();
    editNameField.select();
  }, 0);
}

function closeEditModal() {
  editModalBackdrop.classList.add("hidden");
  editForm.reset();
  toggleEditWeightFields();
  calculateEditValueAndMargin();
  setEditNote("Update the fields and save the changes.", "");
}

function updateEditExpiryDateFromDepositDate() {
  if (!editInvoiceDateField.value) {
    editDateField.value = "";
    return;
  }

  editDateField.value = addOneYear(editInvoiceDateField.value);
}

function addOneYear(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setFullYear(date.getFullYear() + 1);
  return formatDateInput(date);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toggleEditWeightFields() {
  const material = normalizeMaterial(editCategoryField.value);
  const showGold = material.includes("gold");
  const showSilver = material.includes("silver");

  setFieldVisibility(editGoldWeightWrapper, editTdsField, showGold);
  setFieldVisibility(editSilverWeightWrapper, editGstField, showSilver);
  setFieldVisibility(editGoldRateWrapper, editGoldRateField, showGold);
  setFieldVisibility(editSilverRateWrapper, editSilverRateField, showSilver);
  setFieldVisibility(editGoldPurityWrapper, editGoldPurityField, showGold);
  setFieldVisibility(editSilverPurityWrapper, editSilverPurityField, showSilver);
  calculateEditValueAndMargin();
}

function setFieldVisibility(wrapper, field, isVisible) {
  wrapper.classList.toggle("hidden", !isVisible);
  field.required = isVisible && !field.disabled;

  if (!isVisible && !field.disabled) {
    field.value = "";
  }
}

function normalizeMaterial(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function calculateEditValueAndMargin() {
  const material = normalizeMaterial(editCategoryField.value);
  const effectiveGoldRate = goldRate || parseIndianNumber(editGoldRateField.value);
  const effectiveSilverRate = silverRate || parseIndianNumber(editSilverRateField.value);
  const effectiveGoldPurity = parseIndianNumber(editGoldPurityField.value) || goldPurity;
  const effectiveSilverPurity = parseIndianNumber(editSilverPurityField.value) || silverPurity;
  const goldWeight = material.includes("gold") ? parseIndianNumber(editTdsField.value) : 0;
  const silverWeight = material.includes("silver") ? parseIndianNumber(editGstField.value) : 0;
  const amount = parseIndianNumber(editAmountField.value);
  const goldValue = (goldWeight / 10) * effectiveGoldRate * (effectiveGoldPurity / 100);
  const silverValue = (silverWeight / 1000) * effectiveSilverRate * (effectiveSilverPurity / 100);
  const totalValue = goldValue + silverValue;
  const marginAmount = totalValue - amount;
  const margin = totalValue ? (marginAmount / totalValue) * 100 : 0;

  editGoldRateField.value = effectiveGoldRate ? formatIndianInteger(effectiveGoldRate) : "";
  editSilverRateField.value = effectiveSilverRate ? formatIndianInteger(effectiveSilverRate) : "";
  if (!editGoldPurityField.value) {
    editGoldPurityField.value = effectiveGoldPurity ? formatIndianNumber(effectiveGoldPurity) : "";
  }
  if (!editSilverPurityField.value) {
    editSilverPurityField.value = effectiveSilverPurity ? formatIndianNumber(effectiveSilverPurity) : "";
  }
  editValueField.value = totalValue ? formatIndianInteger(totalValue) : "";
  editMarginField.value = totalValue || amount ? formatIndianNumber(margin) : "";
}

async function saveEditedEntry() {
  if (!GOOGLE_SCRIPT_URL) {
    setEditNote("Add your Google Apps Script web app URL in config.js before saving loan records.", "is-error");
    return;
  }

  const payload = {
    action: "updateEntry",
    rowNumber: editRowNumberField.value,
    submittedBy: session.loginId || getUsername(session.username || session.email || ""),
    id: editPanField.value.trim(),
    name: editNameField.value.trim(),
    amount: editAmountField.value.trim(),
    depositDate: editInvoiceDateField.value,
    expiryDate: editDateField.value,
    interestRate: editTaxableAmountField.value.trim(),
    itemMaterial: editCategoryField.value,
    goldWeight: editTdsField.value.trim(),
    silverWeight: editGstField.value.trim(),
    goldPurity: editGoldPurityField.value.trim(),
    silverPurity: editSilverPurityField.value.trim(),
    value: editValueField.value.trim(),
    margin: editMarginField.value.trim(),
    articles: editWorkDetailsField.value.trim(),
    notes: editOthersField.value.trim()
  };

  saveEditButton.disabled = true;
  saveEditButton.textContent = "Saving...";
  setEditNote("Saving changes to Google Sheets...", "");

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Unable to reach the update service.");
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || "Entry could not be updated.");
    }

    closeEditModal();
    setDataNote("Loan record updated successfully.", "is-success");
    await loadEntries();
  } catch (error) {
    setEditNote(error.message || "Entry could not be updated.", "is-error");
  } finally {
    saveEditButton.disabled = false;
    saveEditButton.textContent = "Save Changes";
  }
}

function sanitizeNumericInput(field) {
  const cleaned = String(field.value || "").replace(/[^0-9.]/g, "");
  const firstDotIndex = cleaned.indexOf(".");

  if (firstDotIndex === -1) {
    field.value = cleaned;
    return;
  }

  const integerPart = cleaned.slice(0, firstDotIndex + 1);
  const decimalPart = cleaned.slice(firstDotIndex + 1).replaceAll(".", "");
  field.value = `${integerPart}${decimalPart}`;
}

function applyFormattedValue(field, useIntegerFormat = false) {
  const numericValue = parseIndianNumber(field.value);

  if (!String(field.value || "").trim()) {
    field.value = "";
    return;
  }

  field.value = useIntegerFormat ? formatIndianInteger(numericValue) : formatIndianNumber(numericValue);
}

function exportEntriesToExcel() {
  if (!entryHeaders.length || !filteredEntryRows.length) {
    setDataNote("There are no loan records to export yet.", "is-error");
    return;
  }

  const blob = buildXlsxBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateSuffix = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `loan-records-${dateSuffix}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setDataNote("Exported current loan records to .xlsx.", "is-success");
}

function buildXlsxBlob() {
  const visibleColumns = getVisibleColumns();
  const rows = [
    visibleColumns.map(({ header }) => ({ value: header, type: "text" })),
    ...filteredEntryRows.map((rowEntry) =>
      visibleColumns.map(({ header, index }) => buildExcelCell(header, rowEntry.values[index]))
    )
  ];

  const files = [
    {
      name: "[Content_Types].xml",
      data: xml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
          <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
          <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
          <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
          <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
        </Types>
      `)
    },
    {
      name: "_rels/.rels",
      data: xml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
          <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
        </Relationships>
      `)
    },
    {
      name: "docProps/core.xml",
      data: xml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
          xmlns:dc="http://purl.org/dc/elements/1.1/"
          xmlns:dcterms="http://purl.org/dc/terms/"
          xmlns:dcmitype="http://purl.org/dc/dcmitype/"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <dc:creator>Codex</dc:creator>
          <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
          <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
          <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
        </cp:coreProperties>
      `)
    },
    {
      name: "docProps/app.xml",
      data: xml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
          xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
          <Application>Microsoft Excel</Application>
        </Properties>
      `)
    },
    {
      name: "xl/workbook.xml",
      data: xml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets>
            <sheet name="Loan Records" sheetId="1" r:id="rId1"/>
          </sheets>
        </workbook>
      `)
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: xml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
        </Relationships>
      `)
    },
    {
      name: "xl/styles.xml",
      data: xml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <numFmts count="1">
            <numFmt numFmtId="164" formatCode="#,##,##0"/>
          </numFmts>
          <fonts count="1">
            <font>
              <sz val="11"/>
              <name val="Calibri"/>
            </font>
          </fonts>
          <fills count="2">
            <fill><patternFill patternType="none"/></fill>
            <fill><patternFill patternType="gray125"/></fill>
          </fills>
          <borders count="1">
            <border><left/><right/><top/><bottom/><diagonal/></border>
          </borders>
          <cellStyleXfs count="1">
            <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
          </cellStyleXfs>
          <cellXfs count="2">
            <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
            <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
          </cellXfs>
          <cellStyles count="1">
            <cellStyle name="Normal" xfId="0" builtinId="0"/>
          </cellStyles>
        </styleSheet>
      `)
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: buildWorksheetXml(rows)
    }
  ];

  return new Blob([createZip(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function setDataNote(message, state = "") {
  dataNote.textContent = message;
  dataNote.classList.remove("is-error", "is-success");

  if (state) {
    dataNote.classList.add(state);
  }
}

function setEditNote(message, state = "") {
  editNote.textContent = message;
  editNote.classList.remove("is-error", "is-success");

  if (state) {
    editNote.classList.add(state);
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

function getVisibleColumns() {
  return entryHeaders
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => !HIDDEN_COLUMNS.has(header));
}

function buildExcelCell(header, value) {
  const stringValue = String(value ?? "").trim();

  if (DATE_COLUMNS.has(header)) {
    return { value: formatDateValue(stringValue), type: "text" };
  }

  if (!INDIAN_NUMBER_COLUMNS.has(header)) {
    return { value: stringValue, type: "text" };
  }

  const normalized = Number(stringValue.replaceAll(",", ""));
  if (!Number.isFinite(normalized)) {
    return { value: stringValue, type: "text" };
  }

  return {
    value: INTEGER_NUMBER_COLUMNS.has(header) ? Math.round(normalized) : normalized,
    type: "number"
  };
}

function formatNumericInputValue(value, useIntegerFormat = false) {
  const stringValue = String(value ?? "").trim();

  if (!stringValue) {
    return "";
  }

  const normalized = Number(stringValue.replaceAll(",", ""));
  if (!Number.isFinite(normalized)) {
    return stringValue;
  }

  return useIntegerFormat ? formatIndianInteger(normalized) : formatIndianNumber(normalized);
}

function formatCellValue(header, value) {
  const stringValue = String(value ?? "").trim();

  if (DATE_COLUMNS.has(header)) {
    return formatDateValue(stringValue);
  }

  if (!INDIAN_NUMBER_COLUMNS.has(header)) {
    return stringValue;
  }

  const normalized = Number(stringValue.replaceAll(",", ""));
  if (!Number.isFinite(normalized)) {
    return stringValue;
  }

  return INTEGER_NUMBER_COLUMNS.has(header)
    ? formatIndianInteger(normalized)
    : formatIndianNumber(normalized);
}

function formatDateValue(value) {
  if (!value) {
    return "";
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    return `${day}-${month}-${slashMatch[3]}`;
  }

  return value;
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

function normalizeComparableDate(value) {
  const normalizedInputDate = normalizeInputDateValue(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedInputDate)) {
    return normalizedInputDate;
  }

  return "";
}

function parseIndianNumber(value) {
  const cleaned = String(value || "").replaceAll(",", "").trim();
  const numericValue = Number.parseFloat(cleaned);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatIndianNumber(value) {
  return INDIAN_NUMBER_FORMATTER.format(value);
}

function formatIndianInteger(value) {
  return INDIAN_INTEGER_FORMATTER.format(Math.round(value));
}

function buildWorksheetXml(rows) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, cellIndex) => {
      const reference = `${columnName(cellIndex + 1)}${rowIndex + 1}`;

      if (value.type === "number") {
        return `<c r="${reference}" s="1"><v>${value.value}</v></c>`;
      }

      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value.value)}</t></is></c>`;
    }).join("");

    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  return xml(`
    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>
        ${sheetRows}
      </sheetData>
    </worksheet>
  `);
}

function columnName(index) {
  let value = index;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xml(content) {
  return new TextEncoder().encode(content.trim());
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const fileNameBytes = new TextEncoder().encode(file.name);
    const fileData = file.data;
    const crc = crc32(fileData);
    const localHeader = new Uint8Array(30 + fileNameBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, fileData.length, true);
    localView.setUint32(22, fileData.length, true);
    localView.setUint16(26, fileNameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(fileNameBytes, 30);

    localParts.push(localHeader, fileData);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, fileData.length, true);
    centralView.setUint32(24, fileData.length, true);
    centralView.setUint16(28, fileNameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(fileNameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + fileData.length;
  });

  const centralDirectory = concatUint8Arrays(centralParts);
  const localDirectory = concatUint8Arrays(localParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localDirectory.length, true);
  endView.setUint16(20, 0, true);

  return concatUint8Arrays([localDirectory, centralDirectory, endRecord]);
}

function concatUint8Arrays(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function crc32(data) {
  let crc = 0 ^ -1;

  for (let index = 0; index < data.length; index += 1) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[index]) & 0xff];
  }

  return (crc ^ -1) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((value & 1) === 1) {
        value = 0xedb88320 ^ (value >>> 1);
      } else {
        value >>>= 1;
      }
    }
    table[index] = value >>> 0;
  }

  return table;
})();

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

function hasPermission(permission) {
  const permissions = session?.permissions || {};
  if (!(permission in permissions)) {
    return true;
  }

  return Boolean(permissions[permission]);
}

function getUsername(value) {
  const rawValue = String(value || "").trim();
  return rawValue.includes("@") ? rawValue.split("@")[0] : rawValue;
}
