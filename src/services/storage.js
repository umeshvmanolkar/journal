/**
 * Storage Coordinator Service
 * Manages local trade storage, credential storage, and orchestrates
 * synchronization between Local Sandbox and Google Cloud.
 */
import { 
  initGoogleClients, 
  requestAccessToken, 
  getOrCreateDriveFolder, 
  getOrCreateSpreadsheet, 
  uploadImageToDrive, 
  saveAllTradesToGoogle, 
  fetchTradesFromGoogle,
  disconnectGoogle
} from './googleApi';

// Keys for localStorage
const CREDENTIALS_KEY = 'journal_google_creds';
const MODE_KEY = 'journal_mode'; // 'google'

// Always purge legacy local trade cache to prevent deleted entries from resurrecting
try {
  localStorage.removeItem('journal_trades');
  localStorage.removeItem('hournal_trades');
  localStorage.removeItem('glow_journal_trades');
  
  const oldCreds = localStorage.getItem('hournal_google_creds') || localStorage.getItem('glow_journal_google_creds');
  if (!localStorage.getItem(CREDENTIALS_KEY) && oldCreds) {
    localStorage.setItem(CREDENTIALS_KEY, oldCreds);
  }
  
  const oldMode = localStorage.getItem('hournal_mode') || localStorage.getItem('glow_journal_mode');
  if (!localStorage.getItem(MODE_KEY) && oldMode) {
    localStorage.setItem(MODE_KEY, oldMode);
  }
} catch (e) {
  console.warn("Storage cleanup failed:", e);
}

/**
 * Gets API credentials from localStorage
 */
export function getCredentials() {
  const data = localStorage.getItem(CREDENTIALS_KEY);
  const localCreds = data ? JSON.parse(data) : { apiKey: '', clientId: '' };
  return {
    apiKey: localCreds.apiKey || import.meta.env.VITE_GOOGLE_API_KEY || '',
    clientId: localCreds.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
  };
}

/**
 * Saves API credentials to localStorage
 */
export function saveCredentials(apiKey, clientId) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ apiKey, clientId }));
}

/**
 * Clears credentials and disconnects
 */
export function clearCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY);
  localStorage.removeItem(MODE_KEY);
  disconnectGoogle();
}

/**
 * Gets the current active storage mode
 */
export function getStorageMode() {
  const creds = getCredentials();
  if (!creds.apiKey || !creds.clientId) return 'unconfigured';
  return 'google';
}

/**
 * Sets the active storage mode
 */
export function setStorageMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
}

/**
 * Fetches trades directly from Google Sheets
 */
export async function getTrades() {
  const creds = getCredentials();
  if (!creds.apiKey || !creds.clientId) {
    throw new Error("Google API Key and Client ID must be configured in Settings.");
  }

  await initGoogleClients(creds.apiKey, creds.clientId);
  const token = await requestAccessToken();
  const spreadsheetId = await getOrCreateSpreadsheet(token);
  return await fetchTradesFromGoogle(spreadsheetId, token);
}

/**
 * Legacy stub returning empty array (no local cache)
 */
export function getLocalTrades() {
  return [];
}

/**
 * Saves trades directly to Google Sheets and uploads images to Google Drive.
 * Does NOT cache locally. Throws an error if saving fails.
 */
export async function saveTrades(trades) {
  const creds = getCredentials();
  if (!creds.apiKey || !creds.clientId) {
    throw new Error("Google API Credentials not configured.");
  }

  await initGoogleClients(creds.apiKey, creds.clientId);
  const token = await requestAccessToken();
  const folderId = await getOrCreateDriveFolder(token);

  let finalTrades = [...trades];

  // Scan all trades and upload any base64 local screenshots to Google Drive
  for (let i = 0; i < finalTrades.length; i++) {
    const trade = finalTrades[i];
    if (trade.screenshots && trade.screenshots.length > 0) {
      let updatedScreenshots = [];
      let modified = false;

      for (let j = 0; j < trade.screenshots.length; j++) {
        const src = trade.screenshots[j];
        if (src && src.startsWith('data:')) {
          const filename = `trade_${trade.ticker}_${trade.date}_${trade.id.substring(0, 4)}_${j}.jpg`;
          const driveFileId = await uploadImageToDrive(src, filename, folderId, token);
          updatedScreenshots.push(driveFileId);
          modified = true;
        } else {
          updatedScreenshots.push(src);
        }
      }

      if (modified) {
        finalTrades[i] = {
          ...trade,
          screenshots: updatedScreenshots
        };
      }
    }
  }

  const spreadsheetId = await getOrCreateSpreadsheet(token);
  await saveAllTradesToGoogle(spreadsheetId, finalTrades, token);

  return finalTrades;
}

/**
 * Resizes and compresses base64 image strings to conserve space
 */
export function compressImage(base64Str, maxWidth = 1000, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      // Return original if resizing fails
      resolve(base64Str);
    };
  });
}

/**
 * Refresh / Sync data directly from Google Sheets & Drive
 */
export async function syncLocalToGoogle(onProgress) {
  const creds = getCredentials();
  if (!creds.apiKey || !creds.clientId) {
    throw new Error("Google Credentials not configured.");
  }

  onProgress("Initializing Google APIs...", 20);
  await initGoogleClients(creds.apiKey, creds.clientId);
  
  onProgress("Authenticating with Google...", 50);
  const token = await requestAccessToken();

  onProgress("Accessing Google Spreadsheet...", 75);
  const spreadsheetId = await getOrCreateSpreadsheet(token);

  onProgress("Fetching trades from Google Sheets...", 90);
  const trades = await fetchTradesFromGoogle(spreadsheetId, token);

  onProgress("Sync Complete!", 100);
  return trades;
}
