#!/usr/bin/env node
/**
 * Add kid lifecycle expense reductions to the Avalon Financial Model.
 *
 * 1. Writes a CHILDREN section to Inputs & Assumptions (rows 146+)
 *    with DOBs, milestone dates, and configurable reduction amounts.
 * 2. Creates named ranges for all new cells.
 * 3. Inserts a new row in Monthly Model (row 26) for "Kid Lifecycle Reductions".
 * 4. Writes the reduction formula across all 240 columns.
 * 5. Fixes TOTAL OUTFLOWS to include the new row.
 * 6. Verifies.
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
  if (!auth) throw new Error('No OAuth token for lee');
  const { google } = await import('googleapis');
  const sheets = google.sheets({ version: 'v4', auth });

  // Get sheet IDs
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title,gridProperties)),namedRanges',
  });
  const sheetByTitle = {};
  for (const s of meta.data.sheets) sheetByTitle[s.properties.title] = s.properties;
  const inputsSid = sheetByTitle['Inputs & Assumptions'].sheetId;
  const mmSid = sheetByTitle['Monthly Model'].sheetId;

  // ============================================================
  // STEP 1: Write CHILDREN section to Inputs & Assumptions
  // ============================================================
  console.log('=== Step 1: Write CHILDREN section to Inputs & Assumptions ===');

  const inputsData = [
    { range: "'Inputs & Assumptions'!B147", values: [['CHILDREN — LIFECYCLE REDUCTIONS']] },
    { range: "'Inputs & Assumptions'!B148", values: [['Models step-down in expenses as kids age out. Babysitting ends when the youngest turns 13. Kid-specific costs drop at 18 (leaves home). Shared household costs decrease with a shrinking per-person denominator. Additional reduction at 25 (fully independent).']] },
    { range: "'Inputs & Assumptions'!B150:E150", values: [['Name', 'Date of Birth', 'Leaves Home (18)', 'Fully Independent (25)']] },
    { range: "'Inputs & Assumptions'!B151:E151", values: [['Ryker', '10/1/2014', '=DATE(YEAR(C151)+18,MONTH(C151),DAY(C151))', '=DATE(YEAR(C151)+25,MONTH(C151),DAY(C151))']] },
    { range: "'Inputs & Assumptions'!B152:E152", values: [['Logan', '8/28/2016', '=DATE(YEAR(C152)+18,MONTH(C152),DAY(C152))', '=DATE(YEAR(C152)+25,MONTH(C152),DAY(C152))']] },
    { range: "'Inputs & Assumptions'!B153:E153", values: [['Hazel', '4/30/2021', '=DATE(YEAR(C153)+18,MONTH(C153),DAY(C153))', '=DATE(YEAR(C153)+25,MONTH(C153),DAY(C153))']] },
    { range: "'Inputs & Assumptions'!B154:E154", values: [['DJ', '7/21/2025', '=DATE(YEAR(C154)+18,MONTH(C154),DAY(C154))', '=DATE(YEAR(C154)+25,MONTH(C154),DAY(C154))']] },
    { range: "'Inputs & Assumptions'!B156:C156", values: [['Household Size (total people)', 9]] },
    { range: "'Inputs & Assumptions'!B157:C157", values: [['Kid-Specific Reduction at 18 (per child/mo)', 1880]] },
    { range: "'Inputs & Assumptions'!B158:C158", values: [['Shared Household Monthly Base', 21081]] },
    { range: "'Inputs & Assumptions'!B159:C159", values: [['Additional Reduction at 25 (per child/mo)', 500]] },
    { range: "'Inputs & Assumptions'!B161:D161", values: [['Babysitting Ends', '=DATE(YEAR(C154)+13,MONTH(C154),DAY(C154))', 'When youngest (DJ) turns 13']] },
    { range: "'Inputs & Assumptions'!B162:C162", values: [['Monthly Babysitting Reduction', 5616]] },
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: inputsData },
  });
  console.log('  Wrote CHILDREN section (rows 147-162)');

  // ============================================================
  // STEP 2: Create named ranges
  // ============================================================
  console.log('=== Step 2: Create named ranges ===');

  // Check for existing named ranges to avoid duplicates
  const existingNames = new Set((meta.data.namedRanges || []).map(n => n.name));

  const namedRanges = [
    { name: 'household_size', row: 155, col: 2 },       // C156 (0-indexed row 155)
    { name: 'kid_reduction_18', row: 156, col: 2 },     // C157
    { name: 'shared_household_base', row: 157, col: 2 }, // C158
    { name: 'kid_additional_25', row: 158, col: 2 },     // C159
    { name: 'babysitting_end_date', row: 160, col: 2 },  // C161
    { name: 'babysitting_reduction', row: 161, col: 2 }, // C162
    { name: 'ryker_leaves', row: 150, col: 3 },          // D151
    { name: 'logan_leaves', row: 151, col: 3 },          // D152
    { name: 'hazel_leaves', row: 152, col: 3 },          // D153
    { name: 'dj_leaves', row: 153, col: 3 },             // D154
    { name: 'ryker_independent', row: 150, col: 4 },     // E151
    { name: 'logan_independent', row: 151, col: 4 },     // E152
    { name: 'hazel_independent', row: 152, col: 4 },     // E153
    { name: 'dj_independent', row: 153, col: 4 },        // E154
  ];

  const requests = [];
  for (const nr of namedRanges) {
    if (existingNames.has(nr.name)) {
      console.log(`  Skipping "${nr.name}" — already exists`);
      continue;
    }
    requests.push({
      addNamedRange: {
        namedRange: {
          name: nr.name,
          range: {
            sheetId: inputsSid,
            startRowIndex: nr.row,
            endRowIndex: nr.row + 1,
            startColumnIndex: nr.col,
            endColumnIndex: nr.col + 1,
          },
        },
      },
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });
    console.log(`  Created ${requests.length} named ranges`);
  }

  // ============================================================
  // STEP 3: Insert row 26 in Monthly Model
  // ============================================================
  console.log('=== Step 3: Insert row in Monthly Model ===');

  // Insert at row index 25 (= row 26 in human terms, between Monthly Burn row 25 and Planned Savings row 26)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        insertDimension: {
          range: {
            sheetId: mmSid,
            dimension: 'ROWS',
            startIndex: 25, // 0-indexed = row 26
            endIndex: 26,   // insert 1 row
          },
          inheritFromBefore: false,
        },
      }],
    },
  });
  console.log('  Inserted new row 26 in Monthly Model');
  // After insert:
  //   Row 25: Monthly Burn (unchanged)
  //   Row 26: (empty — our new row)
  //   Row 27: Planned Savings (was 26)
  //   Row 28: TOTAL OUTFLOWS (was 27, formula auto-shifted from =B25+B26 to =B25+B27)

  // ============================================================
  // STEP 4: Write Kid Lifecycle Reduction formula to row 26
  // ============================================================
  console.log('=== Step 4: Write Kid Lifecycle Reduction formulas ===');

  // The formula (negative = reduces outflows):
  // = -1 * (
  //   babysitting: babysitting_reduction * IF(date >= babysitting_end_date)
  //   + kid-specific at 18: kid_reduction_18 * count_of_kids_turned_18
  //   + additional at 25: kid_additional_25 * count_of_kids_turned_25
  //   + shared shrinking denominator: shared_base * (1/9 + 1/8 + 1/7 + 1/6 for each kid who left)
  // )
  function buildFormula(colLetter) {
    const d = `${colLetter}$1`; // date ref
    return `=-1*(` +
      `babysitting_reduction*IF(${d}>=babysitting_end_date,1,0)` +
      `+kid_reduction_18*(IF(${d}>=ryker_leaves,1,0)+IF(${d}>=logan_leaves,1,0)+IF(${d}>=hazel_leaves,1,0)+IF(${d}>=dj_leaves,1,0))` +
      `+kid_additional_25*(IF(${d}>=ryker_independent,1,0)+IF(${d}>=logan_independent,1,0)+IF(${d}>=hazel_independent,1,0)+IF(${d}>=dj_independent,1,0))` +
      `+shared_household_base*(` +
        `IF(${d}>=ryker_leaves,1/household_size,0)` +
        `+IF(${d}>=logan_leaves,1/(household_size-1),0)` +
        `+IF(${d}>=hazel_leaves,1/(household_size-2),0)` +
        `+IF(${d}>=dj_leaves,1/(household_size-3),0)` +
      `)` +
    `)`;
  }

  // Write label
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "'Monthly Model'!A26",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['Kid Lifecycle Reductions']] },
  });

  // Write formula to col B first
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "'Monthly Model'!B26",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[buildFormula('B')]] },
  });
  console.log('  Wrote formula to B26');

  // Copy-paste B26 across C26:IG26 (cols 2→240)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        copyPaste: {
          source: {
            sheetId: mmSid,
            startRowIndex: 25,   // row 26 (0-indexed)
            endRowIndex: 26,
            startColumnIndex: 1, // col B
            endColumnIndex: 2,
          },
          destination: {
            sheetId: mmSid,
            startRowIndex: 25,
            endRowIndex: 26,
            startColumnIndex: 2,  // col C
            endColumnIndex: 241,  // col IG
          },
          pasteType: 'PASTE_NORMAL',
          pasteOrientation: 'NORMAL',
        },
      }],
    },
  });
  console.log('  Copy-pasted formula across C26:IG26 (239 columns)');

  // ============================================================
  // STEP 5: Fix TOTAL OUTFLOWS to include new row
  // ============================================================
  console.log('=== Step 5: Fix TOTAL OUTFLOWS (now row 28) ===');

  // After insert, row 28 = TOTAL OUTFLOWS with formula =B25+B27 (auto-shifted).
  // Need to change to =B25+B26+B27 across all 240 data columns.
  // Write formula to B28, then copyPaste to C:IG.
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "'Monthly Model'!B28",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['=B25+B26+B27']] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        copyPaste: {
          source: {
            sheetId: mmSid,
            startRowIndex: 27,
            endRowIndex: 28,
            startColumnIndex: 1,
            endColumnIndex: 2,
          },
          destination: {
            sheetId: mmSid,
            startRowIndex: 27,
            endRowIndex: 28,
            startColumnIndex: 2,
            endColumnIndex: 241,
          },
          pasteType: 'PASTE_NORMAL',
          pasteOrientation: 'NORMAL',
        },
      }],
    },
  });
  console.log('  Fixed TOTAL OUTFLOWS formula across all 240 columns');

  // ============================================================
  // STEP 6: Verify
  // ============================================================
  console.log('\n=== Step 6: Verify ===');

  // Read Inputs milestone dates
  const inputsVerify = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Inputs & Assumptions'!B150:E154",
    valueRenderOption: 'FORMATTED_VALUE',
  });
  console.log('  Inputs — Children:');
  for (const row of inputsVerify.data.values || []) {
    console.log('    ' + row.join(' | '));
  }

  const inputsParams = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Inputs & Assumptions'!B156:C162",
    valueRenderOption: 'FORMATTED_VALUE',
  });
  console.log('  Inputs — Parameters:');
  for (const row of inputsParams.data.values || []) {
    if (row.some(c => c)) console.log('    ' + row.join(' | '));
  }

  // Read Monthly Model key cells
  const mmVerify = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      "'Monthly Model'!A25:A32",        // Row labels after insert
      "'Monthly Model'!B26",             // Kid reduction month 1 (Apr 2026 — no kids have left yet)
      "'Monthly Model'!EC26",            // Kid reduction month 132 (Mar 2037 — Ryker ~22, Logan ~20)
      "'Monthly Model'!IG26",            // Kid reduction month 240 (Mar 2046 — all kids 20+)
      "'Monthly Model'!B28",             // TOTAL OUTFLOWS month 1
      "'Monthly Model'!IG28",            // TOTAL OUTFLOWS month 240
      "'Monthly Model'!B31",             // Net Cash Flow month 1 (was row 30, now 31)
      "'Monthly Model'!IG31",            // Net Cash Flow month 240
    ],
    valueRenderOption: 'FORMATTED_VALUE',
  });

  console.log('\n  Monthly Model — Row labels (25-32):');
  (mmVerify.data.valueRanges[0].values || []).forEach((r, i) => console.log('    row ' + (25+i) + ': ' + r[0]));

  console.log('\n  Monthly Model — Kid Lifecycle Reduction:');
  console.log('    B26 (Apr 2026):  ' + mmVerify.data.valueRanges[1].values?.[0]?.[0]);
  console.log('    EC26 (Mar 2037): ' + mmVerify.data.valueRanges[2].values?.[0]?.[0]);
  console.log('    IG26 (Mar 2046): ' + mmVerify.data.valueRanges[3].values?.[0]?.[0]);

  console.log('\n  Monthly Model — Total Outflows:');
  console.log('    B28 (Apr 2026):  ' + mmVerify.data.valueRanges[4].values?.[0]?.[0]);
  console.log('    IG28 (Mar 2046): ' + mmVerify.data.valueRanges[5].values?.[0]?.[0]);

  console.log('\n  Monthly Model — Net Cash Flow:');
  console.log('    B31 (Apr 2026):  ' + mmVerify.data.valueRanges[6].values?.[0]?.[0]);
  console.log('    IG31 (Mar 2046): ' + mmVerify.data.valueRanges[7].values?.[0]?.[0]);

  console.log('\n=== COMPLETE ===');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
