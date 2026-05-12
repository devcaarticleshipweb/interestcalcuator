# Money Lending App Setup

This static app uses Google Sheets for login users, borrower master data, and loan entries.

## Central Connection Settings

There are two connection values, each kept in one place:

- Frontend Apps Script URL: edit `config.js`
- Google Sheet ID used by Apps Script: edit `GOOGLE_SHEET_ID` at the top of `google-apps-script.js`

If the Apps Script is bound directly to the same Google Sheet, `GOOGLE_SHEET_ID` may be left blank. If the script is standalone or you want to force one specific sheet, paste the spreadsheet ID there.

## Required Sheets

Create these tabs in your Google Sheet:

- `Users`
- `Master Data`
- `Active Items`
- `Settings`

The `Users` tab should include:

```text
username | password | status | canViewHome | canViewSummary | canAddLoan | canViewData | canEditLoan | canChangePassword
```

Permission values should be `true` or `false`. The app also treats `tru` as true. If a permission column is missing or blank, access is allowed by default.
Permission headers are flexible, so `Can View Home`, `can_view_home`, and `canViewHome` are treated the same.

The `Master Data` tab should include:

```text
Name | PAN No.
```

The `Active Items` tab is created automatically if missing.

The `Settings` tab should include:

```text
Interest Rate | Item Material | Gold Rate | Silver Rate | Gold Purity | Silver Purity
```

Example rows:

```text
1             | Gold          | 65000     | 75000       | 75          | 90
1.5           | Silver        |           |             |             |
2             | Gold+Silver   |           |             |             |
```

`Gold Rate` is treated as the rate per 10 grams. `Silver Rate` is treated as the rate per 1 kg. Purity values are percentages.

## Deploy Apps Script

1. Open your Google Sheet.
2. Go to `Extensions -> Apps Script`.
3. Paste the contents of `google-apps-script.js`.
4. Set `GOOGLE_SHEET_ID` if needed.
5. Deploy as a Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Copy the deployed Web App URL.
7. Paste that URL into `config.js`.

## Run Locally

Open through a local web server, not by double-clicking the HTML files.

```powershell
python -m http.server 8000
```

If Python is not installed, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then open:

```text
http://localhost:8000/index.html
```

## First Test

1. Log in with an active user from `Users`.
2. Open `Add Loan`.
3. Select or add a borrower.
4. Enter amount and deposit date.
5. Confirm expiry date fills one year ahead.
6. Confirm interest rate and item material load from `Settings`.
7. Confirm weight fields appear based on item material.
6. Save the loan.
7. Open `Data` and confirm the record appears.
8. Open `Summary` and confirm totals are shown.
