import React, { useState, useEffect } from 'react';
import { Settings, Plus, Calendar, BarChart3, TrendingUp } from 'lucide-react';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import TradeModal from './components/TradeModal';
import SettingsModal from './components/SettingsModal';
import { getTrades, saveTrades, getStorageMode } from './services/storage';

export default function App() {
  const [trades, setTrades] = useState([]);
  const [view, setView] = useState('calendar'); // 'calendar' or 'dashboard'
  const [storageMode, setStorageMode] = useState('local');
  const [loading, setLoading] = useState(true);

  // Modal control states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [activeTrade, setActiveTrade] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [clickedDate, setClickedDate] = useState(null);

  // Initialize and load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const mode = getStorageMode();
      setStorageMode(mode);
      const data = await getTrades();
      setTrades(data);
    } catch (e) {
      console.error("Failed loading trading logs:", e);
    } finally {
      setLoading(false);
    }
  };

  // Open add modal for specific calendar day
  const handleOpenAddTrade = (dateStr) => {
    setClickedDate(dateStr);
    setIsAddOpen(true);
  };

  // Open edit modal for select trade
  const handleOpenEditTrade = (trade) => {
    setActiveTrade(trade);
  };

  // Save new or updated trade log
  const handleSaveTrade = async (tradeData) => {
    let updatedTrades;
    const index = trades.findIndex(t => t.id === tradeData.id);

    if (index > -1) {
      // Update existing
      updatedTrades = [...trades];
      updatedTrades[index] = tradeData;
    } else {
      // Insert new
      updatedTrades = [...trades, tradeData];
    }

    setTrades(updatedTrades);
    setIsAddOpen(false);
    setActiveTrade(null);

    // Save to active storage driver
    try {
      const finalTrades = await saveTrades(updatedTrades);
      setTrades(finalTrades);
    } catch (error) {
      console.error("Error saving trade:", error);
      alert("Failed syncing save data to Google. Entries cached locally.");
    }
  };

  // Delete trade entry
  const handleDeleteTrade = async (tradeId) => {
    if (window.confirm("Are you sure you want to permanently delete this trading journal entry?")) {
      const updatedTrades = trades.filter(t => t.id !== tradeId);
      setTrades(updatedTrades);
      setActiveTrade(null);

      try {
        await saveTrades(updatedTrades);
      } catch (error) {
        console.error("Error deleting trade:", error);
        alert("Failed syncing deletion to Google. Cache updated locally.");
      }
    }
  };

  // Config adjustments in settings panel
  const handleConfigChange = () => {
    loadData();
  };

  return (
    <div className="app-container">
      
      {/* App Top Navigation Bar */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">
            <TrendingUp size={20} />
          </div>
          <span className="logo-text">Journal</span>
        </div>

        {/* State Badges, Navigation Tabs & Options */}
        <div className="nav-buttons">
          
          {/* Connection Status Pill */}
          <div className={`connection-badge ${storageMode === 'google' ? 'connected' : 'local'}`}>
            <span className="badge-dot"></span>
            <span>{storageMode === 'google' ? 'Cloud Sync' : 'Local Sandbox'}</span>
          </div>

          {/* Toggle Tab View */}
          <div className="view-tabs" style={{ marginLeft: '1rem', marginRight: '1rem' }}>
            <button 
              className={`tab-btn ${view === 'calendar' ? 'active' : ''}`}
              onClick={() => setView('calendar')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Calendar size={14} />
                Calendar
              </span>
            </button>
            <button 
              className={`tab-btn ${view === 'dashboard' ? 'active' : ''}`}
              onClick={() => setView('dashboard')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <BarChart3 size={14} />
                Dashboard
              </span>
            </button>
          </div>

          {/* Settings Trigger */}
          <button className="btn btn-secondary btn-icon-only" onClick={() => setIsSettingsOpen(true)}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Viewport Content Area */}
      {loading ? (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div className="logo-icon animate-spin" style={{ background: 'transparent', border: '3px solid var(--accent-primary)', borderTopColor: 'transparent', borderRadius: '50%', width: '40px', height: '40px' }} />
            <h3 style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Synchronizing Journal Data...</h3>
          </div>
        </div>
      ) : view === 'calendar' ? (
        <CalendarView 
          trades={trades} 
          onAddTrade={handleOpenAddTrade} 
          onEditTrade={handleOpenEditTrade} 
        />
      ) : (
        <Dashboard trades={trades} />
      )}

      {/* Adding a new Trade Entry Modal */}
      {isAddOpen && (
        <TradeModal 
          dateStr={clickedDate}
          onClose={() => setIsAddOpen(false)}
          onSave={handleSaveTrade}
        />
      )}

      {/* Editing an existing Trade Entry Modal */}
      {activeTrade && (
        <TradeModal 
          trade={activeTrade}
          onClose={() => setActiveTrade(null)}
          onSave={handleSaveTrade}
          onDelete={handleDeleteTrade}
        />
      )}

      {/* App Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)}
          onConfigChange={handleConfigChange}
        />
      )}

    </div>
  );
}
