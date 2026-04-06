#!/usr/bin/env node
/**
 * Three fixes:
 * 1. Replace static NPER retirement calc with dynamic MATCH on Closing Balance row
 * 2. Exclude 529 accounts from retirement portfolio via retirement_portfolio named range
 * 3. Refactor Hallie RSU row 6 to remove broken active_scenario dependency
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
  const scenSid = sheetByTitle['Scenarios'].sheetId;
  const existingNames = new Set((meta.data.namedRanges || []).map(n => n.name));

  const IA = "'Inputs & Assumptions'";

  // ============================================================
  // FIX 3: Refactor Hallie RSU row 6 — remove active_scenario
  // ============================================================
  console.log('=== Fix 3: Refactor Hallie RSU (row 6) ===');

  // New formula: uses personb_rsu_preferred directly instead of IFS(active_scenario...)
  const hallieRSU = `=LET(ct,'Scenarios'!$A$22,mon,B$1,liq_date,personb_rsu_liquidity_date,post_ipo,hallie_post_ipo,ipo_yr,hallie_ipo_year,is_ipo_month,AND(liq_date<>"",MONTH(mon)=MONTH(liq_date),YEAR(mon)=YEAR(liq_date)),ipo_value,IF(is_ipo_month,personb_rsu_shares*personb_rsu_preferred,0),post_ipo_rsu,IF(AND(ct,post_ipo="Stays at Vanta",ipo_yr<>"",mon>DATE(ipo_yr,12,31)),LET(dir_yr,hallie_dir_promo_year,vp_yr,hallie_vp_promo_year,use_vp,AND(vp_yr<>"",mon>=DATE(vp_yr,4,1)),use_dir,AND(dir_yr<>"",mon>=DATE(dir_yr,4,1)),grant4,IF(use_vp,hallie_vp_rsu_4yr,IF(use_dir,hallie_dir_rsu_4yr,0)),grant4/48),0),ipo_value+post_ipo_rsu)`;

  // Write to col B then copy-paste
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "'Monthly Model'!B6",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[hallieRSU]] },
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        copyPaste: {
          source: { sheetId: mmSid, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 },
          destination: { sheetId: mmSid, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 2, endColumnIndex: 241 },
          pasteType: 'PASTE_NORMAL', pasteOrientation: 'NORMAL',
        },
      }],
    },
  });
  console.log('  Row 6 refactored — uses personb_rsu_preferred directly');

  // Verify the IPO month is no longer #REF
  const rsuCheck = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      "'Monthly Model'!BV6",   // IPO month (Apr 2032) — was #REF
      "'Monthly Model'!BV10",  // Total Gross Income — was #REF
      "'Monthly Model'!BV38",  // Closing Balance — was #REF
      "'Monthly Model'!BW6",   // month after IPO
    ],
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const rv = rsuCheck.data.valueRanges;
  console.log('  BV6  (IPO month): ' + rv[0].values?.[0]?.[0] + (String(rv[0].values?.[0]?.[0]).includes('REF') ? ' *** STILL BROKEN' : ' ✓'));
  console.log('  BV10 (Total Income): ' + rv[1].values?.[0]?.[0] + (String(rv[1].values?.[0]?.[0]).includes('REF') ? ' *** STILL BROKEN' : ' ✓'));
  console.log('  BV38 (Closing Bal): ' + rv[2].values?.[0]?.[0] + (String(rv[2].values?.[0]?.[0]).includes('REF') ? ' *** STILL BROKEN' : ' ✓'));
  console.log('  BW6  (month after): ' + rv[3].values?.[0]?.[0]);

  // ============================================================
  // FIX 2: Exclude 529 from retirement portfolio
  // ============================================================
  console.log('\n=== Fix 2: Create retirement_portfolio (excluding 529s) ===');

  // Add 529 balance field to Inputs & Assumptions
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${IA}!B196:D196`, values: [['529 Accounts Balance (excluded from retirement)', 516371, 'From Monarch brokerage accounts — update periodically']] },
        { range: `${IA}!B197:D197`, values: [['Retirement Portfolio', '=portfolio_value-C196', 'Portfolio value minus education savings']] },
      ],
    },
  });

  // Create named ranges
  const newRanges = [];
  if (!existingNames.has('education_529_balance')) {
    newRanges.push({
      addNamedRange: {
        namedRange: {
          name: 'education_529_balance',
          range: { sheetId: inputsSid, startRowIndex: 195, endRowIndex: 196, startColumnIndex: 2, endColumnIndex: 3 },
        },
      },
    });
  }
  if (!existingNames.has('retirement_portfolio')) {
    newRanges.push({
      addNamedRange: {
        namedRange: {
          name: 'retirement_portfolio',
          range: { sheetId: inputsSid, startRowIndex: 196, endRowIndex: 197, startColumnIndex: 2, endColumnIndex: 3 },
        },
      },
    });
  }
  if (newRanges.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: newRanges },
    });
  }
  console.log('  Added 529 balance ($516,371) and retirement_portfolio named range');

  // ============================================================
  // FIX 1: Dynamic retirement via MATCH on Closing Balance
  // ============================================================
  console.log('\n=== Fix 1: Dynamic retirement calculation ===');

  // Replace helper cells and summary bar formulas in Scenarios tab
  // P3 (baseline NPER): replace with MATCH on Closing Balance row
  // The Closing Balance is row 38, cols B:IG.
  // Retirement target is in N3.
  // MATCH(TRUE, row>=target, 0) returns the first month where portfolio crosses the target.
  //
  // But we need to use retirement_portfolio instead of portfolio_value for the starting point.
  // The Monthly Model's Closing Balance ALREADY uses portfolio_value as the seed.
  // To adjust for 529 exclusion, we subtract the 529 from the Closing Balance in the comparison.
  // Adjusted comparison: Closing Balance - 529 >= target
  //
  // Formula: =IFERROR(MATCH(TRUE, ARRAYFORMULA('Monthly Model'!B38:IG38 - education_529_balance >= N3), 0) / 12, "25+")

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        // P3: baseline months to retirement (dynamic walk of Closing Balance)
        {
          range: "'Scenarios'!P3",
          values: [[`=IFERROR(MATCH(TRUE,ARRAYFORMULA('Monthly Model'!B38:IG38-education_529_balance>=$N$3),0),"N/A")`]],
        },
        // G5: baseline retirement years (now from dynamic MATCH)
        {
          range: "'Scenarios'!G5",
          values: [[`=IFERROR($P$3/12,"25+")`]],
        },
        // H5: adjusted retirement years — add scenario one-time impacts to portfolio, monthly to surplus
        // Walk Closing Balance adjusted for one-time scenario impacts and 529 exclusion
        // Simplified: use MATCH but adjust the target by subtracting one-time scenario impacts
        // (one-time impacts increase portfolio → lower effective target)
        {
          range: "'Scenarios'!H5",
          values: [[`=IFERROR(MATCH(TRUE,ARRAYFORMULA('Monthly Model'!B38:IG38-education_529_balance+SUM(K9:K33)>=$N$3),0)/12,"25+")`]],
        },
        // I5: delta
        {
          range: "'Scenarios'!I5",
          values: [[`=IFERROR(H5-G5,"")`]],
        },
        // O3: keep surplus reference (used by per-row NPER calcs in scenarios)
        // Update per-row retirement calcs to also use retirement_portfolio
        // Per-row J column formulas use portfolio_value — update to retirement_portfolio
      ],
    },
  });
  console.log('  Summary bar now uses dynamic MATCH on Monthly Model Closing Balance');
  console.log('  529 accounts ($516K) excluded from retirement comparison');

  // Update per-row J formulas in Scenarios to use retirement_portfolio
  // Read current J formulas to understand which rows need updating
  const jResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Scenarios'!J9:J33",
    valueRenderOption: 'FORMULA',
  });
  const jRows = jResp.data.values || [];
  const updatedJ = [];
  for (let i = 0; i < jRows.length; i++) {
    const f = jRows[i]?.[0] || '';
    if (f && f.includes('portfolio_value')) {
      // Replace portfolio_value with retirement_portfolio
      updatedJ.push({
        range: `'Scenarios'!J${9 + i}`,
        values: [[f.replace(/portfolio_value/g, 'retirement_portfolio')]],
      });
    }
  }
  if (updatedJ.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updatedJ },
    });
    console.log(`  Updated ${updatedJ.length} per-row retirement formulas to use retirement_portfolio`);
  }

  // ============================================================
  // VERIFY
  // ============================================================
  console.log('\n=== Verify ===');

  // Check Closing Balance trajectory is now clean
  const balCheck = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      "'Monthly Model'!BU38",  // month 72 (before IPO)
      "'Monthly Model'!BV38",  // month 73 (IPO month — was #REF)
      "'Monthly Model'!BW38",  // month 74 (after IPO)
      "'Monthly Model'!EC38",  // month 132
      "'Monthly Model'!IG38",  // month 240
    ],
    valueRenderOption: 'FORMATTED_VALUE',
  });
  console.log('Closing Balance trajectory:');
  const balLabels = ['BU38 (month 72)', 'BV38 (month 73, IPO)', 'BW38 (month 74)', 'EC38 (month 132)', 'IG38 (month 240)'];
  for (let i = 0; i < 5; i++) {
    const v = balCheck.data.valueRanges[i].values?.[0]?.[0];
    console.log('  ' + balLabels[i] + ': ' + v + (String(v).includes('REF') ? ' *** STILL BROKEN' : ' ✓'));
  }

  // Check retirement calculations
  const retCheck = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      `${IA}!C196`,            // 529 balance
      `${IA}!C197`,            // retirement portfolio
      "'Scenarios'!N3",        // retirement target
      "'Scenarios'!P3",        // baseline months (now MATCH result)
      "'Scenarios'!G5",        // baseline years
      "'Scenarios'!H5",        // adjusted years
      "'Scenarios'!I5",        // delta
    ],
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const rc = retCheck.data.valueRanges;
  console.log('\nRetirement calculation:');
  console.log('  529 balance: ' + rc[0].values?.[0]?.[0]);
  console.log('  retirement_portfolio: ' + rc[1].values?.[0]?.[0]);
  console.log('  retirement target: ' + rc[2].values?.[0]?.[0]);
  console.log('  baseline months (MATCH): ' + rc[3].values?.[0]?.[0]);
  console.log('  baseline years: ' + rc[4].values?.[0]?.[0]);
  console.log('  adjusted years: ' + rc[5].values?.[0]?.[0]);
  console.log('  delta: ' + rc[6].values?.[0]?.[0]);

  // Check Row 6 at IPO month
  const row6Check = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      "'Monthly Model'!BV6",   // IPO month value
      "'Monthly Model'!BW6",   // month after
    ],
    valueRenderOption: 'FORMATTED_VALUE',
  });
  console.log('\nHallie RSU Event:');
  console.log('  BV6 (IPO month, Apr 2032): ' + row6Check.data.valueRanges[0].values?.[0]?.[0]);
  console.log('  BW6 (month after): ' + row6Check.data.valueRanges[1].values?.[0]?.[0]);

  console.log('\n=== ALL FIXES COMPLETE ===');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
