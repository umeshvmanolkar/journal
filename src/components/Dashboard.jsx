import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Percent, BarChart3 } from 'lucide-react';

export default function Dashboard({ trades }) {
  // 1. Calculate Stats
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  const breakEvenTrades = trades.filter(t => t.pnl === 0);

  const winCount = winningTrades.length;
  const lossCount = losingTrades.length;
  
  const winRate = totalTrades > 0 
    ? Math.round((winCount / (winCount + lossCount || 1)) * 100) 
    : 0;

  const totalProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  const netPnl = totalProfit - totalLoss;

  const avgWin = winCount > 0 ? (totalProfit / winCount) : 0;
  const avgLoss = lossCount > 0 ? (totalLoss / lossCount) : 0;

  const profitFactor = totalLoss > 0 
    ? (totalProfit / totalLoss).toFixed(2) 
    : totalProfit > 0 ? '∞' : '0.00';

  // 2. Generate Cumulative P&L Data for SVG Chart
  // Sort trades chronologically: oldest first
  const sortedTrades = [...trades].sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
    const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
    return dateA - dateB;
  });

  const chartPoints = [];
  let currentCumulative = 0;
  
  // Starting point (0)
  chartPoints.push({ xLabel: 'Start', yVal: 0 });
  
  sortedTrades.forEach((t) => {
    currentCumulative += t.pnl;
    chartPoints.push({
      xLabel: `${t.date.split('-')[1]}/${t.date.split('-')[2]}`,
      yVal: currentCumulative,
      ticker: t.ticker,
      pnl: t.pnl
    });
  });

  // Calculate SVG Coordinates
  const svgWidth = 800;
  const svgHeight = 220;
  const paddingX = 60;
  const paddingY = 30;

  const activeWidth = svgWidth - paddingX * 2;
  const activeHeight = svgHeight - paddingY * 2;

  const yValues = chartPoints.map(p => p.yVal);
  const minY = Math.min(...yValues, 0);
  const maxY = Math.max(...yValues, 100); // default height to 100 if all zero
  const yRange = maxY - minY || 1;

  const pointsCount = chartPoints.length;

  const getSvgCoords = (index, value) => {
    const x = paddingX + (index / (pointsCount - 1 || 1)) * activeWidth;
    // Invert Y coordinate because SVG (0,0) is top-left
    const y = paddingY + activeHeight - ((value - minY) / yRange) * activeHeight;
    return { x, y };
  };

  // Build the path strings
  let linePath = '';
  let areaPath = '';
  const coordinateList = [];

  if (pointsCount > 0) {
    chartPoints.forEach((point, i) => {
      const { x, y } = getSvgCoords(i, point.yVal);
      coordinateList.push({ x, y, ...point });

      if (i === 0) {
        linePath = `M ${x} ${y}`;
        areaPath = `M ${x} ${paddingY + activeHeight} L ${x} ${y}`;
      } else {
        linePath += ` L ${x} ${y}`;
        areaPath += ` L ${x} ${y}`;
      }
    });

    // Close the area path to the bottom axis
    const lastCoord = coordinateList[coordinateList.length - 1];
    areaPath += ` L ${lastCoord.x} ${paddingY + activeHeight} Z`;
  }

  // Draw grid lines
  const gridLines = 4;
  const yGridValues = [];
  for (let i = 0; i <= gridLines; i++) {
    yGridValues.push(minY + (yRange / gridLines) * i);
  }

  // Circular gauge settings for win rate
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (winRate / 100) * circumference;

  return (
    <div className="dashboard-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* 4-Column Stat Grid */}
      <div className="dashboard-grid">
        {/* Net P&L */}
        <div className={`glass-card stat-card ${netPnl >= 0 ? 'profit' : 'loss'}`}>
          <span className="stat-label">Net Performance</span>
          <div className="stat-value" style={{ color: netPnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
            {netPnl >= 0 ? '+' : ''}{netPnl.toFixed(2)} R
          </div>
          <span className="stat-desc">Net R-multiple output</span>
        </div>

        {/* Win Rate Ring */}
        <div className="glass-card stat-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
          <div>
            <span className="stat-label">Win Rate</span>
            <div className="stat-value" style={{ marginTop: '0.25rem' }}>{winRate}%</div>
            <span className="stat-desc">{winCount} W - {lossCount} L</span>
          </div>
          <div className="win-rate-ring-container">
            <svg className="win-rate-svg">
              <circle className="win-rate-track" cx="45" cy="45" r={radius} />
              <circle 
                className="win-rate-indicator" 
                cx="45" 
                cy="45" 
                r={radius} 
                style={{ 
                  strokeDasharray: circumference, 
                  strokeDashoffset: strokeDashoffset,
                  stroke: winRate >= 50 ? 'var(--color-profit)' : '#f59e0b'
                }} 
              />
            </svg>
            <span className="win-rate-text">{winRate}%</span>
          </div>
        </div>

        {/* Profit Factor */}
        <div className="glass-card stat-card">
          <span className="stat-label">Profit Factor</span>
          <div className="stat-value" style={{ color: Number(profitFactor) >= 1.5 || profitFactor === '∞' ? 'var(--color-profit)' : 'inherit' }}>
            {profitFactor}
          </div>
          <span className="stat-desc">Ratio of gross gains / gross losses</span>
        </div>

        {/* Avg Win / Avg Loss */}
        <div className="glass-card stat-card">
          <span className="stat-label">Wins vs Losses</span>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
            <div>
              <span className="stat-desc" style={{ color: 'var(--color-profit)', fontWeight: 700 }}>Avg Win</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-profit)' }}>
                {avgWin.toFixed(2)} R
              </div>
            </div>
            <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem' }}>
              <span className="stat-desc" style={{ color: 'var(--color-loss)', fontWeight: 700 }}>Avg Loss</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-loss)' }}>
                -{avgLoss.toFixed(2)} R
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Curve Graph */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={18} style={{ color: 'var(--accent-primary)' }} />
            Equity Curve
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Cumulative P&L over {totalTrades} trades
          </span>
        </div>

        <div className="chart-container">
          {totalTrades === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📈</span>
              <h3>No trading data available</h3>
              <p>Add your first trade to generate your equity curve.</p>
            </div>
          ) : (
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="chart-svg">
              <defs>
                <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {yGridValues.map((val, i) => {
                const y = paddingY + activeHeight - ((val - minY) / yRange) * activeHeight;
                return (
                  <g key={i}>
                    <line 
                      x1={paddingX} 
                      y1={y} 
                      x2={svgWidth - paddingX} 
                      y2={y} 
                      className="chart-grid-line" 
                    />
                    <text 
                      x={paddingX - 10} 
                      y={y + 3} 
                      textAnchor="end" 
                      className="chart-text"
                    >
                      {val >= 0 ? '+' : ''}{val.toFixed(1)}R
                    </text>
                  </g>
                );
              })}

              {/* Area & Line */}
              <path d={areaPath} className="chart-path-area" />
              <path d={linePath} className="chart-path-line" />

              {/* Data Points */}
              {coordinateList.map((c, i) => (
                <circle
                  key={i}
                  cx={c.x}
                  cy={c.y}
                  r="4"
                  className="chart-point"
                  title={`${c.xLabel}: ${c.yVal.toFixed(2)} R`}
                />
              ))}

              {/* X Axis Labels */}
              {coordinateList.filter((_, idx) => {
                // Throttle X axis labels to prevent cluttering
                const step = Math.ceil(coordinateList.length / 10) || 1;
                return idx % step === 0 || idx === coordinateList.length - 1;
              }).map((c, i) => (
                <text
                  key={i}
                  x={c.x}
                  y={svgHeight - paddingY + 15}
                  textAnchor="middle"
                  className="chart-text"
                >
                  {c.xLabel}
                </text>
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
