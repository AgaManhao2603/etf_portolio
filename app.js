// ETF Portfolio Tracker - Enhanced with Automatic Price Updates
// Features:
// - Automatic overnight price refresh
// - Periodic updates during market hours
// - Smart caching to avoid rate limits
// - Last update timestamp tracking

// Initial portfolio data (from your spreadsheet)
const initialPortfolio = [
    { etf: 'SOXX', shares: 107.14, avgEntry: 280.00, invested: 30000, reserved: 0, strategy: 'Semiconductors - Wait for RSI cooldown below 70.' },
    { etf: 'IWM', shares: 30.04, avgEntry: 249.63, invested: 7500, reserved: 7500, strategy: 'Small-cap value - Buy on dips.' },
    { etf: 'ARKK', shares: 0, avgEntry: 0, invested: 0, reserved: 20000, strategy: 'Innovation - Wait for RSI < 70, target ~$75-78 range.' },
    { etf: 'VWO', shares: 414.46, avgEntry: 54.10, invested: 22425.26, reserved: 0, strategy: 'Emerging markets diversification.' },
    { etf: 'INDA', shares: 140.42, avgEntry: 53.41, invested: 7500, reserved: 0, strategy: 'India growth exposure.' },
    { etf: 'AIA', shares: 78.35, avgEntry: 95.72, invested: 7500, reserved: 0, strategy: 'Asia ex-Japan exposure.' },
    { etf: 'SCHD', shares: 449.64, avgEntry: 27.80, invested: 12500, reserved: 0, strategy: 'Good long-term entry anytime.' },
    { etf: 'HYG', shares: 123.92, avgEntry: 80.70, invested: 10000, reserved: 0, strategy: 'Stable high-yield bond exposure.' },
    { etf: 'IBIT', shares: 0, avgEntry: 0, invested: 0, reserved: 70000, strategy: 'BTC retracement targets: -15%, -25%, -35%' }
];

const initialTransactions = [
    { date: '2024-01-15', etf: 'SOXX', action: 'BUY', shares: 107.14, price: 280.00, total: 30000, notes: 'Initial Position' },
    { date: '2024-01-15', etf: 'IWM', action: 'BUY', shares: 30.04, price: 249.63, total: 7500, notes: 'Initial Position' },
    { date: '2024-01-15', etf: 'VWO', action: 'BUY', shares: 138.73, price: 54.06, total: 7500, notes: 'Initial Position' },
    { date: '2024-06-15', etf: 'VWO', action: 'BUY', shares: 275.73, price: 54.13, total: 14925.26, notes: 'Additional Purchase' },
    { date: '2024-01-15', etf: 'INDA', action: 'BUY', shares: 140.42, price: 53.41, total: 7500, notes: 'Initial Position' },
    { date: '2024-01-15', etf: 'AIA', action: 'BUY', shares: 78.35, price: 95.72, total: 7500, notes: 'Initial Position' },
    { date: '2024-01-15', etf: 'SCHD', action: 'BUY', shares: 449.64, price: 27.80, total: 12500, notes: 'Initial Position' },
    { date: '2024-01-15', etf: 'HYG', action: 'BUY', shares: 123.92, price: 80.70, total: 10000, notes: 'Initial Position' }
];

// State management
let portfolio = [];
let transactions = [];
let currentPrices = {};
let lastPriceUpdate = null;
let priceUpdateInterval = null;

// Price update configuration
const PRICE_UPDATE_CONFIG = {
    // Update every 5 minutes during market hours
    marketHoursInterval: 5 * 60 * 1000,
    // Update every 2 hours outside market hours
    afterHoursInterval: 2 * 60 * 60 * 1000,
    // Force update if data is older than 30 minutes
    staleThreshold: 30 * 60 * 1000,
    // Cache prices in localStorage
    cacheKey: 'etf_price_cache',
    cacheTimestampKey: 'etf_price_cache_timestamp'
};

// Initialize app
function initializeApp() {
    // Load data from localStorage or use initial data
    const savedPortfolio = localStorage.getItem('etf_portfolio');
    const savedTransactions = localStorage.getItem('etf_transactions');
    
    if (savedPortfolio) {
        portfolio = JSON.parse(savedPortfolio);
    } else {
        portfolio = [...initialPortfolio];
        savePortfolio();
    }
    
    if (savedTransactions) {
        transactions = JSON.parse(savedTransactions);
    } else {
        transactions = [...initialTransactions];
        saveTransactions();
    }
    
    // Load cached prices first for instant display
    loadCachedPrices();
    
    // Render initial view IMMEDIATELY with available data
    renderDashboard();
    renderTransactions();
    renderStrategy();
    
  // Fetch current prices - Manual refresh only
async function fetchCurrentPrices(isAutoUpdate = false) {
    // For now, just update the timestamp
    lastPriceUpdate = new Date();
    updateLastUpdated();
    
    if (isAutoUpdate) {
        showUpdateIndicator();
        setTimeout(() => hideUpdateIndicator(), 1000);
    }
    
    console.log('Manual price refresh - update prices in code when needed');
}

// Load cached prices from localStorage
function loadCachedPrices() {
    const cachedPrices = localStorage.getItem(PRICE_UPDATE_CONFIG.cacheKey);
    const cacheTimestamp = localStorage.getItem(PRICE_UPDATE_CONFIG.cacheTimestampKey);
    
    if (cachedPrices && cacheTimestamp) {
        currentPrices = JSON.parse(cachedPrices);
        lastPriceUpdate = new Date(parseInt(cacheTimestamp));
        console.log('Loaded cached prices from', lastPriceUpdate);
    } else {
        // Use fallback prices immediately if no cache
        currentPrices = {
            'SOXX': 316.29,
            'IWM': 254.81,
            'ARKK': 83.16,
            'VWO': 54.55,
            'INDA': 53.37,
            'AIA': 98.09,
            'SCHD': 27.57,
            'HYG': 80.74,
            'IBIT': 52.49
        };
        console.log('Using fallback prices for initial display');
    }
}

// Cache prices to localStorage
function cachePrices() {
    localStorage.setItem(PRICE_UPDATE_CONFIG.cacheKey, JSON.stringify(currentPrices));
    localStorage.setItem(PRICE_UPDATE_CONFIG.cacheTimestampKey, Date.now().toString());
}

// Check if we're in market hours (US market: 9:30 AM - 4:00 PM ET, Mon-Fri)
function isMarketHours() {
    const now = new Date();
    const day = now.getUTCDay();
    const hours = now.getUTCHours();
    
    // Weekend check (0 = Sunday, 6 = Saturday)
    if (day === 0 || day === 6) return false;
    
    // US Market hours in UTC: 14:30 - 21:00 (9:30 AM - 4:00 PM ET)
    // Adjusting for daylight saving time variations
    return hours >= 13 && hours < 22;
}

// Setup automatic price updates
function setupAutomaticUpdates() {
    // Clear any existing interval
    if (priceUpdateInterval) {
        clearInterval(priceUpdateInterval);
    }
    
    // Determine update frequency based on market hours
    const updateInterval = isMarketHours() 
        ? PRICE_UPDATE_CONFIG.marketHoursInterval 
        : PRICE_UPDATE_CONFIG.afterHoursInterval;
    
    console.log(`Setting up price updates every ${updateInterval / 1000 / 60} minutes`);
    
    // Set up periodic updates
    priceUpdateInterval = setInterval(() => {
        console.log('Automatic price update triggered');
        fetchCurrentPrices(true);
    }, updateInterval);
    
    // Also check when page becomes visible again (handles overnight scenarios)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            const timeSinceUpdate = lastPriceUpdate 
                ? Date.now() - lastPriceUpdate.getTime() 
                : Infinity;
            
            // If more than 30 minutes since last update, fetch fresh prices
            if (timeSinceUpdate > PRICE_UPDATE_CONFIG.staleThreshold) {
                console.log('Page visible after long period, fetching fresh prices');
                fetchCurrentPrices(true);
            }
        }
    });
}

// Save data to localStorage
function savePortfolio() {
    localStorage.setItem('etf_portfolio', JSON.stringify(portfolio));
}

function saveTransactions() {
    localStorage.setItem('etf_transactions', JSON.stringify(transactions));
}

// Fetch current prices using Yahoo Finance API
async function fetchCurrentPrices(isAutoUpdate = false) {
    const symbols = portfolio.map(p => p.etf).join(',');
    
    // Show update indicator
    if (isAutoUpdate) {
        showUpdateIndicator();
    }
    
    try {
        console.log(`Fetching prices for: ${symbols}`);
        
        // Use corsproxy.io - a reliable CORS proxy
        const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
        const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.quoteResponse && data.quoteResponse.result) {
            let pricesUpdated = false;
            data.quoteResponse.result.forEach(quote => {
                const newPrice = quote.regularMarketPrice || 0;
                if (newPrice > 0) {
                    currentPrices[quote.symbol] = newPrice;
                    pricesUpdated = true;
                }
            });
            
            if (pricesUpdated) {
                lastPriceUpdate = new Date();
                cachePrices();
                renderDashboard();
                updateLastUpdated();
                console.log('Prices updated successfully at', lastPriceUpdate);
            }
        }
    } catch (error) {
        console.warn('Unable to fetch live prices, using cached prices:', error.message);
        // Keep using cached/fallback prices
        if (!lastPriceUpdate) {
            lastPriceUpdate = new Date();
        }
    } finally {
        if (isAutoUpdate) {
            hideUpdateIndicator();
        }
    }
}

// Show/hide update indicator
function showUpdateIndicator() {
    const indicator = document.getElementById('updateIndicator');
    if (indicator) {
        indicator.style.display = 'flex';
    }
}

function hideUpdateIndicator() {
    const indicator = document.getElementById('updateIndicator');
    if (indicator) {
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 1000);
    }
}

// Calculate portfolio metrics
function calculateMetrics() {
    let totalInvested = 0;
    let totalValue = 0;
    let totalReserved = 0;
    
    portfolio.forEach(position => {
        totalInvested += position.invested;
        totalReserved += position.reserved;
        const currentPrice = currentPrices[position.etf] || position.avgEntry || 0;
        totalValue += position.shares * currentPrice;
    });
    
    const totalGainLoss = totalValue - totalInvested;
    const gainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;
    
    return {
        totalInvested,
        totalValue,
        totalReserved,
        totalGainLoss,
        gainLossPercent
    };
}

// Render dashboard
function renderDashboard() {
    const metrics = calculateMetrics();
    
    // Update summary cards
    document.getElementById('totalValue').textContent = formatCurrency(metrics.totalValue);
    document.getElementById('totalInvested').textContent = formatCurrency(metrics.totalInvested);
    document.getElementById('reservedCapital').textContent = formatCurrency(metrics.totalReserved);
    document.getElementById('totalGainLoss').textContent = formatCurrency(metrics.totalGainLoss);
    document.getElementById('numPositions').textContent = portfolio.filter(p => p.shares > 0).length;
    
    const changeElement = document.getElementById('totalChange');
    const changeAmount = formatCurrency(metrics.totalGainLoss);
    const changePercent = metrics.gainLossPercent.toFixed(2);
    changeElement.textContent = `${changeAmount} (${changePercent}%)`;
    changeElement.className = metrics.totalGainLoss >= 0 ? 'card-change positive' : 'card-change negative';
    
    const gainPercentElement = document.getElementById('gainLossPercent');
    gainPercentElement.textContent = `${changePercent}%`;
    gainPercentElement.className = metrics.totalGainLoss >= 0 ? 'positive' : 'negative';
    
    // Render positions
    renderPositions();
}

// Render positions table
function renderPositions() {
    const tbody = document.getElementById('positionsBody');
    if (!tbody) {
        console.error('positionsBody element not found');
        return;
    }
    
    tbody.innerHTML = '';
    
    portfolio.forEach((position, index) => {
        const currentPrice = currentPrices[position.etf] || position.avgEntry || 0;
        const currentValue = position.shares * currentPrice;
        const gainLoss = currentValue - position.invested;
        const gainLossPercent = position.invested > 0 ? (gainLoss / position.invested) * 100 : 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="etf-symbol">${position.etf}</td>
            <td>${position.shares.toFixed(2)}</td>
            <td>${formatCurrency(position.avgEntry)}</td>
            <td class="current-price">${formatCurrency(currentPrice)}</td>
            <td>${formatCurrency(position.invested)}</td>
            <td>${formatCurrency(currentValue)}</td>
            <td class="${gainLoss >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(gainLoss)}<br>
                <small>(${gainLossPercent.toFixed(2)}%)</small>
            </td>
            <td>${formatCurrency(position.reserved)}</td>
            <td class="actions">
                <button class="btn-small btn-primary" onclick="openTransactionModal('${position.etf}', 'BUY')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Buy
                </button>
                <button class="btn-small btn-danger" onclick="openTransactionModal('${position.etf}', 'SELL')" ${position.shares === 0 ? 'disabled' : ''}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Sell
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Render transactions table
function renderTransactions() {
    const tbody = document.getElementById('transactionsBody');
    if (!tbody) {
        console.error('transactionsBody element not found');
        return;
    }
    
    tbody.innerHTML = '';
    
    // Sort transactions by date (newest first)
    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedTransactions.forEach((transaction, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(transaction.date)}</td>
            <td class="etf-symbol">${transaction.etf}</td>
            <td class="action ${transaction.action.toLowerCase()}">${transaction.action}</td>
            <td>${transaction.shares.toFixed(2)}</td>
            <td>${formatCurrency(transaction.price)}</td>
            <td>${formatCurrency(transaction.total)}</td>
            <td>${transaction.notes || '-'}</td>
            <td class="actions">
                <button class="btn-icon" onclick="deleteTransaction(${index})" title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Render strategy notes
function renderStrategy() {
    const tbody = document.getElementById('strategyBody');
    if (!tbody) {
        console.error('strategyBody element not found');
        return;
    }
    
    tbody.innerHTML = '';
    
    portfolio.forEach(position => {
        const currentPrice = currentPrices[position.etf] || position.avgEntry || 0;
        const priceVsEntry = position.avgEntry > 0 
            ? ((currentPrice - position.avgEntry) / position.avgEntry * 100).toFixed(2)
            : 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="etf-symbol">${position.etf}</td>
            <td>${position.strategy}</td>
            <td>${formatCurrency(position.avgEntry)}</td>
            <td class="current-price">${formatCurrency(currentPrice)}</td>
            <td class="${parseFloat(priceVsEntry) >= 0 ? 'positive' : 'negative'}">
                ${priceVsEntry}%
            </td>
            <td>${formatCurrency(position.reserved)}</td>
        `;
        tbody.appendChild(row);
    });
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

// Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Update last updated timestamp
function updateLastUpdated() {
    const element = document.getElementById('lastUpdated');
    if (element && lastPriceUpdate) {
        const now = new Date();
        const diff = Math.floor((now - lastPriceUpdate) / 1000);
        
        let timeAgo;
        if (diff < 60) {
            timeAgo = 'just now';
        } else if (diff < 3600) {
            const minutes = Math.floor(diff / 60);
            timeAgo = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            const hours = Math.floor(diff / 3600);
            timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
        
        element.textContent = `Last updated: ${timeAgo}`;
    }
    
    // Update again in 1 minute
    setTimeout(updateLastUpdated, 60000);
}

// Open transaction modal
function openTransactionModal(etf = '', action = 'BUY') {
    const modal = document.getElementById('transactionModal');
    const form = document.getElementById('transactionForm');
    const title = document.getElementById('modalTitle');
    
    title.textContent = `${action} ${etf || 'ETF'}`;
    form.reset();
    
    document.getElementById('transactionETF').value = etf;
    document.getElementById('transactionAction').value = action;
    document.getElementById('transactionDate').value = new Date().toISOString().split('T')[0];
    
    modal.style.display = 'flex';
}

// Close transaction modal
function closeTransactionModal() {
    document.getElementById('transactionModal').style.display = 'none';
}

// Add transaction
function addTransaction(event) {
    event.preventDefault();
    
    const etf = document.getElementById('transactionETF').value.toUpperCase();
    const action = document.getElementById('transactionAction').value;
    const shares = parseFloat(document.getElementById('transactionShares').value);
    const price = parseFloat(document.getElementById('transactionPrice').value);
    const date = document.getElementById('transactionDate').value;
    const notes = document.getElementById('transactionNotes').value;
    
    const total = shares * price;
    
    const transaction = {
        date,
        etf,
        action,
        shares,
        price,
        total,
        notes
    };
    
    transactions.push(transaction);
    saveTransactions();
    
    // Update portfolio
    updatePortfolio(etf, action, shares, price, total);
    
    // Refresh views
    renderDashboard();
    renderTransactions();
    renderStrategy();
    
    // Close modal
    closeTransactionModal();
}

// Update portfolio based on transaction
function updatePortfolio(etf, action, shares, price, total) {
    let position = portfolio.find(p => p.etf === etf);
    
    if (!position) {
        // Create new position
        position = {
            etf,
            shares: 0,
            avgEntry: 0,
            invested: 0,
            reserved: 0,
            strategy: 'Add your strategy notes here'
        };
        portfolio.push(position);
    }
    
    if (action === 'BUY') {
        const newTotalShares = position.shares + shares;
        const newTotalInvested = position.invested + total;
        position.avgEntry = newTotalInvested / newTotalShares;
        position.shares = newTotalShares;
        position.invested = newTotalInvested;
        
        // Reduce reserved capital
        if (position.reserved >= total) {
            position.reserved -= total;
        } else {
            position.reserved = 0;
        }
    } else if (action === 'SELL') {
        const soldValue = shares * position.avgEntry;
        position.shares -= shares;
        position.invested -= soldValue;
        
        if (position.shares <= 0) {
            position.shares = 0;
            position.avgEntry = 0;
            position.invested = 0;
        }
    }
    
    savePortfolio();
}

// Delete transaction
function deleteTransaction(index) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        transactions.splice(index, 1);
        saveTransactions();
        
        // Recalculate entire portfolio from scratch
        recalculatePortfolio();
        
        renderDashboard();
        renderTransactions();
        renderStrategy();
    }
}

// Recalculate portfolio from transactions
function recalculatePortfolio() {
    // Reset all positions
    portfolio = [...initialPortfolio];
    
    // Replay all transactions
    transactions.forEach(t => {
        updatePortfolio(t.etf, t.action, t.shares, t.price, t.total);
    });
    
    savePortfolio();
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // Modal close on background click
    document.getElementById('transactionModal').addEventListener('click', (e) => {
        if (e.target.id === 'transactionModal') {
            closeTransactionModal();
        }
    });
    
    // Form submission
    document.getElementById('transactionForm').addEventListener('submit', addTransaction);
    
    // Manual refresh button
    const refreshBtn = document.getElementById('refreshPrices');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchCurrentPrices(true);
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
