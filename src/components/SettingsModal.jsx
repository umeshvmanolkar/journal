import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Save, AlertTriangle, HelpCircle, Download, Upload, Info } from 'lucide-react';
import { getCredentials, saveCredentials, clearCredentials, getStorageMode, setStorageMode, syncLocalToGoogle, getLocalTrades, saveTrades } from '../services/storage';

export default function SettingsModal({ onClose, onConfigChange }) {
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [storageMode, setStorageModeState] = useState('local');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncProgress, setSyncProgress] = useState(0);
  const [localTradesCount, setLocalTradesCount] = useState(0);

  // Load existing configuration on mount
  useEffect(() => {
    const creds = getCredentials();
    setApiKey(creds.apiKey || '');
    setClientId(creds.clientId || '');
    setStorageModeState(getStorageMode());
    setLocalTradesCount(getLocalTrades().length);
  }, []);

  const handleSaveCreds = (e) => {
    e.preventDefault();
    if (!apiKey.trim() || !clientId.trim()) {
      alert("Please provide both an API Key and a Client ID.");
      return;
    }
    saveCredentials(apiKey.trim(), clientId.trim());
    alert("Google API Credentials saved! You can now switch to Google Sheets Sync mode.");
    onConfigChange();
  };

  const handleClearCreds = () => {
    if (window.confirm("Are you sure you want to disconnect Google Sheets and clear all keys? Your local data will not be deleted.")) {
      clearCredentials();
      setApiKey('');
      setClientId('');
      setStorageModeState('local');
      alert("Credentials cleared. Reverted to Local Sandbox.");
      onConfigChange();
    }
  };

  const handleToggleMode = (mode) => {
    const creds = getCredentials();
    if (mode === 'google' && (!creds.apiKey || !creds.clientId)) {
      alert("Please configure and save Google Client ID and API Key first.");
      return;
    }
    setStorageMode(mode);
    setStorageModeState(mode);
    onConfigChange();
  };

  const handleSyncData = async () => {
    setSyncing(true);
    setSyncProgress(0);
    setSyncStatus('Initiating Sync...');
    
    try {
      const updatedTrades = await syncLocalToGoogle((message, progress) => {
        setSyncStatus(message);
        setSyncProgress(progress);
      });
      setStorageModeState('google');
      setLocalTradesCount(0);
      alert("Local data successfully migrated to Google Sheets and Drive folder!");
      onConfigChange();
    } catch (error) {
      console.error("Migration failed:", error);
      alert(`Sync failed: ${error.message || 'Check your Google developer console credentials.'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleExportBackup = () => {
    const data = JSON.stringify(getLocalTrades(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `glow_journal_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const trades = JSON.parse(event.target.result);
        if (Array.isArray(trades)) {
          if (window.confirm(`Load backup containing ${trades.length} trades? This will merge with your current entries.`)) {
            const current = getLocalTrades();
            // Merge matching IDs or just combine
            const ids = new Set(current.map(t => t.id));
            const merged = [...current];
            
            trades.forEach(t => {
              if (!ids.has(t.id)) {
                merged.push(t);
              }
            });

            await saveTrades(merged);
            setLocalTradesCount(merged.length);
            alert("Backup imported successfully!");
            onConfigChange();
          }
        } else {
          alert("Invalid file format. Backup must be a list of trades.");
        }
      } catch (err) {
        alert("Failed to parse backup file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Journal Settings & Cloud Sync</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          
          {/* Storage Information Banner */}
          <div className="form-group glass-card" style={{ padding: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block', fontWeight: 600 }}>Direct Storage Mode</label>
            <p className="stat-desc">
              ☁️ All trade entries and screenshot images are stored directly in your Google Sheets and Google Drive. No trade data is saved in browser local storage or cache.
            </p>
          </div>

          {/* Setup Walkthrough Tutorial */}
          <div className="settings-instructions">
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#6366f1' }}>
              <HelpCircle size={15} />
              Setup Guide: Generating Google Developer Credentials
            </h4>
            <ol>
              <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Google Cloud Console</a> and create a new project.</li>
              <li>Search for and Enable the <strong>Google Sheets API</strong> and <strong>Google Drive API</strong>.</li>
              <li>Go to <strong>OAuth Consent Screen</strong>: Choose <em>External</em>, set App Name, and add your email.</li>
              <li>Add Scopes: Select `.../auth/spreadsheets` and `.../auth/drive.file`.</li>
              <li>Add Test Users: Add the email address of your Google Account.</li>
              <li>Go to <strong>Credentials</strong> &rarr; <strong>Create Credentials</strong>:
                <ul>
                  <li><strong>API Key</strong>: Copy it to the form below.</li>
                  <li><strong>OAuth Client ID</strong>: Choose <em>Web Application</em>.</li>
                  <li>Authorized JavaScript Origins: Add <code>http://localhost:5173</code> (or your local port).</li>
                  <li>Copy the Client ID to the form below.</li>
                </ul>
              </li>
            </ol>
          </div>

          {/* Google Credentials Form */}
          <form onSubmit={handleSaveCreds} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Google API Key</label>
              <input 
                type="password" 
                placeholder="AIzaSy..." 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
              />
            </div>
            
            <div className="form-group">
              <label>OAuth 2.0 Client ID</label>
              <input 
                type="text" 
                placeholder="12345678-abcdef.apps.googleusercontent.com" 
                value={clientId} 
                onChange={(e) => setClientId(e.target.value)} 
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              {apiKey || clientId ? (
                <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={handleClearCreds}>
                  Disconnect Cloud
                </button>
              ) : null}
              <button type="submit" className="btn btn-primary" style={{ flex: 2, gap: '0.4rem' }}>
                <Save size={16} />
                Save Credentials
              </button>
            </div>
          </form>

          {/* Backup Import/Export Panel */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
              Local Backup Operations
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1, gap: '0.4rem', fontSize: '0.8rem' }}
                onClick={handleExportBackup}
              >
                <Download size={14} />
                Backup Data (JSON)
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1, gap: '0.4rem', fontSize: '0.8rem' }}
                onClick={() => document.getElementById('import-backup-input').click()}
              >
                <Upload size={14} />
                Restore Backup
              </button>
              <input 
                id="import-backup-input" 
                type="file" 
                accept=".json" 
                onChange={handleImportBackup} 
                style={{ display: 'none' }} 
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close Settings</button>
        </div>

      </div>
    </div>
  );
}
