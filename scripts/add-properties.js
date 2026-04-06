import { getClient, ALL_GOOGLE_SCOPES } from '../src/utils/google-oauth.js';

const SHEET_ID = '193JJvxdWw_Y9k0oBAyDmku43OEkncj0T8DX8htVWVfo';

async function main() {
  const auth = await getClient('lee', ALL_GOOGLE_SCOPES);
  const { google } = await import('googleapis');
  const sheets = google.sheets({ version: 'v4', auth });

  const inputsSid = (await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID, fields: 'sheets(properties(sheetId,title))',
  })).data.sheets.find(s => s.properties.title === 'Inputs & Assumptions').properties.sheetId;
  const existingNames = new Set((await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID, fields: 'namedRanges',
  })).data.namedRanges.map(n => n.name));

  // Add PROPERTIES section to Inputs (row 213+)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: "'Inputs & Assumptions'!B213", values: [['PROPERTY VALUES']] },
        { range: "'Inputs & Assumptions'!B214:D214", values: [['Update from Zillow quarterly. Zestimates as of April 2026.']] },
        { range: "'Inputs & Assumptions'!B216:E216", values: [['Primary Residence', '2946 Avalon Ave, Berkeley CA 94705', 5000400, 'zpid: 24831804']] },
        { range: "'Inputs & Assumptions'!B217:E217", values: [['Kelly — SF Property', '271 Collingwood St, San Francisco CA 94114', 2507400, 'zpid: 15129330']] },
        { range: "'Inputs & Assumptions'!B218:E218", values: [['Kelly — El Cerrito Property', '532 Bonnie Dr, El Cerrito CA 94530', 0, 'zpid: 18529226 — update from Zillow']] },
        // Scenarios: wire Kelly inheritance rows to Inputs property values
        { range: "'Scenarios'!D28", values: [['=property_sf_value']] },
        { range: "'Scenarios'!D29", values: [['=property_elcerrito_value']] },
        // Assets: property breakdown rows
        { range: "'Assets'!A13:B13", values: [['Primary Residence (Zestimate)', '=property_primary_value']] },
        { range: "'Assets'!A14:B14", values: [['Kelly — SF Property (Zestimate)', '=property_sf_value']] },
        { range: "'Assets'!A15:B15", values: [['Kelly — El Cerrito (Zestimate)', '=property_elcerrito_value']] },
        { range: "'Assets'!A16:B16", values: [['Other Illiquid (MDJST, Ayco)', '=B18-B13-B14-B15']] },
      ],
    },
  });
  console.log('Wrote property values to Inputs, Assets, Scenarios');

  // Named ranges
  const newRanges = [
    { name: 'property_primary_value', row: 215, col: 3 },
    { name: 'property_sf_value', row: 216, col: 3 },
    { name: 'property_elcerrito_value', row: 217, col: 3 },
  ];
  const requests = [];
  for (const nr of newRanges) {
    if (!existingNames.has(nr.name)) {
      requests.push({
        addNamedRange: {
          namedRange: {
            name: nr.name,
            range: { sheetId: inputsSid, startRowIndex: nr.row, endRowIndex: nr.row + 1, startColumnIndex: nr.col, endColumnIndex: nr.col + 1 },
          },
        },
      });
    }
  }
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
  }
  console.log('Created named ranges');

  // Verify
  const check = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: ["'Inputs & Assumptions'!B216:D218", "'Assets'!A13:B16", "'Scenarios'!D28:D29"],
    valueRenderOption: 'FORMATTED_VALUE',
  });
  console.log('\nInputs — Properties:');
  for (const row of check.data.valueRanges[0].values || []) console.log('  ' + row.join(' | '));
  console.log('\nAssets — Property rows:');
  for (const row of check.data.valueRanges[1].values || []) console.log('  ' + row.join(' | '));
  console.log('\nScenarios — Kelly inheritance values:');
  for (const row of check.data.valueRanges[2].values || []) console.log('  ' + row.join(' | '));
}

main().catch(err => { console.error(err.message); process.exit(1); });
