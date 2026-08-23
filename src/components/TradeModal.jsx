import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, ImageIcon, Plus, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { compressImage, getStorageMode, getCredentials } from '../services/storage';

export default function TradeModal({ trade, dateStr, onClose, onSave, onDelete }) {
  const isEdit = !!trade;
  
  // State variables for form inputs
  const [date, setDate] = useState(dateStr || new Date().toISOString().split('T')[0]);
  const [ticker, setTicker] = useState('XAUUSD');
  const [type, setType] = useState('BUY');
  const [outcome, setOutcome] = useState('WIN');
  const [rr, setRr] = useState('1.0');
  const [notes, setNotes] = useState('');
  
  // Array of image data (could be base64 strings or google drive IDs)
  const [screenshots, setScreenshots] = useState([]);
  // Local cache of resolved blob URLs for Google Drive screenshots
  const [resolvedImages, setResolvedImages] = useState({});
  const [loadingImages, setLoadingImages] = useState({});

  // Lightbox view state
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const blobUrlsRef = useRef([]);

  // Initialize fields on mount / change of active trade
  useEffect(() => {
    if (isEdit && trade) {
      setDate(trade.date);
      setTicker(trade.ticker || 'XAUUSD');
      setType(trade.type);
      setOutcome(trade.status || 'WIN');
      setRr(Math.abs(trade.pnl || 0).toString());
      setNotes(trade.notes || '');
      setScreenshots(trade.screenshots || []);
    } else {
      // Clear fields for new trade
      setDate(dateStr || new Date().toISOString().split('T')[0]);
      setTicker('XAUUSD');
      setType('BUY');
      setOutcome('WIN');
      setRr('1.0');
      setNotes('');
      setScreenshots([]);
    }
  }, [trade, isEdit, dateStr]);

  // Load and cache Google Drive screenshots
  useEffect(() => {
    screenshots.forEach((src) => {
      // If it is a Drive File ID and not yet resolved
      if (src && !src.startsWith('data:') && !resolvedImages[src] && !loadingImages[src]) {
        resolveDriveImage(src);
      }
    });
  }, [screenshots, resolvedImages, loadingImages]);

  const resolveDriveImage = async (fileId) => {
    setLoadingImages(prev => ({ ...prev, [fileId]: true }));
    try {
      const creds = getCredentials();
      const token = localStorage.getItem('google_access_token');
      if (!token) throw new Error("No google access token available");

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to load image");

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      blobUrlsRef.current.push(objectUrl);
      setResolvedImages(prev => ({ ...prev, [fileId]: objectUrl }));
    } catch (e) {
      console.error("Error loading drive image:", e);
    } finally {
      setLoadingImages(prev => ({ ...prev, [fileId]: false }));
    }
  };

  // Clean up Blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          console.warn("Failed to revoke URL:", url, e);
        }
      });
    };
  }, []);

  // Listen for paste events (Ctrl+V) to capture clipboard screenshots directly
  useEffect(() => {
    const handlePaste = async (e) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      for (let item of clipboardItems) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = async (event) => {
            const base64 = event.target.result;
            const compressed = await compressImage(base64);
            setScreenshots(prev => [...prev, compressed]);
          };
          reader.readAsDataURL(file);
          
          e.preventDefault(); // Stop default text insertion
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  // Handle image uploads
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    for (let file of files) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        // Compress image before saving to keep storage footprints low
        const compressed = await compressImage(base64);
        setScreenshots(prev => [...prev, compressed]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeScreenshot = (index) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  // Drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (let file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target.result;
          const compressed = await compressImage(base64);
          setScreenshots(prev => [...prev, compressed]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Determine signed R multiple for PnL
    const rrVal = parseFloat(rr) || 0;
    let pnlNum = 0;
    if (outcome === 'WIN') {
      pnlNum = Math.abs(rrVal);
    } else if (outcome === 'LOSS') {
      pnlNum = -Math.abs(rrVal);
    } else {
      pnlNum = 0;
    }

    const savedData = {
      id: isEdit ? trade.id : Date.now().toString(),
      date,
      time: '12:00', // default dummy
      ticker: ticker.toUpperCase(),
      type,
      entryPrice: 0,
      exitPrice: 0,
      size: 0,
      fees: 0,
      pnl: pnlNum,
      status: outcome,
      notes,
      screenshots
    };

    onSave(savedData);
  };

  const getImageSrc = (src) => {
    if (src.startsWith('data:')) return src;
    return resolvedImages[src] || '';
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Modify Trade Journal' : 'Record Trade Entry'}</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            
            {/* Ticker and Action Type */}
            <div className="form-row">
              <div className="form-group">
                <label>Ticker / Symbol</label>
                <select value={ticker} onChange={(e) => setTicker(e.target.value)}>
                  <option value="XAUUSD">XAUUSD</option>
                  <option value="EURUSD">EURUSD</option>
                  <option value="NAS100">NAS100</option>
                </select>
              </div>
              <div className="form-group">
                <label>Action</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="BUY">BUY (Long)</option>
                  <option value="SELL">SELL (Short)</option>
                </select>
              </div>
            </div>

            {/* Date & Outcome */}
            <div className="form-row">
              <div className="form-group">
                <label>Execution Date</label>
                <input 
                  type="date" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Outcome</label>
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  <option value="WIN">WIN</option>
                  <option value="LOSS">LOSS</option>
                  <option value="BREAKEVEN">BREAKEVEN</option>
                </select>
              </div>
            </div>

            {/* RR Ratio Field */}
            {outcome !== 'BREAKEVEN' && (
              <div className="form-group">
                <label>Realized Risk-to-Reward Ratio (R)</label>
                <input 
                  type="number" 
                  step="any" 
                  placeholder={outcome === 'LOSS' ? '1.0' : 'e.g. 2.5'} 
                  value={rr} 
                  onChange={(e) => setRr(e.target.value)} 
                  required 
                />
              </div>
            )}

            {/* Notes */}
            <div className="form-group">
              <label>Trade Notes / Reflection</label>
              <textarea 
                placeholder="Describe setup, rules followed, feelings, lessons..." 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Multi Screenshots Upload */}
            <div className="form-group">
              <label>Screenshots ({screenshots.length})</label>
              <div 
                className="image-upload-zone"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => document.getElementById('screenshot-file-input').click()}
              >
                <ImageIcon size={28} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                <span className="image-upload-text">Drag & drop, click to browse, or paste directly (Ctrl+V)</span>
                <span className="image-upload-subtext">Images are compressed for faster sync</span>
                <input 
                  id="screenshot-file-input" 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                  style={{ display: 'none' }} 
                />
              </div>

              {/* Screenshot Grid View */}
              {screenshots.length > 0 && (
                <div className="image-preview-grid">
                  {screenshots.map((src, index) => {
                    const imgUrl = getImageSrc(src);
                    const isLoading = !src.startsWith('data:') && loadingImages[src];

                    return (
                      <div key={index} className="image-preview-item">
                        {isLoading ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'rgba(0,0,0,0.4)' }}>
                            <RefreshCw size={18} className="animate-spin" />
                          </div>
                        ) : (
                          <img 
                            src={imgUrl} 
                            alt={`screenshot-${index}`} 
                            className="image-preview-img" 
                            onClick={() => setLightboxIndex(index)}
                          />
                        )}
                        <button 
                          type="button" 
                          className="image-preview-remove" 
                          onClick={() => removeScreenshot(index)}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Footer Actions */}
          <div className="modal-footer">
            {isEdit && (
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={() => onDelete(trade.id)}
                style={{ marginRight: 'auto' }}
              >
                <Trash2 size={16} />
                Delete Entry
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {isEdit ? 'Save Changes' : 'Record Trade'}
            </button>
          </div>
        </form>
      </div>

      {/* Screenshot Lightbox / Carousel View */}
      {lightboxIndex !== null && (
        <div className="lightbox-overlay" onClick={() => setLightboxIndex(null)}>
          <button className="lightbox-close" onClick={() => setLightboxIndex(null)}>
            <X size={24} />
          </button>
          
          {screenshots.length > 1 && (
            <button 
              className="lightbox-nav prev" 
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((lightboxIndex - 1 + screenshots.length) % screenshots.length);
              }}
            >
              <ChevronLeft size={28} />
            </button>
          )}

          <img 
            className="lightbox-img animate-scale-in" 
            src={getImageSrc(screenshots[lightboxIndex])} 
            alt="Screenshot enlarged view" 
            onClick={(e) => e.stopPropagation()}
          />

          {screenshots.length > 1 && (
            <button 
              className="lightbox-nav next" 
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((lightboxIndex + 1) % screenshots.length);
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
