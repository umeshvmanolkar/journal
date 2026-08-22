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
const TRADES_KEY = 'glow_journal_trades';
const CREDENTIALS_KEY = 'glow_journal_google_creds';
const MODE_KEY = 'glow_journal_mode'; // 'local' or 'google'

/**
 * Gets API credentials from localStorage
 */
export function getCredentials() {
  const data = localStorage.getItem(CREDENTIALS_KEY);
  return data ? JSON.parse(data) : { apiKey: '', clientId: '' };
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
 * Gets the current active storage mode ('local' or 'google')
 */
export function getStorageMode() {
  const creds = getCredentials();
  if (!creds.apiKey || !creds.clientId) return 'local';
  return localStorage.getItem(MODE_KEY) || 'local';
}

/**
 * Sets the active storage mode
 */
export function setStorageMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
}

/**
 * Fetches trades based on the active storage mode
 */
export async function getTrades() {
  const mode = getStorageMode();

  if (mode === 'google') {
    try {
      const creds = getCredentials();
      await initGoogleClients(creds.apiKey, creds.clientId);
      const token = await requestAccessToken();
      const spreadsheetId = await getOrCreateSpreadsheet(token);
      return await fetchTradesFromGoogle(spreadsheetId, token);
    } catch (error) {
      console.error("Failed to fetch from Google. Falling back to local cache.", error);
      // Return local cache as fallback
      return getLocalTrades();
    }
  } else {
    return getLocalTrades();
  }
}

/**
 * Gets local trades from localStorage
 */
export function getLocalTrades() {
  const data = localStorage.getItem(TRADES_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Saves trades based on the active storage mode
 */
export async function saveTrades(trades) {
  const mode = getStorageMode();
  
  // Always update local cache so there's an offline/instant copy
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades));

  if (mode === 'google') {
    const creds = getCredentials();
    await initGoogleClients(creds.apiKey, creds.clientId);
    const token = await requestAccessToken();
    const spreadsheetId = await getOrCreateSpreadsheet(token);
    await saveAllTradesToGoogle(spreadsheetId, trades, token);
  }
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
 * Syncs local sandbox data to Google Sheets & Drive
 * Uploads all local base64 screenshots to Drive, updates IDs, and writes to Sheets.
 */
export async function syncLocalToGoogle(onProgress) {
  const creds = getCredentials();
  if (!creds.apiKey || !creds.clientId) {
    throw new Error("Google Credentials not configured.");
  }

  onProgress("Initializing Google APIs...", 10);
  await initGoogleClients(creds.apiKey, creds.clientId);
  
  onProgress("Authenticating...", 20);
  const token = await requestAccessToken();

  onProgress("Accessing Google Drive Folder...", 30);
  const folderId = await getOrCreateDriveFolder(token);

  onProgress("Accessing Google Spreadsheet...", 40);
  const spreadsheetId = await getOrCreateSpreadsheet(token);

  const localTrades = getLocalTrades();
  const total = localTrades.length;
  
  onProgress(`Syncing ${total} trades. Uploading screenshots...`, 50);

  // Upload screenshots for each trade if they are base64 local data
  const updatedTrades = [];
  for (let i = 0; i < total; i++) {
    const trade = localTrades[i];
    const updatedScreenshots = [];

    if (trade.screenshots && trade.screenshots.length > 0) {
      for (let j = 0; j < trade.screenshots.length; j++) {
        const screenshot = trade.screenshots[j];
        
        if (screenshot.startsWith('data:')) {
          onProgress(`Uploading screenshot ${j + 1} for trade ${trade.ticker}...`, 50 + Math.floor((i / total) * 30));
          try {
            const filename = `trade_${trade.ticker}_${trade.date}_${trade.id.substring(0, 4)}_${j}.jpg`;
            const driveFileId = await uploadImageToDrive(screenshot, filename, folderId, token);
            updatedScreenshots.push(driveFileId);
          } catch (e) {
            console.error("Failed uploading screenshot, keeping local cache", e);
            updatedScreenshots.push(screenshot);
          }
        } else {
          // Already uploaded (is a Google Drive file ID)
          updatedScreenshots.push(screenshot);
        }
      }
    }

    updatedTrades.push({
      ...trade,
      screenshots: updatedScreenshots
    });
  }

  onProgress("Writing all trades to Google Sheets...", 90);
  await saveAllTradesToGoogle(spreadsheetId, updatedTrades, token);

  // Set mode to google and update local cache
  setStorageMode('google');
  localStorage.setItem(TRADES_KEY, JSON.stringify(updatedTrades));
  
  onProgress("Sync Complete!", 100);
  return updatedTrades;
}
