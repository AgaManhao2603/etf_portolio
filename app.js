// ETF Portfolio Tracker - CLOUD STORAGE VERSION
// Versioned data storage: bumping DATA_VERSION forces clean reinitialize
// so code logic changes never conflict with stale stored data

// CONFIGURATION
const CONFIG = {
    DATA_VERSION: 5,                              // v5: Added IAU T2 + fixed calculateMetrics G/L
    CLOUD_STORAGE_KEY: 'etf_portfolio_v5',
    CLOUD_PRICES_KEY: 'etf_current_prices',
    LOCAL_BACKUP_KEY: 'etf_portfolio_local_v5',
    PRICE_UPDATE: {
        marketHoursInterval: 5 * 60 * 1000,      // 5 minutes during market hours
        afterHoursInterval: 2 * 60 * 60 * 1000,  // 2 hours after hours
        staleThreshold: 30 * 60 * 1000            // 30 minutes
    }
};

// INITIAL TRANSACTIONS - Complete history (single source of truth)
const initialTransactions = [
    // === INITIAL POSITIONS (January 2024) ===
    { date: '2024-01-15', etf: 'SOXX', action: 'BUY', shares: 107, price: 280.00, total: 29960, notes: 'Initial Position - Entry at dip' },
    { date: '2024-01-15', etf: 'SCHD', action: 'BUY', shares: 449, price: 27.86, total: 12509, notes: 'Initial Dividend Position' },
    { date: '2024-01-15', etf: 'IWM', action: 'BUY', shares: 30, price: 253.83, total: 7615, notes: 'IWM Initial - First entry' },

    // === DECEMBER 2024 SCALING ===
    { date: '2024-12-13', etf: 'SOXX', action: 'BUY', shares: 48, price: 310.00, total: 14880, notes: 'SOXX Scale T2 - Fibonacci entry' },
    { date: '2024-12-15', etf: 'SOXX', action: 'BUY', shares: 30, price: 305.00, total: 9150, notes: 'SOXX Scale T3 - Consolidation' },
    { date: '2024-12-29', etf: 'IAU', action: 'BUY', shares: 370, price: 81.72, total: 30236, notes: 'Gold - 0.382 Fib entry during capitulation' },
    { date: '2024-12-29', etf: 'SLV', action: 'BUY', shares: 305, price: 65.53, total: 19987, notes: 'Silver - 0.618 Fib entry' },
    { date: '2024-12-31', etf: 'IWM', action: 'BUY', shares: 79, price: 249.00, total: 19671, notes: 'IWM Scale T2 - Overnight fill' },

    // === JANUARY 2025 SCALING ===
    { date: '2025-01-03', etf: 'IWM', action: 'BUY', shares: 80, price: 248.70, total: 19896, notes: 'IWM Scale T3 - Lower target fill' },
    { date: '2025-01-05', etf: 'SCHD', action: 'BUY', shares: 2158, price: 27.96, total: 60338, notes: 'SCHD Scale - Major accumulation' },
    { date: '2025-01-05', etf: 'VTI', action: 'BUY', shares: 212, price: 338.40, total: 71741, notes: 'VTI - New total market position' },
    { date: '2025-01-06', etf: 'IAU', action: 'BUY', shares: 479, price: 95.08, total: 45544, notes: 'IAU Scale - Dollar weakness hedge' },
    { date: '2025-01-06', etf: 'SLV', action: 'BUY', shares: 1353, price: 99.57, total: 134716, notes: 'SLV Scale - Major silver position' },

    // === APRIL 2025 REBALANCING ===
    { date: '2025-04-20', etf: 'SOXX', action: 'SELL', shares: 50, price: 418.24, total: 20912, notes: 'Partial take-profit - redeploy to IAU' },

    // === APRIL 2026 IAU DCA (redeployed from SOXX sale) ===
    { date: '2026-04-24', etf: 'IAU', action: 'BUY', shares: 113, price: 88.18, total: 9964.34, notes: 'IAU T1 - Bought the dip, redeployed from SOXX sale' },
    { date: '2026-04-28', etf: 'IAU', action: 'BUY', shares: 127, price: 86.23, total: 10951.21, notes: 'IAU T2 - DBS fill at gold $4,600 level' }
];

// Strategy notes for each ETF
const etfStrategies = {
    'SOXX': 'Semiconductors - Core growth position',
    'IWM': 'Small-cap value',
    'IAU': 'Gold hedge for dollar weakness',
    'SLV': 'Silver hedge for dollar weakness',
    'SCHD': 'Dividend growth exposure',
    'VTI': 'Total market exposure'
};

// State management
let portfolio = [];
let transactions = [];
let currentPrices = {};
let lastPriceUpdate = null;
let priceUpdateInterval = null;
let cloudStorageAvailable = typeof window !== 'undefined' && typeof window.storage !== 'undefined';

// ============================================================================
// CLOUD STORAGE FUNCTIONS
// ============================================================================

async function saveTransactionsToCloud() {
    const payload = JSON.stringify({
        version: CONFIG.DATA_VERSION,
        transactions: transactions
    });

    if (!cloudStorageAvailable) {
        console.warn('Cloud storage not available, using localStorage only');
        localStorage.setItem(CONFIG.LOCAL_BACKUP_KEY, payload);
        return;
    }

    try {
        const result = await window.storage.set(CONFIG.CLOUD_STORAGE_KEY, payload);
        if (result) {
            console.log('✅ Transactions saved to cloud storage');
        }
    } catch (err) {
        console.error('Cloud save failed:', err);
    }

    // Always keep local backup
    try {
        localStorage.setItem(CONFIG.LOCAL_BACKUP_KEY, payload);
    } catch (e) {
        console.warn('localStorage backup failed:', e);
    }
}

async function loadTransactionsFromCloud() {
    let data = null;

    // Try cloud first
    if (cloudStorageAvailable) {
        try {
            const result = await window.storage.get(CONFIG.CLOUD_STORAGE_KEY);
            if (result && result.value) {
                data = JSON.parse(result.value);
                console.log('✅ Loaded from cloud storage');
            }
        } catch (err) {
            console.warn('Cloud load failed:', err);
        }
    }

    // Fallback to localStorage
    if (!data) {
        try {
            const local = localStorage.getItem(CONFIG.LOCAL_BACKUP_KEY);
            if (local) {
                data = JSON.parse(local);
                console.log('✅ Loaded from localStorage backup');
            }
        } catch (e) {
            console.warn('localStorage load failed:', e);
        }
    }

    // Version check: if stored version doesn't match code, reinitialize
    if (data && data.version === CONFIG.DATA_VERSION) {
        return data.transactions;
    }

    if (data && data.version !== CONFIG.DATA_VERSION) {
        console.log(`⚠️ Data version mismatch (stored: ${data.version}, code: ${CONFIG.DATA_VERSION}). Reinitializing...`);
    }

    return null; // Will trigger initialization from initialTransactions
}

async function savePricesToCloud() {
    const payload = JSON.stringify({
        prices: currentPrices,
        timestamp: Date.now()
    });

    if (cloudStorageAvailable) {
        try {
            await window.storage.set(CONFIG.CLOUD_PRICES_KEY, payload);
        } catch (err) {
            console.warn('Price cache save failed:', err);
        }
    }

    try {
        localStorage.setItem(CONFIG.CLOUD_PRICES_KEY, payload);
    } catch (e) { /* ignore */ }
}

async function loadPricesFromCloud() {
    let data = null;

    if (cloudStorageAvailable) {
        try {
            const result = await window.storage.get(CONFIG.CLOUD_PRICES_KEY);
            if (result && result.value) {
                data = JSON.parse(result.value);
            }
        } catch (err) { /* ignore */ }
    }

    if (!data) {
        try {
            const local = localStorage.getItem(CONFIG.CLOUD_PRICES_KEY);
            if (local) data = JSON.parse(local);
        } catch (e) { /* ignore */ }
    }

    if (data && data.prices) {
        const age = Date.now() - (data.timestamp || 0);
        if (age < CONFIG.PRICE_UPDATE.afterHoursInterval) {
            currentPrices = data.prices;
            console.log('✅ Loaded cached prices');
            return true;
        }
    }

    return false;
}

// ============================================================================
// PORTFOLIO CALCULATION
// ============================================================================
//
// ACCOUNTING MODEL:
//
//   totalBuys  = sum of all buy amounts for this ETF (never reduced on sells)
//                This is the "Original Investment" display value.
//
//   costBasis  = cost of shares you STILL HOLD (reduced on sells)
//                This drives avgEntry calculation only.
//
//   totalSells = sum of all sell proceeds for this ETF
//
//   redeployed = portion of buys funded by sale proceeds from other ETFs
//                (informational tag only — does NOT affect P&L math)
//
// PER-ROW DISPLAY:
//   Invested   = totalBuys  (always shows original investment)
//   P&L        = currentValue − totalBuys
//   Sell tag   = shows cash received from sales for this ETF
//   Redeployed = shows portion funded by sale proceeds (cyan tag)
//
// DASHBOARD TOTALS:
//   Total Invested = sum(totalBuys) − sum(totalSells) = net capital deployed
//   Portfolio Value = sum(shares × price)
//   P&L            = Portfolio Value − Total Invested
//   Undeployed Cash = sale proceeds not yet redeployed (informational)
//
// NOTE: Per-row invested totals will exceed dashboard "Total Invested"
// by the amount of sale proceeds. This is expected — rows show gross
// investment per ETF, dashboard shows net capital in the market.
// ============================================================================

function recalculatePortfolioFromTransactions() {
    portfolio = [];

    // Track sale proceeds pool for redeployment tagging
    let saleProceedsPool = 0;

    // Sort transactions by date to process in order
    const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(t => {
        let position = portfolio.find(p => p.etf === t.etf);

        if (!position) {
            position = {
                etf: t.etf,
                shares: 0,
                avgEntry: 0,
                totalBuys: 0,
                costBasis: 0,
                totalSells: 0,
                redeployed: 0,
                strategy: etfStrategies[t.etf] || 'Add strategy notes'
            };
            portfolio.push(position);
        }

        if (t.action === 'BUY') {
            // Track redeployment: if there are sale proceeds available, tag this buy
            if (saleProceedsPool > 0) {
                const redeployedAmount = Math.min(saleProceedsPool, t.total);
                position.redeployed += redeployedAmount;
                saleProceedsPool -= redeployedAmount;
            }

            position.shares += t.shares;
            position.totalBuys += t.total;
            position.costBasis += t.total;
            position.avgEntry = position.shares > 0 ? position.costBasis / position.shares : 0;

        } else if (t.action === 'SELL') {
            const costPerShare = position.shares > 0 ? position.costBasis / position.shares : 0;
            const soldCostBasis = t.shares * costPerShare;

            position.shares -= t.shares;
            position.costBasis -= soldCostBasis;
            position.totalSells += t.total;

            // Add sale proceeds to redeployment pool
            saleProceedsPool += t.total;

            if (position.shares <= 0) {
                position.shares = 0;
                position.costBasis = 0;
                position.avgEntry = 0;
            } else {
                position.avgEntry = position.costBasis / position.shares;
            }
        }
    });

    console.log('Portfolio recalculated:', portfolio.filter(p => p.shares > 0).length, 'active positions');
}

// ============================================================================
// DASHBOARD RENDERING
// ============================================================================

function calculateMetrics() {
    let totalBuysAll = 0;
    let totalSellsAll = 0;
    let totalValue = 0;
    let totalRedeployedAll = 0;

    portfolio.forEach(position => {
        totalBuysAll += position.totalBuys;
        totalSellsAll += position.totalSells;
        totalRedeployedAll += (position.redeployed || 0);
        const currentPrice = currentPrices[position.etf] || position.avgEntry || 0;
        totalValue += position.shares * currentPrice;
    });

    // Total Invested = gross buys (matches sum of per-row "Invested" columns)
    // This is what you actually deployed into positions, including internal transfers.
    const totalInvested = totalBuysAll;

    // Undeployed cash = sale proceeds not yet redeployed into new buys
    const undeployedCash = totalSellsAll - totalRedeployedAll;

    // =========================================================================
    // CRITICAL FIX (v5): G/L = market value minus GROSS buys
    //
    // This ensures: sum of per-row G/L === dashboard G/L  (always consistent)
    //
    // Previous bugs:
    //   v3: subtracted redeployed from cost basis → G/L was $20K too high
    //   v4: used buys - sells → G/L didn't match sum of rows
    //   v5: uses gross buys → perfect match with rows ✅
    // =========================================================================
    const totalGainLoss = totalValue - totalInvested;
    const gainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

    return {
        totalInvested,
        totalValue,
        undeployedCash,
        totalGainLoss,
        gainLossPercent
    };
}

function renderDashboard() {
    const metrics = calculateMetrics();

    document.getElementById('totalValue').textContent = formatCurrency(metrics.totalValue);
    document.getElementById('totalInvested').textContent = formatCurrency(metrics.totalInvested);
    document.getElementById('totalGainLoss').textContent = formatCurrency(metrics.totalGainLoss);

    const cashElement = document.getElementById('undeployedCash');
    if (cashElement) {
        cashElement.textContent = formatCurrency(metrics.undeployedCash);
    }

    // Count only non-zero positions
    const activePositions = portfolio.filter(p => p.etf && p.shares > 0).length;
    document.getElementById('numPositions').textContent = activePositions;

    const changeElement = document.getElementById('totalChange');
    const changeAmount = formatCurrency(metrics.totalGainLoss);
    const changePercent = metrics.gainLossPercent.toFixed(2);
    changeElement.textContent = `${changeAmount} (${changePercent}%)`;
    changeElement.className = metrics.totalGainLoss >= 0 ? 'card-change positive' : 'card-change negative';

    const gainPercentElement = document.getElementById('gainLossPercent');
    if (gainPercentElement) {
        gainPercentElement.textContent = `${changePercent}%`;
        gainPercentElement.className = metrics.totalGainLoss >= 0 ? 'positive' : 'negative';
    }

    renderPositions();
}

function renderPositions() {
    const tbody = document.getElementById('positionsBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const activePositions = portfolio.filter(p => p.etf && p.shares > 0);

    activePositions.forEach((position) => {
        const currentPrice = currentPrices[position.etf] || position.avgEntry || 0;
        const currentValue = position.shares * currentPrice;

        // =====================================================================
        // INVESTED = totalBuys (total capital in this ETF, including redeployed)
        //
        // P&L = current value vs full invested amount
        // This correctly reflects per-share performance.
        // Redeployed tag is informational only.
        // =====================================================================
        const invested = position.totalBuys;
        const gainLoss = currentValue - invested;
        const gainLossPercent = invested > 0 ? (gainLoss / invested) * 100 : 0;

        const row = document.createElement('tr');

        // Invested cell with sell/redeployed tags
        let investedHTML = formatCurrency(invested);
        if (position.totalSells > 0) {
            investedHTML += `<br><span class="sell-tag">Sold: ${formatCurrency(position.totalSells)}</span>`;
        }
        if (position.redeployed > 0) {
            investedHTML += `<br><span class="redeployed-tag">Redeployed: ${formatCurrency(position.redeployed)}</span>`;
        }

        row.innerHTML = `
            <td class="etf-name">${position.etf}</td>
            <td>${position.shares.toFixed(2)}</td>
            <td>${formatCurrency(position.avgEntry)}</td>
            <td class="current-price">${formatCurrency(currentPrice)}</td>
            <td>${investedHTML}</td>
            <td>${formatCurrency(currentValue)}</td>
            <td class="${gainLoss >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(gainLoss)}<br>
                <small>(${gainLossPercent.toFixed(2)}%)</small>
            </td>
            <td>
                <button class="btn btn-buy" onclick="openTransactionModal('BUY', '${position.etf}')">+ Buy</button>
                <button class="btn btn-sell" onclick="openTransactionModal('SELL', '${position.etf}')">− Sell</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

// ============================================================================
// TRANSACTIONS TAB
// ============================================================================

function renderTransactions() {
    const tbody = document.getElementById('transactionsBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedTransactions.forEach((t, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${new Date(t.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            <td class="etf-name">${t.etf}</td>
            <td><span class="action-badge ${t.action.toLowerCase()}">${t.action}</span></td>
            <td>${t.shares.toFixed(2)}</td>
            <td>${formatCurrency(t.price)}</td>
            <td>${formatCurrency(t.total)}</td>
            <td>${t.notes || ''}</td>
            <td><button class="btn-delete" onclick="deleteTransaction(${index})">🗑</button></td>
        `;
        tbody.appendChild(row);
    });
}

// ============================================================================
// STRATEGY TAB
// ============================================================================

function renderStrategy() {
    const tbody = document.getElementById('strategyBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const activePositions = portfolio.filter(p => p.shares > 0);

    activePositions.forEach(position => {
        const currentPrice = currentPrices[position.etf] || position.avgEntry || 0;
        const currentValue = position.shares * currentPrice;
        const metrics = calculateMetrics();
        const allocation = metrics.totalValue > 0 ? (currentValue / metrics.totalValue * 100) : 0;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="etf-name">${position.etf}</td>
            <td>${allocation.toFixed(1)}%</td>
            <td>${formatCurrency(currentValue)}</td>
            <td>${position.strategy}</td>
        `;
        tbody.appendChild(row);
    });
}

// ============================================================================
// PRICE UPDATES
// ============================================================================

function isMarketHours() {
    const now = new Date();
    const day = now.getUTCDay();
    const hours = now.getUTCHours();

    if (day === 0 || day === 6) return false;
    return hours >= 13 && hours < 22; // US market hours in UTC
}

async function fetchCurrentPrices(isAutoUpdate = false) {
    const activeETFs = portfolio.filter(p => p.shares > 0).map(p => p.etf);
    if (activeETFs.length === 0) return;

    const symbols = activeETFs.join(',');

    if (isAutoUpdate) showUpdateIndicator();

    try {
        console.log(`Fetching prices for: ${symbols}`);

        const response = await fetch(`https://yahoo-finance-proxy.aga-b10.workers.dev/?symbols=${symbols}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.quoteResponse && data.quoteResponse.result) {
            data.quoteResponse.result.forEach(quote => {
                if (quote.symbol && quote.regularMarketPrice) {
                    currentPrices[quote.symbol] = quote.regularMarketPrice;
                }
            });

            lastPriceUpdate = new Date();
            await savePricesToCloud();
            console.log('✅ Prices updated:', currentPrices);

            renderDashboard();
        }
    } catch (error) {
        console.error('Price fetch error:', error);
        // Use fallback prices if we have none
        if (Object.keys(currentPrices).length === 0) {
            loadFallbackPrices();
        }
    }

    if (isAutoUpdate) {
        setTimeout(() => hideUpdateIndicator(), 1000);
    }

    updateLastUpdated();
}

function loadFallbackPrices() {
    // Last known prices as fallback
    const fallback = {
        'SOXX': 461.44,
        'IWM': 277.97,
        'IAU': 86.85,
        'SLV': 66.66,
        'SCHD': 32.07,
        'VTI': 354.18
    };

    Object.keys(fallback).forEach(symbol => {
        if (!currentPrices[symbol]) {
            currentPrices[symbol] = fallback[symbol];
        }
    });

    console.log('Using fallback prices for initial display');
}

function setupAutomaticUpdates() {
    // Clear any existing interval
    if (priceUpdateInterval) clearInterval(priceUpdateInterval);

    const interval = isMarketHours()
        ? CONFIG.PRICE_UPDATE.marketHoursInterval
        : CONFIG.PRICE_UPDATE.afterHoursInterval;

    priceUpdateInterval = setInterval(() => fetchCurrentPrices(true), interval);

    console.log(`Price updates: every ${interval / 1000}s (${isMarketHours() ? 'market hours' : 'after hours'})`);
}

function updateLastUpdated() {
    const el = document.getElementById('lastUpdated');
    if (el && lastPriceUpdate) {
        el.textContent = `Last updated: ${lastPriceUpdate.toLocaleTimeString()}`;
    }
}

function showUpdateIndicator() {
    const el = document.getElementById('updateIndicator');
    if (el) el.style.display = 'inline';
}

function hideUpdateIndicator() {
    const el = document.getElementById('updateIndicator');
    if (el) el.style.display = 'none';
}

// ============================================================================
// TRANSACTION MANAGEMENT
// ============================================================================

function openTransactionModal(action, etf) {
    const modal = document.getElementById('transactionModal');
    if (!modal) return;

    document.getElementById('transactionAction').value = action || 'BUY';
    document.getElementById('transactionETF').value = etf || '';
    document.getElementById('transactionShares').value = '';
    document.getElementById('transactionPrice').value = '';
    document.getElementById('transactionTotal').value = '';
    document.getElementById('transactionNotes').value = '';
    document.getElementById('transactionDate').value = new Date().toISOString().split('T')[0];

    modal.style.display = 'flex';
}

function closeTransactionModal() {
    const modal = document.getElementById('transactionModal');
    if (modal) modal.style.display = 'none';
}

async function addTransaction(e) {
    e.preventDefault();

    const date = document.getElementById('transactionDate').value;
    const etf = document.getElementById('transactionETF').value.toUpperCase().trim();
    const action = document.getElementById('transactionAction').value;
    const shares = parseFloat(document.getElementById('transactionShares').value);
    const price = parseFloat(document.getElementById('transactionPrice').value);
    const total = parseFloat(document.getElementById('transactionTotal').value) || (shares * price);
    const notes = document.getElementById('transactionNotes').value;

    if (!date || !etf || !shares || !price) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    // Validate sell: can't sell more than you own
    if (action === 'SELL') {
        const position = portfolio.find(p => p.etf === etf);
        const available = position ? position.shares : 0;
        if (shares > available) {
            showNotification(`Cannot sell ${shares} shares of ${etf}. Only ${available} available.`, 'error');
            return;
        }
    }

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
    await saveTransactionsToCloud();

    recalculatePortfolioFromTransactions();

    renderDashboard();
    renderTransactions();
    renderStrategy();

    closeTransactionModal();
    showNotification('Transaction added successfully', 'success');
}

async function deleteTransaction(index) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const transactionToDelete = sortedTransactions[index];

    const actualIndex = transactions.findIndex(t =>
        t.date === transactionToDelete.date &&
        t.etf === transactionToDelete.etf &&
        t.shares === transactionToDelete.shares &&
        t.price === transactionToDelete.price
    );

    if (actualIndex >= 0) {
        transactions.splice(actualIndex, 1);
        await saveTransactionsToCloud();

        recalculatePortfolioFromTransactions();

        renderDashboard();
        renderTransactions();
        renderStrategy();

        showNotification('Transaction deleted', 'info');
    }
}

// Auto-calculate total when shares/price change
function setupAutoCalculate() {
    const sharesInput = document.getElementById('transactionShares');
    const priceInput = document.getElementById('transactionPrice');
    const totalInput = document.getElementById('transactionTotal');

    if (sharesInput && priceInput && totalInput) {
        const calc = () => {
            const s = parseFloat(sharesInput.value) || 0;
            const p = parseFloat(priceInput.value) || 0;
            if (s > 0 && p > 0) {
                totalInput.value = (s * p).toFixed(2);
            }
        };
        sharesInput.addEventListener('input', calc);
        priceInput.addEventListener('input', calc);
    }
}

// ============================================================================
// EXPORT / IMPORT
// ============================================================================

function exportPortfolioData() {
    const data = {
        version: CONFIG.DATA_VERSION,
        exportDate: new Date().toISOString(),
        transactions: transactions,
        prices: currentPrices
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etf-portfolio-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('Portfolio data exported!', 'success');
}

async function importPortfolioData(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.transactions && Array.isArray(data.transactions)) {
            transactions = data.transactions;
            await saveTransactionsToCloud();
            recalculatePortfolioFromTransactions();
            renderDashboard();
            renderTransactions();
            renderStrategy();
            showNotification(`Imported ${transactions.length} transactions!`, 'success');
        } else {
            showNotification('Invalid backup file format', 'error');
        }
    } catch (err) {
        showNotification('Error reading backup file', 'error');
        console.error('Import error:', err);
    }

    e.target.value = '';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatCurrency(value) {
    if (typeof value !== 'number' || isNaN(value)) return '$0.00';
    return '$' + value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function showNotification(message, type) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.textContent = message;
    document.body.appendChild(el);

    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initializeApp() {
    console.log(`ETF Portfolio Tracker v${CONFIG.DATA_VERSION} initializing...`);

    // Load cached prices first for immediate display
    await loadPricesFromCloud();
    if (Object.keys(currentPrices).length === 0) {
        loadFallbackPrices();
    }

    // Load transactions (cloud → localStorage → initialTransactions)
    const stored = await loadTransactionsFromCloud();

    if (stored) {
        transactions = stored;
        console.log(`Loaded ${transactions.length} transactions from storage`);
    } else {
        transactions = [...initialTransactions];
        console.log(`Initialized with ${transactions.length} transactions from code`);
        await saveTransactionsToCloud();
    }

    // Build portfolio from transactions
    recalculatePortfolioFromTransactions();

    // Render everything
    renderDashboard();
    renderTransactions();
    renderStrategy();

    // Setup event listeners
    setupEventListeners();
    setupAutoCalculate();

    // Fetch live prices
    await fetchCurrentPrices(false);

    // Start automatic updates
    setupAutomaticUpdates();

    console.log('✅ App initialized');
}

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

    // Refresh button
    const refreshBtn = document.getElementById('refreshPrices');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => fetchCurrentPrices(true));
    }

    // Export button
    const exportBtn = document.getElementById('exportData');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportPortfolioData);
    }

    // Import input
    const importInput = document.getElementById('importData');
    if (importInput) {
        importInput.addEventListener('change', importPortfolioData);
    }
}

// ============================================================================
// START THE APP
// ============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

window.openTransactionModal = openTransactionModal;
window.closeTransactionModal = closeTransactionModal;
window.deleteTransaction = deleteTransaction;
window.exportPortfolioData = exportPortfolioData;
