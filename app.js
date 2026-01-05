// ETF Portfolio Tracker - FIXED VERSION
// Bug fix: Removed duplicate initialPortfolio - transactions are now the single source of truth
// Features:
// - Automatic overnight price refresh
// - Periodic updates during market hours
// - Smart caching to avoid rate limits
// - Last update timestamp tracking

// SINGLE SOURCE OF TRUTH: Transactions only
// Portfolio is calculated from these transactions

const initialTransactions = [
    // === INITIAL POSITIONS (January 2024) ===
    { date: '2024-01-15', etf: 'SOXX', action: 'BUY', shares: 107, price: 280.00, total: 29960, notes: 'Initial Position - Entry at dip' },
    { date: '2024-01-15', etf: 'VWO', action: 'BUY', shares: 139, price: 54.06, total: 7515, notes: 'Initial EM Position - Tranche 1' },
    { date: '2024-01-15', etf: 'AIA', action: 'BUY', shares: 78, price: 95.18, total: 7424, notes: 'Initial Asia Position' },
    { date: '2024-01-15', etf: 'SCHD', action: 'BUY', shares: 449, price: 27.86, total: 12509, notes: 'Initial Dividend Position' },
    
    // === VWO SCALING (June 2024) ===
    { date: '2024-06-15', etf: 'VWO', action: 'BUY', shares: 274, price: 54.38, total: 14900, notes: 'VWO Scale - Tranche 2' },
    
    // === DECEMBER 2024 DEPLOYMENT - First Wave ===
    { date: '2024-12-13', etf: 'SOXX', action: 'BUY', shares: 48, price: 310.00, total: 14880, notes: 'SOXX Scale T2 - Fibonacci entry' },
    { date: '2024-12-13', etf: 'IBIT', action: 'BUY', shares: 784, price: 51.00, total: 39984, notes: 'IBIT Initial - BTC dip entry' },
    { date: '2024-12-13', etf: 'ARKK', action: 'BUY', shares: 184, price: 81.50, total: 14996, notes: 'ARKK Initial - Breakout entry' },
    
    // === DECEMBER 2024 DEPLOYMENT - Scaling Wave ===
    { date: '2024-12-15', etf: 'SOXX', action: 'BUY', shares: 30, price: 305.00, total: 9150, notes: 'SOXX Scale T3 - Consolidation' },
    { date: '2024-12-15', etf: 'IWM', action: 'BUY', shares: 30, price: 253.83, total: 7615, notes: 'IWM Initial - First entry' },
    
    // === DECEMBER 29-30 PRECIOUS METALS (Fibonacci Entries) ===
    { date: '2024-12-29', etf: 'IAU', action: 'BUY', shares: 370, price: 81.72, total: 30236, notes: 'Gold - 0.382 Fib entry during capitulation' },
    { date: '2024-12-29', etf: 'SLV', action: 'BUY', shares: 305, price: 65.53, total: 19987, notes: 'Silver - 0.618 Fib entry, worst day in 5 years' },
    
    // === DECEMBER 30-31 OVERNIGHT FILLS (Market Weakness) ===
    { date: '2024-12-30', etf: 'ARKK', action: 'BUY', shares: 256, price: 78.00, total: 19968, notes: 'ARKK Scale T2 - Overnight fill during Dow weakness' },
    { date: '2024-12-30', etf: 'IWM', action: 'BUY', shares: 79, price: 249.00, total: 19671, notes: 'IWM Scale T2 - Limit order filled' },
    
    // === JANUARY 2025 MAJOR SCALING (Week of Jan 5) ===
    { date: '2025-01-02', etf: 'ARKK', action: 'BUY', shares: 126, price: 78.50, total: 9891, notes: 'ARKK Scale T3 - Additional accumulation' },
    { date: '2025-01-02', etf: 'IBIT', action: 'BUY', shares: 625, price: 48.00, total: 30000, notes: 'IBIT Scale T2 - Target $48 hit perfectly' },
    { date: '2025-01-03', etf: 'IWM', action: 'BUY', shares: 80, price: 248.70, total: 19896, notes: 'IWM Scale T3 - Lower target fill' }
];

// Strategy notes for each ETF (separate from position calculations)
const etfStrategies = {
    'SOXX': 'Semiconductors - Core growth position',
    'IBIT': 'Bitcoin exposure - Scaled accumulation',
    'ARKK': 'Innovation - Multi-tranche entry',
    'IWM': 'Small-cap value',
    'IAU': 'Gold hedge for dollar weakness',
    'SLV': 'Silver hedge for dollar weakness',
    'VWO': 'Emerging markets diversification',
    'AIA': 'Asia ex-Japan exposure',
    'SCHD': 'Dividend growth exposure',
    'VTI': 'Total market exposure',
    'HYG': 'High yield bonds',
    'INDA': 'India exposure'
};

// State management
let portfolio = [];
let transactions = [];
let currentPrices = {};
let lastPriceUpdate = null;
let priceUpdateInterval = null;

// Price update configuration
const PRICE_UPDATE_CONFIG = {
    marketHoursInterval: 5 * 60 * 1000,
    afterHoursInterval: 2 * 60 * 60 * 1000,
    staleThreshold: 30 * 60 * 1000,
    cacheKey: 'etf_price_cache',
    cacheTimestampKey: 'etf_price_cache_timestamp'
};

// Initialize app
function initializeApp() {
    const savedTransactions = localStorage.getItem('etf_transactions');
    
    if (savedTransactions) {
        transactions = JSON.parse(savedTransactions);
    } else {
        transactions = [...initialTransactions];
        saveTransactions();
    }
    
    // ALWAYS calculate portfolio from transactions - this is the fix!
    recalculatePortfolioFromTransactions();
    
    loadCachedPrices();
    renderDashboard();
    renderTransactions();
    renderStrategy();
    fetchCurrentPrices();
    setupAutomaticUpdates();
    setupEventListeners();
    updateLastUpdated();
}

function loadCachedPrices() {
    const cachedPrices = localStorage.getItem(PRICE_UPDATE_CONFIG.cacheKey);
    const cacheTimestamp = localStorage.getItem(PRICE_UPDATE_CONFIG.cacheTimestampKey);
    
    if (cachedPrices && cacheTimestamp) {
        currentPrices = JSON.parse(cachedPrices);
        lastPriceUpdate = new Date(parseInt(cacheTimestamp));
        console.log('Loaded cached prices from', lastPriceUpdate);
    } else {
        currentPrices = {
            'SOXX': 299.48,
            'IWM': 252.50,
            'ARKK': 80.39,
            'VWO': 53.94,
            'INDA': 53.37,
            'AIA': 95.27,
            'SCHD': 27.68,
            'HYG': 80.49,
            'IBIT': 51.20,
            'IAU': 81.72,
            'SLV': 65.53,
            'VTI': 338.40
        };
        console.log('Using fallback prices for initial display');
    }
}

function cachePrices() {
    localStorage.setItem(PRICE_UPDATE_CONFIG.cacheKey, JSON.stringify(currentPrices));
    localStorage.setItem(PRICE_UPDATE_CONFIG.cacheTimestampKey, Date.now().toString());
}

function isMarketHours() {
    const now = new Date();
    const day = now.getUTCDay();
    const hours = now.getUTCHours();
    
    if (day === 0 || day === 6) return false;
    return hours >= 13 && hours < 22;
}

function setupAutomaticUpdates() {
    if (priceUpdateInterval) {
        clearInterval(priceUpdateInterval);
    }
    
    const updateInterval = isMarketHours() 
        ? PRICE_UPDATE_CONFIG.marketHoursInterval 
        : PRICE_UPDATE_CONFIG.afterHoursInterval;
    
    console.log(`Setting up price updates every ${updateInterval / 1000 / 60} minutes`);
    
    priceUpdateInterval = setInterval(() => {
        console.log('Automatic price update triggered');
        fetchCurrentPrices(true);
    }, updateInterval);
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            const timeSinceUpdate = lastPriceUpdate 
                ? Date.now() - lastPriceUpdate.getTime() 
                : Infinity;
            
            if (timeSinceUpdate > PRICE_UPDATE_CONFIG.staleThreshold) {
                console.log('Page visible after long period, fetching fresh prices');
                fetchCurrentPrices(true);
            }
        }
    });
}

function savePortfolio() {
    localStorage.setItem('etf_portfolio', JSON.stringify(portfolio));
}

function saveTransactions() {
    localStorage.setItem('etf_transactions', JSON.stringify(transactions));
}

async function fetchCurrentPrices(isAutoUpdate = false) {
    const symbols = portfolio.map(p => p.etf).join(',');
    
    if (isAutoUpdate) {
        showUpdateIndicator();
    }
    
    try {
        console.log(`Fetching prices for: ${symbols}`);
        
        const response = await fetch(`https://yahoo-finance-proxy.aga-b10.workers.dev/?symbols=${symbols}`);
        
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
        if (!lastPriceUpdate) {
            lastPriceUpdate = new Date();
        }
    } finally {
        if (isAutoUpdate) {
            hideUpdateIndicator();
        }
    }
}

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

function renderDashboard() {
    const metrics = calculateMetrics();
    
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
    
    renderPositions();
}

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

function renderTransactions() {
    const tbody = document.getElementById('transactionsBody');
    if (!tbody) {
        console.error('transactionsBody element not found');
        return;
    }
    
    tbody.innerHTML = '';
    
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

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

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
    
    setTimeout(updateLastUpdated, 60000);
}

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

function closeTransactionModal() {
    document.getElementById('transactionModal').style.display = 'none';
}

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
    
    // Recalculate entire portfolio from scratch
    recalculatePortfolioFromTransactions();
    
    renderDashboard();
    renderTransactions();
    renderStrategy();
    
    closeTransactionModal();
}

function recalculatePortfolioFromTransactions() {
    // Start with empty portfolio
    portfolio = [];
    
    // Build portfolio from ALL transactions
    transactions.forEach(t => {
        let position = portfolio.find(p => p.etf === t.etf);
        
        if (!position) {
            position = {
                etf: t.etf,
                shares: 0,
                avgEntry: 0,
                invested: 0,
                reserved: 0,
                strategy: etfStrategies[t.etf] || 'Add your strategy notes here'
            };
            portfolio.push(position);
        }
        
        if (t.action === 'BUY') {
            const newTotalShares = position.shares + t.shares;
            const newTotalInvested = position.invested + t.total;
            position.avgEntry = newTotalShares > 0 ? newTotalInvested / newTotalShares : 0;
            position.shares = newTotalShares;
            position.invested = newTotalInvested;
        } else if (t.action === 'SELL') {
            const soldValue = t.shares * position.avgEntry;
            position.shares -= t.shares;
            position.invested -= soldValue;
            
            if (position.shares <= 0) {
                position.shares = 0;
                position.avgEntry = 0;
                position.invested = 0;
            }
        }
    });
    
    savePortfolio();
}

function deleteTransaction(index) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        // Get the sorted view to match what user sees
        const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        const transactionToDelete = sortedTransactions[index];
        
        // Find the actual index in the unsorted array
        const actualIndex = transactions.findIndex(t => 
            t.date === transactionToDelete.date && 
            t.etf === transactionToDelete.etf && 
            t.shares === transactionToDelete.shares &&
            t.price === transactionToDelete.price
        );
        
        transactions.splice(actualIndex, 1);
        saveTransactions();
        
        // Recalculate entire portfolio from remaining transactions
        recalculatePortfolioFromTransactions();
        
        renderDashboard();
        renderTransactions();
        renderStrategy();
    }
}

function setupEventListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    document.getElementById('transactionModal').addEventListener('click', (e) => {
        if (e.target.id === 'transactionModal') {
            closeTransactionModal();
        }
    });
    
    document.getElementById('transactionForm').addEventListener('submit', addTransaction);
    
    const refreshBtn = document.getElementById('refreshPrices');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchCurrentPrices(true);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
