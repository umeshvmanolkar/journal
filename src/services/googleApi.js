/**
 * Google Drive & Sheets Integration Service
 * Handles client-side OAuth2 authentication, spreadsheet reads/writes,
 * and image uploads to a dedicated Drive folder.
 */

let tokenClient = null;
let gapiInitialized = false;
let gisInitialized = false;

// Scopes required for the app (safe drive.file scope allows access only to files created by this app)
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest',
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
];

/**
 * Loads the Google GAPI and GIS SDKs dynamically
 */
export function loadGoogleScripts() {
  return new Promise((resolve) => {
    let gapiLoaded = typeof gapi !== 'undefined';
    let gisLoaded = typeof google !== 'undefined' && google.accounts;

    if (gapiLoaded && gisLoaded) {
      resolve(true);
      return;
    }

    const checkLoaded = () => {
      gapiLoaded = typeof gapi !== 'undefined';
      gisLoaded = typeof google !== 'undefined' && google.accounts;
      if (gapiLoaded && gisLoaded) {
        resolve(true);
      } else {
        setTimeout(checkLoaded, 100);
      }
    };
    checkLoaded();
  });
}

/**
 * Initializes GAPI Client and GIS Token Client
 */
export async function initGoogleClients(apiKey, clientId) {
  if (!apiKey || !clientId) return false;

  await loadGoogleScripts();

  return new Promise((resolve, reject) => {
    try {
      // 1. Initialize GAPI client
      gapi.load('client', async () => {
        try {
          await gapi.client.init({
            apiKey: apiKey,
            discoveryDocs: DISCOVERY_DOCS,
          });
          gapiInitialized = true;
          checkBothInitialized(clientId, resolve);
        } catch (error) {
          console.error("GAPI initialization error:", error);
          reject(error);
        }
      });

      // 2. Initialize GIS client
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: '', // defined dynamically during token request
      });
      gisInitialized = true;
      checkBothInitialized(clientId, resolve);
    } catch (error) {
      console.error("Error in initGoogleClients:", error);
      reject(error);
    }
  });
}

function checkBothInitialized(clientId, resolve) {
  if (gapiInitialized && gisInitialized && tokenClient) {
    resolve(true);
  }
}

/**
 * Requests OAuth2 token from user
 */
export function requestAccessToken() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("Google Client not initialized. Check API credentials in Settings."));
      return;
    }

    tokenClient.callback = async (response) => {
      if (response.error !== undefined) {
        reject(response);
      } else {
        // Access token acquired
        localStorage.setItem('google_access_token', response.access_token);
        localStorage.setItem('google_token_expiry', Date.now() + (response.expires_in * 1000));
        resolve(response.access_token);
      }
    };

    // Retrieve cached token if it exists and is still valid
    const cachedToken = localStorage.getItem('google_access_token');
    const expiry = localStorage.getItem('google_token_expiry');
    
    if (cachedToken && expiry && Date.now() < Number(expiry)) {
      gapi.client.setToken({ access_token: cachedToken });
      resolve(cachedToken);
    } else {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    }
  });
}

/**
 * Disconnects from Google account by removing cached token
 */
export function disconnectGoogle() {
  const token = localStorage.getItem('google_access_token');
  if (token) {
    google.accounts.oauth2.revoke(token, () => {
      console.log('Google token revoked');
    });
  }
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_token_expiry');
}

/**
 * Finds or creates a Drive folder for trading journal screenshots
 */
export async function getOrCreateDriveFolder(accessToken) {
  gapi.client.setToken({ access_token: accessToken });
  
  // 1. Search for existing folder
  const response = await gapi.client.drive.files.list({
    q: "name = 'Trading Journal Screenshots' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  const files = response.result.files;
  if (files && files.length > 0) {
    return files[0].id;
  }

  // 2. Create if not exists
  const folderMetadata = {
    name: 'Trading Journal Screenshots',
    mimeType: 'application/vnd.google-apps.folder'
  };

  const createResponse = await gapi.client.drive.files.create({
    resource: folderMetadata,
    fields: 'id'
  });

  return createResponse.result.id;
}

/**
 * Uploads a base64 image file to the designated Drive folder
 */
export async function uploadImageToDrive(base64Data, filename, folderId, accessToken) {
  // Extract content type and clean base64 data
  const parts = base64Data.split(';');
  const mimeType = parts[0].split(':')[1];
  const cleanBase64 = parts[1].split(',')[1];
  
  const metadata = {
    name: filename,
    mimeType: mimeType,
    parents: [folderId]
  };

  const boundary = 'journal_multipart_boundary';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + mimeType + '\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    cleanBase64 +
    close_delim;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body: multipartRequestBody
  });

  if (!response.ok) {
    throw new Error('Failed to upload screenshot to Drive: ' + response.statusText);
  }

  const fileInfo = await response.json();
  return fileInfo.id; // Return the Drive file ID
}

/**
 * Finds or creates the Spreadsheet named 'Trading Journal Data'
 */
export async function getOrCreateSpreadsheet(accessToken) {
  gapi.client.setToken({ access_token: accessToken });

  // 1. Search for existing sheet
  const response = await gapi.client.drive.files.list({
    q: "name = 'Trading Journal Data' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  const files = response.result.files;
  if (files && files.length > 0) {
    return files[0].id;
  }

  // 2. Create if not exists
  const spreadsheetMetadata = {
    properties: {
      title: 'Trading Journal Data'
    }
  };

  const createResponse = await gapi.client.sheets.spreadsheets.create({
    resource: spreadsheetMetadata,
    fields: 'spreadsheetId'
  });

  const spreadsheetId = createResponse.result.spreadsheetId;

  // Get the default sheet's title dynamically (supports any locale/language)
  const spreadsheet = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
  const sheetName = spreadsheet.result.sheets[0].properties.title;

  // 3. Initialize header row
  const headers = [
    'ID', 'Date', 'Time', 'Ticker', 'Type', 
    'Entry Price', 'Exit Price', 'Size', 'Fees', 
    'PnL', 'Status', 'Notes', 'Screenshot IDs'
  ];

  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId,
    range: `${sheetName}!A1:M1`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [headers]
    }
  });

  return spreadsheetId;
}

/**
 * Fetches all trades from Google Sheets
 */
export async function fetchTradesFromGoogle(spreadsheetId, accessToken) {
  gapi.client.setToken({ access_token: accessToken });

  try {
    // Get the first sheet's title dynamically
    const spreadsheet = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
    const sheetName = spreadsheet.result.sheets[0].properties.title;

    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A2:M10000`, // Fetch up to 10k rows
    });

    const rows = response.result.values;
    if (!rows || rows.length === 0) return [];

    return rows.map(row => ({
      id: row[0] || '',
      date: row[1] || '',
      time: row[2] || '',
      ticker: row[3] || '',
      type: row[4] || '',
      entryPrice: row[5] ? Number(row[5]) : 0,
      exitPrice: row[6] ? Number(row[6]) : 0,
      size: row[7] ? Number(row[7]) : 0,
      fees: row[8] ? Number(row[8]) : 0,
      pnl: row[9] ? Number(row[9]) : 0,
      status: row[10] || '',
      notes: row[11] || '',
      screenshots: row[12] ? row[12].split(',').filter(Boolean) : []
    }));
  } catch (error) {
    console.error("Error reading spreadsheet values:", error);
    throw error;
  }
}

/**
 * Saves all trades (overwrites or updates) in the spreadsheet
 */
export async function saveAllTradesToGoogle(spreadsheetId, trades, accessToken) {
  gapi.client.setToken({ access_token: accessToken });

  // Get the first sheet's title dynamically
  const spreadsheet = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
  const sheetName = spreadsheet.result.sheets[0].properties.title;

  // Format trades into rows, sanitizing all undefined/null fields
  const rows = trades.map(trade => [
    String(trade.id || ''),
    String(trade.date || ''),
    String(trade.time || '12:00'),
    String(trade.ticker || '').toUpperCase(),
    String(trade.type || 'BUY'),
    Number(trade.entryPrice || 0),
    Number(trade.exitPrice || 0),
    Number(trade.size || 0),
    Number(trade.fees || 0),
    Number(trade.pnl || 0),
    String(trade.status || 'BREAKEVEN'),
    String(trade.notes || ''),
    trade.screenshots ? trade.screenshots.join(',') : ''
  ]);

  // First, clear existing sheet data (excluding header)
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: spreadsheetId,
    range: `${sheetName}!A2:M10000`,
  });

  if (rows.length === 0) return;

  // Append new rows
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId,
    range: `${sheetName}!A2:M${1 + rows.length}`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: rows
    }
  });
}
