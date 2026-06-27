const SESSION_KEY = "lendingUserSession";

const sidebarUsername = document.getElementById("sidebarUsername");
const logoutButtons = document.querySelectorAll("[data-logout]");
const entryForm = document.getElementById("entryForm");
const entryNote = document.getElementById("entryNote");
const idField = document.getElementById("panField");
const nameField = document.getElementById("nameField");
const amountField = document.getElementById("amountField");
const depositDateField = document.getElementById("invoiceDateField");
const expiryDateField = document.getElementById("dateField");
const interestRateField = document.getElementById("taxableAmountField");
const itemMaterialField = document.getElementById("categoryField");
const goldWeightField = document.getElementById("tdsField");
const silverWeightField = document.getElementById("gstField");
const goldRateField = document.getElementById("goldRateField");
const silverRateField = document.getElementById("silverRateField");
const goldPurityField = document.getElementById("goldPurityField");
const silverPurityField = document.getElementById("silverPurityField");
const valueField = document.getElementById("valueField");
const marginField = document.getElementById("marginField");
const articlesField = document.getElementById("workDetailsField");
const notesField = document.getElementById("othersField");
const goldWeightWrapper = goldWeightField.closest(".field");
const silverWeightWrapper = silverWeightField.closest(".field");
const goldRateWrapper = goldRateField.closest(".field");
const silverRateWrapper = silverRateField.closest(".field");
const goldPurityWrapper = goldPurityField.closest(".field");
const silverPurityWrapper = silverPurityField.closest(".field");

const GOOGLE_SCRIPT_URL = window.APP_CONFIG?.googleScriptUrl || "";
const INDIAN_NUMBER_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const INDIAN_INTEGER_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});
let goldRate = 0;
let silverRate = 0;
let goldPurity = 0;
let silverPurity = 0;
let activeItemNames = [];

const enterNavigationFields = [
  idField,
  nameField,
  amountField,
  depositDateField,
  expiryDateField,
  interestRateField,
  itemMaterialField,
  goldWeightField,
  silverWeightField,
  valueField,
  marginField,
  articlesField,
  notesField
];

const session = getSession();

if (!session) {
  window.location.href = "index.html";
}

if (session) {
  sidebarUsername.textContent = session.fullName || getUsername(session.username || session.email || "User");
}

void loadActiveItemNames();
void loadSettings();
toggleWeightFields();

entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveEntry();
});

logoutButtons.forEach((button) => {
  button.addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "index.html";
  });
});

[amountField, interestRateField, goldWeightField, silverWeightField, goldPurityField, silverPurityField].forEach((field) => {
  if (field.tagName === "SELECT") {
    return;
  }

  field.addEventListener("input", () => {
    sanitizeNumericInput(field);
    calculateValueAndMargin();
  });

  field.addEventListener("blur", () => {
    applyFormattedValue(field, field === amountField);
    calculateValueAndMargin();
  });
});

depositDateField.addEventListener("change", () => {
  updateExpiryDateFromDepositDate();
});

itemMaterialField.addEventListener("change", () => {
  toggleWeightFields();
  calculateValueAndMargin();
});

enterNavigationFields.forEach((field, index) => {
  field.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    if ((field === articlesField || field === notesField) && !event.shiftKey) {
      return;
    }

    event.preventDefault();
    focusNextField(index);
  });
});

async function saveEntry() {
  const submitButton = entryForm.querySelector(".submit-btn");

  if (!GOOGLE_SCRIPT_URL) {
    setEntryNote("Add your Google Apps Script web app URL in config.js before saving loans.", "is-error");
    return;
  }

  const payload = {
    action: "saveEntry",
    submittedBy: session.loginId || getUsername(session.username || session.email || ""),
    id: idField.value.trim(),
    name: nameField.value.trim(),
    amount: amountField.value.trim(),
    depositDate: depositDateField.value,
    expiryDate: expiryDateField.value,
    interestRate: interestRateField.value.trim(),
    itemMaterial: itemMaterialField.value,
    goldWeight: goldWeightField.value.trim(),
    silverWeight: silverWeightField.value.trim(),
    goldPurity: goldPurityField.value.trim(),
    silverPurity: silverPurityField.value.trim(),
    value: valueField.value.trim(),
    margin: marginField.value.trim(),
    articles: articlesField.value.trim(),
    notes: notesField.value.trim()
  };

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  setEntryNote("Saving this loan record to Google Sheets...", "");

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Unable to reach the save service.");
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || "Loan could not be saved.");
    }

    entryForm.reset();
    toggleWeightFields();
    calculateValueAndMargin();
    setEntryNote("Loan saved successfully. You can now add another record.", "is-success");
    focusAndSelectField(nameField);
  } catch (error) {
    setEntryNote(error.message || "Loan could not be saved.", "is-error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save Loan";
  }
}


async function loadActiveItemNames() {
  if (!GOOGLE_SCRIPT_URL) {
    populateNameSelect([]);
    return;
  }

  try {
    const result = await loadEntriesJsonp();
    if (!result.success || !Array.isArray(result.headers) || !Array.isArray(result.data)) {
      throw new Error(result.message || "Active Items are unavailable.");
    }

    const nameIndex = result.headers.indexOf("Name");
    if (nameIndex === -1) {
      throw new Error('The "Active Items" sheet must include a "Name" column.');
    }

    activeItemNames = uniqueNames(result.data.map((rowEntry) => {
      const row = rowEntry && Array.isArray(rowEntry.values) ? rowEntry.values : rowEntry;
      return Array.isArray(row) ? row[nameIndex] : "";
    }));
    populateNameSelect(activeItemNames);
  } catch (error) {
    activeItemNames = [];
    populateNameSelect([]);
    setEntryNote(error.message || "Could not load active names.", "is-error");
  }
}

function loadEntriesJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = `entryNamesCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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
      reject(new Error("Active Items request timed out."));
    }, 10000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Could not reach the Active Items service."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function populateNameSelect(names) {
  nameField.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = names.length ? "Select name" : "No active names found";
  nameField.appendChild(placeholder);

  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    nameField.appendChild(option);
  });
}

function uniqueNames(values) {
  const seen = {};
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen[key]) {
        return false;
      }

      seen[key] = true;
      return true;
    })
    .sort((left, right) => left.localeCompare(right));
}

async function loadSettings() {
  if (!GOOGLE_SCRIPT_URL) {
    populateSelect(interestRateField, []);
    populateSelect(itemMaterialField, []);
    return;
  }

  try {
    const result = await loadSettingsJsonp();
    if (!result.success) {
      throw new Error(result.message || "Settings are unavailable.");
    }

    populateSelect(interestRateField, result.interestRates || []);
    populateSelect(itemMaterialField, result.itemMaterials || []);
    goldRate = parseIndianNumber(result.goldRate);
    silverRate = parseIndianNumber(result.silverRate);
    goldPurity = parseIndianNumber(result.goldPurity);
    silverPurity = parseIndianNumber(result.silverPurity);
    goldRateField.value = goldRate ? formatIndianInteger(goldRate) : "";
    silverRateField.value = silverRate ? formatIndianInteger(silverRate) : "";
    goldPurityField.value = goldPurity ? formatIndianNumber(goldPurity) : "";
    silverPurityField.value = silverPurity ? formatIndianNumber(silverPurity) : "";
    toggleWeightFields();
    calculateValueAndMargin();
  } catch (error) {
    populateSelect(interestRateField, []);
    populateSelect(itemMaterialField, []);
    setEntryNote(error.message || "Could not load dropdown settings.", "is-error");
  }
}

function loadSettingsJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = `settingsCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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
      reject(new Error("Settings request timed out. Redeploy the Apps Script and try again."));
    }, 10000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Could not reach the Settings sheet service."));
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

function updateExpiryDateFromDepositDate() {
  if (!depositDateField.value) {
    expiryDateField.value = "";
    return;
  }

  expiryDateField.value = addOneYear(depositDateField.value);
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

function toggleWeightFields() {
  const material = normalizeMaterial(itemMaterialField.value);
  const showGold = material.includes("gold");
  const showSilver = material.includes("silver");

  setFieldVisibility(goldWeightWrapper, goldWeightField, showGold);
  setFieldVisibility(silverWeightWrapper, silverWeightField, showSilver);
  setFieldVisibility(goldRateWrapper, goldRateField, showGold);
  setFieldVisibility(silverRateWrapper, silverRateField, showSilver);
  setFieldVisibility(goldPurityWrapper, goldPurityField, showGold);
  setFieldVisibility(silverPurityWrapper, silverPurityField, showSilver);
  calculateValueAndMargin();
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

function calculateValueAndMargin() {
  const material = normalizeMaterial(itemMaterialField.value);
  const goldWeight = material.includes("gold") ? parseIndianNumber(goldWeightField.value) : 0;
  const silverWeight = material.includes("silver") ? parseIndianNumber(silverWeightField.value) : 0;
  const amount = parseIndianNumber(amountField.value);
  const effectiveGoldPurity = parseIndianNumber(goldPurityField.value) || goldPurity;
  const effectiveSilverPurity = parseIndianNumber(silverPurityField.value) || silverPurity;
  const goldValue = (goldWeight / 10) * goldRate * (effectiveGoldPurity / 100);
  const silverValue = (silverWeight / 1000) * silverRate * (effectiveSilverPurity / 100);
  const totalValue = goldValue + silverValue;
  const marginAmount = totalValue - amount;
  const margin = totalValue ? (marginAmount / totalValue) * 100 : 0;

  goldRateField.value = goldRate ? formatIndianInteger(goldRate) : "";
  silverRateField.value = silverRate ? formatIndianInteger(silverRate) : "";
  if (!goldPurityField.value) {
    goldPurityField.value = goldPurity ? formatIndianNumber(goldPurity) : "";
  }
  if (!silverPurityField.value) {
    silverPurityField.value = silverPurity ? formatIndianNumber(silverPurity) : "";
  }
  valueField.value = totalValue ? formatIndianInteger(totalValue) : "";
  marginField.value = totalValue || amount ? formatIndianNumber(margin) : "";
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
  if (!String(field.value || "").trim()) {
    field.value = "";
    return;
  }

  field.value = useIntegerFormat
    ? formatIndianInteger(parseIndianNumber(field.value))
    : formatIndianNumber(parseIndianNumber(field.value));
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

function focusNextField(currentIndex) {
  const nextField = enterNavigationFields[currentIndex + 1];

  if (nextField) {
    focusAndSelectField(nextField);
  }
}

function focusAndSelectField(field) {
  field.focus();

  if (typeof field.select === "function") {
    field.select();
  }
}

function setEntryNote(message, state = "") {
  entryNote.textContent = message;
  entryNote.classList.remove("is-error", "is-success");

  if (state) {
    entryNote.classList.add(state);
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
