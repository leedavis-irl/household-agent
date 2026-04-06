#!/usr/bin/env node
/**
 * Critical fixes batch:
 * 1. Remove savings double-count (Row 25 + Row 28)
 * 2. Add expense inflation (Inputs + Row 25)
 * 3. Fix YTD stock reset at January (Row 15 + Row 16)
 * 4. Add healthcare cost post-retirement (Inputs + Row 25)
 * 5. DJ to TK expense change (Inputs rows 132-134)
 * 6. Clean up orphan named ranges
 * 7. Add net worth to Assets tab
 * 8. Update retirement burn horizon
 */
import { getClient, ALL_GOOGLE_SCOPES } from '../src/utils/google-oauth.js';

const SHEET_ID = '193JJvxdWw_Y9k0oBAyDmku43OEkncj0T8DX8htVWVfo';

async function main() {
  const auth = await getClient('lee', ALL_GOOGLE_SCOPES);
  const { google } = await import('googleapis');
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title)),namedRanges',
  });
  const sheetByTitle = {};
  for (const s of meta.data.sheets) sheetByTitle[s.properties.title] = s.properties;
  const inputsSid = sheetByTitle['Inputs & Assumptions'].sheetId;
  const mmSid = sheetByTitle['Monthly Model'].sheetId;
  const assetsSid = sheetByTitle['Assets'].sheetId;
  const existingNames = new Map((meta.data.namedRanges || []).map(n => [n.name, n.namedRangeId]));

  const IA = "'Inputs & Assumptions'";

  // ============================================================
  // STEP 1: Add new Inputs fields
  // ============================================================
  console.log('Step 1: Add Inputs fields');

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        // Expense inflation (row 86 — currently blank, before SCHEDULED EXPENSE CHANGES)
        { range: `${IA}!B86:D86`, values: [['Expense Inflation Rate', 0.03, 'Applied annually to Monthly Burn. 3% is the long-run US average.']] },
        // Healthcare (row 209-211)
        { range: `${IA}!B209`, values: [['POST-RETIREMENT HEALTHCARE']] },
        { range: `${IA}!B210:D210`, values: [['Monthly Healthcare Cost (Steve + Lee)', 4000, 'ACA/private coverage after Steve leaves Meta. Applies from Steve retirement until Medicare eligibility.']] },
        { range: `${IA}!B211:D211`, values: [['Monthly Healthcare Cost (Kelly)', 1500, 'Applies when Hallie retires (Kelly loses Hallie employer coverage).']] },
        // DJ to TK (rows 132-134 — was "DJ to TK" placeholder)
        { range: `${IA}!B132:B134`, values: [['Change 12 — Description'], ['Change 12 — Monthly Delta'], ['Change 12 — Start Date YYYY-MM']] },
        { range: `${IA}!C132:C134`, values: [['DJ to TK (preschool ends)'], [-3000], ['=DATE(2030,9,1)']] },
        { range: `${IA}!D132`, values: [['Arbor was ~$3K/mo. Adjust if actual is different.']] },
        // Update retirement burn horizon to Steve's retirement year
        { range: `${IA}!C195`, values: [['=steve_retire_year-YEAR(TODAY())']] },
        { range: `${IA}!D195`, values: [['Auto-computed from Steve retirement year']] },
      ],
    },
  });

  // Create named ranges for new fields
  const newRanges = [
    { name: 'expense_inflation_rate', row: 85, col: 2 },  // C86
    { name: 'healthcare_monthly', row: 209, col: 2 },      // C210
    { name: 'healthcare_kelly_monthly', row: 210, col: 2 }, // C211
    { name: 'expense_change_12_delta', row: 132, col: 2 },  // C133
    { name: 'expense_change_12_start', row: 133, col: 2 },  // C134
  ];
  const addRequests = [];
  for (const nr of newRanges) {
    if (!existingNames.has(nr.name)) {
      addRequests.push({
        addNamedRange: {
          namedRange: {
            name: nr.name,
            range: { sheetId: inputsSid, startRowIndex: nr.row, endRowIndex: nr.row + 1, startColumnIndex: nr.col, endColumnIndex: nr.col + 1 },
          },
        },
      });
    }
  }
  if (addRequests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: addRequests },
    });
  }
  console.log('  Added inflation rate, healthcare costs, DJ to TK, updated retirement horizon');

  // ============================================================
  // STEP 2: Fix Monthly Model formulas
  // ============================================================
  console.log('\nStep 2: Fix Monthly Model formulas');

  // --- Row 25 (Monthly Burn): remove +monthly_savings, add inflation + healthcare ---
  // Read current formula to preserve the expense change chain
  const curB25 = (await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Monthly Model'!B25",
    valueRenderOption: 'FORMULA',
  })).data.values[0][0];

  // Remove +monthly_savings from the formula
  let newB25 = curB25.replace('+monthly_savings', '');

  // Add DJ to TK expense change (change 12)
  // Insert before the closing of the formula
  newB25 += '+IF(AND(expense_change_12_start<>"",B$1>=DATE(YEAR(expense_change_12_start),MONTH(expense_change_12_start),1)),expense_change_12_delta,0)';

  // Add healthcare costs
  newB25 += '+IF(B$1>=DATE(steve_retire_year,1,1),healthcare_monthly,0)';
  newB25 += '+IF(B$1>=DATE(hallie_retire_year,1,1),healthcare_kelly_monthly,0)';

  // Wrap entire expression with inflation compounding
  // The formula currently starts with "=" — strip it, wrap, re-add
  const innerB25 = newB25.slice(1); // remove leading =
  newB25 = '=(' + innerB25 + ')*(1+expense_inflation_rate)^MAX(0,YEAR(B$1)-YEAR(TODAY()))';

  // --- Row 28 (TOTAL OUTFLOWS): remove Row 27 from sum ---
  const newB28 = '=B25+B26';

  // --- Row 15 (YTD Stock): fix January reset ---
  // Replace SEARCH("Jan",C$2) with MONTH(C$1)=1
  const newC15 = '=IF(MONTH(C$1)=1, C4, B15+C4)';

  // --- Row 16 (Stock Withholding): fix ytd_prior January reset ---
  const curC16 = (await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Monthly Model'!C16",
    valueRenderOption: 'FORMULA',
  })).data.values[0][0];
  const newC16 = curC16.replace('IF(ISNUMBER(SEARCH("Jan",C$2)), 0, B15)', 'IF(MONTH(C$1)=1, 0, B15)');

  // Write all formulas to col B (or C for rows 15/16)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: "'Monthly Model'!B25", values: [[newB25]] },
        { range: "'Monthly Model'!B28", values: [[newB28]] },
        { range: "'Monthly Model'!C15", values: [[newC15]] },
        { range: "'Monthly Model'!C16", values: [[newC16]] },
      ],
    },
  });
  console.log('  Wrote fixed formulas to B25, B28, C15, C16');

  // Copy-paste across all columns
  const copyOps = [
    { row: 24, srcCol: 1, dstStart: 2, dstEnd: 241 },   // Row 25: B→C:IG
    { row: 27, srcCol: 1, dstStart: 2, dstEnd: 241 },   // Row 28: B→C:IG
    { row: 14, srcCol: 2, dstStart: 3, dstEnd: 241 },   // Row 15: C→D:IG
    { row: 15, srcCol: 2, dstStart: 3, dstEnd: 241 },   // Row 16: C→D:IG
  ];
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: copyOps.map(op => ({
        copyPaste: {
          source: { sheetId: mmSid, startRowIndex: op.row, endRowIndex: op.row + 1, startColumnIndex: op.srcCol, endColumnIndex: op.srcCol + 1 },
          destination: { sheetId: mmSid, startRowIndex: op.row, endRowIndex: op.row + 1, startColumnIndex: op.dstStart, endColumnIndex: op.dstEnd },
          pasteType: 'PASTE_NORMAL', pasteOrientation: 'NORMAL',
        },
      })),
    },
  });
  console.log('  Copy-pasted across all 240 columns');

  // ============================================================
  // STEP 3: Assets tab — add liabilities and net worth
  // ============================================================
  console.log('\nStep 3: Assets tab net worth');

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: "'Assets'!A28", values: [['LIABILITIES']] },
        { range: "'Assets'!A29:B29", values: [['Mortgage Balance', -2518071]] },
        { range: "'Assets'!A30:B30", values: [['Credit Card Balances', -14606]] },
        { range: "'Assets'!A31:B31", values: [['Total Liabilities', '=B29+B30']] },
        { range: "'Assets'!A33", values: [['NET WORTH']] },
        { range: "'Assets'!A34:B34", values: [['Household Net Worth', '=B21+B31']] },
        { range: "'Assets'!C29", values: [['Update periodically from Monarch']] },
      ],
    },
  });
  console.log('  Added liabilities + net worth section');

  // ============================================================
  // STEP 4: Clean up orphan named ranges
  // ============================================================
  console.log('\nStep 4: Clean up orphan named ranges');

  const orphans = ['active_scenario', 'adult_1_age', 'adult_1_retire_year', 'adult_2_age',
    'adult_2_retire_year', 'adult_3_age', 'adult_3_retire_year', 'adult_4_age',
    'adult_4_retire_year', 'drawdown_rate', 'scenario_names'];

  const deleteRequests = [];
  for (const name of orphans) {
    const id = existingNames.get(name);
    if (id) {
      deleteRequests.push({ deleteNamedRange: { namedRangeId: id } });
    }
  }
  if (deleteRequests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: deleteRequests },
    });
    console.log(`  Deleted ${deleteRequests.length} orphan named ranges`);
  }

  // ============================================================
  // STEP 5: Verify
  // ============================================================
  console.log('\nStep 5: Verify');

  const verify = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      "'Monthly Model'!B25",   // Monthly Burn month 1
      "'Monthly Model'!B28",   // Total Outflows month 1
      "'Monthly Model'!B31",   // Net Cash Flow month 1
      "'Monthly Model'!IG25",  // Monthly Burn month 240
      "'Monthly Model'!IG28",  // Total Outflows month 240
      "'Monthly Model'!IG31",  // Net Cash Flow month 240
      "'Monthly Model'!DO25",  // Monthly Burn at Steve retirement
      "'Monthly Model'!DO28",  // Total Outflows at Steve retirement
      "'Monthly Model'!B38",   // Closing Balance month 1
      "'Monthly Model'!IG38",  // Closing Balance month 240
      "'Assets'!B34",          // Net Worth
      "'Scenarios'!G5",        // Years to retirement
      `${IA}!C86`,             // Inflation rate
      `${IA}!C195`,            // Retirement horizon
      `${IA}!C210`,            // Healthcare monthly
    ],
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const v = verify.data.valueRanges;
  const fmt = (x) => typeof x === 'number' ? '$' + Math.round(x).toLocaleString() : x;

  console.log('Monthly Burn:');
  console.log('  Month 1 (Apr 2026): ' + fmt(v[0].values?.[0]?.[0]));
  console.log('  Month 240 (Mar 2046): ' + fmt(v[3].values?.[0]?.[0]) + ' (should be higher than month 1 due to inflation)');
  console.log('  Steve retirement: ' + fmt(v[6].values?.[0]?.[0]) + ' (should include healthcare)');
  console.log('Total Outflows:');
  console.log('  Month 1: ' + fmt(v[1].values?.[0]?.[0]) + ' (should be ~$8.4K less than before — no double-count)');
  console.log('  Month 240: ' + fmt(v[4].values?.[0]?.[0]));
  console.log('Net Cash Flow:');
  console.log('  Month 1: ' + fmt(v[2].values?.[0]?.[0]) + ' (should be ~$8.4K more than before)');
  console.log('  Month 240: ' + fmt(v[5].values?.[0]?.[0]));
  console.log('Closing Balance:');
  console.log('  Month 1: ' + fmt(v[8].values?.[0]?.[0]));
  console.log('  Month 240: ' + fmt(v[9].values?.[0]?.[0]));
  console.log('Assets:');
  console.log('  Net Worth: ' + fmt(v[10].values?.[0]?.[0]));
  console.log('Scenarios:');
  console.log('  Years to retirement: ' + v[11].values?.[0]?.[0]);
  console.log('Inputs:');
  console.log('  Inflation rate: ' + v[12].values?.[0]?.[0]);
  console.log('  Retirement horizon: ' + fmt(v[13].values?.[0]?.[0]) + ' years');
  console.log('  Healthcare monthly: ' + fmt(v[14].values?.[0]?.[0]));

  console.log('\n=== ALL FIXES COMPLETE ===');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
