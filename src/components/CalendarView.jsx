import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, RefreshCw, X, Edit2 } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarView({ trades, onAddTrade, onEditTrade }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(null);

  // GDrive image loading cache and lightbox states
  const [resolvedImages, setResolvedImages] = useState({});
  const [loadingImages, setLoadingImages] = useState({});
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [lightboxScreenshots, setLightboxScreenshots] = useState([]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get first day of the month
  const firstDayOfMonth = new Date(year, month, 1);
  // Get number of days in the month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Calculate starting offset (Monday as 0, Sunday as 6)
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

  // Previous month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  // Next month navigation
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Format date as YYYY-MM-DD
  const formatDateString = (d) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  // Group trades by date
  const tradesByDate = trades.reduce((acc, trade) => {
    const dStr = trade.date;
    if (!acc[dStr]) acc[dStr] = [];
    acc[dStr].push(trade);
    return acc;
  }, {});

  // Calculate stats for a specific day
  const getDayStats = (dStr) => {
    const dayTrades = tradesByDate[dStr] || [];
    if (dayTrades.length === 0) return null;

    const netPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
    return {
      netPnl,
      count: dayTrades.length
    };
  };

  // Selected Date string (default to today if not selected)
  const activeDateStr = selectedDateStr || formatDateString(new Date().getDate());
  
  // Trades for selected date, sorted chronologically (oldest trade first)
  const selectedTrades = tradesByDate[activeDateStr] || [];
  const sortedSelectedTrades = [...selectedTrades].sort((a, b) => Number(a.id) - Number(b.id));

  // Load and cache Google Drive screenshots for the selected day's trades
  useEffect(() => {
    sortedSelectedTrades.forEach((trade) => {
      if (trade.screenshots) {
        trade.screenshots.forEach((src) => {
          if (src && !src.startsWith('data:') && !resolvedImages[src] && !loadingImages[src]) {
            resolveDriveImage(src);
          }
        });
      }
    });
  }, [activeDateStr, trades]); // Re-run when day updates or trades data changes

  const resolveDriveImage = async (fileId) => {
    setLoadingImages(prev => ({ ...prev, [fileId]: true }));
    try {
      const token = localStorage.getItem('google_access_token');
      if (!token) return;

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to load image");

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setResolvedImages(prev => ({ ...prev, [fileId]: objectUrl }));
    } catch (e) {
      console.error("Error loading drive image in sidebar:", e);
    } finally {
      setLoadingImages(prev => ({ ...prev, [fileId]: false }));
    }
  };

  // Clean up Blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(resolvedImages).forEach(url => URL.revokeObjectURL(url));
    };
  }, [resolvedImages]);

  // Generate calendar grid array
  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({ empty: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = formatDateString(d);
    const stats = getDayStats(dStr);
    const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
    
    cells.push({
      empty: false,
      day: d,
      dateStr: dStr,
      stats,
      isToday
    });
  }

  // Open Lightbox for sidebar photos
  const handleOpenLightbox = (screenshotsList, index) => {
    setLightboxScreenshots(screenshotsList);
    setLightboxIndex(index);
  };

  const getImageSrc = (src) => {
    if (src.startsWith('data:')) return src;
    return resolvedImages[src] || '';
  };

  return (
    <div className="main-content-grid animate-fade-in">
      
      {/* Left Column: Calendar Card (Pushed more to the left via 1.1fr vs 1.9fr split) */}
      <div className="glass-card calendar-card">
        
        {/* Calendar Header Controls */}
        <div className="calendar-header">
          <div className="calendar-title">
            <CalendarIcon size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>{MONTHS[month]} {year}</span>
          </div>
          <div className="calendar-controls">
            <button className="btn btn-secondary btn-icon-only" onClick={prevMonth}>
              <ChevronLeft size={18} />
            </button>
            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setCurrentDate(new Date())}>
              Today
            </button>
            <button className="btn btn-secondary btn-icon-only" onClick={nextMonth}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Days of week labels */}
        <div className="calendar-grid">
          {WEEKDAYS.map((day) => (
            <div key={day} className="calendar-day-label">{day}</div>
          ))}

          {/* Calendar Grid Cells */}
          {cells.map((cell, idx) => {
            if (cell.empty) {
              return <div key={`empty-${idx}`} className="calendar-cell empty-cell" />;
            }

            const { day, dateStr, stats, isToday } = cell;
            const isSelected = dateStr === activeDateStr;
            
            let cellClass = '';
            if (stats) {
              cellClass = stats.netPnl > 0 ? 'profit-day' : stats.netPnl < 0 ? 'loss-day' : '';
            }
            if (isToday) cellClass += ' today-cell';

            return (
              <div 
                key={dateStr} 
                className={`calendar-cell ${cellClass}`}
                style={{ 
                  border: isSelected ? '2px solid var(--accent-primary)' : '',
                  padding: isSelected ? '0.4rem' : '0.5rem'
                }}
                onClick={() => setSelectedDateStr(dateStr)}
              >
                <span className="cell-date">{day}</span>
                {stats && (
                  <span className="cell-amount">
                    {stats.netPnl >= 0 ? '+' : ''}{stats.netPnl.toFixed(1)}R
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Day Trades Detail Panel (Wide Details with Photos) */}
      <div className="glass-card details-sidebar">
        
        {/* Header section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1rem' }}>
              {new Date(activeDateStr).toLocaleDateString(undefined, { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {sortedSelectedTrades.length} Trade{sortedSelectedTrades.length !== 1 ? 's' : ''} on this day
            </span>
          </div>
          
          <button 
            className="btn btn-primary" 
            style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem', gap: '0.3rem' }}
            onClick={() => onAddTrade(activeDateStr)}
          >
            <Plus size={14} />
            Record
          </button>
        </div>

        {/* Detailed Trades View */}
        {sortedSelectedTrades.length === 0 ? (
          <div className="empty-state" style={{ minHeight: '280px' }}>
            <span className="empty-state-icon" style={{ fontSize: '2rem' }}>📊</span>
            <h4>No trades recorded</h4>
            <p>You haven't logged any trades for this day yet.</p>
            <button 
              className="btn btn-secondary" 
              style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}
              onClick={() => onAddTrade(activeDateStr)}
            >
              Add Trade Entry
            </button>
          </div>
        ) : (
          <div className="trades-list" style={{ gap: '1rem', maxHeight: '680px' }}>
            
            {/* Total Daily Profitability Banner */}
            {(() => {
              const dailyPnl = sortedSelectedTrades.reduce((sum, t) => sum + t.pnl, 0);
              return (
                <div 
                  style={{ 
                    background: dailyPnl >= 0 ? 'var(--color-profit-bg)' : 'var(--color-loss-bg)', 
                    border: '1px solid',
                    borderColor: dailyPnl >= 0 ? 'var(--color-profit-border)' : 'var(--color-loss-border)',
                    borderRadius: '10px',
                    padding: '0.75rem',
                    textAlign: 'center',
                    marginBottom: '0.25rem'
                  }}
                >
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: dailyPnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                    Daily Balance
                  </span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: dailyPnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                    {dailyPnl >= 0 ? '+' : ''}{dailyPnl.toFixed(2)} R
                  </div>
                </div>
              );
            })()}

            {/* Render Detailed Trade Cards */}
            {sortedSelectedTrades.map((trade) => (
              <div key={trade.id} className="trade-detail-card">
                
                {/* Header: Ticker, Action Type, Outcome, P&L and Edit button */}
                <div className="trade-detail-header">
                  <div className="trade-detail-left">
                    <span className="trade-ticker" style={{ fontSize: '1.1rem' }}>
                      {trade.ticker.toUpperCase()}
                    </span>
                    <span className={`trade-type-badge ${trade.type.toLowerCase()}`}>
                      {trade.type}
                    </span>
                    <span 
                      className="trade-type-badge"
                      style={{
                        background: trade.status === 'WIN' ? 'var(--color-profit-bg)' : trade.status === 'LOSS' ? 'var(--color-loss-bg)' : 'var(--color-neutral-bg)',
                        color: trade.status === 'WIN' ? 'var(--color-profit)' : trade.status === 'LOSS' ? 'var(--color-loss)' : 'var(--text-secondary)',
                        border: '1px solid',
                        borderColor: trade.status === 'WIN' ? 'var(--color-profit-border)' : trade.status === 'LOSS' ? 'var(--color-loss-border)' : 'var(--color-neutral-border)'
                      }}
                    >
                      {trade.status}
                    </span>
                  </div>

                  <div className="trade-detail-right">
                    <span className={`trade-pnl ${trade.pnl >= 0 ? 'profit' : 'loss'}`} style={{ fontSize: '1.15rem', marginRight: '0.5rem', fontWeight: 800 }}>
                      {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)} R
                    </span>
                    <button 
                      className="btn btn-secondary btn-icon-only" 
                      style={{ width: '32px', height: '32px', borderRadius: '8px' }}
                      onClick={() => onEditTrade(trade)}
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Body Reflection Notes */}
                {trade.notes && (
                  <div className="trade-detail-notes">
                    {trade.notes}
                  </div>
                )}

                {/* Screenshots Grid (Photos Rendered Directly) */}
                {trade.screenshots && trade.screenshots.length > 0 && (
                  <div className="sidebar-screenshot-grid">
                    {trade.screenshots.map((src, index) => {
                      const imgUrl = getImageSrc(src);
                      const isLoading = !src.startsWith('data:') && loadingImages[src];

                      return (
                        <div 
                          key={index} 
                          className="sidebar-screenshot-item"
                          onClick={() => handleOpenLightbox(trade.screenshots, index)}
                        >
                          {isLoading ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'rgba(0,0,0,0.1)' }}>
                              <RefreshCw size={14} className="animate-spin" style={{ opacity: 0.5 }} />
                            </div>
                          ) : (
                            <img src={imgUrl} alt="Trade Screenshot" className="sidebar-screenshot-img" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal (For sidebar photo expansion) */}
      {lightboxIndex !== null && (
        <div className="lightbox-overlay" onClick={() => setLightboxIndex(null)}>
          <button className="lightbox-close" onClick={() => setLightboxIndex(null)}>
            <X size={24} />
          </button>
          
          {lightboxScreenshots.length > 1 && (
            <button 
              className="lightbox-nav prev" 
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((lightboxIndex - 1 + lightboxScreenshots.length) % lightboxScreenshots.length);
              }}
            >
              <ChevronRight size={28} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}

          <img 
            className="lightbox-img animate-scale-in" 
            src={getImageSrc(lightboxScreenshots[lightboxIndex])} 
            alt="Screenshots expanded detail" 
            onClick={(e) => e.stopPropagation()}
          />

          {lightboxScreenshots.length > 1 && (
            <button 
              className="lightbox-nav next" 
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((lightboxIndex + 1) % lightboxScreenshots.length);
              }}
            >
              <ChevronRight size={28} />
            </button>
          )}
        </div>
      )}

    </div>
  );
}
