// ========== Global State ==========
let currentReportData = null;
let currentFilter = 'all';
let severityChart = null;
let statusChart = null;
let historyCache = [];
let reportSearchTerm = '';
let reportsCurrentPage = 1;
const REPORTS_PER_PAGE = 10;

// ========== Authentication ==========
// Check token when page loads
if (window.location.pathname !== '/login.html' && window.location.pathname !== '/register.html') {
    document.addEventListener('DOMContentLoaded', () => {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'login.html';
        } else {
            updateUserProfile(token);
            showHomeView(); // Start at Home View
        }
    });
}

function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
}

function updateUserProfile(token) {
    const user = parseJwt(token);
    if (user && user.username) {
        const usernameEl = document.getElementById('user-menu-username');
        const avatarEl = document.getElementById('user-avatar-initial');
        if (usernameEl) usernameEl.textContent = user.username;
        if (avatarEl) avatarEl.textContent = user.username.charAt(0).toUpperCase();
    }
}

function toggleProfileMenu() {
    const menu = document.getElementById('user-menu-dropdown');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

function toggleHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.classList.toggle('hidden');
    }
}

// Close menu when clicking outside
window.addEventListener('click', function(e) {
    const menu = document.getElementById('user-menu-dropdown');
    const button = document.getElementById('user-menu-button');
    if (menu && button && !menu.classList.contains('hidden')) {
        if (!menu.contains(e.target) && !button.contains(e.target)) {
            menu.classList.add('hidden');
        }
    }
});


// Logout function
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

// ========== File Upload Handler ==========
async function handleFileUpload(input) {
    const file = input.files[0];
    const errorDiv = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    
    errorDiv.classList.add('hidden');

    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const jsonContent = JSON.parse(e.target.result);
            
            if (!jsonContent.app_summary && !jsonContent.results) {
                throw new Error("Invalid JSON structure. Missing 'app_summary' or 'results'.");
            }

            const token = localStorage.getItem('token');
            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    fileName: file.name,
                    uploadDate: new Date().toISOString(),
                    data: jsonContent
                })
            });

            if (!response.ok) {
                const responseText = await response.text();
                let errMessage = 'Failed to upload report.';

                try {
                    const errData = JSON.parse(responseText);
                    errMessage = errData.message || errData.error || errMessage;
                } catch (parseError) {
                    if (response.status === 401) {
                        errMessage = 'Session expired or unauthorized. Please login again.';
                    } else if (responseText && responseText.trim()) {
                        errMessage = responseText.trim();
                    }
                }

                if (response.status === 401) {
                    localStorage.removeItem('token');
                }

                throw new Error(errMessage);
            }

            currentReportData = normalizeReportData(jsonContent);
            renderReport(currentReportData);
            showDashboard();
            updateHistoryUI();

        } catch (error) {
            console.error('Upload error:', error);
            errorText.textContent = error.message;
            errorDiv.classList.remove('hidden');
        }
    };

    reader.onerror = function() {
        errorText.textContent = 'Failed to read file. Please try again.';
        errorDiv.classList.remove('hidden');
    };

    reader.readAsText(file);
}


// ========== History Management ==========
async function updateHistoryUI() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch('/api/reports', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            // If token is invalid, redirect to login
            if (response.status === 401) {
                logout();
            }
            throw new Error('Failed to fetch history.');
        }

        const reports = await response.json();
        historyCache = reports.data || [];
        updateHistorySidebar(historyCache);

    } catch (error) {
        console.error('Error fetching history:', error);
    }
}


function updateHistorySidebar(history) {
    const list = document.getElementById('history-sidebar-list');
    const empty = document.getElementById('history-empty');

    if (!list || !empty) return;
    
    if (history.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    list.innerHTML = history.map(entry => createHistoryItem(entry, false)).join('');
}

function createHistoryItem(entry, isPreview) {
    const date = new Date(entry.uploadDate);
    const timeAgo = getTimeAgo(date);
    
    return `
        <div class="history-item" onclick="loadHistoryEntry(${entry.id})">
            <div class="history-item-header">
                <div class="history-item-title truncate">${escapeHtml(entry.fileName)}</div>
                ${!isPreview ? `
                    <button onclick="event.stopPropagation(); deleteHistoryEntry(${entry.id})" 
                            class="text-red-400 hover:text-red-300 transition">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                ` : ''}
            </div>
            <div class="history-item-meta">
                <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ${timeAgo}
                </span>
            </div>
        </div>
    `;
}

async function loadHistoryEntry(id) {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`/api/reports/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load report.');
        }

        const report = await response.json();
        currentReportData = normalizeReportData(JSON.parse(report.data.data));
        renderReport(currentReportData);
        showDashboard();

        const historySidebar = document.getElementById('history-sidebar');
        if (historySidebar && !historySidebar.classList.contains('hidden')) {
            toggleHistory();
        }
        
    } catch (error) {
        console.error('Error loading report:', error);
    }
}

async function deleteHistoryEntry(id) {
    if (!confirm('Are you sure you want to delete this report?')) return;
    
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`/api/reports/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete report.');
        }

        updateHistoryUI();
    } catch (error) {
        console.error('Error deleting report:', error);
    }
}

function clearAllHistory() {
    alert("This feature is disabled. Please delete reports one by one.");
}

// ========== UI State Management ==========
function hideAllViews() {
    const views = ['upload-section', 'report-dashboard', 'profile-view', 'settings-view', 'dashboard-home-view'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    // Hide context buttons
    document.getElementById('btn-reset').classList.add('hidden');
    document.getElementById('btn-history').classList.add('hidden');
}

function showDashboard() {
    // Acts as "Back" or "Main" logic
    hideAllViews();
    if (currentReportData) {
        document.getElementById('report-dashboard').classList.remove('hidden');
        document.getElementById('btn-reset').classList.remove('hidden');
        document.getElementById('btn-history').classList.remove('hidden');
    } else {
        showHomeView();
    }
}

function showHomeView() {
    hideAllViews();
    document.getElementById('dashboard-home-view').classList.remove('hidden');
    document.getElementById('btn-history').classList.remove('hidden');
    
    updateHomeData();
    
    // Close dropdown
    const menu = document.getElementById('user-menu-dropdown');
    if (menu) menu.classList.add('hidden');
    
    // Update welcome name
    const token = localStorage.getItem('token');
    const user = parseJwt(token);
    if (user && document.getElementById('home-username')) {
        document.getElementById('home-username').textContent = user.username;
    }
}

async function updateHomeData() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch('/api/reports', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const result = await response.json();
            const reports = result.data;
            historyCache = reports || [];
            reportsCurrentPage = 1;
            renderHomeStats(reports);
            renderProjectsTable(reports);
            updateHistorySidebar(historyCache); // Sync sidebar
        }
    } catch (error) {
        console.error("Error updating home data", error);
    }
}

function renderHomeStats(reports) {
    let totalProjects = reports.length;
    let totalVulns = 0;
    let criticalVulns = 0;
    
    reports.forEach(report => {
        try {
            const data = JSON.parse(report.data);
            const results = data.results || [];
            totalVulns += results.filter(r => r.status === 'Vulnerable').length;
            criticalVulns += results.filter(r => r.status === 'Vulnerable' && (r.result?.severity?.toLowerCase() === 'critical' || r.result?.severity?.toLowerCase() === 'high')).length;
        } catch (e) {
            console.error("Error parsing report stats", e);
        }
    });
    
    if(document.getElementById('stat-total-projects')) document.getElementById('stat-total-projects').textContent = totalProjects;
    if(document.getElementById('stat-total-vulns')) document.getElementById('stat-total-vulns').textContent = totalVulns;
    if(document.getElementById('stat-critical-vulns')) document.getElementById('stat-critical-vulns').textContent = criticalVulns;
}

function renderProjectsTable(reports) {
    const tbody = document.getElementById('projects-table-body');
    const metaEl = document.getElementById('reports-table-meta');
    const paginationInfoEl = document.getElementById('reports-pagination-info');
    const pageIndicatorEl = document.getElementById('reports-page-indicator');
    const prevBtn = document.getElementById('reports-prev-btn');
    const nextBtn = document.getElementById('reports-next-btn');
    if (!tbody) return;

    tbody.innerHTML = '';

    const normalizedSearch = reportSearchTerm.trim().toLowerCase();
    const sortedReports = [...reports].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    const filteredReports = normalizedSearch
        ? sortedReports.filter(report => (report.fileName || '').toLowerCase().includes(normalizedSearch))
        : sortedReports;

    const totalReports = filteredReports.length;
    const totalPages = Math.max(1, Math.ceil(totalReports / REPORTS_PER_PAGE));
    reportsCurrentPage = Math.min(reportsCurrentPage, totalPages);

    const startIndex = (reportsCurrentPage - 1) * REPORTS_PER_PAGE;
    const endIndex = startIndex + REPORTS_PER_PAGE;
    const paginatedReports = filteredReports.slice(startIndex, endIndex);

    if (metaEl) {
        metaEl.textContent = normalizedSearch
            ? `${totalReports} matching report${totalReports === 1 ? '' : 's'}`
            : 'Latest uploads linked to your account';
    }

    if (paginationInfoEl) {
        if (totalReports === 0) {
            paginationInfoEl.textContent = 'Showing 0 to 0 of 0 reports';
        } else {
            paginationInfoEl.textContent = `Showing ${startIndex + 1} to ${Math.min(endIndex, totalReports)} of ${totalReports} reports`;
        }
    }

    if (pageIndicatorEl) {
        pageIndicatorEl.textContent = `Page ${totalReports === 0 ? 0 : reportsCurrentPage} of ${totalReports === 0 ? 0 : totalPages}`;
    }

    if (prevBtn) prevBtn.disabled = reportsCurrentPage <= 1 || totalReports === 0;
    if (nextBtn) nextBtn.disabled = reportsCurrentPage >= totalPages || totalReports === 0;

    if (paginatedReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500">${normalizedSearch ? 'No reports match your search.' : 'No projects found. Start a new scan!'}</td></tr>`;
        return;
    }

    paginatedReports.forEach(report => {
        let vulnCount = 0;
        let criticalCount = 0;
        let highCount = 0;
        try {
            const data = JSON.parse(report.data);
            const results = data.results || [];
            vulnCount = results.filter(r => r.status === 'Vulnerable').length;
            criticalCount = results.filter(r => r.status === 'Vulnerable' && r.result?.severity?.toLowerCase() === 'critical').length;
            highCount = results.filter(r => r.status === 'Vulnerable' && r.result?.severity?.toLowerCase() === 'high').length;
        } catch (e) {}
        
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-dark-700/30 transition-colors border-b border-dark-700/30 last:border-0';
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-white">${escapeHtml(report.fileName)}</td>
            <td class="px-6 py-4 text-slate-400">${new Date(report.uploadDate).toLocaleDateString()}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/20">${vulnCount} Issues</span>
                    ${criticalCount > 0 ? `<span class="px-2 py-1 rounded text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/20">${criticalCount} Critical</span>` : ''}
                    ${highCount > 0 ? `<span class="px-2 py-1 rounded text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/20">${highCount} High</span>` : ''}
                </div>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="loadHistoryEntry(${report.id})" class="text-brand-primary hover:text-brand-secondary text-sm font-medium mr-3 transition-colors">View</button>
                <button onclick="deleteHistoryEntry(${report.id})" class="text-red-400 hover:text-red-300 text-sm font-medium transition-colors">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function handleReportSearch(value) {
    reportSearchTerm = value || '';
    reportsCurrentPage = 1;
    renderProjectsTable(historyCache);
}

function changeReportsPage(direction) {
    const nextPage = reportsCurrentPage + direction;
    if (nextPage < 1) return;
    reportsCurrentPage = nextPage;
    renderProjectsTable(historyCache);
}

function showProfileView() {
    hideAllViews();
    const view = document.getElementById('profile-view');
    if (view) view.classList.remove('hidden');
    
    // Close dropdown
    const menu = document.getElementById('user-menu-dropdown');
    if (menu) menu.classList.add('hidden');
    
    // Populate profile data
    const token = localStorage.getItem('token');
    const user = parseJwt(token);
    if (user) {
        const usernameEl = document.getElementById('profile-username');
        const avatarEl = document.getElementById('profile-avatar-initial');
        if (usernameEl) usernameEl.textContent = user.username;
        if (avatarEl) avatarEl.textContent = user.username.charAt(0).toUpperCase();
    }
}

function showSettingsView() {
    hideAllViews();
    const view = document.getElementById('settings-view');
    if (view) view.classList.remove('hidden');
    
    // Close dropdown
    const menu = document.getElementById('user-menu-dropdown');
    if (menu) menu.classList.add('hidden');
}

function resetViewer() {
    document.getElementById('file-upload').value = '';
    
    // If going to "New Scan", show upload section specifically
    hideAllViews();
    document.getElementById('upload-section').classList.remove('hidden');
    document.getElementById('btn-history').classList.remove('hidden');
    
    currentReportData = null;
    
    if (severityChart) {
        severityChart.destroy();
        severityChart = null;
    }
    if (statusChart) {
        statusChart.destroy();
        statusChart = null;
    }
    
    switchTab('overview');
}

// ========== Report Rendering ==========
function normalizeReportData(data) {
    const normalized = data && typeof data === 'object' ? { ...data } : {};
    normalized.results = Array.isArray(normalized.results) ? normalized.results.map(item => ({
        ...item,
        rule: item?.rule || 'unknown_rule',
        vulnerability: item?.vulnerability || item?.rule || 'Unknown Finding',
        status: item?.status || 'Unknown',
        result: {
            severity: item?.result?.severity || 'Info',
            confidence: item?.result?.confidence || '',
            evidence: item?.result?.evidence || '',
            description: item?.result?.description || '',
            attack_scenario: item?.result?.attack_scenario || '',
            attacker_priority: item?.result?.attacker_priority || '',
            recommendation: item?.result?.recommendation || '',
            false_positive_analysis: item?.result?.false_positive_analysis || '',
            masvs_reference: item?.result?.masvs_reference || null,
            is_vulnerable: item?.result?.is_vulnerable ?? (item?.status === 'Vulnerable')
        },
        also_detected_by: Array.isArray(item?.also_detected_by) ? item.also_detected_by : []
    })) : [];

    normalized.analysis_errors = Array.isArray(normalized.analysis_errors) ? normalized.analysis_errors : [];
    return normalized;
}

function getReportStats(data) {
    const results = data.results || [];
    return {
        total: results.length,
        vulnerable: results.filter(r => r.status === 'Vulnerable').length,
        notVulnerable: results.filter(r => r.status !== 'Vulnerable').length,
        critical: results.filter(r => r.status === 'Vulnerable' && r.result?.severity?.toLowerCase() === 'critical').length,
        high: results.filter(r => r.status === 'Vulnerable' && r.result?.severity?.toLowerCase() === 'high').length,
        medium: results.filter(r => r.status === 'Vulnerable' && r.result?.severity?.toLowerCase() === 'medium').length,
        low: results.filter(r => r.status === 'Vulnerable' && r.result?.severity?.toLowerCase() === 'low').length,
        info: results.filter(r => r.result?.severity?.toLowerCase() === 'info').length
    };
}

function renderReport(data) {
    const normalizedData = normalizeReportData(data);
    renderStats(normalizedData);
    renderSummary(normalizedData);
    renderAttackSurface(normalizedData);
    renderFindings(normalizedData);
    renderOverview(normalizedData);
    renderCompliance(normalizedData);
    renderEvidence(normalizedData);
}

function renderStats(data) {
    const stats = getReportStats(data);
    
    const statsSection = document.getElementById('stats-section');
    statsSection.innerHTML = `
        <div class="stat-card fade-in" style="animation-delay: 0.1s">
            <div class="stat-icon bg-gradient-to-br from-blue-500 to-blue-600">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">Total Findings</div>
        </div>
        <div class="stat-card fade-in" style="animation-delay: 0.2s">
            <div class="stat-icon bg-gradient-to-br from-red-500 to-red-600">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <div class="stat-value">${stats.vulnerable}</div>
            <div class="stat-label">Vulnerable</div>
        </div>
        <div class="stat-card fade-in" style="animation-delay: 0.3s">
            <div class="stat-icon bg-gradient-to-br from-orange-500 to-red-500">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <div class="stat-value">${stats.critical + stats.high}</div>
            <div class="stat-label">Critical & High</div>
        </div>
        <div class="stat-card fade-in" style="animation-delay: 0.4s">
            <div class="stat-icon bg-gradient-to-br from-yellow-500 to-orange-500">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            </div>
            <div class="stat-value">${stats.medium + stats.low + stats.info}</div>
            <div class="stat-label">Medium, Low & Info</div>
        </div>
    `;
}

function renderSummary(data) {
    const summaryContent = data.app_summary || "_No summary provided._";
    document.getElementById('content-summary').innerHTML = marked.parse(summaryContent);
}

function formatAttackSurfaceBoolean(value) {
    return value
        ? '<span class="attack-surface-status is-enabled inline-flex items-center px-2 py-1 rounded-md bg-green-500/20 text-green-300 border border-green-500/30 text-xs font-semibold">Enabled</span>'
        : '<span class="attack-surface-status is-disabled inline-flex items-center px-2 py-1 rounded-md bg-slate-700/70 text-slate-300 border border-slate-600/50 text-xs font-semibold">Not Detected</span>';
}

function renderAttackSurface(data) {
    const container = document.getElementById('content-attack-surface');
    const attackSurfaceContent = data.attack_surface_map;

    if (!attackSurfaceContent) {
        container.innerHTML = marked.parse('_No attack surface map provided._');
        return;
    }

    if (typeof attackSurfaceContent === 'string') {
        container.innerHTML = marked.parse(attackSurfaceContent);
        return;
    }

    const exportedActivities = attackSurfaceContent.exported_activities || [];
    const exportedReceivers = attackSurfaceContent.exported_receivers || [];
    const exportedServices = attackSurfaceContent.exported_services || [];
    const exportedProviders = attackSurfaceContent.exported_providers || [];
    const deepLinks = attackSurfaceContent.deep_links || [];
    const unprotectedBroadcasts = attackSurfaceContent.unprotected_broadcasts || [];
    const network = attackSurfaceContent.network || [];
    const manifestFlags = attackSurfaceContent.manifest_flags || {};

    const renderList = (title, items, emptyText = 'None detected') => `
        <div class="attack-surface-section bg-dark-900/40 border border-dark-700 rounded-xl p-4">
            <h3 class="text-sm font-semibold text-white mb-3">${title}</h3>
            ${items.length ? `
                <div class="flex flex-wrap gap-2">
                    ${items.map(item => `<span class="attack-surface-chip px-3 py-1 rounded-lg bg-dark-800 border border-dark-600 text-slate-200 text-sm">${escapeHtml(item)}</span>`).join('')}
                </div>
            ` : `<p class="text-sm text-slate-500">${escapeHtml(emptyText)}</p>`}
        </div>
    `;

    const renderKeyValues = Object.keys(manifestFlags).length ? `
        <div class="attack-surface-section bg-dark-900/40 border border-dark-700 rounded-xl p-4">
            <h3 class="text-sm font-semibold text-white mb-3">Manifest Flags</h3>
            <div class="grid sm:grid-cols-2 gap-3">
                ${Object.entries(manifestFlags).map(([key, value]) => `
                    <div class="attack-surface-row flex items-center justify-between gap-3 rounded-lg bg-dark-800/80 border border-dark-700 px-3 py-2">
                        <span class="text-sm text-slate-300">${escapeHtml(key.replace(/_/g, ' '))}</span>
                        ${formatAttackSurfaceBoolean(Boolean(value))}
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '';

    const renderDeepLinks = `
        <div class="attack-surface-section bg-dark-900/40 border border-dark-700 rounded-xl p-4">
            <h3 class="text-sm font-semibold text-white mb-3">Deep Links</h3>
            ${deepLinks.length ? `
                <div class="space-y-3">
                    ${deepLinks.map(link => `
                        <div class="attack-surface-row rounded-lg bg-dark-800/80 border border-dark-700 p-3">
                            <div class="text-sm text-white font-medium">${escapeHtml(link.scheme || 'unknown')}://${escapeHtml(link.host || '')}</div>
                            <div class="text-xs text-slate-400 mt-1">Handler: ${escapeHtml(link.handler || 'Unknown')}</div>
                        </div>
                    `).join('')}
                </div>
            ` : `<p class="text-sm text-slate-500">No deep links detected</p>`}
        </div>
    `;

    container.className = 'max-w-none';
    container.innerHTML = `
        <div class="space-y-6">
            <div class="attack-surface-metrics grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div class="attack-surface-metric bg-dark-900/40 border border-dark-700 rounded-xl p-4">
                    <p class="text-xs uppercase tracking-wider text-slate-500 mb-2">Exported Activities</p>
                    <p class="text-3xl font-bold text-white">${exportedActivities.length}</p>
                </div>
                <div class="attack-surface-metric bg-dark-900/40 border border-dark-700 rounded-xl p-4">
                    <p class="text-xs uppercase tracking-wider text-slate-500 mb-2">Receivers</p>
                    <p class="text-3xl font-bold text-white">${exportedReceivers.length}</p>
                </div>
                <div class="attack-surface-metric bg-dark-900/40 border border-dark-700 rounded-xl p-4">
                    <p class="text-xs uppercase tracking-wider text-slate-500 mb-2">Services / Providers</p>
                    <p class="text-3xl font-bold text-white">${exportedServices.length + exportedProviders.length}</p>
                </div>
                <div class="attack-surface-metric bg-dark-900/40 border border-dark-700 rounded-xl p-4">
                    <p class="text-xs uppercase tracking-wider text-slate-500 mb-2">Deep Links</p>
                    <p class="text-3xl font-bold text-white">${deepLinks.length}</p>
                </div>
            </div>

            <div class="grid lg:grid-cols-2 gap-4">
                ${renderList('Exported Activities', exportedActivities)}
                ${renderList('Exported Receivers', exportedReceivers)}
                ${renderList('Exported Services', exportedServices)}
                ${renderList('Exported Providers', exportedProviders)}
            </div>

            ${renderDeepLinks}

            <div class="grid lg:grid-cols-2 gap-4">
                ${renderList('Unprotected Broadcasts', unprotectedBroadcasts)}
                ${renderList('Network Exposure', network)}
            </div>

            <div class="attack-surface-section capability-flags bg-dark-900/40 border border-dark-700 rounded-xl p-4">
                <h3 class="text-sm font-semibold text-white mb-3">Capability Flags</h3>
                <div class="capability-flags-grid grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div class="attack-surface-row capability-flag flex items-center justify-between gap-3 rounded-lg bg-dark-800/80 border border-dark-700 px-3 py-2">
                        <span class="text-sm text-slate-300">File I/O</span>
                        ${formatAttackSurfaceBoolean(Boolean(attackSurfaceContent.file_io))}
                    </div>
                    <div class="attack-surface-row capability-flag flex items-center justify-between gap-3 rounded-lg bg-dark-800/80 border border-dark-700 px-3 py-2">
                        <span class="text-sm text-slate-300">IPC</span>
                        ${formatAttackSurfaceBoolean(Boolean(attackSurfaceContent.ipc))}
                    </div>
                    <div class="attack-surface-row capability-flag flex items-center justify-between gap-3 rounded-lg bg-dark-800/80 border border-dark-700 px-3 py-2">
                        <span class="text-sm text-slate-300">Deserialization</span>
                        ${formatAttackSurfaceBoolean(Boolean(attackSurfaceContent.deserialization))}
                    </div>
                    <div class="attack-surface-row capability-flag flex items-center justify-between gap-3 rounded-lg bg-dark-800/80 border border-dark-700 px-3 py-2">
                        <span class="text-sm text-slate-300">Reflection</span>
                        ${formatAttackSurfaceBoolean(Boolean(attackSurfaceContent.reflection))}
                    </div>
                </div>
            </div>

            ${renderKeyValues}
        </div>
    `;
}

function renderFindings(data) {
    const results = data.results || [];
    const findingsList = document.getElementById('findings-list');
    const findingsCount = document.getElementById('findings-count');
    
    findingsCount.textContent = results.length;
    
    if (results.length === 0) {
        findingsList.innerHTML = `
            <div class="text-center py-16 bg-dark-800/50 backdrop-blur-sm border border-dark-600/50 rounded-xl">
                <svg class="w-16 h-16 text-green-500/50 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <p class="text-slate-400 text-lg">No vulnerabilities found</p>
            </div>
        `;
        return;
    }
    
    findingsList.innerHTML = '';
    results.forEach((item, index) => {
        const card = createFindingCard(item, index);
        findingsList.appendChild(card);
    });
}

function createFindingCard(item, index) {
    const r = item.result || {};
    const severity = (r.severity || 'info').toLowerCase();
    const severityClass = `severity-${severity}`;
    const statusClass = item.status === 'Vulnerable' ? 'status-vulnerable' : 'status-not-vulnerable';
    
    const card = document.createElement('div');
    card.className = `finding-card ${severityClass} fade-in`;
    card.style.animationDelay = `${index * 0.05}s`;
    card.setAttribute('data-severity', severity);
    card.setAttribute('data-status', item.status);
    
    card.innerHTML = `
        <div class="card-header flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div class="flex-grow">
                <div class="finding-meta flex items-center gap-2 mb-3 flex-wrap">
                    <span class="finding-meta-chip finding-meta-severity ${severityClass}">${escapeHtml(r.severity || 'Info')}</span>
                    <span class="finding-meta-chip finding-meta-status ${statusClass}">${escapeHtml(item.status)}</span>
                    ${item.rule ? `<span class="finding-meta-chip finding-meta-rule"><span class="finding-meta-label">Rule</span>${escapeHtml(item.rule)}</span>` : ''}
                    ${r.attacker_priority ? `<span class="finding-meta-chip finding-meta-priority"><span class="finding-meta-label">Priority</span>${escapeHtml(r.attacker_priority)}</span>` : ''}
                    ${r.confidence ? `<span class="finding-meta-chip finding-meta-confidence"><span class="finding-meta-label">Confidence</span>${escapeHtml(r.confidence)}</span>` : ''}
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${escapeHtml(item.vulnerability)}</h3>
                <p class="text-sm text-slate-400 font-mono break-all">${escapeHtml(item.file)}</p>
            </div>
            ${r.masvs_reference ? `
                <a href="${r.masvs_reference.link}" target="_blank" rel="noopener noreferrer" 
                   class="flex items-center gap-2 px-3 py-2 bg-brand-primary/10 hover:bg-brand-primary/20 border border-brand-primary/30 rounded-lg text-sm font-medium text-brand-primary transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    ${r.masvs_reference.id}
                </a>
            ` : ''}
        </div>
        <div class="card-body space-y-4">
            <div>
                <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</h4>
                <p class="text-slate-300 leading-relaxed">${escapeHtml(r.description || 'No description provided.')}</p>
            </div>
            ${r.attack_scenario || r.recommendation ? `
                <div class="grid md:grid-cols-2 gap-4">
                    ${r.attack_scenario ? `
                        <div class="finding-detail finding-attack bg-dark-900/50 border border-red-900/30 rounded-lg p-4">
                            <h4 class="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                Attack Scenario
                            </h4>
                            <p class="text-slate-300 text-sm">${escapeHtml(r.attack_scenario)}</p>
                        </div>
                    ` : ''}
                    ${r.recommendation ? `
                        <div class="finding-detail finding-recommendation bg-dark-900/50 border border-green-900/30 rounded-lg p-4">
                            <h4 class="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                Recommendation
                            </h4>
                            <p class="text-green-300/90 text-sm">${escapeHtml(r.recommendation)}</p>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            ${r.evidence ? `
                <div>
                    <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Evidence</h4>
                    <pre class="bg-dark-900/80 border border-dark-700 rounded-lg p-4 overflow-x-auto custom-scrollbar"><code class="text-xs text-cyan-300">${escapeHtml(r.evidence)}</code></pre>
                </div>
            ` : ''}
            ${item.also_detected_by && item.also_detected_by.length ? `
                <div class="also-detected-section pt-4 border-t border-dark-700">
                    <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Also Detected By</h4>
                    <div class="space-y-3">
                        ${item.also_detected_by.map(detector => `
                            <div class="also-detected-item bg-dark-900/50 border border-dark-700 rounded-lg p-4">
                                <div class="finding-meta also-detected-meta flex flex-wrap items-center gap-2 mb-3">
                                    <span class="finding-meta-chip finding-meta-rule">
                                        <span class="finding-meta-label">Rule</span>${escapeHtml(detector.rule || 'unknown_rule')}
                                    </span>
                                    ${detector.severity ? `
                                        <span class="finding-meta-chip finding-meta-severity severity-${escapeHtml(String(detector.severity).toLowerCase())}">
                                            <span class="finding-meta-label">Severity</span>${escapeHtml(detector.severity)}
                                        </span>
                                    ` : ''}
                                </div>
                                <p class="also-detected-title text-sm font-semibold text-white mb-1">${escapeHtml(detector.vulnerability || 'Additional Detection')}</p>
                                <p class="also-detected-description text-sm text-slate-400">${escapeHtml(detector.description || 'No description provided.')}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            ${r.false_positive_analysis ? `
                <div class="pt-4 border-t border-dark-700">
                    <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">False Positive Analysis</h4>
                    <p class="text-sm text-slate-400 italic">${escapeHtml(r.false_positive_analysis)}</p>
                </div>
            ` : ''}
        </div>
    `;
    
    return card;
}

function renderCompliance(data) {
    const container = document.getElementById('content-compliance');
    if (!container) return;

    const results = data.results || [];
    const vulnerableResults = results.filter(item => item.status === 'Vulnerable');
    const mappedReferences = vulnerableResults
        .map(item => item.result?.masvs_reference)
        .filter(ref => ref && (ref.id || ref.link));

    if (!mappedReferences.length) {
        container.innerHTML = `
            <div class="workspace-panel-subtle p-6 text-sm text-slate-400">
                No MASVS compliance mapping available for this report.
            </div>
        `;
        return;
    }

    const uniqueReferences = Array.from(
        new Map(mappedReferences.map(ref => [ref.id || ref.link, ref])).values()
    );

    container.innerHTML = `
        <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            ${uniqueReferences.map(ref => `
                <a href="${ref.link || '#'}" target="_blank" rel="noopener noreferrer"
                   class="workspace-panel-subtle p-5 hover:border-cyan-500/40 transition-colors block">
                    <div class="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">MASVS Control</div>
                    <div class="text-lg font-semibold text-white">${escapeHtml(ref.id || 'Unknown Reference')}</div>
                    <div class="text-sm text-cyan-300 mt-2">Open reference</div>
                </a>
            `).join('')}
        </div>
    `;
}

function renderEvidence(data) {
    const container = document.getElementById('content-evidence');
    if (!container) return;

    const evidenceItems = (data.results || []).filter(item => item.result?.evidence);

    if (!evidenceItems.length) {
        container.innerHTML = `
            <div class="workspace-panel-subtle p-6 text-sm text-slate-400">
                No evidence snippets available in this report.
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="space-y-4">
            ${evidenceItems.map(item => `
                <div class="workspace-panel-subtle p-5">
                    <div class="flex flex-wrap items-center gap-3 mb-3">
                        <span class="severity-badge severity-${escapeHtml(String(item.result?.severity || 'info').toLowerCase())}">
                            ${escapeHtml(item.result?.severity || 'Info')}
                        </span>
                        <span class="text-sm font-semibold text-white">${escapeHtml(item.vulnerability || item.rule || 'Finding')}</span>
                    </div>
                    <p class="text-xs text-slate-500 font-mono mb-3 break-all">${escapeHtml(item.file || '')}</p>
                    <pre class="bg-dark-900/80 border border-dark-700 rounded-lg p-4 overflow-x-auto custom-scrollbar"><code class="text-xs text-cyan-300">${escapeHtml(item.result.evidence)}</code></pre>
                </div>
            `).join('')}
        </div>
    `;
}

function renderOverview(data) {
    const results = data.results || [];
    const stats = getReportStats(data);
    
    if (severityChart) severityChart.destroy();
    if (statusChart) statusChart.destroy();
    
    const severityCtx = document.getElementById('severity-chart');
    if (severityCtx) {
        severityChart = new Chart(severityCtx, {
            type: 'doughnut',
            data: {
                labels: ['Critical', 'High', 'Medium', 'Low', 'Info'],
                datasets: [{
                    data: [stats.critical, stats.high, stats.medium, stats.low, stats.info],
                    backgroundColor: [
                        'rgba(220, 38, 38, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(249, 115, 22, 0.8)',
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(148, 163, 184, 0.8)'
                    ],
                    borderColor: [
                        'rgba(220, 38, 38, 1)',
                        'rgba(239, 68, 68, 1)',
                        'rgba(249, 115, 22, 1)',
                        'rgba(59, 130, 246, 1)',
                        'rgba(148, 163, 184, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#333333',
                            padding: 15,
                            font: {
                                size: 12,
                                family: 'Inter'
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Severity Distribution',
                        color: '#222222',
                        font: {
                            size: 16,
                            weight: 'bold',
                            family: 'Inter'
                        },
                        padding: 20
                    }
                }
            }
        });
    }
    
    const statusCtx = document.getElementById('status-chart');
    if (statusCtx) {
        const vulnerable = stats.vulnerable;
        const notVulnerable = stats.notVulnerable;
        
        statusChart = new Chart(statusCtx, {
            type: 'pie',
            data: {
                labels: ['Vulnerable', 'Not Vulnerable'],
                datasets: [{
                    data: [vulnerable, notVulnerable],
                    backgroundColor: [
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(34, 197, 94, 0.8)'
                    ],
                    borderColor: [
                        'rgba(239, 68, 68, 1)',
                        'rgba(34, 197, 94, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#333333',
                            padding: 15,
                            font: {
                                size: 12,
                                family: 'Inter'
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Vulnerability Status',
                        color: '#222222',
                        font: {
                            size: 16,
                            weight: 'bold',
                            family: 'Inter'
                        },
                        padding: 20
                    }
                }
            }
        });
    }
    
    const criticalList = document.getElementById('critical-findings-list');
    const criticalFindings = results
        .filter(r => {
            const sev = (r.result?.severity || '').toLowerCase();
            return (sev === 'critical' || sev === 'high') && r.status === 'Vulnerable';
        })
        .slice(0, 5);
    
    if (criticalFindings.length === 0) {
        criticalList.innerHTML = `
            <div class="text-center py-8 text-slate-500">
                <svg class="w-12 h-12 text-green-500/50 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <p class="text-sm">No critical vulnerabilities found</p>
            </div>
        `;
    } else {
        criticalList.innerHTML = criticalFindings.map(item => {
            const severity = (item.result?.severity || 'info').toLowerCase();
            return `
                <div class="flex items-start gap-3 p-3 bg-dark-900/50 border border-dark-700 rounded-lg hover:border-red-500/30 transition-colors cursor-pointer" onclick="switchTab('findings')">
                    <div class="flex-shrink-0">
                        <span class="severity-badge severity-${severity}">${item.result?.severity}</span>
                    </div>
                    <div class="flex-grow min-w-0">
                        <h4 class="text-sm font-semibold text-white mb-1 truncate">${escapeHtml(item.vulnerability)}</h4>
                        <p class="text-xs text-slate-400 font-mono truncate">${escapeHtml(item.file)}</p>
                    </div>
                </div>
            `;
        }).join('');
    }
}


// ========== Tab Navigation ==========
function switchTab(tabName) {
    ['overview', 'summary', 'attack-surface', 'findings', 'compliance', 'evidence'].forEach(tab => {
        const tabEl = document.getElementById(`tab-${tab}`);
        const btnEl = document.getElementById(`btn-${tab}`);
        
        if (tabEl) tabEl.classList.add('hidden');
        if (btnEl) {
            btnEl.classList.remove('active');
        }
    });
    
    const activeTab = document.getElementById(`tab-${tabName}`);
    const activeBtn = document.getElementById(`btn-${tabName}`);
    
    if (activeTab) activeTab.classList.remove('hidden');
    if (activeBtn) activeBtn.classList.add('active');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========== Findings Filter ==========
function filterFindings(filterType) {
    currentFilter = filterType;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-filter="${filterType}"]`)?.classList.add('active');
    
    const cards = document.querySelectorAll('.finding-card');
    cards.forEach(card => {
        const severity = card.getAttribute('data-severity');
        const status = card.getAttribute('data-status');
        
        let show = false;
        
        if (filterType === 'all') {
            show = true;
        } else if (filterType === 'vulnerable') {
            show = status === 'Vulnerable';
        } else {
            show = severity === filterType;
        }
        
        if (show) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// ========== History Sidebar ==========
function toggleHistory() {
    const sidebar = document.getElementById('history-sidebar');
    if(sidebar) {
        sidebar.classList.toggle('hidden');
        if (!sidebar.classList.contains('hidden')) {
            updateHistorySidebar(historyCache);
        }
    }
}


// ========== Utility Functions ==========
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
    }
    
    return 'just now';
}
