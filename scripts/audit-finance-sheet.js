#!/usr/bin/env node
/**
 * One-off audit of the Avalon Financial Model before doing anything destructive.
 *
 * Reads every tab, extracts formulas + values, and produces a report:
 *   - Every cross-tab reference to Monthly Model
 *   - Which cells in Monthly Model are formulas vs raw values
 *   - Row 1 date headers
 *   - Sample of formulas per row (to understand patterns)
 *
 * Writes a JSON dump to /tmp/finance-audit.json for downstream analysis.
 */
import { getClient, ALL_GOOGLE_SCOPES } from '../src/utils/google-oauth.js';
import { writeFileSync } from 'fs';

const SHEET_ID = '193JJvxdWw_Y9k0oBAyDmku43OEkncj0T8DX8htVWVfo';

async function main() {
  const auth = await getClient('lee', ALL_GOOGLE_SCOPES);
  if (!auth) throw new Error('No OAuth token for lee');
  const { google } = await import('googleapis');
  const sheets = google.sheets({ version: 'v4', auth });

  // Get full metadata including grid properties per sheet
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title,gridProperties))',
  });

  const report = {
    sheetTitle: 'Avalon Financial Model',
    tabs: {},
    crossRefsToMonthlyModel: [],
    monthlyModelShape: null,
  };

  for (const s of meta.data.sheets) {
    const title = s.properties.title;
    const rows = s.properties.gridProperties.rowCount;
    const cols = s.properties.gridProperties.columnCount;
    report.tabs[title] = { rows, cols, sheetId: s.properties.sheetId };
    console.log(`Tab "${title}": ${rows} rows × ${cols} cols`);
  }

  // Read EVERY tab with formulas (not just values). The Sheets API has two modes:
  //   - valueRenderOption: FORMULA → returns formula strings, e.g. "=B5+C5"
  //   - valueRenderOption: FORMATTED_VALUE → returns what you see on screen
  // We want FORMULA so we can see references.
  const allTabs = Object.keys(report.tabs);
  for (const tab of allTabs) {
    const range = `'${tab}'`;
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
      valueRenderOption: 'FORMULA',
    });
    const values = resp.data.values || [];
    report.tabs[tab].values = values;
    console.log(`Read "${tab}": ${values.length} rows of data`);
  }

  // Find every cross-reference TO Monthly Model from other tabs
  // Pattern: 'Monthly Model'! or MonthlyModel! or "Monthly Model"!
  // Google Sheets requires single quotes around tab names with spaces
  const monthlyRefRegex = /['"]?Monthly Model['"]?!/gi;

  for (const tab of allTabs) {
    if (tab === 'Monthly Model') continue;
    const values = report.tabs[tab].values;
    for (let r = 0; r < values.length; r++) {
      const row = values[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (typeof cell === 'string' && monthlyRefRegex.test(cell)) {
          monthlyRefRegex.lastIndex = 0;
          report.crossRefsToMonthlyModel.push({
            tab,
            cell: `${colLetter(c)}${r + 1}`,
            formula: cell,
          });
        }
        monthlyRefRegex.lastIndex = 0;
      }
    }
  }

  // Analyze Monthly Model shape
  const mmValues = report.tabs['Monthly Model'].values;
  const mmRow1 = mmValues[0] || [];
  report.monthlyModelShape = {
    rows: mmValues.length,
    maxColsInData: Math.max(...mmValues.map((r) => (r || []).length)),
    row1Headers: mmRow1,
    row1DateCols: mmRow1.filter((v) => v && String(v).includes('/')).length,
  };

  // Count formulas vs raw values in Monthly Model
  let formulaCount = 0;
  let valueCount = 0;
  const formulaSamplesByRow = {};
  for (let r = 0; r < mmValues.length; r++) {
    const row = mmValues[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell == null || cell === '') continue;
      if (typeof cell === 'string' && cell.startsWith('=')) {
        formulaCount++;
        if (!formulaSamplesByRow[r + 1]) {
          formulaSamplesByRow[r + 1] = [];
        }
        if (formulaSamplesByRow[r + 1].length < 3) {
          formulaSamplesByRow[r + 1].push({
            col: colLetter(c),
            formula: cell,
          });
        }
      } else {
        valueCount++;
      }
    }
  }
  report.monthlyModelShape.formulaCount = formulaCount;
  report.monthlyModelShape.valueCount = valueCount;
  report.monthlyModelShape.formulaSamplesByRow = formulaSamplesByRow;

  // Column A of Monthly Model — what are the row labels?
  const mmColA = mmValues.map((r) => (r || [])[0]).filter((v) => v != null && v !== '');
  report.monthlyModelShape.rowLabels = mmColA;

  writeFileSync('/tmp/finance-audit.json', JSON.stringify(report, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('Tabs:', Object.keys(report.tabs).join(', '));
  console.log('Cross-refs to Monthly Model from other tabs:', report.crossRefsToMonthlyModel.length);
  console.log('Monthly Model rows:', report.monthlyModelShape.rows);
  console.log('Monthly Model max cols in data:', report.monthlyModelShape.maxColsInData);
  console.log('Monthly Model row 1 date cols:', report.monthlyModelShape.row1DateCols);
  console.log('Monthly Model formulas:', formulaCount);
  console.log('Monthly Model raw values:', valueCount);
  console.log('Monthly Model row labels (col A):');
  mmColA.forEach((l, i) => console.log(`  row ${i + 1}: ${l}`));
  console.log('\nFull report written to /tmp/finance-audit.json');
}

function colLetter(colIdx) {
  let result = '';
  let n = colIdx;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
