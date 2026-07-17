// ==========================================================================
// CLIENT ENGINE WITH ADVANCED ADMIN API INTEGRATION & GSAP ANIMATION CONTROL
// ==========================================================================
// Globally wrap fetch to handle alternative ports and file:// protocol
(function() {
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        let finalUrl = url;
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:';
        const currentPort = window.location.port;
        
        if (typeof url === 'string' && url.startsWith('/api') && isLocal && currentPort !== "3000") {
            finalUrl = `http://localhost:3000${url}`;
        }
        return originalFetch(finalUrl, options);
    };
})();

class KPISystem {
    constructor() {
        this.token = localStorage.getItem("bia_dm_token") || null;
        this.currentUser = JSON.parse(localStorage.getItem("bia_dm_user")) || null;
        this.currentView = "view-login";
        this.chartInstance = null;
        
        // Admin spec data structures
        this.activeAdminTab = "trends";
        this.trendChartInstance = null;
        this.currentConfigItems = [];
        this.allConfigs = {};

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initDates();
        
        // Auto routing on initialization based on token existence
        if (this.token && this.currentUser) {
            this.navigateTo("view-dashboard");
        } else {
            this.navigateTo("view-login");
        }
    }

    initDates() {
        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById("daily-report-date").value = todayStr;
        document.getElementById("audit-log-date").value = todayStr;
        
        const yearMonth = todayStr.substring(0, 7);
        const monthReportMonth = document.getElementById("monthly-report-month");
        if (monthReportMonth) monthReportMonth.value = yearMonth;
        
        const modeEl = document.getElementById("summary-filter-mode");
        if (modeEl) modeEl.value = "month";

        const dateLabel = document.getElementById("kpi-date-label");
        if (dateLabel) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dateLabel.innerText = `Date: ${new Date().toLocaleDateString("en-US", options)}`;
        }
    }

    setupEventListeners() {
        // Login Submit
        document.getElementById("login-form").addEventListener("submit", (e) => {
            e.preventDefault();
            this.login();
        });

        // KPI Submission Form Submit
        document.getElementById("kpi-entry-form").addEventListener("submit", (e) => {
            e.preventDefault();
            this.submitKPI();
        });

        // Change Password Form Submit
        document.getElementById("password-form").addEventListener("submit", (e) => {
            e.preventDefault();
            this.changePassword();
        });

        // Mouse Parallax for Premium Aesthetics
        document.addEventListener("mousemove", (e) => {
            const { clientX, clientY } = e;
            const xPercent = (clientX - window.innerWidth / 2) / (window.innerWidth / 2);
            const yPercent = (clientY - window.innerHeight / 2) / (window.innerHeight / 2);

            gsap.to(".glow-1", {
                x: -xPercent * 50,
                y: -yPercent * 50,
                duration: 1.2,
                ease: "power2.out"
            });
            gsap.to(".glow-2", {
                x: xPercent * 50,
                y: yPercent * 50,
                duration: 1.2,
                ease: "power2.out"
            });
        });
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }

    navigateTo(viewId) {
        const currentSec = document.getElementById(this.currentView);
        const targetSec = document.getElementById(viewId);

        if (!targetSec) return;

        // GSAP transition animation choreography
        gsap.to(currentSec, {
            opacity: 0,
            y: -15,
            duration: 0.2,
            onComplete: () => {
                currentSec.classList.remove("active");
                targetSec.classList.add("active");
                
                // Reset scroll position to top instantly
                window.scrollTo({ top: 0, behavior: 'instant' });
                
                // Toggle background decorations visibility (only on login screen)
                const videoBg = document.querySelector(".video-bg-container");
                const bgDecor = document.querySelector(".bg-decoration");
                if (videoBg) videoBg.style.display = (viewId === "view-login") ? "block" : "none";
                if (bgDecor) bgDecor.style.display = (viewId === "view-login") ? "block" : "none";
                
                // View render API hooks
                if (viewId === "view-dashboard") this.renderDashboard();
                if (viewId === "view-kpi-entry") this.renderKPIForm();
                if (viewId === "view-leaderboard") this.renderLeaderboard();
                if (viewId === "view-daily-report") this.renderDailyReport();
                if (viewId === "view-monthly-report") this.renderMonthlyReport();
                if (viewId === "view-admin-control") this.renderAdminControl();

                gsap.fromTo(targetSec, 
                    { opacity: 0, y: 15 },
                    { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }
                );
            }
        });

        this.currentView = viewId;
    }

    navigateToAdminTeam() {
        this.activeAdminTab = "team";
        this.navigateTo("view-admin-control");
    }

    async login() {
        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;
        const errorEl = document.getElementById("login-error");

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.currentUser = data.user;
                
                localStorage.setItem("bia_dm_token", this.token);
                localStorage.setItem("bia_dm_user", JSON.stringify(this.currentUser));

                errorEl.style.display = "none";
                document.getElementById("login-form").reset();
                
                this.showToast(`Welcome, ${data.user.name}!`, "success");
                this.navigateTo("view-dashboard");
            } else {
                throw new Error(data.error || "Login failed");
            }
        } catch (err) {
            errorEl.innerText = err.message;
            errorEl.style.display = "block";
            gsap.fromTo(errorEl, { x: -10 }, { x: 0, duration: 0.3, ease: "rough", repeat: 2 });
        }
    }

    logout() {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem("bia_dm_token");
        localStorage.removeItem("bia_dm_user");
        this.navigateTo("view-login");
        this.showToast("Logged out successfully.", "info");
    }

    showToast(message, type = "success") {
        const toast = document.getElementById("toast-notification");
        const msgEl = toast.querySelector(".toast-message");
        const iconEl = toast.querySelector(".toast-icon");

        msgEl.innerText = message;
        toast.className = "toast show";

        if (type === "error") {
            toast.className = "toast show toast-error";
            iconEl.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color:var(--rose)"></i>`;
        } else if (type === "info") {
            iconEl.innerHTML = `<i class="fa-solid fa-circle-info" style="color:var(--primary)"></i>`;
        } else {
            iconEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--emerald)"></i>`;
        }

        setTimeout(() => {
            toast.classList.remove("show");
        }, 3500);
    }

    renderDashboard() {
        if (!this.currentUser) return;
        document.getElementById("user-display-name").innerText = `${this.currentUser.name} (${this.currentUser.role})`;
        document.getElementById("user-role-badge").innerText = this.currentUser.role;

        const adminReportsEl = document.getElementById("admin-reports-card");
        if (this.currentUser.role === "Admin") {
            adminReportsEl.style.display = "block";
            document.body.classList.add("admin-mode");
        } else {
            adminReportsEl.style.display = "none";
            document.body.classList.remove("admin-mode");
        }
    }

    async renderKPIForm() {
        const dynamicFields = document.getElementById("dynamic-kpi-fields");
        dynamicFields.innerHTML = "";

        if (this.currentUser.role === "Admin") {
            dynamicFields.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:40px;">
                    <i class="fa-solid fa-user-shield" style="font-size:48px; color:var(--primary); margin-bottom:16px;"></i>
                    <h3>Admin Mode</h3>
                    <p style="color:var(--text-muted); margin-top:8px;">Administrators do not submit daily checklists. Please login as a consultant.</p>
                </div>
            `;
            document.querySelector(".form-footer").style.display = "none";
            return;
        }

        document.querySelector(".form-footer").style.display = "flex";

        // Fetch configs dynamically from the backend!
        let items = [];
        try {
            const resConfigs = await fetch('/api/kpis/configs', { headers: this.getHeaders() });
            const configsData = await resConfigs.json();
            items = configsData[this.currentUser.id] || [];
        } catch (e) {
            this.showToast("Failed to fetch metric configurations", "error");
            return;
        }
        
        if (items.length === 0) {
            dynamicFields.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:40px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:48px; color:var(--text-light); margin-bottom:16px;"></i>
                    <h3>Metrics Not Configured</h3>
                    <p style="color:var(--text-muted); margin-top:8px;">Please ask your administrator to configure KPI metrics for your account.</p>
                </div>
            `;
            document.querySelector(".form-footer").style.display = "none";
            return;
        }

        // Group by category
        const categories = {};
        items.forEach(item => {
            if (!categories[item.category]) categories[item.category] = [];
            categories[item.category].push(item);
        });

        // Pull existing daily submission for selected date via API
        let existingSubmission = null;
        const dateInput = document.getElementById("kpi-submission-date");
        if (dateInput) {
            const today = new Date();
            
            // Generate ISO date strings in YYYY-MM-DD local format
            const formatDateLocal = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            
            const todayStr = formatDateLocal(today);
            
            // Calculate 2 days ago date
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(today.getDate() - 2);
            const twoDaysAgoStr = formatDateLocal(twoDaysAgo);
            
            // Enforce constraints in Date UI picker
            dateInput.setAttribute("max", todayStr);
            dateInput.setAttribute("min", twoDaysAgoStr);
            
            if (!dateInput.value) {
                dateInput.value = todayStr;
            }
        }
        const selectedDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

        try {
            const response = await fetch(`/api/reports/daily?date=${selectedDate}`, {
                headers: this.getHeaders()
            });
            if (response.ok) {
                const dayData = await response.json();
                existingSubmission = dayData[this.currentUser.id];
            }
        } catch (e) {
            console.error("Failed to load existing daily KPI submission:", e);
        }

        for (const catName in categories) {
            const catCard = document.createElement("div");
            catCard.className = "glass-card kpi-category-card";
            
            const weightage = categories[catName][0].weightage || "";
            let headerHtml = `
                <div class="category-title-row">
                    <div class="category-title">${catName}</div>
                    ${weightage ? `<span class="category-weightage-badge">${weightage} weight</span>` : ""}
                </div>`;
            let rowsHtml = "";

            categories[catName].forEach(item => {
                const qtyVal = existingSubmission && existingSubmission.items[item.id] ? existingSubmission.items[item.id].qty : 0;
                const remarksVal = existingSubmission && existingSubmission.items[item.id] ? existingSubmission.items[item.id].remarks : "";
                const isRemarkDisabled = qtyVal === 0 ? "disabled" : "";
                const isRemarkRequired = qtyVal > 0 ? "remark-required" : "";

                rowsHtml += `
                    <div class="kpi-item-row" data-item-id="${item.id}" data-points="${item.points}">
                        <div class="kpi-details">
                            <label>${item.label}</label>
                            <span class="points-val">${item.points} pts / activity</span>
                        </div>
                        <div class="kpi-input-wrapper">
                            <input type="number" 
                                   class="kpi-qty" 
                                   name="qty_${item.id}" 
                                   value="${qtyVal}" 
                                   min="0" 
                                   oninput="app.calculateFormScore()">
                        </div>
                        <div class="kpi-remark-wrapper">
                            <input type="text" 
                                   class="kpi-remark ${isRemarkRequired}" 
                                   name="remark_${item.id}" 
                                   placeholder="Add required brief description" 
                                   value="${remarksVal}" 
                                   ${isRemarkDisabled}>
                        </div>
                    </div>
                `;
            });

            catCard.innerHTML = headerHtml + rowsHtml;
            dynamicFields.appendChild(catCard);
        }

        this.calculateFormScore();
    }

    calculateFormScore() {
        let total = 0;
        let hasErrors = false;
        const rows = document.querySelectorAll(".kpi-item-row");
        
        rows.forEach(row => {
            const points = parseInt(row.getAttribute("data-points"), 10);
            const qtyInput = row.querySelector(".kpi-qty");
            const remarkInput = row.querySelector(".kpi-remark");

            const qty = parseInt(qtyInput.value, 10) || 0;

            if (qty > 0) {
                total += (qty * points);
                remarkInput.disabled = false;
                remarkInput.setAttribute("placeholder", "Add required brief description");
                
                if (remarkInput.value.trim() === "") {
                    remarkInput.classList.add("remark-required");
                    remarkInput.style.borderColor = "var(--rose)";
                    hasErrors = true;
                } else {
                    remarkInput.classList.remove("remark-required");
                    remarkInput.style.borderColor = "";
                }
            } else {
                remarkInput.disabled = true;
                remarkInput.classList.remove("remark-required");
                remarkInput.style.borderColor = "";
                remarkInput.placeholder = "Description optional (qty is 0)";
            }
        });

        document.getElementById("estimated-score").innerText = `${total} pts`;
        return { score: total, hasErrors: hasErrors };
    }

    async submitKPI() {
        if (this.currentUser.role === "Admin") return;

        const { score, hasErrors } = this.calculateFormScore();

        if (hasErrors) {
            this.showToast("All activities with quantities require a description.", "error");
            return;
        }

        const submissionItems = {};
        const rows = document.querySelectorAll(".kpi-item-row");
        
        rows.forEach(row => {
            const itemId = row.getAttribute("data-item-id");
            const points = parseInt(row.getAttribute("data-points"), 10);
            const qty = parseInt(row.querySelector(".kpi-qty").value, 10) || 0;
            const remarks = row.querySelector(".kpi-remark").value.trim();

            if (qty > 0) {
                submissionItems[itemId] = {
                    qty: qty,
                    points: qty * points,
                    remarks: remarks
                };
            }
        });

        try {
            const response = await fetch('/api/kpis/submit', {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    score,
                    items: submissionItems,
                    date: document.getElementById("kpi-submission-date").value
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast(`Daily KPI submitted! Saved points: ${data.score}`, "success");
                this.navigateTo("view-dashboard");
            } else {
                throw new Error(data.error || "Submission failed");
            }
        } catch (e) {
            this.showToast(e.message, "error");
        }
    }

    async renderLeaderboard() {
        const leaderboardBody = document.getElementById("leaderboard-body");
        leaderboardBody.innerHTML = "";

        try {
            const response = await fetch('/api/kpis/leaderboard', {
                headers: this.getHeaders()
            });

            if (!response.ok) throw new Error("Leaderboard loading failed");

            const sortedConsultants = await response.json();

            sortedConsultants.forEach((consultant, index) => {
                const rank = index + 1;
                let rankClass = "rank-other";
                let trophy = "";

                if (rank === 1) { rankClass = "rank-gold"; trophy = " 🥇"; }
                else if (rank === 2) { rankClass = "rank-silver"; trophy = " 🥈"; }
                else if (rank === 3) { rankClass = "rank-bronze"; trophy = " 🥉"; }

                const tr = document.createElement("tr");
                if (this.currentUser && this.currentUser.role === "Admin") {
                    tr.style.cursor = "pointer";
                    tr.addEventListener("click", () => this.showUserAnalytics(consultant.id, consultant.name, consultant.specialization));
                }
                tr.innerHTML = `
                    <td>
                        <span class="rank-pill ${rankClass}">${rank}</span>
                    </td>
                    <td>
                        <strong>${consultant.name}</strong>${trophy}
                    </td>
                    <td>${consultant.specialization}</td>
                    <td class="text-right score">${consultant.score} pts</td>
                `;
                leaderboardBody.appendChild(tr);
            });
        } catch (err) {
            this.showToast(err.message, "error");
        }
    }

    async changePassword() {
        const oldPassword = document.getElementById("old-pass").value;
        const newPassword = document.getElementById("new-pass").value;
        const confirmPass = document.getElementById("confirm-pass").value;
        const statusEl = document.getElementById("password-status");

        if (newPassword !== confirmPass) {
            statusEl.innerText = "New passwords do not match.";
            statusEl.className = "status-msg text-error";
            return;
        }

        if (newPassword.length < 4) {
            statusEl.innerText = "Password must be at least 4 characters.";
            statusEl.className = "status-msg text-error";
            return;
        }

        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ oldPassword, newPassword })
            });

            const data = await response.json();

            if (response.ok) {
                this.currentUser.password = newPassword;
                localStorage.setItem("bia_dm_user", JSON.stringify(this.currentUser));

                statusEl.innerText = "Password updated successfully!";
                statusEl.className = "status-msg text-success";
                document.getElementById("password-form").reset();
                
                this.showToast("Security credentials updated.", "success");
                setTimeout(() => this.navigateTo("view-dashboard"), 1500);
            } else {
                throw new Error(data.error || "Password change failed");
            }
        } catch (e) {
            statusEl.innerText = e.message;
            statusEl.className = "status-msg text-error";
        }
    }

    async renderDailyReport() {
        const dateVal = document.getElementById("daily-report-date").value;
        const container = document.getElementById("daily-report-content");
        container.innerHTML = "";

        if (!dateVal) return;

        try {
            const response = await fetch(`/api/reports/daily?date=${dateVal}`, {
                headers: this.getHeaders()
            });

            if (!response.ok) throw new Error("Failed to load daily report data");

            const dayData = await response.json();

            // Fetch users list to resolve specialization details dynamically
            const resUsers = await fetch('/api/admin/users', { headers: this.getHeaders() });
            const usersList = await resUsers.json();

            // Fetch current KPI configuration list
            const resConfigs = await fetch('/api/kpis/configs', { headers: this.getHeaders() });
            const configs = await resConfigs.json();

            if (Object.keys(dayData).length === 0) {
                container.innerHTML = `
                    <div class="glass-card" style="text-align:center; padding:40px;">
                        <i class="fa-solid fa-folder-open" style="font-size:48px; color:var(--text-light); margin-bottom:16px;"></i>
                        <h3>No Submissions Found</h3>
                        <p style="color:var(--text-muted); margin-top:8px;">No digital marketing team members have entered activities for ${new Date(dateVal).toLocaleDateString()}.</p>
                    </div>
                `;
                return;
            }

            for (const userId in dayData) {
                const submission = dayData[userId];
                const card = document.createElement("div");
                card.className = "glass-card report-emp-card";
                
                let rowsHtml = "";
                const userKPIs = configs[userId] || [];
                const userObj = usersList.find(u => u.id === userId) || { specialization: "Team Member" };

                for (const itemId in submission.items) {
                    const kpiItem = userKPIs.find(item => item.id == itemId);
                    const label = kpiItem ? kpiItem.label : "Additional Activity";
                    const itemData = submission.items[itemId];

                    rowsHtml += `
                        <tr>
                            <td>${label}</td>
                            <td class="text-right">${itemData.qty}</td>
                            <td class="text-right" style="color:var(--emerald); font-weight:600;">+${itemData.points}</td>
                            <td><em>"${itemData.remarks}"</em></td>
                        </tr>
                    `;
                }

                card.innerHTML = `
                    <div class="report-emp-header">
                        <h3 style="cursor:pointer;" onclick="app.showUserAnalytics('${submission.userId}', '${submission.submittedBy}', '${userObj.specialization}')">
                            ${submission.submittedBy} <span class="badge">${userObj.specialization}</span>
                        </h3>
                        <span class="total-points">Total Score: ${submission.score} pts</span>
                    </div>
                    <div class="table-responsive">
                        <table class="report-table-small">
                            <thead>
                                <tr>
                                    <th>Activity Description</th>
                                    <th class="text-right">Qty</th>
                                    <th class="text-right">Points</th>
                                    <th>Submission Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                `;
                container.appendChild(card);
            }
        } catch (err) {
            this.showToast(err.message, "error");
        }
    }

    toggleSummaryFilterMode() {
        const mode = document.getElementById("summary-filter-mode").value;
        const monthInput = document.getElementById("monthly-report-month");
        const dayInput = document.getElementById("monthly-report-day");

        if (mode === "month") {
            monthInput.style.display = "block";
            dayInput.style.display = "none";
            if (!monthInput.value) {
                const todayStr = new Date().toISOString().split('T')[0];
                monthInput.value = todayStr.substring(0, 7);
            }
        } else if (mode === "day") {
            monthInput.style.display = "none";
            dayInput.style.display = "block";
            if (!dayInput.value) {
                const d = new Date();
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                dayInput.value = `${year}-${month}-${day}`;
            }
        } else {
            monthInput.style.display = "none";
            dayInput.style.display = "none";
        }

        this.renderMonthlyReport();
    }

    async renderMonthlyReport() {
        const modeSelect = document.getElementById("summary-filter-mode");
        const mode = modeSelect ? modeSelect.value : "month";
        let val = "";

        if (mode === "month") {
            val = document.getElementById("monthly-report-month").value;
            if (!val) return;
        } else if (mode === "day") {
            val = document.getElementById("monthly-report-day").value;
            if (!val) return;
        }

        const tbody = document.getElementById("monthly-report-body");
        tbody.innerHTML = "";

        try {
            const response = await fetch(`/api/reports/summary?mode=${mode}&value=${val}`, {
                headers: this.getHeaders()
            });

            if (!response.ok) throw new Error("Failed to load performance summary");

            const monthlyData = await response.json();

            const chartData = {
                labels: [],
                datasets: [{
                    label: 'Points Earned',
                    data: [],
                    backgroundColor: [
                        'rgba(192, 178, 159, 0.65)',
                        'rgba(163, 191, 168, 0.65)',
                        'rgba(210, 164, 164, 0.65)',
                        'rgba(137, 135, 130, 0.65)',
                        'rgba(223, 219, 213, 0.65)',
                        'rgba(120, 118, 113, 0.65)'
                    ],
                    borderColor: [
                        'rgba(192, 178, 159, 1)',
                        'rgba(163, 191, 168, 1)',
                        'rgba(210, 164, 164, 1)',
                        'rgba(137, 135, 130, 1)',
                        'rgba(223, 219, 213, 1)',
                        'rgba(120, 118, 113, 1)'
                    ],
                    borderWidth: 1,
                    hoverOffset: 15
                }]
            };

            // Calculate total monthly score to display percentage distributions
            let totalMonthlyScore = 0;
            monthlyData.forEach(emp => {
                if (emp.score > 0) totalMonthlyScore += emp.score;
            });

            monthlyData.forEach(emp => {
                const tr = document.createElement("tr");
                if (this.currentUser && this.currentUser.role === "Admin") {
                    tr.style.cursor = "pointer";
                    tr.addEventListener("click", () => this.showUserAnalytics(emp.id, emp.name, emp.specialization || "Consultant"));
                }
                tr.innerHTML = `
                    <td><strong>${emp.name}</strong></td>
                    <td>${emp.submissionsCount} Active Days</td>
                    <td class="text-right score" style="color:var(--emerald); font-weight:700;">${emp.score} pts</td>
                `;
                tbody.appendChild(tr);

                if (emp.score > 0) {
                    const percent = totalMonthlyScore > 0 ? ((emp.score / totalMonthlyScore) * 100).toFixed(1) : 0;
                    chartData.labels.push(`${emp.name} (${percent}%)`);
                    chartData.datasets[0].data.push(emp.score);
                }
            });

            this.renderChart(chartData);
        } catch (err) {
            this.showToast(err.message, "error");
        }
    }

    renderChart(chartData) {
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const ctx = document.getElementById('monthlyChart').getContext('2d');
        if (chartData.labels.length === 0) {
            ctx.clearRect(0, 0, 300, 300);
            return;
        }

        this.chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            font: { family: 'Inter', size: 14, weight: '500' },
                            color: '#e6e3dd', /* High-contrast ivory */
                            padding: 20
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }

    // ==========================================================================
    // ADMIN CONTROL PANEL BUSINESS LOGIC
    // ==========================================================================

    switchAdminTab(tabName) {
        this.activeAdminTab = tabName;

        // Toggle buttons active classes
        document.querySelectorAll(".tab-btn").forEach(btn => {
            if (btn.getAttribute("data-tab") === tabName) {
                btn.classList.add("active");
                btn.classList.remove("btn-secondary");
                btn.classList.add("btn-primary");
            } else {
                btn.classList.remove("active");
                btn.classList.remove("btn-primary");
                btn.classList.add("btn-secondary");
            }
        });

        // Hide/Show tab contents
        document.querySelectorAll(".admin-tab-content").forEach(el => {
            el.style.display = "none";
        });
        document.getElementById(`admin-tab-${tabName}`).style.display = "block";

        // Tab selection render hooks
        if (tabName === "trends") this.loadAdminTrends();
        if (tabName === "team") this.loadAdminUsers();
        if (tabName === "configs") this.loadAdminConfigsList();
        if (tabName === "logs") this.loadAuditLogs();
    }

    renderAdminControl() {
        if (this.currentUser.role !== "Admin") {
            this.navigateTo("view-dashboard");
            return;
        }
        this.switchAdminTab(this.activeAdminTab);
    }

    async loadAdminTrends() {
        try {
            const response = await fetch('/api/admin/analytics/trends', { headers: this.getHeaders() });
            const trendData = await response.json();

            // Calculate stats widgets values
            let total = 0;
            trendData.forEach(day => total += day.score);

            // Fetch monthly counts to figure out active submissions
            const currentMonth = new Date().toISOString().substring(0, 7);
            const resMonthly = await fetch(`/api/reports/summary?mode=month&value=${currentMonth}`, {
                headers: this.getHeaders()
            });
            const monthlyData = await resMonthly.json();

            let activeDays = 0;
            monthlyData.forEach(emp => activeDays += emp.submissionsCount);

            document.getElementById("stat-total-points").innerText = `${total} pts`;
            document.getElementById("stat-active-days").innerText = `${activeDays} days`;
            document.getElementById("stat-daily-avg").innerText = trendData.length > 0 ? `${Math.round(total / trendData.length)} pts` : "0 pts";

            // Draw line chart
            const labels = trendData.map(d => d.date);
            const scores = trendData.map(d => d.score);

            const ctx = document.getElementById("trendChart").getContext("2d");
            if (this.trendChartInstance) this.trendChartInstance.destroy();

            this.trendChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Points Trend',
                        data: scores,
                        fill: true,
                        backgroundColor: 'rgba(192, 178, 159, 0.15)',
                        borderColor: 'rgba(192, 178, 159, 1)',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: 'rgba(192, 178, 159, 1)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#232321' },
                            ticks: { color: '#888681' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#888681' }
                        }
                    },
                    plugins: {
                        legend: { display: false }
                    },
                    animation: {
                        duration: 1600,
                        easing: 'easeOutQuart'
                    }
                }
            });

            // GSAP stagger loading for admin trend statistics boxes
            gsap.from("#admin-tab-trends .stat-box", {
                opacity: 0,
                y: 30,
                stagger: 0.12,
                duration: 0.8,
                ease: "power3.out",
                clearProps: "all"
            });
        } catch (e) {
            this.showToast("Failed to load line trends", "error");
        }
    }

    async loadAdminUsers() {
        const tbody = document.getElementById("admin-users-list");
        tbody.innerHTML = "";

        try {
            const response = await fetch('/api/admin/users', { headers: this.getHeaders() });
            const users = await response.json();

            users.forEach(u => {
                if (u.role === "Admin") return; // skip self
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>
                        <strong style="cursor:pointer; text-decoration:underline; text-underline-offset: 3px;" onclick="app.showUserAnalytics('${u.id}', '${u.name}', '${u.specialization}')">${u.name}</strong><br>
                        <span style="color:var(--text-muted); font-size:12px;">${u.email}</span><br>
                        <span style="font-family:var(--font-mono); color:var(--accent-color); font-size:12px; font-weight:600;">Key: ${u.password}</span>
                    </td>
                    <td>${u.specialization}</td>
                    <td class="text-right">
                        <button class="btn btn-secondary" style="padding:8px 14px; font-size:13px; color:var(--accent-color);" onclick="app.changeConsultantPasswordPrompt('${u.email}')">
                            <i class="fa-solid fa-key"></i> Key
                        </button>
                        <button class="btn btn-secondary" style="padding:8px 14px; font-size:13px;" onclick="app.editConsultantPrompt('${u.email}', '${u.name}', '${u.specialization}')">
                            <i class="fa-solid fa-user-pen"></i> Edit
                        </button>
                        <button class="btn btn-secondary" style="padding:8px 14px; font-size:13px; color:var(--rose);" onclick="app.deleteConsultant('${u.email}')">
                            <i class="fa-solid fa-trash-can"></i> Delete
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            this.showToast("Failed to fetch team listings", "error");
        }
    }

    async addConsultant(event) {
        event.preventDefault();
        
        const name = document.getElementById("add-user-name").value.trim();
        const email = document.getElementById("add-user-email").value.trim();
        const specialization = document.getElementById("add-user-specialization").value.trim();
        const password = document.getElementById("add-user-password").value;

        try {
            const response = await fetch('/api/admin/users', {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ name, email, specialization, password, role: 'Consultant' })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast("Consultant account created successfully", "success");
                document.getElementById("add-user-form").reset();
                this.loadAdminUsers();
            } else {
                throw new Error(data.error || "Failed to create user");
            }
        } catch (e) {
            this.showToast(e.message, "error");
        }
    }
    changeConsultantPasswordPrompt(email) {
        const newPass = prompt("Enter new password for this consultant account:");
        if (newPass === null || newPass.trim() === "") return;
        this.updateConsultant(email, null, null, newPass.trim());
    }

    editConsultantPrompt(email, name, spec) {
        const newName = prompt("Edit Consultant Name:", name);
        if (newName === null) return;
        const newSpec = prompt("Edit Consultant Specialization:", spec);
        if (newSpec === null) return;
        const newPass = prompt("Set New Password (leave blank to keep unchanged):");

        this.updateConsultant(email, newName, newSpec, newPass);
    }

    async updateConsultant(email, name, specialization, password) {
        const body = {};
        if (name) body.name = name;
        if (specialization) body.specialization = specialization;
        if (password) body.password = password;

        try {
            const response = await fetch(`/api/admin/users/${email}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(body)
            });

            if (response.ok) {
                this.showToast("User details saved successfully", "success");
                this.loadAdminUsers();
            } else {
                const data = await response.json();
                throw new Error(data.error || "Update failed");
            }
        } catch (e) {
            this.showToast(e.message, "error");
        }
    }

    async deleteConsultant(email) {
        if (!confirm("Are you sure you want to permanently delete this consultant account? All their KPI records will remain, but they won't be able to log in.")) return;

        try {
            const response = await fetch(`/api/admin/users/${email}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });

            if (response.ok) {
                this.showToast("Consultant account deleted", "success");
                this.loadAdminUsers();
            } else {
                const data = await response.json();
                throw new Error(data.error || "Deletion failed");
            }
        } catch (e) {
            this.showToast(e.message, "error");
        }
    }

    async loadAdminConfigsList() {
        const select = document.getElementById("config-user-select");
        select.innerHTML = `<option value="">Select Consultant...</option>`;

        try {
            const resUsers = await fetch('/api/admin/users', { headers: this.getHeaders() });
            const users = await resUsers.json();

            // Cache all configs on load
            const resConfigs = await fetch('/api/kpis/configs', { headers: this.getHeaders() });
            this.allConfigs = await resConfigs.json();

            users.forEach(u => {
                if (u.role === "Admin") return;
                const option = document.createElement("option");
                option.value = u.id;
                option.text = `${u.name} (${u.specialization})`;
                select.appendChild(option);
            });

            document.getElementById("config-editor-fields").style.display = "none";
            document.getElementById("config-editor-placeholder").style.display = "block";
        } catch (e) {
            this.showToast("Failed to fetch configurations", "error");
        }
    }

    loadUserKPIConfig() {
        const userId = document.getElementById("config-user-select").value;
        const editorFields = document.getElementById("config-editor-fields");
        const placeholder = document.getElementById("config-editor-placeholder");

        if (!userId) {
            editorFields.style.display = "none";
            placeholder.style.display = "block";
            return;
        }

        editorFields.style.display = "block";
        placeholder.style.display = "none";

        this.currentConfigItems = this.allConfigs[userId] || [];
        this.renderConfigEditorRows();
    }

    renderConfigEditorRows() {
        const tbody = document.getElementById("config-editor-rows");
        tbody.innerHTML = "";

        if (this.currentConfigItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No metrics configured. Click 'Add New Metric' below.</td></tr>`;
            return;
        }

        this.currentConfigItems.forEach((item, index) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <input type="text" class="btn btn-secondary text-left config-cell-cat" style="width:100%; border:1px solid #e2e8f0;" value="${item.category}" onchange="app.updateConfigCache(${index}, 'category', this.value)">
                </td>
                <td>
                    <input type="text" class="btn btn-secondary text-left config-cell-label" style="width:100%; border:1px solid #e2e8f0;" value="${item.label}" onchange="app.updateConfigCache(${index}, 'label', this.value)">
                </td>
                <td style="width:110px;">
                    <input type="text" class="btn btn-secondary config-cell-weightage" style="width:100%; border:1px solid #e2e8f0; text-align:center;" value="${item.weightage || ''}" placeholder="e.g. 20%" onchange="app.updateConfigCache(${index}, 'weightage', this.value)">
                </td>
                <td style="width:120px;">
                    <input type="number" class="btn btn-secondary config-cell-points" style="width:100%; border:1px solid #e2e8f0; text-align:center;" value="${item.points}" min="1" onchange="app.updateConfigCache(${index}, 'points', this.value)">
                </td>
                <td class="text-right" style="width:80px;">
                    <button class="btn btn-secondary" style="padding:6px; color:var(--rose);" onclick="app.removeConfigCacheRow(${index})">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    updateConfigCache(index, field, value) {
        if (field === 'points') {
            this.currentConfigItems[index][field] = parseInt(value, 10) || 1;
        } else {
            this.currentConfigItems[index][field] = value.trim();
        }
    }

    addNewConfigRow() {
        const newId = Date.now() + Math.floor(Math.random() * 100);
        this.currentConfigItems.push({
            id: newId,
            category: "General Activity",
            label: "Description of activity...",
            weightage: "",
            points: 5
        });
        this.renderConfigEditorRows();
    }

    removeConfigCacheRow(index) {
        this.currentConfigItems.splice(index, 1);
        this.renderConfigEditorRows();
    }

    async saveUserKPIConfig() {
        const userId = document.getElementById("config-user-select").value;
        if (!userId) return;

        // Perform basic validations
        let valid = true;
        this.currentConfigItems.forEach(item => {
            if (!item.category || !item.label) {
                valid = false;
            }
        });

        if (!valid) {
            this.showToast("Configurations cannot have blank categories or descriptions.", "error");
            return;
        }

        try {
            const response = await fetch('/api/admin/kpis/configs', {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ userId, items: this.currentConfigItems })
            });

            if (response.ok) {
                this.showToast("KPI configuration weights updated successfully!", "success");
                // Update local memory
                this.allConfigs[userId] = this.currentConfigItems;
            } else {
                const data = await response.json();
                throw new Error(data.error || "Save failed");
            }
        } catch (e) {
            this.showToast(e.message, "error");
        }
    }

    async loadAuditLogs() {
        const dateVal = document.getElementById("audit-log-date").value;
        const tbody = document.getElementById("audit-logs-rows");
        tbody.innerHTML = "";

        if (!dateVal) return;

        try {
            const response = await fetch(`/api/reports/daily?date=${dateVal}`, {
                headers: this.getHeaders()
            });

            if (!response.ok) throw new Error("Failed to load audit logs");

            const dayData = await response.json();
            const keys = Object.keys(dayData);

            if (keys.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:30px;">No entries submitted for this date.</td></tr>`;
                return;
            }

            // Load configurations list for resolving IDs
            const resConfigs = await fetch('/api/kpis/configs', { headers: this.getHeaders() });
            const configs = await resConfigs.json();

            keys.forEach(userId => {
                const sub = dayData[userId];
                let summaryHtml = "";
                const userKPIs = configs[userId] || [];

                for (const itemId in sub.items) {
                    const kpiItem = userKPIs.find(item => item.id == itemId);
                    const label = kpiItem ? kpiItem.label : "General Metric";
                    summaryHtml += `• ${label} (Qty: ${sub.items[itemId].qty}) - <em>"${sub.items[itemId].remarks}"</em><br>`;
                }

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><strong>${sub.submittedBy}</strong></td>
                    <td style="color:var(--emerald); font-weight:700;">${sub.score} pts</td>
                    <td style="font-size:12px; line-height:1.6; color:var(--text-muted);">${summaryHtml}</td>
                    <td class="text-right">
                        <button class="btn btn-secondary" style="color:var(--rose); padding:6px 12px; font-size:12px;" onclick="app.deleteSubmission('${dateVal}', '${userId}')">
                            <i class="fa-solid fa-square-minus"></i> Void Log
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            this.showToast(e.message, "error");
        }
    }

    async deleteSubmission(date, userId) {
        if (!confirm("Are you sure you want to VOID and delete this submission? Points will be deducted immediately from the Leaderboard and monthly stats.")) return;

        try {
            const response = await fetch(`/api/admin/submissions/${date}/${userId}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });

            if (response.ok) {
                this.showToast("KPI submission log successfully voided", "success");
                this.loadAuditLogs();
            } else {
                const data = await response.json();
                throw new Error(data.error || "Failed to void log");
            }
        } catch (e) {
            this.showToast(e.message, "error");
        }
    }

    toggleModalFilterMode() {
        const mode = document.getElementById("modal-filter-mode").value;
        const monthInput = document.getElementById("modal-filter-month");
        const dayInput = document.getElementById("modal-filter-day");

        if (mode === "month") {
            monthInput.style.display = "block";
            dayInput.style.display = "none";
            if (!monthInput.value) {
                monthInput.value = new Date().toISOString().substring(0, 7);
            }
        } else if (mode === "day") {
            monthInput.style.display = "none";
            dayInput.style.display = "block";
            if (!dayInput.value) {
                dayInput.value = new Date().toISOString().split('T')[0];
            }
        } else {
            monthInput.style.display = "none";
            dayInput.style.display = "none";
        }

        this.refreshUserAnalytics();
    }

    async showUserAnalytics(userId, name, specialization) {
        if (this.currentUser.role !== "Admin") return;

        // Save target context
        this.activeAnalyticsUser = { id: userId, name, specialization };

        // Reset Filter inputs to default
        const modeSelect = document.getElementById("modal-filter-mode");
        if (modeSelect) modeSelect.value = "month";
        
        const monthInput = document.getElementById("modal-filter-month");
        if (monthInput) {
            monthInput.value = new Date().toISOString().substring(0, 7);
            monthInput.style.display = "block";
        }

        const dayInput = document.getElementById("modal-filter-day");
        if (dayInput) {
            dayInput.style.display = "none";
        }

        // Reset statistics labels
        document.getElementById("modal-user-name").innerText = name;
        document.getElementById("modal-user-spec").innerText = specialization;
        document.getElementById("modal-stat-points").innerText = "Loading...";
        document.getElementById("modal-stat-days").innerText = "Loading...";
        document.getElementById("modal-stat-avg").innerText = "Loading...";

        const metaEl = document.getElementById("modal-user-meta");
        metaEl.innerHTML = "Loading metadata...";

        // Look up email & key
        try {
            const uResponse = await fetch('/api/admin/users', { headers: this.getHeaders() });
            const uList = await uResponse.json();
            const found = uList.find(u => u.id === userId);
            if (found) {
                metaEl.innerHTML = `Email: <strong style="color:var(--text-primary);">${found.email}</strong> &nbsp;|&nbsp; Key: <strong style="color:var(--accent-color);">${found.password}</strong>`;
            } else {
                metaEl.innerHTML = "";
            }
        } catch (e) {
            metaEl.innerHTML = "Metadata unavailable";
        }

        // Run query and display
        await this.refreshUserAnalytics();

        // Animate overlay modal open
        const modal = document.getElementById("user-analytics-modal");
        const content = modal.querySelector(".modal-content");
        
        modal.style.display = "flex";
        gsap.killTweensOf([modal, content]);
        gsap.to(modal, { opacity: 1, duration: 0.3 });
        gsap.to(content, { y: 0, opacity: 1, duration: 0.3 });
    }

    async refreshUserAnalytics() {
        if (!this.activeAnalyticsUser) return;
        const { id: userId } = this.activeAnalyticsUser;

        const modeSelect = document.getElementById("modal-filter-mode");
        const mode = modeSelect ? modeSelect.value : "month";
        let val = "";

        if (mode === "month") {
            val = document.getElementById("modal-filter-month").value;
        } else if (mode === "day") {
            val = document.getElementById("modal-filter-day").value;
        }

        const logsBody = document.getElementById("modal-logs-rows");
        logsBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Loading logs...</td></tr>`;

        try {
            // Fetch configs to resolve category names
            const resConfigs = await fetch('/api/kpis/configs', { headers: this.getHeaders() });
            const configs = await resConfigs.json();
            const userKPIs = configs[userId] || [];

            // Fetch this user's submissions matching the filter
            const queryParams = new URLSearchParams({ mode, value: val }).toString();
            const response = await fetch(`/api/admin/users/${userId}/submissions?${queryParams}`, { headers: this.getHeaders() });
            const userSubmissions = await response.json();

            let totalPoints = 0;
            userSubmissions.forEach(sub => totalPoints += sub.score);
            const activeDays = userSubmissions.length;

            document.getElementById("modal-stat-points").innerText = `${totalPoints} pts`;
            document.getElementById("modal-stat-days").innerText = `${activeDays} days`;
            document.getElementById("modal-stat-avg").innerText = activeDays > 0 ? `${Math.round(totalPoints / activeDays)} pts` : "0 pts";

            // Group submissions by category to render Polar Area Chart
            const categoryPoints = {};
            userSubmissions.forEach(sub => {
                for (const itemId in sub.items) {
                    const kpiItem = userKPIs.find(item => String(item.id) === String(itemId));
                    const catName = kpiItem ? kpiItem.category : "General";
                    const pts = sub.items[itemId].points || 0;
                    categoryPoints[catName] = (categoryPoints[catName] || 0) + pts;
                }
            });

            // Prepare chart data
            const labels = Object.keys(categoryPoints);
            const dataPoints = Object.values(categoryPoints);
            this.renderModalChart(labels, dataPoints);

            // Render log rows
            logsBody.innerHTML = "";
            if (userSubmissions.length === 0) {
                logsBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No entries submitted matching this filter.</td></tr>`;
            } else {
                userSubmissions.forEach(sub => {
                    let summaryHtml = "";
                    for (const itemId in sub.items) {
                        const kpiItem = userKPIs.find(item => String(item.id) === String(itemId));
                        const label = kpiItem ? kpiItem.label : "Activity";
                        summaryHtml += `• ${label} (Qty: ${sub.items[itemId].qty}) - <em>"${sub.items[itemId].remarks}"</em><br>`;
                    }

                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td style="white-space:nowrap;"><strong>${sub.date}</strong></td>
                        <td style="color:var(--emerald); font-weight:700;">+${sub.score} pts</td>
                        <td style="font-size:15px; line-height:1.6; color:var(--text-primary);">${summaryHtml}</td>
                    `;
                    logsBody.appendChild(tr);
                });
            }

            // Animate Modal Entrance with GSAP
            const modal = document.getElementById("user-analytics-modal");
            const content = modal.querySelector(".modal-content");
            modal.style.display = "flex";
            
            gsap.killTweensOf([modal, content]);
            gsap.to(modal, { opacity: 1, duration: 0.25 });
            gsap.fromTo(content, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "back.out(1.2)" });
            gsap.fromTo(".modal-content .stat-box", 
                { opacity: 0, scale: 0.9, y: 15 }, 
                { opacity: 1, scale: 1, y: 0, stagger: 0.08, duration: 0.4, delay: 0.2, ease: "power3.out", clearProps: "all" }
            );

        } catch (e) {
            this.showToast(e.message, "error");
        }
    }

    renderModalChart(labels, dataPoints) {
        if (this.modalChartInstance) {
            this.modalChartInstance.destroy();
        }

        const ctx = document.getElementById('modalChart').getContext('2d');
        if (labels.length === 0) {
            ctx.clearRect(0, 0, 200, 200);
            return;
        }

        this.modalChartInstance = new Chart(ctx, {
            type: 'polarArea',
            data: {
                labels: labels,
                datasets: [{
                    data: dataPoints,
                    backgroundColor: [
                        'rgba(192, 178, 159, 0.65)',
                        'rgba(163, 191, 168, 0.65)',
                        'rgba(210, 164, 164, 0.65)',
                        'rgba(137, 135, 130, 0.65)',
                        'rgba(223, 219, 213, 0.65)',
                        'rgba(120, 118, 113, 0.65)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    r: {
                        grid: { color: '#232321' },
                        ticks: { display: false }
                    }
                },
                animation: {
                    duration: 1500,
                    easing: 'easeOutQuart'
                }
            }
        });
    }

    closeUserAnalytics() {
        const modal = document.getElementById("user-analytics-modal");
        const content = modal.querySelector(".modal-content");
        
        gsap.killTweensOf([modal, content]);
        gsap.to(content, { y: 30, opacity: 0, duration: 0.2 });
        gsap.to(modal, { opacity: 0, duration: 0.2, onComplete: () => {
            modal.style.display = "none";
        }});
    }

    async exportToExcel() {
        if (this.currentUser.role !== "Admin") return;
        
        const modeSelect = document.getElementById("summary-filter-mode");
        const mode = modeSelect ? modeSelect.value : "month";
        let val = "";

        if (mode === "month") {
            val = document.getElementById("monthly-report-month").value;
        } else if (mode === "day") {
            val = document.getElementById("monthly-report-day").value;
        }

        this.showToast(`Preparing Excel report (${mode} basis)...`, "success");

        try {
            // Fetch dynamic performance summary matching the filter
            const resSummary = await fetch(`/api/reports/summary?mode=${mode}&value=${val}`, { headers: this.getHeaders() });
            const summaryData = await resSummary.json();
            
            // Sort descending to build leaderboard rankings
            summaryData.sort((a, b) => b.score - a.score);
            
            const summaryRows = summaryData.map((c, i) => ({
                'Rank': i + 1,
                'Consultant Name': c.name,
                'Specialization': c.specialization,
                'Period Score (pts)': c.score,
                'Period Active Days': c.submissionsCount
            }));

            // Fetch matching raw logs
            const resLogs = await fetch(`/api/admin/submissions/export?mode=${mode}&value=${val}`, { headers: this.getHeaders() });
            const logs = await resLogs.json();

            // Create Workbook
            const wb = XLSX.utils.book_new();
            const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
            const wsLogs = XLSX.utils.json_to_sheet(logs);

            // Determine file naming suffix
            const suffix = mode === "all" ? "All_Time" : val;

            XLSX.utils.book_append_sheet(wb, wsSummary, "Filtered Ranking");
            XLSX.utils.book_append_sheet(wb, wsLogs, "Filtered Log Audit");

            XLSX.writeFile(wb, `BIA_KPI_Report_${mode}_${suffix}.xlsx`);
            this.showToast("Filtered Excel workbook downloaded!", "success");
        } catch (e) {
            this.showToast("Failed to generate Excel report: " + e.message, "error");
        }
    }

    downloadExcelTemplate() {
        const sampleRows = [
            {
                'date': '2026-07-16',
                'email': 'mufeeda@bradfordia.org',
                'activity': 'Display Ads, Banners, and Grid Creatives',
                'qty': 2,
                'remarks': 'Backfilled campaign creatives'
            },
            {
                'date': '2026-07-16',
                'email': 'sakshi@bradfordia.org',
                'activity': 'A/B Test Visual Layout Variations',
                'qty': 1,
                'remarks': 'Ingested historical A/B variation updates'
            }
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(sampleRows);
        XLSX.utils.book_append_sheet(wb, ws, "Submissions Import Template");
        XLSX.writeFile(wb, "KPI_Import_Template.xlsx");
        this.showToast("Excel import template downloaded!", "success");
    }

    importExcelData(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showToast("Reading spreadsheet file...", "success");
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(sheet);

                if (rows.length === 0) {
                    throw new Error("No data records found in Excel sheet");
                }

                // POST to bulk import endpoint
                const res = await fetch('/api/admin/submissions/bulk', {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ rows })
                });

                const result = await res.json();
                
                if (res.ok) {
                    this.showToast(result.message, "success");
                    // Refresh view
                    this.renderAdminControl();
                    // Clear file input
                    event.target.value = "";
                } else {
                    throw new Error(result.error || "Bulk ingestion failed");
                }
            } catch (err) {
                this.showToast("Import error: " + err.message, "error");
                event.target.value = "";
            }
        };

        reader.readAsArrayBuffer(file);
    }
}

// Global App Initialization Hook
let app;
document.addEventListener("DOMContentLoaded", () => {
    app = new KPISystem();
});
