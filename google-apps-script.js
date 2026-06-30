const USERS_SHEET_NAME = "Users";
const MASTER_DATA_SHEET_NAME = "Master Data";
const ENTRIES_SHEET_NAME = "Active Items";
const MATURED_ITEMS_SHEET_NAME = "Matured Items";
const SETTINGS_SHEET_NAME = "Settings";
const GOOGLE_SHEET_ID = "";
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ENTRY_HEADERS = [
  "Timestamp",
  "Submitted By",
  "ID",
  "Name",
  "Amount",
  "Deposit Date",
  "Expiry Date",
  "Interest Rate",
  "Item Material",
  "Gold Weight",
  "Silver Weight",
  "Gold Purity",
  "Silver Purity",
  "Value",
  "Margin %",
  "Articles",
  "Notes"
];
const MATURED_ITEM_HEADERS = ENTRY_HEADERS.concat([
  "Maturity Date",
  "Matured By",
  "Maturity Interest"
]);

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "").trim().toLowerCase();
  const callback = String((e && e.parameter && e.parameter.callback) || "").trim();

  if (action === "masterdata") {
    return getMasterDataResponse(callback);
  }

   if (action === "entries") {
    return getEntriesResponse(callback);
  }

  if (action === "settings") {
    return getSettingsResponse(callback);
  }

  if (action === "permissions") {
    return getPermissionsResponse(e.parameter || {}, callback);
  }

  return jsonResponse({
    success: false,
    message: "Unsupported GET action."
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const action = String(payload.action || "").trim().toLowerCase();

    if (action === "saveentry") {
      return saveEntry(payload);
    }

    if (action === "updateentry") {
      return updateEntry(payload);
    }

    if (action === "matureentry") {
      return matureEntry(payload);
    }

    if (action === "addmasterdata") {
      return addMasterData(payload);
    }

    if (action === "changepassword") {
      return changePassword(payload);
    }

    const usernameInput = String(payload.username || payload.email || "").trim();
    const normalizedUsernameInput = usernameInput.toLowerCase();
    const password = String(payload.password || "").trim();

    if (!usernameInput || !password) {
      return jsonResponse({
        success: false,
        message: "Username and password are required."
      });
    }

    const sheet = getSpreadsheet().getSheetByName(USERS_SHEET_NAME);
    if (!sheet) {
      return jsonResponse({
        success: false,
        message: 'Sheet "Users" was not found.'
      });
    }

    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) {
      return jsonResponse({
        success: false,
        message: "No users are configured yet."
      });
    }

    const headers = rows[0].map((value) => String(value).trim().toLowerCase());
    const usernameIndex = headers.indexOf("username");
    const passwordIndex = headers.indexOf("password");

    if (usernameIndex === -1) {
      return jsonResponse({
        success: false,
        message: 'The "Users" sheet must include a "username" column.'
      });
    }

    if (passwordIndex === -1) {
      return jsonResponse({
        success: false,
        message: 'The "Users" sheet must include a "password" column.'
      });
    }

    const statusIndex = headers.indexOf("status");
    const fullNameIndex = headers.indexOf("full name");
    const allowedNameIndex = headers.indexOf("name");
    const matchedUser = rows.slice(1).find((row) => {
      const rowUsername = String(row[usernameIndex] || "").trim().toLowerCase();
      const rowPassword = String(row[passwordIndex] || "").trim();

      return rowUsername === normalizedUsernameInput && rowPassword === password;
    });

    if (!matchedUser) {
      return jsonResponse({
        success: false,
        message: "Invalid username or password."
      });
    }

    const rowStatus = statusIndex === -1 ? "active" : String(matchedUser[statusIndex] || "").trim().toLowerCase();
    if (rowStatus === "inactive") {
      return jsonResponse({
        success: false,
        message: "User Blocked. Please Contact Admin."
      });
    }

    const username = String(matchedUser[usernameIndex] || "").trim();
    const fullName = fullNameIndex === -1 ? "" : String(matchedUser[fullNameIndex] || "").trim();
    const allowedNames = parseAllowedNames(allowedNameIndex === -1 ? "" : matchedUser[allowedNameIndex]);
    const permissions = buildPermissions(headers, matchedUser);

    return jsonResponse({
      success: true,
      message: "Login successful.",
      username: username || usernameInput,
      fullName: fullName || username || usernameInput,
      loginId: username || usernameInput,
      allowedNames: allowedNames,
      permissions: permissions
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      message: error.message || "Unexpected error while validating login."
    });
  }
}

function changePassword(payload) {
  const usernameInput = String(payload.username || payload.email || "").trim();
  const normalizedUsernameInput = usernameInput.toLowerCase();
  const oldPassword = String(payload.oldPassword || "").trim();
  const newPassword = String(payload.newPassword || "").trim();

  if (!usernameInput || !oldPassword || !newPassword) {
    return jsonResponse({
      success: false,
      message: "Username, old password, and new password are required."
    });
  }

  if (oldPassword === newPassword) {
    return jsonResponse({
      success: false,
      message: "New password must be different from old password."
    });
  }

  const sheet = getSpreadsheet().getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    return jsonResponse({
      success: false,
      message: 'Sheet "Users" was not found.'
    });
  }

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) {
    return jsonResponse({
      success: false,
      message: "No users are configured yet."
    });
  }

  const headers = rows[0].map((value) => String(value).trim().toLowerCase());
  const usernameIndex = headers.indexOf("username");
  const passwordIndex = headers.indexOf("password");

  if (usernameIndex === -1) {
    return jsonResponse({
      success: false,
      message: 'The "Users" sheet must include a "username" column.'
    });
  }

  if (passwordIndex === -1) {
    return jsonResponse({
      success: false,
      message: 'The "Users" sheet must include a "password" column.'
    });
  }

  const userRowIndex = rows.slice(1).findIndex((row) => {
    const rowUsername = String(row[usernameIndex] || "").trim().toLowerCase();
    return rowUsername === normalizedUsernameInput;
  });

  if (userRowIndex === -1) {
    return jsonResponse({
      success: false,
      message: "User was not found."
    });
  }

  const matchedRow = rows[userRowIndex + 1];
  const currentPassword = String(matchedRow[passwordIndex] || "").trim();

  if (currentPassword !== oldPassword) {
    return jsonResponse({
      success: false,
      message: "Old password is incorrect."
    });
  }

  sheet.getRange(userRowIndex + 2, passwordIndex + 1).setValue(newPassword);

  return jsonResponse({
    success: true,
    message: "Password changed successfully."
  });
}

function parseAllowedNames(value) {
  const rawValue = String(value || "").trim();
  if (rawValue.toLowerCase() === "all") {
    return {
      all: true,
      names: []
    };
  }

  if (!rawValue) {
    return {
      all: false,
      names: []
    };
  }

  const seen = {};
  const names = rawValue
    .split(",")
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen[key]) {
        return false;
      }

      seen[key] = true;
      return true;
    });

  return {
    all: false,
    names: names
  };
}
function getPermissionsResponse(parameters, callback) {
  const username = String((parameters && (parameters.username || parameters.email)) || "").trim();
  const user = getUserRecord(username);

  if (!user) {
    return buildGetResponse({
      success: false,
      message: "User was not found."
    }, callback);
  }

  return buildGetResponse({
    success: true,
    permissions: buildPermissions(user.headers, user.row)
  }, callback);
}

function saveEntry(payload) {
  const submittedBy = String(payload.submittedBy || "").trim();
  const id = String(payload.id || payload.pan || "").trim();
  const name = String(payload.name || "").trim();
  const amount = normalizeNumericValue(payload.amount);
  const depositDate = String(payload.depositDate || payload.invoiceDate || "").trim();
  const expiryDate = String(payload.expiryDate || payload.date || "").trim();
  const interestRate = normalizeNumericValue(payload.interestRate || payload.taxableAmount);
  const itemMaterial = String(payload.itemMaterial || payload.category || "").trim();
  const goldWeight = normalizeNumericValue(payload.goldWeight || payload.tds);
  const silverWeight = normalizeNumericValue(payload.silverWeight || payload.gst);
  const goldPurity = normalizeNumericValue(payload.goldPurity);
  const silverPurity = normalizeNumericValue(payload.silverPurity);
  const settings = getSettingsValues();
  const goldRate = settings.goldRate;
  const silverRate = settings.silverRate;
  const value = normalizeNumericValue(payload.value) || calculateItemValue(goldWeight, silverWeight, goldRate, silverRate, goldPurity, silverPurity);
  const margin = normalizeNumericValue(payload.margin) || calculateMarginPercent(value, amount);
  const articles = String(payload.articles || payload.workDetails || "").trim();
  const notes = String(payload.notes || payload.others || "").trim();

  if (!userHasPermission(submittedBy, "canAddLoan")) {
    return jsonResponse({
      success: false,
      message: "You do not have permission to add loan records."
    });
  }

  if (!submittedBy || !id || !name || !amount || !depositDate || !expiryDate || !itemMaterial || !articles) {
    return jsonResponse({
      success: false,
      message: "Missing required entry details."
    });
  }

  const sheet = getOrCreateEntriesSheet();
  sheet.appendRow([
    new Date(),
    submittedBy,
    id,
    name,
    amount,
    depositDate,
    expiryDate,
    interestRate,
    itemMaterial,
    goldWeight,
    silverWeight,
    goldPurity,
    silverPurity,
    value,
    margin,
    articles,
    notes
  ]);

  return jsonResponse({
    success: true,
    message: "Loan saved successfully."
  });
}

function updateEntry(payload) {
  const rowNumber = Number(payload.rowNumber);
  const submittedBy = String(payload.submittedBy || "").trim();
  const id = String(payload.id || payload.pan || "").trim();
  const name = String(payload.name || "").trim();
  const amount = normalizeNumericValue(payload.amount);
  const depositDate = String(payload.depositDate || payload.invoiceDate || "").trim();
  const expiryDate = String(payload.expiryDate || payload.date || "").trim();
  const interestRate = normalizeNumericValue(payload.interestRate || payload.taxableAmount);
  const itemMaterial = String(payload.itemMaterial || payload.category || "").trim();
  const goldWeight = normalizeNumericValue(payload.goldWeight || payload.tds);
  const silverWeight = normalizeNumericValue(payload.silverWeight || payload.gst);
  const goldPurity = normalizeNumericValue(payload.goldPurity);
  const silverPurity = normalizeNumericValue(payload.silverPurity);
  const settings = getSettingsValues();
  const goldRate = settings.goldRate;
  const silverRate = settings.silverRate;
  const value = normalizeNumericValue(payload.value) || calculateItemValue(goldWeight, silverWeight, goldRate, silverRate, goldPurity, silverPurity);
  const margin = normalizeNumericValue(payload.margin) || calculateMarginPercent(value, amount);
  const articles = String(payload.articles || payload.workDetails || "").trim();
  const notes = String(payload.notes || payload.others || "").trim();

  if (!userHasPermission(submittedBy, "canEditLoan")) {
    return jsonResponse({
      success: false,
      message: "You do not have permission to edit loan records."
    });
  }

  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    return jsonResponse({
      success: false,
      message: "Invalid entry row."
    });
  }

  if (!submittedBy || !id || !name || !amount || !depositDate || !expiryDate || !itemMaterial || !articles) {
    return jsonResponse({
      success: false,
      message: "Missing required entry details."
    });
  }

  const sheet = getOrCreateEntriesSheet();
  const createdAt = sheet.getRange(rowNumber, 1).getValue() || new Date();
  sheet.getRange(rowNumber, 1, 1, ENTRY_HEADERS.length).setValues([[
    createdAt,
    submittedBy,
    id,
    name,
    amount,
    depositDate,
    expiryDate,
    interestRate,
    itemMaterial,
    goldWeight,
    silverWeight,
    goldPurity,
    silverPurity,
    value,
    margin,
    articles,
    notes
  ]]);

  return jsonResponse({
    success: true,
    message: "Loan record updated successfully."
  });
}

function matureEntry(payload) {
  const rowNumber = Number(payload.rowNumber);
  const maturedBy = String(payload.maturedBy || payload.submittedBy || "").trim();
  const maturityDate = normalizeDateInput(payload.maturityDate) || getTodayDateString();

  if (!userHasPermission(maturedBy, "canEditLoan")) {
    return jsonResponse({
      success: false,
      message: "You do not have permission to mature loan records."
    });
  }

  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    return jsonResponse({
      success: false,
      message: "Invalid entry row."
    });
  }

  const activeSheet = getOrCreateEntriesSheet();
  if (rowNumber > activeSheet.getLastRow()) {
    return jsonResponse({
      success: false,
      message: "That loan record was not found in Active Items."
    });
  }

  const rowValues = activeSheet.getRange(rowNumber, 1, 1, ENTRY_HEADERS.length).getDisplayValues()[0];
  const maturityInterest = calculateMaturityInterest(rowValues, maturityDate);
  const maturedSheet = getOrCreateMaturedItemsSheet();

  maturedSheet.appendRow(rowValues.concat([
    maturityDate,
    maturedBy,
    maturityInterest
  ]));
  activeSheet.deleteRow(rowNumber);

  return jsonResponse({
    success: true,
    message: "Loan matured successfully.",
    maturityInterest: maturityInterest
  });
}

function addMasterData(payload) {
  const name = String(payload.name || "").trim();
  const pan = String(payload.pan || "").trim().toUpperCase();

  if (!name || !pan) {
    return jsonResponse({
      success: false,
      message: "Name and PAN No. are required."
    });
  }

  if (!PAN_REGEX.test(pan)) {
    return jsonResponse({
      success: false,
      message: "PAN No. must be 10 characters: 5 letters, 4 numbers, 1 letter."
    });
  }

  const sheet = getSpreadsheet().getSheetByName(MASTER_DATA_SHEET_NAME);
  if (!sheet) {
    return jsonResponse({
      success: false,
      message: 'Sheet "Master Data" was not found.'
    });
  }

  const rows = sheet.getDataRange().getValues();
  const headers = rows.length ? rows[0].map((value) => String(value).trim().toLowerCase()) : [];
  const nameIndex = headers.indexOf("name");
  const panIndex = headers.indexOf("pan no.");
  const fallbackPanIndex = headers.indexOf("pan");
  const resolvedPanIndex = panIndex === -1 ? fallbackPanIndex : panIndex;

  if (nameIndex === -1 || resolvedPanIndex === -1) {
    return jsonResponse({
      success: false,
      message: 'The "Master Data" sheet must include "Name" and "PAN No." columns.'
    });
  }

  const exists = rows.slice(1).some((row) => {
    const existingName = String(row[nameIndex] || "").trim().toLowerCase();
    const existingPan = String(row[resolvedPanIndex] || "").trim().toLowerCase();

    return existingName === name.toLowerCase() || existingPan === pan.toLowerCase();
  });

  if (exists) {
    return jsonResponse({
      success: false,
      message: "This Name or PAN No. already exists in Master Data."
    });
  }

  const newRow = new Array(headers.length).fill("");
  newRow[nameIndex] = name;
  newRow[resolvedPanIndex] = pan;
  sheet.appendRow(newRow);

  return jsonResponse({
    success: true,
    message: "Master Data added successfully."
  });
}

function getMasterDataResponse(callback) {
  try {
    const sheet = getSpreadsheet().getSheetByName(MASTER_DATA_SHEET_NAME);
    if (!sheet) {
      return buildGetResponse({
        success: false,
        message: 'Sheet "Master Data" was not found.'
      }, callback);
    }

    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) {
      return buildGetResponse({
        success: true,
        data: []
      }, callback);
    }

    const headers = rows[0].map((value) => String(value).trim().toLowerCase());
    const nameIndex = headers.indexOf("name");
    const panIndex = headers.indexOf("pan no.");
    const fallbackPanIndex = headers.indexOf("pan");
    const resolvedPanIndex = panIndex === -1 ? fallbackPanIndex : panIndex;

    if (nameIndex === -1 || resolvedPanIndex === -1) {
      return buildGetResponse({
        success: false,
        message: 'The "Master Data" sheet must include "Name" and "PAN No." columns.'
      }, callback);
    }

    const data = rows.slice(1)
      .map((row) => ({
        name: String(row[nameIndex] || "").trim(),
        pan: String(row[resolvedPanIndex] || "").trim()
      }))
      .filter((item) => item.name && item.pan)
      .sort((left, right) => left.name.localeCompare(right.name));

    return buildGetResponse({
      success: true,
      data: data
    }, callback);
  } catch (error) {
    return buildGetResponse({
      success: false,
      message: error.message || "Unexpected error while loading master data."
    }, callback);
  }
}

function getEntriesResponse(callback) {
  try {
    const sheet = getOrCreateEntriesSheet();

    if (!sheet || sheet.getLastRow() < 2) {
      return buildGetResponse({
        success: true,
        headers: ENTRY_HEADERS,
        data: []
      }, callback);
    }

    const rows = sheet.getRange(1, 1, sheet.getLastRow(), ENTRY_HEADERS.length).getDisplayValues();
    const headers = rows[0];
    const data = rows.slice(1).map((row, index) => ({
      rowNumber: index + 2,
      values: row
    })).reverse();

    return buildGetResponse({
      success: true,
      headers: headers,
      data: data
    }, callback);
  } catch (error) {
    return buildGetResponse({
      success: false,
      message: error.message || "Unexpected error while loading entries."
    }, callback);
  }
}

function getSettingsResponse(callback) {
  try {
    return buildGetResponse(getSettingsValues(), callback);
  } catch (error) {
    return buildGetResponse({
      success: false,
      message: error.message || "Unexpected error while loading settings."
    }, callback);
  }
}

function getSettingsValues() {
  const sheet = getSpreadsheet().getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    return {
      success: false,
      message: 'Sheet "Settings" was not found.',
      interestRates: [],
      itemMaterials: [],
      goldRate: 0,
      silverRate: 0,
      goldPurity: 0,
      silverPurity: 0
    };
  }

  const rows = sheet.getDataRange().getDisplayValues();
  if (rows.length < 2) {
    return {
      success: true,
      interestRates: [],
      itemMaterials: [],
      goldRate: 0,
      silverRate: 0,
      goldPurity: 0,
      silverPurity: 0
    };
  }

  const headers = rows[0].map((value) => String(value).trim().toLowerCase());
  const interestRateIndex = findHeaderIndex(headers, ["interest rate", "interest rates", "rate"]);
  const itemMaterialIndex = findHeaderIndex(headers, ["item material", "item materials", "material"]);
  const goldRateIndex = findHeaderIndex(headers, ["gold rate", "gold rates"]);
  const silverRateIndex = findHeaderIndex(headers, ["silver rate", "silver rates"]);
  const goldPurityIndex = findHeaderIndex(headers, ["gold purity", "gold purity %", "gold purities"]);
  const silverPurityIndex = findHeaderIndex(headers, ["silver purity", "silver purity %", "silver purities"]);
  const resolvedInterestRateIndex = interestRateIndex === -1 ? 0 : interestRateIndex;
  const resolvedItemMaterialIndex = itemMaterialIndex === -1 ? 1 : itemMaterialIndex;

  return {
    success: true,
    interestRates: uniqueValues(rows.slice(1).map((row) => row[resolvedInterestRateIndex])),
    itemMaterials: uniqueValues(rows.slice(1).map((row) => row[resolvedItemMaterialIndex])),
    goldRate: normalizeNumericValue(goldRateIndex === -1 ? "" : firstValue(rows.slice(1).map((row) => row[goldRateIndex]))),
    silverRate: normalizeNumericValue(silverRateIndex === -1 ? "" : firstValue(rows.slice(1).map((row) => row[silverRateIndex]))),
    goldPurity: normalizeNumericValue(goldPurityIndex === -1 ? "" : firstValue(rows.slice(1).map((row) => row[goldPurityIndex]))),
    silverPurity: normalizeNumericValue(silverPurityIndex === -1 ? "" : firstValue(rows.slice(1).map((row) => row[silverPurityIndex])))
  };
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildGetResponse(payload, callback) {
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return jsonResponse(payload);
}

function getOrCreateEntriesSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(ENTRIES_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(ENTRIES_SHEET_NAME);
  }

  const hasHeaders = sheet.getLastRow() > 0;
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, ENTRY_HEADERS.length).setValues([ENTRY_HEADERS]);
    return sheet;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, ENTRY_HEADERS.length).getDisplayValues()[0];
  const headersMatch = ENTRY_HEADERS.every((header, index) => String(currentHeaders[index] || "").trim() === header);
  if (!headersMatch) {
    sheet.getRange(1, 1, 1, ENTRY_HEADERS.length).setValues([ENTRY_HEADERS]);
  }

  return sheet;
}

function getOrCreateMaturedItemsSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(MATURED_ITEMS_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(MATURED_ITEMS_SHEET_NAME);
  }

  const hasHeaders = sheet.getLastRow() > 0;
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, MATURED_ITEM_HEADERS.length).setValues([MATURED_ITEM_HEADERS]);
    return sheet;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, MATURED_ITEM_HEADERS.length).getDisplayValues()[0];
  const headersMatch = MATURED_ITEM_HEADERS.every((header, index) => String(currentHeaders[index] || "").trim() === header);
  if (!headersMatch) {
    sheet.getRange(1, 1, 1, MATURED_ITEM_HEADERS.length).setValues([MATURED_ITEM_HEADERS]);
  }

  return sheet;
}

function calculateMaturityInterest(rowValues, maturityDateValue) {
  const amount = normalizeNumericValue(rowValues[4]);
  const depositDate = parseDateValue(rowValues[5]);
  const maturityDate = parseDateValue(maturityDateValue);
  const interestRate = normalizeNumericValue(rowValues[7]);

  if (!amount || !interestRate || !depositDate || !maturityDate || maturityDate < depositDate) {
    return 0;
  }

  const duration = getInterestDuration(depositDate, maturityDate);
  const monthlyInterest = amount * (interestRate / 100);
  const interest = (monthlyInterest * duration.months) + ((monthlyInterest / 30) * duration.days);
  return roundToNearestTen(interest);
}

function getInterestDuration(depositDate, targetDate) {
  const startDate = new Date(depositDate.getFullYear(), depositDate.getMonth(), depositDate.getDate());
  const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());

  if (endDate.getDate() < startDate.getDate()) {
    months -= 1;
  }

  months = Math.max(months, 0);
  const monthAnchor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  monthAnchor.setMonth(monthAnchor.getMonth() + months);
  const days = Math.max(Math.floor((endDate.getTime() - monthAnchor.getTime()) / 86400000), 0);

  return {
    months: months,
    days: days
  };
}

function roundToNearestTen(value) {
  return Math.round(value / 10) * 10;
}

function getTodayDateString() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function normalizeDateInput(value) {
  const parsed = parseDateValue(value);
  return parsed ? formatDateString(parsed) : "";
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const stringValue = String(value || "").trim();
  if (!stringValue) {
    return null;
  }

  let match = stringValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  match = stringValue.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  match = stringValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  return null;
}

function formatDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function normalizeNumericValue(value) {
  const normalized = String(value || "").replace(/,/g, "").trim();
  const numericValue = Number(normalized);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function buildPermissions(headers, row) {
  return {
    canViewHome: readPermission(headers, row, ["canviewhome", "viewhome", "home"], false),
    canViewSummary: readPermission(headers, row, ["canviewsummary", "viewsummary", "summary"], false),
    canAddLoan: readPermission(headers, row, ["canaddloan", "addloan", "addrecord"], false),
    canViewData: readPermission(headers, row, ["canviewdata", "viewdata", "data"], false),
    canEditLoan: readPermission(headers, row, ["caneditloan", "editloan", "editrecord"], false),
    canChangePassword: readPermission(headers, row, ["canchangepassword", "changepassword"], false)
  };
}

function readPermission(headers, row, names, fallback) {
  const normalizedNames = names.map(normalizeHeaderName);
  const index = headers.findIndex((header) => normalizedNames.includes(normalizeHeaderName(header)));
  if (index === -1) {
    return fallback;
  }

  const value = String(row[index] ?? "").trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  return ["true", "tru", "1"].includes(value);
}

function normalizeHeaderName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function userHasPermission(usernameInput, permissionName) {
  const user = getUserRecord(usernameInput);
  if (!user) {
    return false;
  }

  return buildPermissions(user.headers, user.row)[permissionName] !== false;
}

function getUserRecord(usernameInput) {
  const normalizedUsernameInput = String(usernameInput || "").trim().toLowerCase();
  if (!normalizedUsernameInput) {
    return null;
  }

  const sheet = getSpreadsheet().getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    return null;
  }

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) {
    return null;
  }

  const headers = rows[0].map((value) => String(value).trim().toLowerCase());
  const usernameIndex = headers.indexOf("username");
  const row = rows.slice(1).find((item) => {
    const rowUsername = usernameIndex === -1 ? "" : String(item[usernameIndex] || "").trim().toLowerCase();
    return rowUsername === normalizedUsernameInput;
  });

  return row ? { headers, row } : null;
}

function calculateItemValue(goldWeight, silverWeight, goldRate, silverRate, goldPurity, silverPurity) {
  const goldValue = (goldWeight / 10) * goldRate * (goldPurity / 100);
  const silverValue = (silverWeight / 1000) * silverRate * (silverPurity / 100);
  return goldValue + silverValue;
}

function calculateMarginPercent(value, amount) {
  const marginAmount = value - amount;
  return value ? (marginAmount / value) * 100 : 0;
}

function findHeaderIndex(headers, names) {
  return names.map((name) => headers.indexOf(name)).find((index) => index !== -1) ?? -1;
}

function uniqueValues(values) {
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
    });
}

function firstValue(values) {
  const value = values
    .map((item) => String(item || "").trim())
    .find((item) => item);

  return value || "";
}

function getUsernameFromEmail(email) {
  return String(email || "").trim().split("@")[0];
}

function getSpreadsheet() {
  const sheetId = String(GOOGLE_SHEET_ID || "").trim();
  return sheetId ? SpreadsheetApp.openById(sheetId) : SpreadsheetApp.getActiveSpreadsheet();
}
