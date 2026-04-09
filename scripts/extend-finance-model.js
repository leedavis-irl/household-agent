#!/usr/bin/env node
/**
 * Extend Avalon Financial Model from 11 years to 20 years (monthly granularity).
 *
 * Phase 1: Extend Monthly Model tab
 *   - Duplicate Monthly Model as "Monthly Model (backup YYYY-MM-DD)"
 *   - Append 108 columns (ED:IG) to the grid
 *   - Write monthly date serials Apr 2037 → Mar 2046 into row 1
 *   - Copy-paste formulas from col EC rows 2-37 into cols ED:IG rows 2-37
 *     (Sheets API copyPaste auto-adjusts relative refs like drag-fill in UI)
 *
 * Phase 2: Extend Summary tab's Annual + Quarterly sections to 20 years
 *   - Append 36 columns to Summary grid
 *   - Write year headers (2037..2045) in row 2 cols M:U
 *   - Write quarter headers (Q1 2037..Q4 2045) in row 11 cols AT:CC
 *   - Construct and write 54 new Annual formulas (rows 3-8 × cols M:U)
 *   - Construct and write 216 new Quarterly formulas (rows 12-17 × cols AT:CC)
 *
 * Verification after each phase. Aborts if verification fails.
 * Full report written to /tmp/extension-report.json.
 */
import { getClient, ALL_GOOGLE_SCOPES } from '../src/utils/google-oauth.js';
import { writeFileSync } from 'fs';

const SHEET_ID = '193JJvxdWw_Y9k0oBAyDmku43OEkncj0T8DX8htVWVfo';
const MM = 'Monthly Model';
const SUMM = 'Summary';

// ---- Column math helpers ----
function col2letter(n) {
  // 1-based: 1 → A, 26 → Z, 27 → AA, 241 → IG
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

// ---- Date serial helpers ----
const EPOCH_MS = Date.UTC(1899, 11, 30); // Google Sheets epoch (Lotus 1-2-3 compat)
function dateToSerial(year, monthIdx /* 0-based */, day) {
  return (Date.UTC(year, monthIdx, day) - EPOCH_MS) / 86_400_000;
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    phases: {},
  };

  const auth = await getClient('lee', ALL_GOOGLE_SCOPES);
  if (!auth) throw new Error('No OAuth token for lee');
  const { google } = await import('googleapis');
  const sheets = google.sheets({ version: 'v4', auth });

  // ===== Pre-flight: sanity check the date serial math against known values =====
  const apr2026 = dateToSerial(2026, 3, 1);
  if (apr2026 !== 46113) {
    throw new Error(`Date serial math is wrong: expected 46113 for Apr 2026, got ${apr2026}`);
  }
  console.log('Date serial math verified (Apr 2026 = 46113)');

  // ===== Get metadata: sheetIds, grid sizes =====
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title,gridProperties))',
  });
  const sheetByTitle = {};
  for (const s of meta.data.sheets) {
    sheetByTitle[s.properties.title] = s.properties;
  }
  const mmSheetId = sheetByTitle[MM].sheetId;
  const summSheetId = sheetByTitle[SUMM].sheetId;
  const mmCols = sheetByTitle[MM].gridProperties.columnCount;
  const summCols = sheetByTitle[SUMM].gridProperties.columnCount;
  console.log(`Monthly Model: ${mmCols} cols, Summary: ${summCols} cols`);

  // Sanity check existing shape
  const mmRow1 = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${MM}'!EC1`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const mmLastExistingDate = mmRow1.data.values?.[0]?.[0];
  console.log(`Monthly Model col EC row 1 (last existing date): ${mmLastExistingDate}`);
  // Expected: date serial for Mar 2037 = 46447
  const expectedEC = dateToSerial(2037, 2, 1); // Mar 2037
  if (mmLastExistingDate !== expectedEC) {
    console.warn(`  WARN: expected ${expectedEC} (Mar 2037), got ${mmLastExistingDate} — proceeding but flagging`);
  }
  report.preflightMmLastDate = mmLastExistingDate;
  report.preflightExpectedLastDate = expectedEC;

  // ============================================================
  // PHASE 1A — Backup Monthly Model
  // ============================================================
  const backupTitle = `Monthly Model (backup ${new Date().toISOString().slice(0, 10)})`;
  console.log(`\n=== Phase 1A: Backup as "${backupTitle}" ===`);
  const backupResp = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: mmSheetId,
            insertSheetIndex: meta.data.sheets.length,
            newSheetName: backupTitle,
          },
        },
      ],
    },
  });
  const backupSheetId = backupResp.data.replies[0].duplicateSheet.properties.sheetId;
  report.phases.backup = { title: backupTitle, sheetId: backupSheetId };
  console.log(`  Backup created: sheetId=${backupSheetId}`);

  // ============================================================
  // PHASE 1B — Extend Monthly Model grid + dates + formulas
  // ============================================================
  console.log('\n=== Phase 1B: Extend Monthly Model grid ===');
  const mmColsNeeded = 241; // col IG
  const mmColsToAdd = mmColsNeeded - mmCols;
  if (mmColsToAdd > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            appendDimension: {
              sheetId: mmSheetId,
              dimension: 'COLUMNS',
              length: mmColsToAdd,
            },
          },
        ],
      },
    });
    console.log(`  Appended ${mmColsToAdd} cols to Monthly Model (now ${mmColsNeeded})`);
  } else {
    console.log(`  Monthly Model already has ${mmCols} cols, no grow needed`);
  }

  // Generate 108 new date serials: Apr 2037 → Mar 2046
  const newDates = [];
  for (let m = 0; m < 108; m++) {
    // Apr 2037 is monthIdx 3 of year 2037. Advance m months.
    const serial = dateToSerial(2037, 3 + m, 1);
    newDates.push(serial);
  }
  console.log(`  First new date: ${newDates[0]} (expect ${dateToSerial(2037, 3, 1)} for Apr 2037)`);
  console.log(`  Last new date:  ${newDates[107]} (expect ${dateToSerial(2046, 2, 1)} for Mar 2046)`);

  // Write dates to row 1, cols ED:IG (cols 134:241)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${MM}'!ED1:IG1`,
    valueInputOption: 'RAW',
    requestBody: { values: [newDates] },
  });
  console.log(`  Wrote 108 date serials to ${MM}!ED1:IG1`);

  // Copy-paste formulas: source = col EC rows 2-37 (indices 1-36), dest = cols ED:IG same rows
  // This replicates the formulas with auto-adjusted relative refs.
  console.log('  Copy-pasting formulas from col EC into cols ED:IG (rows 2-37)...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          copyPaste: {
            source: {
              sheetId: mmSheetId,
              startRowIndex: 1, // row 2 (0-indexed)
              endRowIndex: 37, // row 37 inclusive = index 37 exclusive
              startColumnIndex: 132, // col EC (0-indexed 132 = col 133)
              endColumnIndex: 133, // exclusive = just col EC
            },
            destination: {
              sheetId: mmSheetId,
              startRowIndex: 1,
              endRowIndex: 37,
              startColumnIndex: 133, // col ED
              endColumnIndex: 241, // col IG + 1 exclusive
            },
            pasteType: 'PASTE_NORMAL',
            pasteOrientation: 'NORMAL',
          },
        },
      ],
    },
  });
  console.log('  Copy-paste complete');

  // ============================================================
  // PHASE 1C — Verify Monthly Model
  // ============================================================
  console.log('\n=== Phase 1C: Verify Monthly Model ===');
  const mmVerify = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      `'${MM}'!ED1:ED1`, // first new date
      `'${MM}'!IG1:IG1`, // last new date
      `'${MM}'!ED10:ED10`, // first new TOTAL GROSS INCOME
      `'${MM}'!IG10:IG10`, // last new TOTAL GROSS INCOME
      `'${MM}'!ED37:ED37`, // first new Closing Balance
      `'${MM}'!IG37:IG37`, // last new Closing Balance
      `'${MM}'!EC10:EC10`, // last existing TOTAL GROSS INCOME (for comparison)
      `'${MM}'!EC37:EC37`, // last existing Closing Balance (for comparison)
    ],
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const mmResults = {
    'ED1 (first new date, expect Apr 2037 = 46478)': mmVerify.data.valueRanges[0].values?.[0]?.[0],
    'IG1 (last new date, expect Mar 2046 = 53752)': mmVerify.data.valueRanges[1].values?.[0]?.[0],
    'ED10 (first new TOTAL GROSS INCOME)': mmVerify.data.valueRanges[2].values?.[0]?.[0],
    'IG10 (last new TOTAL GROSS INCOME)': mmVerify.data.valueRanges[3].values?.[0]?.[0],
    'ED37 (first new Closing Balance)': mmVerify.data.valueRanges[4].values?.[0]?.[0],
    'IG37 (last new Closing Balance)': mmVerify.data.valueRanges[5].values?.[0]?.[0],
    'EC10 (last existing TGI for compare)': mmVerify.data.valueRanges[6].values?.[0]?.[0],
    'EC37 (last existing Closing for compare)': mmVerify.data.valueRanges[7].values?.[0]?.[0],
  };
  console.log('  Monthly Model verification:');
  for (const [k, v] of Object.entries(mmResults)) console.log(`    ${k}: ${v}`);
  report.phases.monthlyModelVerify = mmResults;

  // Sanity checks
  const expectedFirstNewDate = dateToSerial(2037, 3, 1); // Apr 2037
  const expectedLastNewDate = dateToSerial(2046, 2, 1); // Mar 2046
  if (mmResults['ED1 (first new date, expect Apr 2037 = 46478)'] !== expectedFirstNewDate) {
    throw new Error(`First new date mismatch: expected ${expectedFirstNewDate}, got ${mmResults['ED1 (first new date, expect Apr 2037 = 46478)']}`);
  }
  if (mmResults['IG1 (last new date, expect Mar 2046 = 53752)'] !== expectedLastNewDate) {
    throw new Error(`Last new date mismatch: expected ${expectedLastNewDate}, got ${mmResults['IG1 (last new date, expect Mar 2046 = 53752)']}`);
  }
  const firstNewTgi = mmResults['ED10 (first new TOTAL GROSS INCOME)'];
  if (typeof firstNewTgi !== 'number' || firstNewTgi <= 0) {
    throw new Error(`ED10 (first new TGI) is not a positive number: ${firstNewTgi}`);
  }
  console.log('  Phase 1 verification PASSED');

  // ============================================================
  // PHASE 2A — Extend Summary grid
  // ============================================================
  console.log('\n=== Phase 2A: Extend Summary grid ===');
  const summColsNeeded = 81; // col CC (last quarterly cell)
  const summColsToAdd = summColsNeeded - summCols;
  if (summColsToAdd > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            appendDimension: {
              sheetId: summSheetId,
              dimension: 'COLUMNS',
              length: summColsToAdd,
            },
          },
        ],
      },
    });
    console.log(`  Appended ${summColsToAdd} cols to Summary (now ${summColsNeeded})`);
  } else {
    console.log(`  Summary already has ${summCols} cols, no grow needed`);
  }

  // ============================================================
  // PHASE 2B — Build new Summary headers and formulas
  // ============================================================
  console.log('\n=== Phase 2B: Construct Summary extension formulas ===');

  // Mapping: Summary metric row → Monthly Model source row
  const metricToMmRow = {
    gross: 10, // Total Gross Income
    tax: 19, // Total Tax
    netInc: 22, // Net Income
    outflows: 27, // Total Outflows
    cashFlow: 30, // Net Cash Flow
    portfolio: 37, // Closing Balance (period-end)
  };
  const annualRows = {
    3: 'gross',
    4: 'tax',
    5: 'netInc',
    6: 'outflows',
    7: 'cashFlow',
    8: 'portfolio',
  };
  const quarterlyRows = {
    12: 'gross',
    13: 'tax',
    14: 'netInc',
    15: 'outflows',
    16: 'cashFlow',
    17: 'portfolio',
  };

  // --- Build Annual extension (cols M:U = year 11..19, meaning fiscal 2037..2045) ---
  // Year n (0-indexed) in Monthly Model = cols (2 + 12n) : (13 + 12n), months (1 + 12n) : (12 + 12n)
  // Period-end year n = col (13 + 12n), last month of year n
  // Year 11 = cols 134:145 (ED:EO), period-end col 145 (EO)
  // Year 19 = cols 230:241 (HV:IG), period-end col 241 (IG)
  const annualYearHeaders = []; // cols M:U = 2037..2045
  for (let y = 11; y <= 19; y++) {
    annualYearHeaders.push(2026 + y); // fiscal year label
  }
  const annualFormulasByRow = {}; // {3: [9 formulas], 4: [9 formulas], ...}
  for (const [rowStr, metric] of Object.entries(annualRows)) {
    const mmRow = metricToMmRow[metric];
    const rowFormulas = [];
    for (let y = 11; y <= 19; y++) {
      if (metric === 'portfolio') {
        // Period-end: single col ref to last month of year y
        const lastColOfYear = col2letter(13 + 12 * y); // col 145 for y=11 (EO)
        rowFormulas.push(`='${MM}'!${lastColOfYear}${mmRow}`);
      } else {
        // SUM over 12 cols
        const startCol = col2letter(2 + 12 * y);
        const endCol = col2letter(13 + 12 * y);
        rowFormulas.push(`=SUM('${MM}'!${startCol}${mmRow}:${endCol}${mmRow})`);
      }
    }
    annualFormulasByRow[rowStr] = rowFormulas;
  }

  // --- Build Quarterly extension (cols AT:CC = quarter 44..79, meaning Q1 2037..Q4 2045) ---
  // Quarter n (0-indexed) in Monthly Model = cols (2 + 3n) : (4 + 3n), months (1 + 3n) : (3 + 3n)
  // Period-end quarter n = col (4 + 3n)
  // Quarter 44 (first new) = cols 134:136 (ED:EF), period-end 136 (EF)
  // Quarter 79 (last new) = cols 239:241 (HY:IG), period-end 241 (IG)
  const quarterlyHeaders = []; // cols AT:CC = Q1 2037..Q4 2045
  for (let q = 44; q <= 79; q++) {
    const yearOffset = Math.floor(q / 4);
    const qInYear = (q % 4) + 1;
    quarterlyHeaders.push(`Q${qInYear} ${2026 + yearOffset}`);
  }
  const quarterlyFormulasByRow = {};
  for (const [rowStr, metric] of Object.entries(quarterlyRows)) {
    const mmRow = metricToMmRow[metric];
    const rowFormulas = [];
    for (let q = 44; q <= 79; q++) {
      if (metric === 'portfolio') {
        const lastColOfQtr = col2letter(4 + 3 * q);
        rowFormulas.push(`='${MM}'!${lastColOfQtr}${mmRow}`);
      } else {
        const startCol = col2letter(2 + 3 * q);
        const endCol = col2letter(4 + 3 * q);
        rowFormulas.push(`=SUM('${MM}'!${startCol}${mmRow}:${endCol}${mmRow})`);
      }
    }
    quarterlyFormulasByRow[rowStr] = rowFormulas;
  }

  // Sanity: verify our y=10 pattern matches what's currently in L3 (last existing annual year)
  // L3 should be "=SUM('Monthly Model'!DR10:EC10)"
  // y=10: startCol=col2letter(122)=DR, endCol=col2letter(133)=EC. ✓
  // That proves our formula builder matches the existing pattern.
  console.log('  Built annual extension: 6 rows × 9 formulas = 54 cells');
  console.log('  Built quarterly extension: 6 rows × 36 formulas = 216 cells');
  console.log('  Sample new annual formulas (col M):');
  for (const [r, formulas] of Object.entries(annualFormulasByRow)) {
    console.log(`    row ${r}: ${formulas[0]}`);
  }
  console.log('  Sample new quarterly formulas (col AT):');
  for (const [r, formulas] of Object.entries(quarterlyFormulasByRow)) {
    console.log(`    row ${r}: ${formulas[0]}`);
  }

  // ============================================================
  // PHASE 2C — Write Summary extensions
  // ============================================================
  console.log('\n=== Phase 2C: Write Summary extensions ===');

  const data = [];

  // Annual year headers: row 2, cols M:U
  data.push({
    range: `'${SUMM}'!M2:U2`,
    values: [annualYearHeaders],
  });

  // Annual metric formulas: rows 3-8, cols M:U
  for (const [rowStr, formulas] of Object.entries(annualFormulasByRow)) {
    data.push({
      range: `'${SUMM}'!M${rowStr}:U${rowStr}`,
      values: [formulas],
    });
  }

  // Quarterly headers: row 11, cols AT:CC
  data.push({
    range: `'${SUMM}'!AT11:CC11`,
    values: [quarterlyHeaders],
  });

  // Quarterly metric formulas: rows 12-17, cols AT:CC
  for (const [rowStr, formulas] of Object.entries(quarterlyFormulasByRow)) {
    data.push({
      range: `'${SUMM}'!AT${rowStr}:CC${rowStr}`,
      values: [formulas],
    });
  }

  console.log(`  Sending ${data.length} ranges in one batch update...`);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
  console.log('  Summary extension write complete');

  // ============================================================
  // PHASE 2D — Verify Summary
  // ============================================================
  console.log('\n=== Phase 2D: Verify Summary ===');
  const summVerify = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      `'${SUMM}'!L3:L3`, // last existing annual (fiscal 2036 Gross Income) — compare
      `'${SUMM}'!M3:M3`, // first new annual (fiscal 2037 Gross Income)
      `'${SUMM}'!U3:U3`, // last new annual (fiscal 2045 Gross Income)
      `'${SUMM}'!M8:M8`, // first new annual Portfolio Value
      `'${SUMM}'!U8:U8`, // last new annual Portfolio Value
      `'${SUMM}'!AS12:AS12`, // last existing quarterly (Q4 2036 Gross Income) — compare
      `'${SUMM}'!AT12:AT12`, // first new quarterly (Q1 2037 Gross Income)
      `'${SUMM}'!CC12:CC12`, // last new quarterly (Q4 2045 Gross Income)
      `'${SUMM}'!M2:M2`, // annual header first new
      `'${SUMM}'!U2:U2`, // annual header last new
      `'${SUMM}'!AT11:AT11`, // quarterly header first new
      `'${SUMM}'!CC11:CC11`, // quarterly header last new
    ],
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const summResults = {
    'L3 (last existing 2036 annual TGI)': summVerify.data.valueRanges[0].values?.[0]?.[0],
    'M3 (first new 2037 annual TGI)': summVerify.data.valueRanges[1].values?.[0]?.[0],
    'U3 (last new 2045 annual TGI)': summVerify.data.valueRanges[2].values?.[0]?.[0],
    'M8 (first new 2037 Portfolio)': summVerify.data.valueRanges[3].values?.[0]?.[0],
    'U8 (last new 2045 Portfolio)': summVerify.data.valueRanges[4].values?.[0]?.[0],
    'AS12 (last existing Q4 2036 TGI)': summVerify.data.valueRanges[5].values?.[0]?.[0],
    'AT12 (first new Q1 2037 TGI)': summVerify.data.valueRanges[6].values?.[0]?.[0],
    'CC12 (last new Q4 2045 TGI)': summVerify.data.valueRanges[7].values?.[0]?.[0],
    'M2 (annual header)': summVerify.data.valueRanges[8].values?.[0]?.[0],
    'U2 (annual header)': summVerify.data.valueRanges[9].values?.[0]?.[0],
    'AT11 (quarterly header)': summVerify.data.valueRanges[10].values?.[0]?.[0],
    'CC11 (quarterly header)': summVerify.data.valueRanges[11].values?.[0]?.[0],
  };
  console.log('  Summary verification:');
  for (const [k, v] of Object.entries(summResults)) console.log(`    ${k}: ${v}`);
  report.phases.summaryVerify = summResults;

  // Sanity checks
  if (summResults['M2 (annual header)'] !== 2037) {
    throw new Error(`M2 should be 2037, got ${summResults['M2 (annual header)']}`);
  }
  if (summResults['U2 (annual header)'] !== 2045) {
    throw new Error(`U2 should be 2045, got ${summResults['U2 (annual header)']}`);
  }
  if (summResults['AT11 (quarterly header)'] !== 'Q1 2037') {
    throw new Error(`AT11 should be "Q1 2037", got ${summResults['AT11 (quarterly header)']}`);
  }
  if (summResults['CC11 (quarterly header)'] !== 'Q4 2045') {
    throw new Error(`CC11 should be "Q4 2045", got ${summResults['CC11 (quarterly header)']}`);
  }
  const newAnnualTgi = summResults['M3 (first new 2037 annual TGI)'];
  if (typeof newAnnualTgi !== 'number' || newAnnualTgi <= 0) {
    throw new Error(`M3 (first new 2037 annual TGI) is not a positive number: ${newAnnualTgi}`);
  }
  console.log('  Phase 2 verification PASSED');

  // ============================================================
  // Final report
  // ============================================================
  writeFileSync('/tmp/extension-report.json', JSON.stringify(report, null, 2));
  console.log('\n====================================');
  console.log('BOTH PHASES COMPLETE');
  console.log('====================================');
  console.log(`Backup tab: "${backupTitle}" (sheetId ${backupSheetId})`);
  console.log(`Monthly Model: extended to col IG (240 months, through Mar 2046)`);
  console.log(`Summary: extended Annual to col U (20 years) and Quarterly to col CC (80 quarters)`);
  console.log(`\nKey numbers for sanity check:`);
  console.log(`  Monthly Model last Closing Balance (IG37): ${mmResults['IG37 (last new Closing Balance)']}`);
  console.log(`  Summary last Annual Portfolio Value (U8): ${summResults['U8 (last new 2045 Portfolio)']}`);
  console.log(`  Summary last Quarterly TGI (CC12): ${summResults['CC12 (last new Q4 2045 TGI)']}`);
  console.log(`\nFull report: /tmp/extension-report.json`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
