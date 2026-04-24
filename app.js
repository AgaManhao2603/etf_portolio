// ETF Portfolio Tracker - CLOUD STORAGE VERSION
// Versioned data storage: bumping DATA_VERSION forces clean reinitialize
// so code logic changes never conflict with stale stored data

// CONFIGURATION
const CONFIG = {
    DATA_VERSION: 3,                              // Keep at 3 to preserve stored transactions
    CLOUD_STORAGE_KEY: 'etf_portfolio_v3',        // Must match existing stored data
    CLOUD_PRICES_KEY: 'etf_current_prices',
    LOCAL_BACKUP_KEY: 'etf_portfolio_local_v3',   // Must match existing stored data
    PRICE_UPDATE: {
        marketHoursInterval: 5 * 60 * 1000,      // 5 minutes during market hours
        afterHoursInterval: 2 * 60 * 60 * 1000,  // 2 hours after hours
        staleThreshold: 30 * 60 * 1000            // 30 minutes
    }
};

// INITIAL TRANSACTIONS - Complete history including sells
const initialTransactions = [
    // === INITIAL POSITIONS (January 2024) ===
    { date: '2024-01-15', etf: 'SOXX', action: 'BUY', shares: 107, price: 280.00, total: 29960, notes: 'Initial Position - Entry at dip' },
    { date: '2024-01-15', etf: 'SCHD', action: 'BUY', shares: 449, price: 27.86, total: 12509, notes: 'Initial Dividend Position' },
    
    // === DECEMBER 2024 DEPLOYMENT ===
    { date: '2024-12-13', etf: 'SOXX', action: 'BUY', shares: 48, price: 310.00, total: 14880, notes: 'SOXX Scale T2 - Fibonacci entry' },
    { date: '2024-12-15', etf: 'SOXX', action: 'BUY', shares: 30, price: 305.00, total: 9150, notes: 'SOXX Scale T3 - Consolidation' },
    { date: '2024-12-15', etf: 'IWM', action: 'BUY', shares: 30, price: 253.83, total: 7615, notes: 'IWM Initial - First entry' },
    
    // === DECEMBER 29-30 PRECIOUS METALS (Fibonacci Entries) ===
    { date: '2024-12-29', etf: 'IAU', action: 'BUY', shares: 370, price: 81.72, total: 30236, notes: 'Gold - 0.382 Fib entry during capitulation' },
    { date: '2024-12-29', etf: 'SLV', action: 'BUY', shares: 305, price: 65.53, total: 19987, notes: 'Silver - 0.618 Fib entry, worst day in 5 years' },
    
    // === DECEMBER 30-31 OVERNIGHT FILLS (Market Weakness) ===
    { date: '2024-12-30', etf: 'IWM', action: 'BUY', shares: 79, price: 249.00, total: 19671, notes: 'IWM Scale T2 - Limit order filled' },
    
    // === JANUARY 2025 MAJOR SCALING (Week of Jan 5) ===
    { date: '2025-01-03', etf: 'IWM', action: 'BUY', shares: 80, price: 248.70, total: 19896, notes: 'IWM Scale T3 - Lower target fill' },
    
    // === ADDITIONAL POSITIONS (JANUARY 2025) ===
    { date: '2025-01-06', etf: 'IAU', action: 'BUY', shares: 479, price: 95.08, total: 45544, notes: 'Gold - Additional accumulation' },
    { date: '2025-01-06', etf: 'SLV', action: 'BUY', shares: 1353, price: 99.57, total: 134716, notes: 'Silver - Major position scaling' },
    { date: '2025-01-06', etf: 'SCHD', action: 'BUY', shares: 2158, price: 27.96, total: 60338, notes: 'SCHD - Large scale-up' },
    { date: '2025-01-06', etf: 'VTI', action: 'BUY', shares: 212, price: 338.40, total: 71741, notes: 'VTI - New total market position' },
    
    // === APRIL 2025 REBALANCING ===
    { date: '2025-04-20', etf: 'SOXX', action: 'SELL', shares: 50, price: 418.24, total: 20912, notes: 'Partial take-profit - redeploy to IAU' }
];

// Strategy notes for each ETF
const etfStrategies = {
    'SOXX': 'Semiconductors - Core growth position',
    'IWM': 'Small-cap value',
    'IAU': 'Gold hedge for dollar weakness',
    'SLV': 'Silver hedge for dollar weakness',
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
let cloudStorageAvailable = typeof window.storage !== 'undefined';

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
        const result = await window.storage.set(
            CONFIG.CLOUD_STORAGE_KEY,
            payload,
            false
        );
        
        if (result) {
            console.log('✅ Transactions saved to cloud (v' + CONFIG.DATA_VERSION + ')');
            localStorage.setItem(CONFIG.LOCAL_BACKUP_KEY, payload);
        } else {
            console.error('❌ Cloud storage save failed');
        }
    } catch (error) {
        console.error('Cloud storage error:', error);
        localStorage.setItem(CONFIG.LOCAL_BACKUP_KEY, payload);
    }
}

async function loadTransactionsFromCloud() {
    let raw = null;

    if (cloudStorageAvailable) {
        try {
            const result = await window.storage.get(CONFIG.CLOUD_STORAGE_KEY, false);
            if (result && result.value) {
                raw = result.value;
                console.log('✅ Data loaded from cloud storage');
            }
        } catch (error) {
            console.warn('Cloud storage read error:', error);
        }
    }

    if (!raw) {
        raw = localStorage.getItem(CONFIG.LOCAL_BACKUP_KEY);
        if (raw) console.log('ℹ️ Data loaded from localStorage backup');
    }

    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        
        if (parsed.version && parsed.transactions) {
            if (parsed.version === CONFIG.DATA_VERSION) {
                console.log(`✅ Data version ${parsed.version} matches code`);
                return parsed.transactions;
            } else {
                console.warn(`⚠️ Stale data version ${parsed.version}, code expects ${CONFIG.DATA_VERSION}. Reinitializing.`);
                return null;
            }
        }
        
        if (Array.isArray(parsed)) {
            console.warn('⚠️ Found unversioned data from old code. Reinitializing.');
            return null;
        }

        return null;
    } catch (error) {
        console.error('Data parse error:', error);
        return null;
    }
}

async function savePricesToCloud() {
    if (!cloudStorageAvailable) return;

    try {
        const priceData = {
            prices: currentPrices,
            timestamp: lastPriceUpdate ? lastPriceUpdate.getTime() : Date.now()
        };
        
        await window.storage.set(
            CONFIG.CLOUD_PRICES_KEY,
            JSON.stringify(priceData),
            false
        );
    } catch (error) {
        console.error('Price cache save error:', error);
    }
}

async function loadPricesFromCloud() {
    if (!cloudStorageAvailable) return null;

    try {
        const result = await window.storage.get(CONFIG.CLOUD_PRICES_KEY, false);
        
        if (result && result.value) {
            const priceData = JSON.parse(result.value);
            return priceData;
        }
    } catch (error) {
        console.error('Price cache load error:', error);
    }
    
    return null;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initializeApp() {
    showLoadingIndicator('Loading portfolio data...');
    console.log(`ETF Tracker starting (data version ${CONFIG.DATA_VERSION})`);
    
    // Inject styles for sell/redeploy tags
    const tagStyles = document.createElement('style');
    tagStyles.textContent = `
        .sell-tag { color: #f59e0b; opacity: 0.85; }
        .redeploy-tag { color: #22d3ee; opacity: 0.85; }
    `;
    document.head.appendChild(tagStyles);
    
    const savedTransactions = await loadTransactionsFromCloud();
    
    if (savedTransactions && savedTransactions.length > 0) {
        transactions = savedTransactions;
        console.log(`Loaded ${transactions.length} transactions from storage`);
    } else {
        transactions = [...initialTransactions];
        await saveTransactionsToCloud();
        console.log(`Initialized with ${transactions.length} default transactions (v${CONFIG.DATA_VERSION})`);
    }
    
    recalculatePortfolioFromTransactions();
    
    await loadCachedPrices();
    
    renderDashboard();
    renderTransactions();
    renderStrategy();
    
    await fetchCurrentPrices();
    
    setupAutomaticUpdates();
    setupEventListeners();
    fixMobileInputs();
    updateLastUpdated();
    
    hideLoadingIndicator();
    
    showStorageStatus();
}

async function loadCachedPrices() {
    const cloudPrices = await loadPricesFromCloud();
    
    if (cloudPrices && cloudPrices.prices) {
        currentPrices = cloudPrices.prices;
        lastPriceUpdate = new Date(cloudPrices.timestamp);
        console.log('Loaded cached prices from cloud:', lastPriceUpdate);
    } else {
        currentPrices = {
            'SOXX': 348.51,
            'IWM': 265.02,
            'SCHD': 31.47,
            'IAU': 93.24,
            'SLV': 70.19,
            'VTI': 340.96
        };
        console.log('Using fallback prices for initial display');
    }
}

// ============================================================================
// PORTFOLIO CALCULATION
// ============================================================================
//
// ACCOUNTING MODEL:
//
//   totalBuys  = sum of all buy amounts for this ETF (never reduced on sells)
//                This is the "Original Investment" — your per-ETF benchmark.
//
//   costBasis  = cost of shares you STILL HOLD (reduced on sells)
//                This drives avgEntry calculation only.
//
//   totalSells = sum of all sell proceeds for this ETF
//
// PER-ROW DISPLAY:
//   Invested   = totalBuys  (original investment, never changes)
//   P&L        = currentValue − totalBuys
//   Sell tag   = shows cash received from sales for this ETF
//
// DASHBOARD TOTALS:
//   Total Invested = sum(totalBuys) − sum(totalSells) = net capital deployed
//   Portfolio Value = sum(shares × price) = market value of holdings
//   P&L            = Portfolio Value − Total Invested
//   Undeployed Cash = sale proceeds not yet redeployed (informational)
//
// NOTE: Per-row invested totals will exceed dashboard "Total Invested"
// by the amount of sale proceeds. This is expected — rows show gross
// investment per ETF, dashboard shows net capital in the market.

function recalculatePortfolioFromTransactions() {
    portfolio = [];
    
    // Process all transactions chronologically to track cash pool
    const sortedTx = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Cash pool: fills up from sells, drains as you redeploy into buys
    let cashPool = 0;
    
    sortedTx.forEach(t => {
        let position = portfolio.find(p => p.etf === t.etf);
        
        if (!position) {
            position = {
                etf: t.etf,
                shares: 0,
                avgEntry: 0,
                costBasis: 0,        // Cost basis of currently held shares
                totalBuys: 0,        // Sum of all buy amounts (original investment)
                totalSells: 0,       // Sum of all sell proceeds
                redeployed: 0,       // How much of totalBuys came from sale proceeds
                strategy: etfStrategies[t.etf] || 'Add strategy notes'
            };
            portfolio.push(position);
        }
        
        if (t.action === 'BUY') {
            position.shares += t.shares;
            position.costBasis += t.total;
            position.totalBuys += t.total;
            position.avgEntry = position.shares > 0 ? position.costBasis / position.shares : 0;
            
            // If there's cash in the pool, this buy is funded (partially or fully) by redeployed cash
            if (cashPool > 0) {
                const redeployedAmount = Math.min(cashPool, t.total);
                position.redeployed += redeployedAmount;
                cashPool -= redeployedAmount;
            }
        } else if (t.action === 'SELL') {
            // Reduce cost basis by what the sold shares originally cost
            const costBasisOfSold = t.shares * position.avgEntry;
            position.shares -= t.shares;
            position.costBasis -= costBasisOfSold;
            position.totalSells += t.total;
            
            // Sale proceeds go into the cash pool
            cashPool += t.total;
            
            // avgEntry stays the same (average cost method)
            if (position.shares <= 0) {
                position.shares = 0;
                position.costBasis = 0;
                position.avgEntry = 0;
            }
        }
    });
    
    // Whatever's left in the cash pool is undeployed
    portfolio.undeployedCash = Math.max(0, cashPool);
    
    console.log('Portfolio recalculated:', portfolio.length, 'positions');
    console.log('Undeployed cash:', portfolio.undeployedCash);
}

// ============================================================================
// DASHBOARD RENDERING
// ============================================================================

function calculateMetrics() {
    let totalBuysAll = 0;
    let totalSellsAll = 0;
    let totalRedeployedAll = 0;
    let totalMarketValue = 0;
    
    portfolio.forEach(position => {
        if (typeof position === 'object' && position.etf) {
            totalBuysAll += position.totalBuys;
            totalSellsAll += position.totalSells;
            totalRedeployedAll += (position.redeployed || 0);
            
            const currentPrice = currentPrices[position.etf] || position.avgEntry || 0;
            totalMarketValue += position.shares * currentPrice;
        }
    });
    
    const undeployedCash = portfolio.undeployedCash || 0;
    
    // Total Invested = gross total of all buys (matches sum of per-row Invested)
    const totalInvested = totalBuysAll;
    
    // Total Value = market value of holdings + cash on sideline
    const totalValue = totalMarketValue + undeployedCash;
    
    // Original capital = what came from your pocket (excludes redeployed "house money")
    // P&L measures true return on your original capital
    const originalCapital = totalBuysAll - totalRedeployedAll;
    const totalGainLoss = totalValue - originalCapital;
    const gainLossPercent = originalCapital > 0 ? 
        (totalGainLoss / originalCapital) * 100 : 0;
    
    return {
        totalInvested,      // gross total of all buys (matches per-row sum)
        totalValue,         // market value + undeployed cash
        undeployedCash,     // cash from sales not yet redeployed
        originalCapital,    // out-of-pocket capital (buys minus redeployed)
        totalGainLoss,
        gainLossPercent
    };
}

function renderDashboard() {
    const metrics = calculateMetrics();
    
    document.getElementById('totalValue').textContent = formatCurrency(metrics.totalValue);
    document.getElementById('totalInvested').textContent = formatCurrency(metrics.totalInvested);
    document.getElementById('totalGainLoss').textContent = formatCurrency(metrics.totalGainLoss);
    
    // Undeployed cash display (informational — cash from sales waiting to be redeployed)
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
        // This correctly reflects per-share performance: if current price is
        // below avg entry, P&L is negative. Redeployed tag is informational.
        // =====================================================================
        const invested = position.totalBuys;
        const gainLoss = currentValue - invested;
        const gainLossPercent = invested > 0 ? (gainLoss / invested) * 100 : 0;
        
        // Show small tags for sells and redeployed cash
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
            <td class="${parseFloat(priceVsEntry) >= 0 ? 'positive' : 'negative'}">
                ${priceVsEntry}%
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ============================================================================
// TRANSACTION MANAGEMENT
// ============================================================================

function renderTransactions() {
    const tbody = document.getElementById('transactionsBody');
    if (!tbody) return;
    
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

async function addTransaction(event) {
    event.preventDefault();
    
    const etf = document.getElementById('transactionETF').value.toUpperCase();
    const action = document.getElementById('transactionAction').value;
    const shares = parseFloat(document.getElementById('transactionShares').value);
    const date = document.getElementById('transactionDate').value;
    const notes = document.getElementById('transactionNotes').value;
    
    // Parse price from text input (handles both "88" and "88.18")
    const priceInput = document.getElementById('transactionPrice');
    const price = parseFloat(priceInput.value);
    
    if (isNaN(price) || price <= 0) {
        showNotification('Please enter a valid price', 'error');
        return;
    }
    
    if (isNaN(shares) || shares <= 0) {
        showNotification('Please enter a valid number of shares', 'error');
        return;
    }
    
    const total = shares * price;
    
    if (action === 'SELL') {
        const position = portfolio.find(p => p.etf === etf);
        if (!position || position.shares < shares) {
            const available = position ? position.shares : 0;
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
    
    transactions.splice(actualIndex, 1);
    await saveTransactionsToCloud();
    
    recalculatePortfolioFromTransactions();
    
    renderDashboard();
    renderTransactions();
    renderStrategy();
    
    showNotification('Transaction deleted', 'info');
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
    const activeETFs = portfolio.filter(p => p.etf && p.shares > 0).map(p => p.etf);
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
                await savePricesToCloud();
                renderDashboard();
                updateLastUpdated();
                console.log('✅ Prices updated at', lastPriceUpdate);
            }
        }
    } catch (error) {
        console.warn('⚠️ Unable to fetch live prices:', error.message);
        if (!lastPriceUpdate) {
            lastPriceUpdate = new Date();
        }
    } finally {
        if (isAutoUpdate) hideUpdateIndicator();
    }
}

function setupAutomaticUpdates() {
    if (priceUpdateInterval) clearInterval(priceUpdateInterval);
    
    const updateInterval = isMarketHours() 
        ? CONFIG.PRICE_UPDATE.marketHoursInterval 
        : CONFIG.PRICE_UPDATE.afterHoursInterval;
    
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
            
            if (timeSinceUpdate > CONFIG.PRICE_UPDATE.staleThreshold) {
                console.log('Page visible after long period, fetching fresh prices');
                fetchCurrentPrices(true);
            }
        }
    });
}

// ============================================================================
// UI HELPERS
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
    
    modal.style.display = 'flex';
}

function closeTransactionModal() {
    document.getElementById('transactionModal').style.display = 'none';
}

// FIX: Convert price input from type="number" (shows useless spinners on mobile)
// to type="text" with inputmode="decimal" (shows numeric keyboard, allows typing)
function fixMobileInputs() {
    const priceInput = document.getElementById('transactionPrice');
    if (priceInput) {
        priceInput.type = 'text';
        priceInput.inputMode = 'decimal';
        priceInput.pattern = '[0-9]*\\.?[0-9]*';
        priceInput.placeholder = 'e.g. 88 or 88.18';
        
        // Auto-calculate total when price or shares change
        priceInput.addEventListener('input', updateTotalAmount);
    }
    
    const sharesInput = document.getElementById('transactionShares');
    if (sharesInput) {
        sharesInput.addEventListener('input', updateTotalAmount);
    }
}

function updateTotalAmount() {
    const shares = parseFloat(document.getElementById('transactionShares').value) || 0;
    const price = parseFloat(document.getElementById('transactionPrice').value) || 0;
    const totalField = document.getElementById('transactionTotal') || document.getElementById('txTotal');
    if (totalField) {
        totalField.value = (shares * price).toFixed(2);
    }
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

function showUpdateIndicator() {
    const indicator = document.getElementById('updateIndicator');
    if (indicator) indicator.style.display = 'flex';
}

function hideUpdateIndicator() {
    const indicator = document.getElementById('updateIndicator');
    if (indicator) {
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 1000);
    }
}

function showLoadingIndicator(message) {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        indicator.textContent = message;
        indicator.style.display = 'flex';
    }
}

function hideLoadingIndicator() {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) indicator.style.display = 'none';
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showStorageStatus() {
    const status = cloudStorageAvailable 
        ? '☁️ Cloud Storage Active' 
        : '💾 Local Storage Only';
    
    console.log(status);
    
    const statusElement = document.getElementById('storageStatus');
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = cloudStorageAvailable ? 'status-cloud' : 'status-local';
    }
}

// ============================================================================
// EXPORT / IMPORT FUNCTIONS
// ============================================================================

function exportPortfolioData() {
    const exportData = {
        transactions: transactions,
        exportDate: new Date().toISOString(),
        version: '4.0-original-investment-model'
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `portfolio-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    showNotification('Portfolio exported successfully', 'success');
}

async function importPortfolioData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const importData = JSON.parse(e.target.result);
            
            if (!importData.transactions || !Array.isArray(importData.transactions)) {
                throw new Error('Invalid portfolio data format');
            }
            
            if (confirm(`Import ${importData.transactions.length} transactions? This will replace your current data.`)) {
                transactions = importData.transactions;
                await saveTransactionsToCloud();
                
                recalculatePortfolioFromTransactions();
                renderDashboard();
                renderTransactions();
                renderStrategy();
                
                showNotification('Portfolio imported successfully', 'success');
            }
        } catch (error) {
            console.error('Import error:', error);
            showNotification('Import failed: Invalid file format', 'error');
        }
    };
    
    reader.readAsText(file);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

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
        refreshBtn.addEventListener('click', () => fetchCurrentPrices(true));
    }
    
    const exportBtn = document.getElementById('exportData');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportPortfolioData);
    }
    
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
