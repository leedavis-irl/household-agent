#!/usr/bin/env node
/**
 * Add career trajectory models for Steve and Hallie, plus retirement burn assumption.
 * Modifies Inputs & Assumptions, Monthly Model, and Scenarios tabs.
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
  // PHASE 1: Write career trajectory sections to Inputs & Assumptions
  // ============================================================
  console.log('=== Phase 1: Career trajectory sections in Inputs & Assumptions ===');

  const inputsData = [
    // STEVE CAREER TRAJECTORY (rows 165-174)
    { range: `${IA}!B165`, values: [['STEVE — CAREER TRAJECTORY']] },
    { range: `${IA}!B166`, values: [['Promotion timeline for the Monthly Model. Activated by the Steve Career toggle in the Scenarios tab. Raise rate from row 10 applies at each level.']] },
    { range: `${IA}!B168:D168`, values: [['Senior Director Promotion Year', 2030, '=IF(C168="","",DATE(C168,3,1))']] },
    { range: `${IA}!B169:C169`, values: [['Senior Director Annual Base ($)', 420000]] },
    { range: `${IA}!B170:C170`, values: [['Senior Director RSU Grant (4yr $)', 2500000]] },
    { range: `${IA}!B172:D172`, values: [['VP Promotion Year (blank = not modeling)', '', '=IF(C172="","",DATE(C172,3,1))']] },
    { range: `${IA}!B173:C173`, values: [['VP Annual Base ($)', 500000]] },
    { range: `${IA}!B174:C174`, values: [['VP RSU Grant (4yr $)', 5000000]] },

    // HALLIE CAREER TRAJECTORY (rows 177-189)
    { range: `${IA}!B177`, values: [['HALLIE — CAREER TRAJECTORY']] },
    { range: `${IA}!B178`, values: [['Promotion timeline for the Monthly Model. Activated by the Hallie Career toggle in the Scenarios tab. Raise rate from row 46 applies at each level.']] },
    { range: `${IA}!B180:D180`, values: [['Director Promotion Year', 2029, '=IF(C180="","",DATE(C180,4,1))']] },
    { range: `${IA}!B181:C181`, values: [['Director Annual Base ($)', 300000]] },
    { range: `${IA}!B182:C182`, values: [['Director RSU Grant (4yr $)', 1600000]] },
    { range: `${IA}!B184:D184`, values: [['VP Promotion Year (blank = not modeling)', '', '=IF(C184="","",DATE(C184,4,1))']] },
    { range: `${IA}!B185:C185`, values: [['VP Annual Base ($)', 375000]] },
    { range: `${IA}!B186:C186`, values: [['VP RSU Grant (4yr $)', 2400000]] },
    { range: `${IA}!B188:D188`, values: [['Vanta IPO Year', 2032, 'Existing liquidity date in row 52 is used for the one-time event']] },
    { range: `${IA}!B189:D189`, values: [['Post-IPO Employment', 'Unknown', 'Post-IPO trajectory is speculative — revisit when IPO approaches.']] },

    // RETIREMENT ASSUMPTIONS (rows 192-194)
    { range: `${IA}!B192`, values: [['RETIREMENT ASSUMPTIONS']] },
    { range: `${IA}!B193:D193`, values: [['Retirement Monthly Burn', '=INDEX(\'Monthly Model\'!B28:IG28,1,C194*12)', 'Locked for modeling — revisit annually.']] },
    { range: `${IA}!B194:D194`, values: [['Years to Retirement (for burn projection)', 15, 'Projected outflows at this year, net of kid reductions']] },
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: inputsData },
  });
  console.log('  Wrote career trajectory + retirement sections');

  // Create named ranges
  const newRanges = [
    // Steve
    { name: 'steve_sd_promo_year', row: 167, col: 2 },  // C168
    { name: 'steve_sd_base', row: 168, col: 2 },         // C169
    { name: 'steve_sd_rsu_4yr', row: 169, col: 2 },      // C170
    { name: 'steve_vp_promo_year', row: 171, col: 2 },   // C172
    { name: 'steve_vp_base', row: 172, col: 2 },          // C173
    { name: 'steve_vp_rsu_4yr', row: 173, col: 2 },       // C174
    // Hallie
    { name: 'hallie_dir_promo_year', row: 179, col: 2 }, // C180
    { name: 'hallie_dir_base', row: 180, col: 2 },        // C181
    { name: 'hallie_dir_rsu_4yr', row: 181, col: 2 },     // C182
    { name: 'hallie_vp_promo_year', row: 183, col: 2 },  // C184
    { name: 'hallie_vp_base', row: 184, col: 2 },         // C185
    { name: 'hallie_vp_rsu_4yr', row: 185, col: 2 },      // C186
    { name: 'hallie_ipo_year', row: 187, col: 2 },        // C188
    { name: 'hallie_post_ipo', row: 188, col: 2 },        // C189
    // Retirement
    { name: 'retirement_monthly_burn', row: 192, col: 2 }, // C193
    { name: 'retirement_horizon_years', row: 193, col: 2 }, // C194
  ];

  const rangeRequests = [];
  for (const nr of newRanges) {
    if (existingNames.has(nr.name)) {
      console.log(`  Skipping "${nr.name}" — exists`);
      continue;
    }
    rangeRequests.push({
      addNamedRange: {
        namedRange: {
          name: nr.name,
          range: { sheetId: inputsSid, startRowIndex: nr.row, endRowIndex: nr.row + 1, startColumnIndex: nr.col, endColumnIndex: nr.col + 1 },
        },
      },
    });
  }

  // Add dropdown for Post-IPO Employment
  rangeRequests.push({
    setDataValidation: {
      range: { sheetId: inputsSid, startRowIndex: 188, endRowIndex: 189, startColumnIndex: 2, endColumnIndex: 3 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: ['Stays at Vanta', 'Leaves Vanta', 'Unknown'].map(v => ({ userEnteredValue: v })) },
        strict: true, showCustomUi: true,
      },
    },
  });

  if (rangeRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: rangeRequests },
    });
    console.log(`  Created ${rangeRequests.length - 1} named ranges + 1 dropdown`);
  }

  // ============================================================
  // PHASE 2: Update Monthly Model formulas
  // ============================================================
  console.log('\n=== Phase 2: Update Monthly Model formulas ===');

  // --- Row 3: Steve W-2 Salary ---
  const steveW2 = `=LET(ct,'Scenarios'!$A$20,mon,B$1,r,${IA}!$C$10,cur,${IA}!$C$8,sd_yr,steve_sd_promo_year,vp_yr,steve_vp_promo_year,use_vp,AND(ct,vp_yr<>"",mon>=DATE(vp_yr,3,1)),use_sd,AND(ct,sd_yr<>"",mon>=DATE(sd_yr,3,1),NOT(use_vp)),base,IF(use_vp,steve_vp_base/12,IF(use_sd,steve_sd_base/12,cur)),ref_yr,IF(use_vp,vp_yr,IF(use_sd,sd_yr,YEAR(TODAY()))),ref_mo,IF(OR(use_vp,use_sd),1,IF(MONTH(TODAY())>=3,1,0)),n,MAX(0,YEAR(mon)-ref_yr+(MONTH(mon)>=3)-ref_mo),base*(1+r)^n)`;

  // --- Row 4: Steve Stock Vesting ---
  // Modify only the reup section: replace C39 with career-aware value
  const steveStock = `=LET(price,stock_price_current,mon,B$1,vest1,IF(AND(${IA}!$C$20<>"",mon>=${IA}!$C$20,mon<=${IA}!$C$21),${IA}!$C$19/3,0),vest2,IF(AND(${IA}!$C$25<>"",mon>=${IA}!$C$25,mon<=${IA}!$C$26),${IA}!$C$24/3,0),vest3,IF(AND(${IA}!$C$30<>"",mon>=${IA}!$C$30,mon<=${IA}!$C$31),${IA}!$C$29/3,0),vest4,IF(AND(${IA}!$C$35<>"",mon>=${IA}!$C$35,mon<=${IA}!$C$36),${IA}!$C$34/3,0),reup_years_elapsed,MAX((mon-${IA}!$C$41)/365.25,0),reup_active_grants,IF(mon>=${IA}!$C$41,MIN(FLOOR(reup_years_elapsed)+1,${IA}!$C$40),0),eff_reup,IF(AND('Scenarios'!$A$20,steve_vp_promo_year<>"",mon>=DATE(steve_vp_promo_year,3,1)),steve_vp_rsu_4yr/price/4,IF(AND('Scenarios'!$A$20,steve_sd_promo_year<>"",mon>=DATE(steve_sd_promo_year,3,1)),steve_sd_rsu_4yr/price/4,${IA}!$C$39)),reup_monthly,reup_active_grants*eff_reup/(${IA}!$C$40*12),(vest1+vest2+vest3+vest4+reup_monthly)*price)`;

  // --- Row 5: Hallie W-2 Salary ---
  const hallieW2 = `=LET(ct,'Scenarios'!$A$22,mon,B$1,r,${IA}!$C$46,cur,${IA}!$C$44,dir_yr,hallie_dir_promo_year,vp_yr,hallie_vp_promo_year,ipo_yr,hallie_ipo_year,post_ipo,hallie_post_ipo,ipo_cutoff,AND(ct,ipo_yr<>"",mon>=DATE(ipo_yr+1,1,1),OR(post_ipo="Unknown",post_ipo="Leaves Vanta")),use_vp,AND(ct,NOT(ipo_cutoff),vp_yr<>"",mon>=DATE(vp_yr,4,1)),use_dir,AND(ct,NOT(ipo_cutoff),dir_yr<>"",mon>=DATE(dir_yr,4,1),NOT(use_vp)),base,IF(ipo_cutoff,0,IF(use_vp,hallie_vp_base/12,IF(use_dir,hallie_dir_base/12,cur))),ref_yr,IF(ipo_cutoff,0,IF(use_vp,vp_yr,IF(use_dir,dir_yr,YEAR(TODAY())))),ref_mo,IF(ipo_cutoff,0,IF(OR(use_vp,use_dir),1,IF(MONTH(TODAY())>=4,1,0))),n,IF(ipo_cutoff,0,MAX(0,YEAR(mon)-ref_yr+(MONTH(mon)>=4)-ref_mo)),base*(1+r)^n)`;

  // --- Row 6: Hallie RSU Event ---
  // Keep existing one-time event. Add post-IPO ongoing RSU if "Stays at Vanta".
  const hallieRSU = `=LET(ct,'Scenarios'!$A$22,mon,B$1,liq_date,personb_rsu_liquidity_date,post_ipo,hallie_post_ipo,ipo_yr,hallie_ipo_year,is_ipo_month,AND(liq_date<>"",MONTH(mon)=MONTH(liq_date),YEAR(mon)=YEAR(liq_date)),ipo_value,IF(is_ipo_month,LET(price,IFS(active_scenario="Conservative",personb_rsu_409a,active_scenario="Optimistic",personb_rsu_preferred,TRUE,personb_rsu_409a),personb_rsu_shares*price),0),post_ipo_rsu,IF(AND(ct,post_ipo="Stays at Vanta",ipo_yr<>"",mon>DATE(ipo_yr,12,31)),LET(dir_yr,hallie_dir_promo_year,vp_yr,hallie_vp_promo_year,use_vp,AND(vp_yr<>"",mon>=DATE(vp_yr,4,1)),use_dir,AND(dir_yr<>"",mon>=DATE(dir_yr,4,1)),grant4,IF(use_vp,hallie_vp_rsu_4yr,IF(use_dir,hallie_dir_rsu_4yr,0)),grant4/48),0),ipo_value+post_ipo_rsu)`;

  // --- Row 13: Steve W-2 Withholding (simplified: reference row 3) ---
  const steveWithhold = `=B3*${IA}!$C$9`;

  // --- Row 14: Hallie W-2 Withholding (simplified: reference row 5) ---
  const hallieWithhold = `=B5*${IA}!$C$45`;

  // Write formulas to col B first
  const formulaWrites = [
    { range: "'Monthly Model'!B3", values: [[steveW2]] },
    { range: "'Monthly Model'!B4", values: [[steveStock]] },
    { range: "'Monthly Model'!B5", values: [[hallieW2]] },
    { range: "'Monthly Model'!B6", values: [[hallieRSU]] },
    { range: "'Monthly Model'!B13", values: [[steveWithhold]] },
    { range: "'Monthly Model'!B14", values: [[hallieWithhold]] },
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: formulaWrites },
  });
  console.log('  Wrote formulas to col B for rows 3,4,5,6,13,14');

  // Copy-paste col B to C:IG for each modified row
  const modifiedRows = [2, 3, 4, 5, 12, 13]; // 0-indexed row indices
  const copyRequests = modifiedRows.map(rowIdx => ({
    copyPaste: {
      source: { sheetId: mmSid, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 1, endColumnIndex: 2 },
      destination: { sheetId: mmSid, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 2, endColumnIndex: 241 },
      pasteType: 'PASTE_NORMAL',
      pasteOrientation: 'NORMAL',
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: copyRequests },
  });
  console.log('  Copy-pasted formulas across C:IG for all 6 rows');

  // ============================================================
  // PHASE 3: Update Scenarios tab
  // ============================================================
  console.log('\n=== Phase 3: Update Scenarios tab ===');

  // Replace rows 20-21 with single "Steve Career Trajectory" (row 20, clear 21)
  // Replace row 22 with "Hallie Career Trajectory"
  // Update retirement calculation to use retirement_monthly_burn

  const r = 'portfolio_return_rate/12';
  const pv = 'portfolio_value';
  const surplus = '$O$3';
  const baseNPER = '$P$3';
  const annFV = '$L$3';
  const lumpFV = '$M$3';

  const scenData = [
    // Row 20: Steve Career Trajectory
    { range: "'Scenarios'!A20", values: [[false]] },
    { range: "'Scenarios'!B20:G20", values: [['Steve Career Trajectory',
      'Activates promotion timeline from Inputs & Assumptions (SD then VP). Affects W-2 salary and RSU re-up grants.',
      '=steve_sd_promo_year', 'SD Year',
      '=IF(steve_vp_promo_year="","—",steve_vp_promo_year)', 'VP Year']] },
    { range: "'Scenarios'!H20", values: [[
      `=IF(A20,(steve_sd_base/12-${IA}!C8)*(1-${IA}!C9)+(steve_sd_rsu_4yr/48-${IA}!C39*stock_price_current/(${IA}!C40*12)),0)`,
    ]] },
    { range: "'Scenarios'!I20", values: [[
      `=IF(A20,H20*$L$3,0)`,
    ]] },
    { range: "'Scenarios'!J20", values: [[
      `=IF(A20,IFERROR((NPER(${r},-(${surplus}+H20),-${pv},$N$3)-${baseNPER})/12,"25+"),0)`,
    ]] },
    { range: "'Scenarios'!K20", values: [['=IF(A20,0,0)']] },

    // Row 21: Clear (was Steve → VP, now merged into row 20)
    { range: "'Scenarios'!A21:K21", values: [['',' ','(VP promotion year is configured in Inputs & Assumptions if applicable)','','','','','','','','']] },

    // Row 22: Hallie Career Trajectory
    { range: "'Scenarios'!A22", values: [[false]] },
    { range: "'Scenarios'!B22:G22", values: [['Hallie Career Trajectory',
      'Activates promotion timeline + post-IPO employment assumption from Inputs & Assumptions.',
      '=hallie_dir_promo_year', 'Dir Year',
      '=hallie_post_ipo', 'Post-IPO']] },
    { range: "'Scenarios'!H22", values: [[
      `=IF(A22,(hallie_dir_base/12-${IA}!C44)*(1-${IA}!C45)+(hallie_dir_rsu_4yr/48),0)`,
    ]] },
    { range: "'Scenarios'!I22", values: [[
      `=IF(A22,H22*$L$3,0)`,
    ]] },
    { range: "'Scenarios'!J22", values: [[
      `=IF(A22,IFERROR((NPER(${r},-(${surplus}+H22),-${pv},$N$3)-${baseNPER})/12,"25+"),0)`,
    ]] },
    { range: "'Scenarios'!K22", values: [['=IF(A22,0,0)']] },
  ];

  // Update retirement target in helper cell N3 to use retirement_monthly_burn
  scenData.push({
    range: "'Scenarios'!N3",
    values: [['=25*retirement_monthly_burn*12']],
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: scenData },
  });

  // Re-apply checkbox to row 20 and 22 (clearing row 21's validation)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        { setDataValidation: {
          range: { sheetId: scenSid, startRowIndex: 19, endRowIndex: 20, startColumnIndex: 0, endColumnIndex: 1 },
          rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true },
        }},
        // Clear validation from row 21
        { setDataValidation: {
          range: { sheetId: scenSid, startRowIndex: 20, endRowIndex: 21, startColumnIndex: 0, endColumnIndex: 1 },
          rule: null,
        }},
        { setDataValidation: {
          range: { sheetId: scenSid, startRowIndex: 21, endRowIndex: 22, startColumnIndex: 0, endColumnIndex: 1 },
          rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true },
        }},
      ],
    },
  });
  console.log('  Updated Scenarios rows 20-22 + retirement target');

  // ============================================================
  // PHASE 4: Verify
  // ============================================================
  console.log('\n=== Phase 4: Verify ===');

  const verify = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [
      "'Monthly Model'!B3",   // Steve W-2 (should still work = current base)
      "'Monthly Model'!B4",   // Steve Stock (should still work)
      "'Monthly Model'!B5",   // Hallie W-2
      "'Monthly Model'!B6",   // Hallie RSU
      "'Monthly Model'!B13",  // Steve withholding
      "'Monthly Model'!B14",  // Hallie withholding
      "'Monthly Model'!IG3",  // Steve W-2 at month 240
      "'Monthly Model'!IG5",  // Hallie W-2 at month 240
      "'Monthly Model'!B10",  // Total Gross Income month 1
      "'Monthly Model'!IG10", // Total Gross Income month 240
      `${IA}!C168:D168`,      // Steve SD promo year + date
      `${IA}!C188:C189`,      // Hallie IPO year + post-IPO
      `${IA}!C193:C194`,      // Retirement burn + horizon
      "'Scenarios'!N3",       // Retirement target (updated)
      "'Scenarios'!G5:I5",    // Retirement summary bar values
    ],
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const v = verify.data.valueRanges;
  console.log('Monthly Model col B (toggles OFF — should match baseline):');
  console.log('  B3 Steve W-2:', v[0].values?.[0]?.[0]);
  console.log('  B4 Steve Stock:', v[1].values?.[0]?.[0]);
  console.log('  B5 Hallie W-2:', v[2].values?.[0]?.[0]);
  console.log('  B6 Hallie RSU:', v[3].values?.[0]?.[0]);
  console.log('  B13 Steve Withhold:', v[4].values?.[0]?.[0]);
  console.log('  B14 Hallie Withhold:', v[5].values?.[0]?.[0]);
  console.log('Monthly Model col IG (month 240):');
  console.log('  IG3 Steve W-2:', v[6].values?.[0]?.[0]);
  console.log('  IG5 Hallie W-2:', v[7].values?.[0]?.[0]);
  console.log('Total Gross Income:');
  console.log('  B10 (month 1):', v[8].values?.[0]?.[0]);
  console.log('  IG10 (month 240):', v[9].values?.[0]?.[0]);
  console.log('Inputs career config:');
  console.log('  Steve SD:', JSON.stringify(v[10].values?.[0]));
  console.log('  Hallie IPO/post:', JSON.stringify(v[11].values));
  console.log('  Retirement burn/horizon:', JSON.stringify(v[12].values));
  console.log('Scenarios:');
  console.log('  Retirement target (N3):', v[13].values?.[0]?.[0]);
  console.log('  Summary retirement bar:', JSON.stringify(v[14].values?.[0]));

  console.log('\n=== COMPLETE ===');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
