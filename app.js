// ETF Portfolio Tracker - CLOUD STORAGE VERSION
// Versioned data storage: bumping DATA_VERSION forces clean reinitialize
// v6: Added May 2026 sells + transaction journal backup + export-as-code
// v7: Baked in Jun/Jul 2026 equity ETF exit sells (SOXX/SCHD/IWM/VTI) + stable
//     transaction IDs so delete-by-value can no longer mismatch/lose data
// v8: Added the second VTI sell (18 shares @ $370.28, 22 Jun 2026) that fully
//     closes out the VTI position (212 - 18 - 194 = 0)
// v9: Dashboard summary (Total Invested / Total Value / Gain-Loss) now only
//     counts currently-open positions — fully-exited ETFs (SCHD/IWM/VTI) no
//     longer drag the numbers down with capital that's already back in cash

// CONFIGURATION
const CONFIG = {
    DATA_VERSION: 9,
    CLOUD_STORAGE_KEY: 'etf_portfolio_v9',
    CLOUD_PRICES_KEY: 'etf_current_prices',
    LOCAL_BACKUP_KEY: 'etf_portfolio_local_v9',
    // Non-versioned journal key — survives version bumps and storage resets
    JOURNAL_KEY: 'etf_transaction_journal',
    LOCAL_JOURNAL_KEY: 'etf_transaction_journal_local',
    PRICE_UPDATE: {
        marketHoursInterval: 5 * 60 * 1000,
        afterHoursInterval: 2 * 60 * 60 * 1000,
        staleThreshold: 30 * 60 * 1000
    }
};

// INITIAL TRANSACTIONS - Complete history (single source of truth)
// Every transaction carries a stable, permanent `id`. deleteTransaction()
// matches on this id (never on date/etf/shares/price), so it can no longer
// delete the wrong row when two transactions happen to share the same values.
const initialTransactions = [
    // === INITIAL POSITIONS (January 2024) ===
    { id: 'init-01', date: '2024-01-15', etf: 'SOXX', action: 'BUY', shares: 107, price: 280.00, total: 29960, notes: 'Initial Position - Entry at dip' },
    { id: 'init-02', date: '2024-01-15', etf: 'SCHD', action: 'BUY', shares: 449, price: 27.86, total: 12509, notes: 'Initial Dividend Position' },
    { id: 'init-03', date: '2024-01-15', etf: 'IWM', action: 'BUY', shares: 30, price: 253.83, total: 7615, notes: 'IWM Initial - First entry' },

    // === DECEMBER 2024 SCALING ===
    { id: 'init-04', date: '2024-12-13', etf: 'SOXX', action: 'BUY', shares: 48, price: 310.00, total: 14880, notes: 'SOXX Scale T2 - Fibonacci entry' },
    { id: 'init-05', date: '2024-12-15', etf: 'SOXX', action: 'BUY', shares: 30, price: 305.00, total: 9150, notes: 'SOXX Scale T3 - Consolidation' },
    { id: 'init-06', date: '2024-12-29', etf: 'IAU', action: 'BUY', shares: 370, price: 81.72, total: 30236, notes: 'Gold - 0.382 Fib entry during capitulation' },
    { id: 'init-07', date: '2024-12-29', etf: 'SLV', action: 'BUY', shares: 305, price: 65.53, total: 19987, notes: 'Silver - 0.618 Fib entry' },
    { id: 'init-08', date: '2024-12-31', etf: 'IWM', action: 'BUY', shares: 79, price: 249.00, total: 19671, notes: 'IWM Scale T2 - Overnight fill' },

    // === JANUARY 2025 SCALING ===
    { id: 'init-09', date: '2025-01-03', etf: 'IWM', action: 'BUY', shares: 80, price: 248.70, total: 19896, notes: 'IWM Scale T3 - Lower target fill' },
    { id: 'init-10', date: '2025-01-05', etf: 'SCHD', action: 'BUY', shares: 2158, price: 27.96, total: 60338, notes: 'SCHD Scale - Major accumulation' },
    { id: 'init-11', date: '2025-01-05', etf: 'VTI', action: 'BUY', shares: 212, price: 338.40, total: 71741, notes: 'VTI - New total market position' },
    { id: 'init-12', date: '2025-01-06', etf: 'IAU', action: 'BUY', shares: 479, price: 95.08, total: 45544, notes: 'IAU Scale - Dollar weakness hedge' },
    { id: 'init-13', date: '2025-01-06', etf: 'SLV', action: 'BUY', shares: 1353, price: 99.57, total: 134716, notes: 'SLV Scale - Major silver position' },

    // === APRIL 2025 REBALANCING ===
    { id: 'init-14', date: '2025-04-20', etf: 'SOXX', action: 'SELL', shares: 50, price: 418.24, total: 20912, notes: 'Partial take-profit - redeploy to IAU' },

    // === APRIL 2026 IAU DCA (redeployed from SOXX sale) ===
    { id: 'init-15', date: '2026-04-24', etf: 'IAU', action: 'BUY', shares: 113, price: 88.18, total: 9964.34, notes: 'IAU T1 - Bought the dip, redeployed from SOXX sale' },
    { id: 'init-16', date: '2026-04-28', etf: 'IAU', action: 'BUY', shares: 127, price: 86.23, total: 10951.21, notes: 'IAU T2 - DBS fill at gold $4,600 level' },

    // === MAY 2026 PARTIAL SELLS ===
    { id: 'init-17', date: '2026-05-06', etf: 'SOXX', action: 'SELL', shares: 26, price: 497.71, total: 12940.46, notes: 'Partial sell - capital redeployment' },
    { id: 'init-18', date: '2026-05-06', etf: 'IWM', action: 'SELL', shares: 24, price: 285.33, total: 6847.92, notes: 'Partial sell - capital redeployment' },
    { id: 'init-19', date: '2026-05-06', etf: 'SCHD', action: 'SELL', shares: 298, price: 31.62, total: 9422.76, notes: 'Partial sell - capital redeployment' },

    // === JUN/JUL 2026 EQUITY ETF EXIT (per DBS fill confirmations) ===
    { id: 'init-20', date: '2026-06-22', etf: 'SOXX', action: 'SELL', shares: 26, price: 654.01, total: 17004.26, notes: 'Partial sell - equity exit ahead of anticipated volatility' },
    { id: 'init-24', date: '2026-06-22', etf: 'VTI', action: 'SELL', shares: 18, price: 370.28, total: 6665.04, notes: 'Partial exit - equity ETF exit ahead of anticipated volatility' },
    { id: 'init-21', date: '2026-07-27', etf: 'SCHD', action: 'SELL', shares: 2309, price: 33.43, total: 77189.87, notes: 'Full exit - equity ETF exit ahead of anticipated volatility' },
    { id: 'init-22', date: '2026-07-27', etf: 'IWM', action: 'SELL', shares: 165, price: 293.88, total: 48490.20, notes: 'Full exit - equity ETF exit ahead of anticipated volatility' },
    { id: 'init-23', date: '2026-07-27', etf: 'VTI', action: 'SELL', shares: 194, price: 367.615155, total: 71317.34, notes: 'Full exit - equity ETF exit ahead of anticipated volatility' }
];

// Strategy notes for each ETF
const etfStrategies = {
    'SOXX': 'Semiconductors - Core growth position. Scale on RSI < 20.',
    'IWM': 'Small-cap value. Scale on extreme oversold conditions.',
    'IAU': 'Gold hedge for dollar weakness. DCA on dips.',
    'SLV': 'Silver hedge for dollar weakness. Ratio play vs gold.',
    'SCHD': 'Dividend growth exposure. Hold and accumulate.',
    'VTI': 'Total market exposure. Core holding.'
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

    try {
        localStorage.setItem(CONFIG.LOCAL_BACKUP_KEY, payload);
    } catch (e) {
        console.warn('localStorage backup failed:', e);
    }

    // Also save to non-versioned journal (survives version bumps)
    await saveToJournal();
}

async function loadTransactionsFromCloud() {
    let data = null;

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

    if (data && data.version === CONFIG.DATA_VERSION) {
        return data.transactions;
    }

    if (data && data.version !== CONFIG.DATA_VERSION) {
        console.log(`⚠️ Data version mismatch (stored: ${data.version}, code: ${CONFIG.DATA_VERSION}). Reinitializing...`);
    }

    return null;
}

// ============================================================================
// TRANSACTION JOURNAL — non-versioned backup that survives everything
// ============================================================================

async function saveToJournal() {
    const journalPayload = JSON.stringify({
        savedAt: new Date().toISOString(),
        transactions: transactions
    });

    if (cloudStorageAvailable) {
        try {
            await window.storage.set(CONFIG.JOURNAL_KEY, journalPayload);
            console.log('✅ Journal backup saved to cloud');
        } catch (err) {
            console.warn('Journal cloud save failed:', err);
        }
    }

    try {
        localStorage.setItem(CONFIG.LOCAL_JOURNAL_KEY, journalPayload);
    } catch (e) {
        console.warn('Journal localStorage save failed:', e);
    }
}

async function loadFromJournal() {
    let data = null;

    if (cloudStorageAvailable) {
        try {
            const result = await window.storage.get(CONFIG.JOURNAL_KEY);
            if (result && result.value) {
                data = JSON.parse(result.value);
                console.log('✅ Recovered from cloud journal');
            }
        } catch (err) {
            console.warn('Journal cloud load failed:', err);
        }
    }

    if (!data) {
        try {
            const local = localStorage.getItem(CONFIG.LOCAL_JOURNAL_KEY);
            if (local) {
                data = JSON.parse(local);
                console.log('✅ Recovered from localStorage journal');
            }
        } catch (e) {
            console.warn('Journal localStorage load failed:', e);
        }
    }

    // Journal is valid if it has more transactions than initialTransactions
    // (meaning the user added transactions via the UI that aren't in code)
    if (data && data.transactions && data.transactions.length >= initialTransactions.length) {
        return data.transactions;
    }

    return null;
}

// ============================================================================
// PRICE STORAGE
// ============================================================================

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

function recalculatePortfolioFromTransactions() {
    portfolio = [];
    let saleProceedsPool = 0;

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
    let totalBuysOpen = 0;   // Invested capital in positions still held (current trades only)
    let totalSellsAll = 0;   // All-time sell proceeds (needed for cash accounting)
    let totalValue = 0;
    let totalRedeployedAll = 0;

    portfolio.forEach(position => {
        totalSellsAll += position.totalSells;
        totalRedeployedAll += (position.redeployed || 0);
        const currentPrice = currentPrices[position.etf] || position.avgEntry || 0;
        totalValue += position.shares * currentPrice;

        // Only count invested capital for positions still open. A fully-exited
        // position's original cost basis is gone — that capital already
        // reappeared as Undeployed Cash — so it shouldn't drag Gain/Loss down.
        if (position.shares > 0) {
            totalBuysOpen += position.totalBuys;
        }
    });

    const totalInvested = totalBuysOpen;
    const undeployedCash = totalSellsAll - totalRedeployedAll;
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

        const invested = position.totalBuys;
        const gainLoss = currentValue - invested;
        const gainLossPercent = invested > 0 ? (gainLoss / invested) * 100 : 0;

        const sellTag = position.totalSells > 0
            ? `<br><small class="sell-tag">Sold: ${formatCurrency(position.totalSells)}</small>`
            : '';
        const redeployTag = position.redeployed > 0
            ? `<br><small class="redeploy-tag">Redeployed: ${formatCurrency(position.redeployed)}</small>`
            : '';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="etf-symbol">${position.etf}</td>
            <td>${position.shares.toFixed(2)}</td>
            <td>${formatCurrency(position.avgEntry)}</td>
            <td class="current-price">${formatCurrency(currentPrice)}</td>
            <td>${formatCurrency(invested)}${sellTag}${redeployTag}</td>
            <td>${formatCurrency(currentValue)}</td>
            <td class="${gainLoss >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(gainLoss)}<br>
                <small>(${gainLossPercent.toFixed(2)}%)</small>
            </td>
            <td class="actions">
                <button class="btn-small btn-primary" onclick="openTransactionModal('${position.etf}', 'BUY')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Buy
                </button>
                <button class="btn-small btn-danger" onclick="openTransactionModal('${position.etf}', 'SELL')">
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

// ============================================================================
// TRANSACTIONS TAB
// ============================================================================

function renderTransactions() {
    const tbody = document.getElementById('transactionsBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedTransactions.forEach((t) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${new Date(t.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            <td class="etf-symbol">${t.etf}</td>
            <td><span class="action ${t.action.toLowerCase()}">${t.action}</span></td>
            <td>${t.shares.toFixed(2)}</td>
            <td>${formatCurrency(t.price)}</td>
            <td>${formatCurrency(t.total)}</td>
            <td>${t.notes || ''}</td>
            <td>
                <button class="btn-icon" onclick="deleteTransaction('${t.id}')">
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

// ============================================================================
// STRATEGY TAB
// ============================================================================

function renderStrategy() {
    const tbody = document.getElementById('strategyBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const activePositions = portfolio.filter(p => p.etf && p.shares > 0);

    activePositions.forEach(position => {
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
            <td class="${parseFloat(priceVsEntry) >= 0 ? 'positive' : 'negative'}">${priceVsEntry}%</td>
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
    return hours >= 13 && hours < 22;
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
    const fallback = {
        'SOXX': 497.71,
        'IWM': 285.33,
        'IAU': 86.23,
        'SLV': 79.35,
        'SCHD': 31.62,
        'VTI': 364.71
    };

    Object.keys(fallback).forEach(symbol => {
        if (!currentPrices[symbol]) {
            currentPrices[symbol] = fallback[symbol];
        }
    });

    console.log('Using fallback prices for initial display');
}

function setupAutomaticUpdates() {
    if (priceUpdateInterval) clearInterval(priceUpdateInterval);

    const interval = isMarketHours()
        ? CONFIG.PRICE_UPDATE.marketHoursInterval
        : CONFIG.PRICE_UPDATE.afterHoursInterval;

    priceUpdateInterval = setInterval(() => fetchCurrentPrices(true), interval);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            const timeSinceUpdate = lastPriceUpdate
                ? Date.now() - lastPriceUpdate.getTime()
                : Infinity;

            if (timeSinceUpdate > CONFIG.PRICE_UPDATE.staleThreshold) {
                console.log('Page visible after long period, fetching fresh prices');
                fetchCurrentPrices(true);
            }
        }
    });

    console.log(`Price updates: every ${interval / 1000}s (${isMarketHours() ? 'market hours' : 'after hours'})`);
}

function updateLastUpdated() {
    const el = document.getElementById('lastUpdated');
    if (!el || !lastPriceUpdate) return;

    const diff = Math.floor((Date.now() - lastPriceUpdate.getTime()) / 1000);
    let timeAgo;

    if (diff < 60) {
        timeAgo = 'just now';
    } else if (diff < 3600) {
        const mins = Math.floor(diff / 60);
        timeAgo = `${mins} minute${mins > 1 ? 's' : ''} ago`;
    } else {
        const hours = Math.floor(diff / 3600);
        timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }

    el.textContent = `Last updated: ${timeAgo}`;
    setTimeout(updateLastUpdated, 60000);
}

function showUpdateIndicator() {
    const el = document.getElementById('updateIndicator');
    if (el) el.style.display = 'flex';
}

function hideUpdateIndicator() {
    const el = document.getElementById('updateIndicator');
    if (el) el.style.display = 'none';
}

// ============================================================================
// TRANSACTION MANAGEMENT (UI)
// ============================================================================

function openTransactionModal(etf = '', action = 'BUY') {
    const modal = document.getElementById('transactionModal');
    const form = document.getElementById('transactionForm');
    const title = document.getElementById('modalTitle');

    title.textContent = `${action} ${etf || 'ETF'}`;
    form.reset();

    document.getElementById('transactionETF').value = etf;
    document.getElementById('transactionAction').value = action;
    document.getElementById('transactionDate').value = new Date().toISOString().split('T')[0];

    const priceInput = document.getElementById('transactionPrice');
    if (priceInput) {
        priceInput.type = 'text';
        priceInput.inputMode = 'decimal';
        priceInput.pattern = '[0-9]*\\.?[0-9]*';
    }

    modal.style.display = 'flex';
}

function closeTransactionModal() {
    document.getElementById('transactionModal').style.display = 'none';
}

async function addTransaction(event) {
    event.preventDefault();

    const etf = document.getElementById('transactionETF').value.toUpperCase().trim();
    const action = document.getElementById('transactionAction').value;
    const shares = parseFloat(document.getElementById('transactionShares').value);
    const price = parseFloat(document.getElementById('transactionPrice').value);
    const date = document.getElementById('transactionDate').value;
    const notes = document.getElementById('transactionNotes').value;

    if (!date || !etf || !shares || !price) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const total = shares * price;

    if (action === 'SELL') {
        const position = portfolio.find(p => p.etf === etf);
        const available = position ? position.shares : 0;
        if (shares > available) {
            showNotification(`Cannot sell ${shares} shares of ${etf}. Only ${available} available.`, 'error');
            return;
        }
    }

    const transaction = {
        id: generateTxnId(),
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

async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    // Match strictly on the transaction's unique id — never on date/etf/shares/
    // price — so two transactions that happen to share the same values can
    // never cause the wrong one to be deleted.
    const actualIndex = transactions.findIndex(t => t.id === id);

    if (actualIndex >= 0) {
        transactions.splice(actualIndex, 1);
        await saveTransactionsToCloud();

        recalculatePortfolioFromTransactions();

        renderDashboard();
        renderTransactions();
        renderStrategy();

        showNotification('Transaction deleted', 'info');
    } else {
        showNotification('Could not find that transaction to delete', 'error');
    }
}

function generateTxnId() {
    return 'txn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// Backfill ids onto any legacy transactions (loaded from old cloud/journal
// data) that predate the id field, so delete-by-id always has something to match.
function ensureTransactionIds(txns) {
    return txns.map((t, i) => t.id ? t : { ...t, id: `legacy-${i}-${t.date}-${t.etf}-${t.shares}-${t.price}` });
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

// Export transactions as code — paste directly into app.js initialTransactions
function exportAsCode() {
    const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    let code = 'const initialTransactions = [\n';

    let lastYear = '';
    sorted.forEach((t, i) => {
        const year = t.date.substring(0, 4);
        if (year !== lastYear) {
            code += `\n    // === ${year} ===\n`;
            lastYear = year;
        }

        const notesStr = t.notes ? `, notes: '${t.notes.replace(/'/g, "\\'")}'` : '';
        code += `    { date: '${t.date}', etf: '${t.etf}', action: '${t.action}', shares: ${t.shares}, price: ${t.price}, total: ${t.total}${notesStr} }`;
        code += i < sorted.length - 1 ? ',\n' : '\n';
    });

    code += '];\n';

    // Copy to clipboard
    navigator.clipboard.writeText(code).then(() => {
        showNotification('Code copied to clipboard! Paste into app.js to replace initialTransactions.', 'success');
    }).catch(() => {
        // Fallback: download as file
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `initialTransactions-${new Date().toISOString().split('T')[0]}.js`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Code downloaded as file. Paste contents into app.js.', 'success');
    });
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

    await loadPricesFromCloud();
    if (Object.keys(currentPrices).length === 0) {
        loadFallbackPrices();
    }

    // Try primary storage first
    let stored = await loadTransactionsFromCloud();

    // If primary storage is empty, try the journal backup
    if (!stored) {
        console.log('Primary storage empty, checking journal backup...');
        stored = await loadFromJournal();
        if (stored) {
            console.log(`✅ Recovered ${stored.length} transactions from journal backup`);
        }
    }

    if (stored) {
        transactions = ensureTransactionIds(stored);
        console.log(`Loaded ${transactions.length} transactions from storage`);
    } else {
        transactions = [...initialTransactions];
        console.log(`Initialized with ${transactions.length} transactions from code`);
        await saveTransactionsToCloud();
    }

    recalculatePortfolioFromTransactions();

    renderDashboard();
    renderTransactions();
    renderStrategy();

    setupEventListeners();

    await fetchCurrentPrices(false);

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
    const modal = document.getElementById('transactionModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'transactionModal') {
                closeTransactionModal();
            }
        });
    }

    // Form submission
    const form = document.getElementById('transactionForm');
    if (form) {
        form.addEventListener('submit', addTransaction);
    }

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

    // Export as code button
    const exportCodeBtn = document.getElementById('exportAsCode');
    if (exportCodeBtn) {
        exportCodeBtn.addEventListener('click', exportAsCode);
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

// Expose functions for onclick handlers in HTML
window.openTransactionModal = openTransactionModal;
window.closeTransactionModal = closeTransactionModal;
window.deleteTransaction = deleteTransaction;
window.exportPortfolioData = exportPortfolioData;
window.exportAsCode = exportAsCode;
