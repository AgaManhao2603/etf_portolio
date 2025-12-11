// ETF Portfolio Tracker - App Logic
// Data stored in localStorage for persistence

// Initial data from your spreadsheet
const initialPortfolio = [
    { etf: 'SOXX', shares: 107.14, avgEntry: 280.01, invested: 30000, reserved: 40000, strategy: 'Buy at $300 (light), $290 (ideal)' },
    { etf: 'IWM', shares: 30.04, avgEntry: 249.67, invested: 7500, reserved: 35000, strategy: 'Buy at $245 (light), $238 (ideal)' },
    { etf: 'ARKK', shares: 0, avgEntry: 0, invested: 0, reserved: 40000, strategy: 'Buy at $78 (light), $73 (ideal)' },
    { etf: 'VWO', shares: 414.46, avgEntry: 54.11, invested: 22425.26, reserved: 5000, strategy: 'Buy at $52.5 (light), $50–51 (ideal)' },
    { etf: 'INDA', shares: 140.42, avgEntry: 53.41, invested: 7500, reserved: 0, strategy: 'Good entry around $52 (light), $50 (ideal)' },
    { etf: 'AIA', shares: 78.35, avgEntry: 95.72, invested: 7500, reserved: 0, strategy: 'Buy near $60 (light), $57 (ideal)' },
    { etf: 'SCHD', shares: 449.64, avgEntry: 27.80, invested: 12500, reserved: 0, strategy: 'Stable. Good long-term entry anytime.' },
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
    
    // Fetch current prices
    fetchCurrentPrices();
    
    // Render initial view
    renderDashboard();
    renderTransactions();
    renderStrategy();
    
    // Setup event listeners
    setupEventListeners();
    
    // Update last updated time
    updateLastUpdated();
}

// Save data to localStorage
function savePortfolio() {
    localStorage.setItem('etf_portfolio', JSON.stringify(portfolio));
}

function saveTransactions() {
    localStorage.setItem('etf_transactions', JSON.stringify(transactions));
}

// Fetch current prices using a financial API
async function fetchCurrentPrices() {
    const symbols = portfolio.map(p => p.etf).join(',');
    
    try {
        const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`);
        const data = await response.json();
        
        if (data.quoteResponse && data.quoteResponse.result) {
            data.quoteResponse.result.forEach(quote => {
                currentPrices[quote.symbol] = quote.regularMarketPrice || 0;
            });
        }
    } catch (error) {
        console.warn('Unable to fetch live prices, using cached/default values:', error);
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
    }
    
    renderDashboard();
    updateLastUpdated();
}

// Calculate portfolio metrics
function calculateMetrics() {
    let totalInvested = 0;
    let totalValue = 0;
    let totalReserved = 0;
    
    portfolio.forEach(position => {
        totalInvested += position.invested;
        totalReserved += position.reserved;
        const currentPrice = currentPrices[position.etf] || 0;
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
    gainPercentElement.className = metrics.totalGainLoss >= 0 ? 'card-change positive' : 'card-change negative';
    
    const tbody = document.getElementById('portfolioTableBody');
    tbody.innerHTML = '';
    
    portfolio.forEach(position => {
        const currentPrice = currentPrices[position.etf] || 0;
        const currentValue = position.shares * currentPrice;
        const gainLoss = currentValue - position.invested;
        const returnPercent = position.invested > 0 ? (gainLoss / position.invested) * 100 : 0;
        
        let status = 'NOT STARTED';
        let statusClass = 'status-not-started';
        if (position.shares > 0 && position.reserved > 0) {
            status = 'BUILDING';
            statusClass = 'status-building';
        } else if (position.shares > 0) {
            status = 'COMPLETE';
            statusClass = 'status-complete';
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="etf-symbol">${position.etf}</span></td>
            <td class="mono">${position.shares.toFixed(2)}</td>
            <td class="mono">${formatCurrency(position.avgEntry)}</td>
            <td class="mono">${formatCurrency(position.invested)}</td>
            <td class="mono">${formatCurrency(currentPrice)}</td>
            <td class="mono">${formatCurrency(currentValue)}</td>
            <td class="mono ${gainLoss >= 0 ? 'gain-positive' : 'gain-negative'}">
                ${formatCurrency(gainLoss)}
            </td>
            <td class="mono ${returnPercent >= 0 ? 'gain-positive' : 'gain-negative'}">
                ${returnPercent.toFixed(2)}%
            </td>
            <td class="mono">${formatCurrency(position.reserved)}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
        `;
        tbody.appendChild(row);
    });
}

// Render transactions
function renderTransactions() {
    const tbody = document.getElementById('transactionsTableBody');
    tbody.innerHTML = '';
    
    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedTransactions.forEach(tx => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="mono">${formatDate(tx.date)}</td>
            <td><span class="etf-symbol">${tx.etf}</span></td>
            <td><span class="action-${tx.action.toLowerCase()}">${tx.action}</span></td>
            <td class="mono">${tx.shares.toFixed(2)}</td>
            <td class="mono">${formatCurrency(tx.price)}</td>
            <td class="mono">${formatCurrency(tx.total)}</td>
            <td>${tx.notes || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

// Render strategy
function renderStrategy() {
    const grid = document.getElementById('strategyGrid');
    grid.innerHTML = '';
    
    portfolio.forEach(position => {
        const card = document.createElement('div');
        card.className = 'strategy-card';
        card.innerHTML = `
            <div class="strategy-header">
                <span class="strategy-etf">${position.etf}</span>
                <span class="status-badge ${getStatusClass(position)}">${getStatus(position)}</span>
            </div>
            <div class="strategy-content">
                ${position.strategy}
            </div>
        `;
        grid.appendChild(card);
    });
}

// Helper functions
function getStatus(position) {
    if (position.shares === 0) return 'NOT STARTED';
    if (position.reserved > 0) return 'BUILDING';
    return 'COMPLETE';
}

function getStatusClass(position) {
    const status = getStatus(position);
    if (status === 'NOT STARTED') return 'status-not-started';
    if (status === 'BUILDING') return 'status-building';
    return 'status-complete';
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function updateLastUpdated() {
    const now = new Date();
    document.getElementById('lastUpdated').textContent = now.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Event listeners
function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
    
    const modal = document.getElementById('addTransactionModal');
    const addBtn = document.getElementById('addTransactionBtn');
    const closeBtn = document.getElementById('modalClose');
    const overlay = document.getElementById('modalOverlay');
    const cancelBtn = document.getElementById('cancelBtn');
    
    addBtn.addEventListener('click', () => openModal());
    closeBtn.addEventListener('click', () => closeModal());
    overlay.addEventListener('click', () => closeModal());
    cancelBtn.addEventListener('click', () => closeModal());
    
    const sharesInput = document.getElementById('txShares');
    const priceInput = document.getElementById('txPrice');
    const totalInput = document.getElementById('txTotal');
    
    function calculateTotal() {
        const shares = parseFloat(sharesInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        totalInput.value = (shares * price).toFixed(2);
    }
    
    sharesInput.addEventListener('input', calculateTotal);
    priceInput.addEventListener('input', calculateTotal);
    
    const form = document.getElementById('transactionForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        addTransaction();
    });
    
    document.getElementById('refreshPrices').addEventListener('click', () => {
        fetchCurrentPrices();
    });
    
    document.getElementById('txDate').valueAsDate = new Date();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

function openModal() {
    document.getElementById('addTransactionModal').classList.add('active');
}

function closeModal() {
    document.getElementById('addTransactionModal').classList.remove('active');
    document.getElementById('transactionForm').reset();
    document.getElementById('txDate').valueAsDate = new Date();
}

function addTransaction() {
    const transaction = {
        date: document.getElementById('txDate').value,
        etf: document.getElementById('txETF').value.toUpperCase(),
        action: document.getElementById('txAction').value,
        shares: parseFloat(document.getElementById('txShares').value),
        price: parseFloat(document.getElementById('txPrice').value),
        total: parseFloat(document.getElementById('txTotal').value),
        notes: document.getElementById('txNotes').value
    };
    
    transactions.push(transaction);
    saveTransactions();
    
    updatePortfolioFromTransaction(transaction);
    
    renderDashboard();
    renderTransactions();
    renderStrategy();
    
    closeModal();
    
    showNotification('Transaction added successfully!');
}

function updatePortfolioFromTransaction(tx) {
    let position = portfolio.find(p => p.etf === tx.etf);
    
    if (!position) {
        position = {
            etf: tx.etf,
            shares: 0,
            avgEntry: 0,
            invested: 0,
            reserved: 0,
            strategy: ''
        };
        portfolio.push(position);
    }
    
    if (tx.action === 'BUY') {
        const totalCost = (position.shares * position.avgEntry) + tx.total;
        const totalShares = position.shares + tx.shares;
        position.avgEntry = totalCost / totalShares;
        position.shares = totalShares;
        position.invested += tx.total;
    } else if (tx.action === 'SELL') {
        position.shares -= tx.shares;
        position.invested -= tx.total;
    }
    
    savePortfolio();
}

function showNotification(message) {
    alert(message);
}

setInterval(() => {
    fetchCurrentPrices();
}, 5 * 60 * 1000);

document.addEventListener('DOMContentLoaded', initializeApp);
