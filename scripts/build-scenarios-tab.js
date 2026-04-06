#!/usr/bin/env node
/**
 * Replace the Scenarios tab with a clean decision panel.
 * Checkboxes toggle scenarios on/off. Summary bar updates live.
 * All baseline numbers pulled from existing tabs — no hardcoded values.
 */
import { getClient, ALL_GOOGLE_SCOPES } from '../src/utils/google-oauth.js';

const SHEET_ID = '193JJvxdWw_Y9k0oBAyDmku43OEkncj0T8DX8htVWVfo';

function col2letter(n) {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

async function main() {
  const auth = await getClient('lee', ALL_GOOGLE_SCOPES);
  const { google } = await import('googleapis');
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title,gridProperties))',
  });
  const scenSid = meta.data.sheets.find(s => s.properties.title === 'Scenarios').properties.sheetId;

  // ============================================================
  // STEP 1: Clear existing Scenarios tab
  // ============================================================
  console.log('Step 1: Clear existing Scenarios tab');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        updateCells: {
          range: { sheetId: scenSid },
          fields: 'userEnteredValue,userEnteredFormat,dataValidation',
        },
      }],
    },
  });

  // ============================================================
  // STEP 2: Write helper cells (hidden area, row 3 cols L-P)
  // ============================================================
  console.log('Step 2: Write helper cells');
  // These power the summary bar and per-row retirement calculations
  // L3: annuity FV factor (10yr monthly contributions at portfolio return rate)
  // M3: lump sum FV factor (10yr growth of one-time amount)
  // N3: retirement target (25x annual outflows)
  // O3: baseline monthly surplus
  // P3: baseline NPER (months to retirement)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: "'Scenarios'!L2:P2", values: [['AnnuityFV','LumpFV','RetireTarget','Surplus','BaseNPER']] },
        { range: "'Scenarios'!L3:P3", values: [[
          '=((1+portfolio_return_rate/12)^120-1)/(portfolio_return_rate/12)',
          '=(1+portfolio_return_rate/12)^120',
          '=25*\'Monthly Model\'!B28*12',
          '=\'Monthly Model\'!B31',
          '=IFERROR(NPER(portfolio_return_rate/12,-O3,-portfolio_value,N3),"N/A")',
        ]] },
      ],
    },
  });

  // ============================================================
  // STEP 3: Write all content
  // ============================================================
  console.log('Step 3: Write content');

  // --- References used in formulas ---
  const IA = "'Inputs & Assumptions'";
  const r = 'portfolio_return_rate/12';
  const pv = 'portfolio_value';
  const surplus = '$O$3';
  const target = '$N$3';
  const baseNPER = '$P$3';
  const annFV = '$L$3';
  const lumpFV = '$M$3';

  // Helper: build retirement impact formula for a row
  function retireF(toggle, monthlyRaw, onetimeRaw) {
    return `=IF(${toggle},IFERROR((NPER(${r},-(${surplus}+${monthlyRaw}),-(${pv}+${onetimeRaw}),${target})-${baseNPER})/12,"25+"),0)`;
  }
  // Helper: portfolio impact
  function portfolioF(toggle, monthlyRaw, onetimeRaw) {
    return `=IF(${toggle},${onetimeRaw}*${lumpFV}+${monthlyRaw}*${annFV},0)`;
  }

  const data = [];
  function w(range, values) { data.push({ range: `'Scenarios'!${range}`, values }); }

  // --- TITLE ---
  w('A1', [['SCENARIOS — DECISION PANEL']]);

  // --- SUMMARY BAR ---
  w('A3', [['LIVE SUMMARY']]);
  w('A4:I4', [['Baseline Monthly Surplus','','Savings Carve-out','Discretionary Pool','Monthly Scenario Impact','Remaining Discretionary','Retirement (Baseline)','Retirement (w/ Scenarios)','Retirement Δ']]);
  w('A5', [[
    `=\'Monthly Model\'!B31`, // baseline surplus
  ]]);
  w('C5', [[
    `=D33`, // savings carve-out (from row 33)
  ]]);
  w('D5', [[`=A5-C5`]]); // discretionary
  w('E5', [[`=SUM(H9:H33)`]]); // monthly scenario impact
  w('F5', [[`=D5+E5`]]); // remaining
  w('G5', [[`=IFERROR(${baseNPER}/12,"25+")`]]); // baseline retirement yrs
  w('H5', [[`=IFERROR(NPER(${r},-(${surplus}+E5),-(${pv}+SUM(K9:K33)),${target})/12,"25+")`]]); // adjusted
  w('I5', [[`=IFERROR(H5-G5,"")`]]); // delta

  // --- COLUMN HEADERS ---
  w('A7', [['SCENARIOS']]);
  w('A8:K8', [['☑','Scenario','Description','Parameter','','Parameter 2','','Monthly Impact','Portfolio (10yr)','Retirement Δ (yrs)','']]);

  // ============================================================
  // SCENARIO ROWS
  // ============================================================

  // --- LIFESTYLE ---
  // Row 9: Home Renovation (one-time cost)
  w('A9', [[false]]);
  w('B9:G9', [['Home Renovation','One-time renovation project. Reduces portfolio by cost + missed growth.',150000,'Total cost ($)','','']]);
  w('H9', [['=IF(A9,0,0)']]); // no monthly
  w('I9', [[portfolioF('A9','0','-D9')]]);
  w('J9', [[retireF('A9','0','-D9')]]);
  w('K9', [['=IF(A9,-D9,0)']]); // raw one-time for summary

  // Row 10: Italy Trip (one-time cost)
  w('A10', [[false]]);
  w('B10:G10', [['Italy Trip','Family vacation. One-time cost.',30000,'Total cost ($)','','']]);
  w('H10', [['=IF(A10,0,0)']]);
  w('I10', [[portfolioF('A10','0','-D10')]]);
  w('J10', [[retireF('A10','0','-D10')]]);
  w('K10', [['=IF(A10,-D10,0)']]);

  // Row 11: Ski Lease (recurring)
  w('A11', [[false]]);
  w('B11:G11', [['Ski Lease','Seasonal lease, amortized monthly.',15000,'Annual cost ($)','','']]);
  w('H11', [['=IF(A11,-D11/12,0)']]);
  w('I11', [[portfolioF('A11','-D11/12','0')]]);
  w('J11', [[retireF('A11','-D11/12','0')]]);
  w('K11', [['=IF(A11,0,0)']]);

  // Row 13: PRIVATE SCHOOL subheader
  w('B13', [['PRIVATE SCHOOL']]);

  // Rows 14-17: Private school per child
  const kids = [
    { row: 14, name: 'Ryker' },
    { row: 15, name: 'Logan' },
    { row: 16, name: 'Hazel' },
    { row: 17, name: 'DJ' },
  ];
  for (const k of kids) {
    w(`A${k.row}`, [[false]]);
    w(`B${k.row}:G${k.row}`, [[`Private School — ${k.name}`, 'Annual tuition per child.', 45000, 'Annual tuition ($)', '', '']]);
    w(`H${k.row}`, [[`=IF(A${k.row},-D${k.row}/12,0)`]]);
    w(`I${k.row}`, [[portfolioF(`A${k.row}`, `-D${k.row}/12`, '0')]]);
    w(`J${k.row}`, [[retireF(`A${k.row}`, `-D${k.row}/12`, '0')]]);
    w(`K${k.row}`, [[`=IF(A${k.row},0,0)`]]);
  }

  // Row 19: PROMOTIONS & INCOME subheader
  w('B19', [['PROMOTIONS & INCOME']]);

  // Row 20: Steve → Senior Director
  // Impact = (new_base/12 - current_monthly) * (1 - withholding)
  // Current monthly = 'Inputs & Assumptions'!C8, withholding = C9
  w('A20', [[false]]);
  w('B20:G20', [['Steve → Senior Director','Base salary increase. Stock comp increase not modeled (flag).',430000,'New annual base ($)','','']]);
  w('H20', [[`=IF(A20,(D20/12-${IA}!C8)*(1-${IA}!C9),0)`]]);
  w('I20', [[portfolioF('A20', `(D20/12-${IA}!C8)*(1-${IA}!C9)`, '0')]]);
  w('J20', [[retireF('A20', `(D20/12-${IA}!C8)*(1-${IA}!C9)`, '0')]]);
  w('K20', [['=IF(A20,0,0)']]);

  // Row 21: Steve → VP
  w('A21', [[false]]);
  w('B21:G21', [['Steve → VP','Base salary increase. Stock comp increase not modeled (flag).',475000,'New annual base ($)','','']]);
  w('H21', [[`=IF(A21,(D21/12-${IA}!C8)*(1-${IA}!C9),0)`]]);
  w('I21', [[portfolioF('A21', `(D21/12-${IA}!C8)*(1-${IA}!C9)`, '0')]]);
  w('J21', [[retireF('A21', `(D21/12-${IA}!C8)*(1-${IA}!C9)`, '0')]]);
  w('K21', [['=IF(A21,0,0)']]);

  // Row 22: Hallie → Director
  w('A22', [[false]]);
  w('B22:G22', [['Hallie → Director','Base salary increase at Vanta.',275000,'New annual base ($)','','']]);
  w('H22', [[`=IF(A22,(D22/12-${IA}!C44)*(1-${IA}!C45),0)`]]);
  w('I22', [[portfolioF('A22', `(D22/12-${IA}!C44)*(1-${IA}!C45)`, '0')]]);
  w('J22', [[retireF('A22', `(D22/12-${IA}!C44)*(1-${IA}!C45)`, '0')]]);
  w('K22', [['=IF(A22,0,0)']]);

  // Row 23: Vanta IPO (2032)
  // One-time: shares * price * (1 - effective_tax_rate)
  // Shares from Inputs C49, tax rate ~50% (fed supp high + CA + medicare)
  w('A23', [[false]]);
  w('B23:G23', [['Vanta IPO (2032)','Hallie RSU liquidity. Net after ~50% tax.',20,'Price/share ($)',0.50,'Eff. tax rate']]);
  w('H23', [['=IF(A23,0,0)']]); // no monthly
  w('I23', [[portfolioF('A23', '0', `${IA}!C49*D23*(1-F23)`)]]);
  w('J23', [[retireF('A23', '0', `${IA}!C49*D23*(1-F23)`)]]);
  w('K23', [[`=IF(A23,${IA}!C49*D23*(1-F23),0)`]]);

  // Row 25: REAL ESTATE subheader
  w('B25', [['REAL ESTATE']]);

  // Row 26: Property Purchase
  // Monthly = -PMT(mortgage_rate/12, 360, price*(1-down_pct))
  // One-time = -price * down_pct
  // Mortgage rate assumption: 6.5% (flagged)
  w('A26', [[false]]);
  w('B26:G26', [['Property Purchase','Down payment + mortgage at 6.5% / 30yr (assumed rate).',1500000,'Purchase price ($)',0.20,'Down payment %']]);
  w('H26', [[`=IF(A26,-PMT(0.065/12,360,D26*(1-F26)),0)`]]);
  w('I26', [[portfolioF('A26', '-PMT(0.065/12,360,D26*(1-F26))', '-D26*F26')]]);
  w('J26', [[retireF('A26', '-PMT(0.065/12,360,D26*(1-F26))', '-D26*F26')]]);
  w('K26', [[`=IF(A26,-D26*F26,0)`]]);

  // Row 28: KELLY INHERITANCE subheader
  w('B28', [['KELLY INHERITANCE']]);

  // Row 29: SF Property — dropdown None/Sell/Rent
  w('A29', [['None']]);
  w('B29:G29', [['Kelly — SF Property','Sell for lump sum (net 70% after costs) or rent monthly.',1800000,'Property value ($)',5500,'Rent ($/mo)']]);
  w('H29', [[`=IF(A29="Rent",F29,0)`]]);
  w('I29', [[`=IF(A29="Sell",D29*0.7*${lumpFV},IF(A29="Rent",F29*${annFV},0))`]]);
  w('J29', [[`=IF(A29="None",0,IFERROR((NPER(${r},-(${surplus}+IF(A29="Rent",F29,0)),-(${pv}+IF(A29="Sell",D29*0.7,0)),${target})-${baseNPER})/12,"25+"))`]]);
  w('K29', [[`=IF(A29="Sell",D29*0.7,0)`]]);

  // Row 30: El Cerrito Property — dropdown None/Sell/Rent
  w('A30', [['None']]);
  w('B30:G30', [['Kelly — El Cerrito','Sell for lump sum (net 70% after costs) or rent monthly.',900000,'Property value ($)',3500,'Rent ($/mo)']]);
  w('H30', [[`=IF(A30="Rent",F30,0)`]]);
  w('I30', [[`=IF(A30="Sell",D30*0.7*${lumpFV},IF(A30="Rent",F30*${annFV},0))`]]);
  w('J30', [[`=IF(A30="None",0,IFERROR((NPER(${r},-(${surplus}+IF(A30="Rent",F30,0)),-(${pv}+IF(A30="Sell",D30*0.7,0)),${target})-${baseNPER})/12,"25+"))`]]);
  w('K30', [[`=IF(A30="Sell",D30*0.7,0)`]]);

  // Row 32: SAVINGS subheader
  w('B32', [['SAVINGS']]);

  // Row 33: Savings carve-out (always active, editable)
  w('B33:G33', [['Monthly Savings Target','Portion of surplus earmarked for planned savings. Does not affect retirement calc — all surplus grows the portfolio.',`=monthly_savings`,'$/month','','']]);

  // Write all content
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
  console.log(`  Wrote ${data.length} ranges`);

  // ============================================================
  // STEP 4: Add checkboxes and dropdowns
  // ============================================================
  console.log('Step 4: Add data validation (checkboxes & dropdowns)');

  const checkboxRows = [9,10,11,14,15,16,17,20,21,22,23,26];
  const dropdownRows = [
    { row: 29, values: ['None','Sell','Rent'] },
    { row: 30, values: ['None','Sell','Rent'] },
  ];

  const valRequests = [];
  for (const r of checkboxRows) {
    valRequests.push({
      setDataValidation: {
        range: { sheetId: scenSid, startRowIndex: r-1, endRowIndex: r, startColumnIndex: 0, endColumnIndex: 1 },
        rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true },
      },
    });
  }
  for (const d of dropdownRows) {
    valRequests.push({
      setDataValidation: {
        range: { sheetId: scenSid, startRowIndex: d.row-1, endRowIndex: d.row, startColumnIndex: 0, endColumnIndex: 1 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: d.values.map(v => ({ userEnteredValue: v })) },
          strict: true, showCustomUi: true,
        },
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: valRequests },
  });
  console.log(`  Added ${checkboxRows.length} checkboxes and ${dropdownRows.length} dropdowns`);

  // ============================================================
  // STEP 5: Formatting
  // ============================================================
  console.log('Step 5: Formatting');

  const darkBg = { red: 0.15, green: 0.15, blue: 0.2 };
  const sectionBg = { red: 0.93, green: 0.93, blue: 0.96 };
  const summaryBg = { red: 0.22, green: 0.32, blue: 0.42 };
  const white = { red: 1, green: 1, blue: 1 };
  const darkGray = { red: 0.2, green: 0.2, blue: 0.2 };
  const posGreen = { red: 0.1, green: 0.5, blue: 0.2 };
  const negRed = { red: 0.8, green: 0.1, blue: 0.1 };

  const fmtRequests = [
    // Title bar
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 },
      cell: { userEnteredFormat: { backgroundColor: darkBg, textFormat: { bold: true, fontSize: 14, foregroundColor: white } } },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    }},
    // Summary bar header
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 11 },
      cell: { userEnteredFormat: { backgroundColor: sectionBg, textFormat: { bold: true, fontSize: 11, foregroundColor: darkGray } } },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    }},
    // Summary labels row
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 10 },
      cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 9, foregroundColor: white }, backgroundColor: summaryBg, wrapStrategy: 'WRAP' } },
      fields: 'userEnteredFormat(textFormat,backgroundColor,wrapStrategy)',
    }},
    // Summary values row
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 10 },
      cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 }, numberFormat: { type: 'CURRENCY', pattern: '$#,##0' } } },
      fields: 'userEnteredFormat(textFormat,numberFormat)',
    }},
    // Retirement columns in summary (years format, not currency)
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 6, endColumnIndex: 9 },
      cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.0 "yrs"' } } },
      fields: 'userEnteredFormat.numberFormat',
    }},
    // Retirement delta with +/- format
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 8, endColumnIndex: 9 },
      cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '+0.0 "yrs";-0.0 "yrs"' } } },
      fields: 'userEnteredFormat.numberFormat',
    }},
    // Scenario section header
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 11 },
      cell: { userEnteredFormat: { backgroundColor: sectionBg, textFormat: { bold: true, fontSize: 11 } } },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    }},
    // Column headers row
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 11 },
      cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 9 }, backgroundColor: { red: 0.9, green: 0.9, blue: 0.92 }, wrapStrategy: 'WRAP' } },
      fields: 'userEnteredFormat(textFormat,backgroundColor,wrapStrategy)',
    }},
    // Sub-headers (rows 13, 19, 25, 28, 32)
    ...[13,19,25,28,32].map(r => ({
      repeatCell: {
        range: { sheetId: scenSid, startRowIndex: r-1, endRowIndex: r, startColumnIndex: 0, endColumnIndex: 11 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 10 }, backgroundColor: { red: 0.96, green: 0.96, blue: 0.98 } } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    })),
    // Currency format for Monthly Impact (col H)
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 8, endRowIndex: 34, startColumnIndex: 7, endColumnIndex: 8 },
      cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '$#,##0;($#,##0)' } } },
      fields: 'userEnteredFormat.numberFormat',
    }},
    // Currency format for Portfolio Impact (col I)
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 8, endRowIndex: 34, startColumnIndex: 8, endColumnIndex: 9 },
      cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '$#,##0;($#,##0)' } } },
      fields: 'userEnteredFormat.numberFormat',
    }},
    // Retirement Yrs format (col J)
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 8, endRowIndex: 34, startColumnIndex: 9, endColumnIndex: 10 },
      cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '+0.0;-0.0' } } },
      fields: 'userEnteredFormat.numberFormat',
    }},
    // Parameter currency format (col D for most rows)
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 8, endRowIndex: 34, startColumnIndex: 3, endColumnIndex: 4 },
      cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' } } },
      fields: 'userEnteredFormat.numberFormat',
    }},
    // Description col wrap
    { repeatCell: {
      range: { sheetId: scenSid, startRowIndex: 8, endRowIndex: 34, startColumnIndex: 2, endColumnIndex: 3 },
      cell: { userEnteredFormat: { wrapStrategy: 'WRAP', textFormat: { fontSize: 9 } } },
      fields: 'userEnteredFormat(wrapStrategy,textFormat)',
    }},
    // Column widths
    ...[
      [0, 1, 45],   // A: checkbox
      [1, 2, 200],  // B: scenario name
      [2, 3, 280],  // C: description
      [3, 4, 120],  // D: param 1
      [4, 5, 100],  // E: param 1 label
      [5, 6, 100],  // F: param 2
      [6, 7, 90],   // G: param 2 label
      [7, 8, 130],  // H: monthly
      [8, 9, 140],  // I: portfolio
      [9, 10, 120], // J: retirement
      [10, 11, 5],  // K: hidden one-time
    ].map(([s, e, px]) => ({
      updateDimensionProperties: {
        range: { sheetId: scenSid, dimension: 'COLUMNS', startIndex: s, endIndex: e },
        properties: { pixelSize: px },
        fields: 'pixelSize',
      },
    })),
    // Freeze rows 1-5 (title + summary) and col A-B
    {
      updateSheetProperties: {
        properties: { sheetId: scenSid, gridProperties: { frozenRowCount: 5, frozenColumnCount: 2 } },
        fields: 'gridProperties(frozenRowCount,frozenColumnCount)',
      },
    },
    // Conditional formatting: green for positive monthly impact, red for negative
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: scenSid, startRowIndex: 8, endRowIndex: 34, startColumnIndex: 7, endColumnIndex: 8 }],
          booleanRule: {
            condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '0' }] },
            format: { textFormat: { foregroundColor: posGreen } },
          },
        },
        index: 0,
      },
    },
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: scenSid, startRowIndex: 8, endRowIndex: 34, startColumnIndex: 7, endColumnIndex: 8 }],
          booleanRule: {
            condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '0' }] },
            format: { textFormat: { foregroundColor: negRed } },
          },
        },
        index: 1,
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: fmtRequests },
  });
  console.log('  Formatting applied');

  // ============================================================
  // STEP 6: Verify
  // ============================================================
  console.log('\nStep 6: Verify');

  const verify = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      "'Scenarios'!A4:I5",
      "'Scenarios'!L3:P3",
    ],
    valueRenderOption: 'FORMATTED_VALUE',
  });

  console.log('Summary bar labels:', JSON.stringify(verify.data.valueRanges[0].values?.[0]));
  console.log('Summary bar values:', JSON.stringify(verify.data.valueRanges[0].values?.[1]));
  console.log('Helper cells:', JSON.stringify(verify.data.valueRanges[1].values?.[0]));

  console.log('\n=== COMPLETE ===');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
