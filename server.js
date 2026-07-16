const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'bradford_intl_alliance_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve frontend static files from root

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SUBMISSIONS_FILE = path.join(__dirname, 'data', 'submissions.json');
const CONFIGS_FILE = path.join(__dirname, 'data', 'kpi_configs.json');

// Helper functions for file reading/writing
function readUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function readSubmissions() {
    return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
}

function writeSubmissions(data) {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function readConfigs() {
    return JSON.parse(fs.readFileSync(CONFIGS_FILE, 'utf8'));
}

function writeConfigs(data) {
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access token missing' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalid or expired' });
        req.user = user;
        next();
    });
}

// Role Authorization Middleware
function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(403).json({ error: 'Administrative privileges required' });
    }
}

// --------------------------------------------------------------------------
// API ENDPOINTS
// --------------------------------------------------------------------------

// 1. User Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const users = readUsers();
    const user = users[email.toLowerCase()];

    if (user && user.password === password) {
        const payload = {
            id: user.id,
            name: user.name,
            email: email.toLowerCase(),
            role: user.role,
            specialization: user.specialization
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: payload });
    } else {
        res.status(401).json({ error: 'Invalid email or password' });
    }
});

// 2. Change Password
app.post('/api/auth/change-password', authenticateToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    const users = readUsers();
    const user = users[req.user.email];

    if (!user || user.password !== oldPassword) {
        return res.status(400).json({ error: 'Current password verification failed' });
    }

    user.password = newPassword;
    users[req.user.email] = user;
    writeUsers(users);

    res.json({ message: 'Password updated successfully' });
});

// 3. Get KPI configuration (for form loading)
app.get('/api/kpis/configs', authenticateToken, (req, res) => {
    const configs = readConfigs();
    res.json(configs);
});

// 4. Submit Daily KPI
app.post('/api/kpis/submit', authenticateToken, (req, res) => {
    const { score, items } = req.body;
    
    if (req.user.role === 'Admin') {
        return res.status(400).json({ error: 'Administrators cannot submit daily KPIs' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const submissions = readSubmissions();

    if (!submissions[todayStr]) {
        submissions[todayStr] = {};
    }

    submissions[todayStr][req.user.id] = {
        submittedBy: req.user.name,
        email: req.user.email,
        score: score,
        items: items
    };

    writeSubmissions(submissions);
    res.json({ message: 'KPI submitted successfully', score });
});

// 5. Leaderboard View
app.get('/api/kpis/leaderboard', authenticateToken, (req, res) => {
    const submissions = readSubmissions();
    const users = readUsers();

    const monthScores = {};
    
    Object.keys(users).forEach(email => {
        const u = users[email];
        if (u.role !== 'Admin') {
            monthScores[u.id] = {
                id: u.id,
                email: email,
                name: u.name,
                specialization: u.specialization,
                score: 0
            };
        }
    });

    const currentMonth = new Date().toISOString().substring(0, 7); // e.g. "2026-07"
    
    for (const date in submissions) {
        if (date.startsWith(currentMonth)) {
            const daySubmissions = submissions[date];
            for (const userId in daySubmissions) {
                if (monthScores[userId]) {
                    monthScores[userId].score += daySubmissions[userId].score;
                }
            }
        }
    }

    const sorted = Object.values(monthScores).sort((a, b) => b.score - a.score);
    res.json(sorted);
});

// 6. Daily Report (Admin Only)
app.get('/api/reports/daily', authenticateToken, (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Date query parameter is required' });
    }

    const submissions = readSubmissions();
    const dayData = submissions[date] || {};
    res.json(dayData);
});

// 7. Monthly Report (Admin Only)
app.get('/api/reports/monthly', authenticateToken, (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).json({ error: 'Month query parameter is required' });
    }

    const submissions = readSubmissions();
    const users = readUsers();
    const summary = {};

    Object.keys(users).forEach(email => {
        const u = users[email];
        if (u.role !== 'Admin') {
            summary[u.id] = {
                name: u.name,
                submissionsCount: 0,
                score: 0
            };
        }
    });

    for (const date in submissions) {
        if (date.startsWith(month)) {
            const dayData = submissions[date];
            for (const userId in dayData) {
                if (summary[userId]) {
                    summary[userId].submissionsCount += 1;
                    summary[userId].score += dayData[userId].score;
                }
            }
        }
    }

    res.json(Object.values(summary));
});

// --------------------------------------------------------------------------
// ADMIN ACTION CONTROL PANEL ENDPOINTS
// --------------------------------------------------------------------------

// 8. Get all system accounts
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    const users = readUsers();
    const userList = Object.keys(users).map(email => ({
        email: email,
        id: users[email].id,
        name: users[email].name,
        role: users[email].role,
        specialization: users[email].specialization
    }));
    res.json(userList);
});

// 9. Add a new team member
app.post('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    const { email, name, role, password, specialization } = req.body;
    
    if (!email || !name || !role || !password || !specialization) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const users = readUsers();
    const cleanEmail = email.toLowerCase().trim();

    if (users[cleanEmail]) {
        return res.status(400).json({ error: 'A user with this email already exists' });
    }

    // Auto-generate ID from name
    const userId = name.toLowerCase().replace(/\s+/g, '');

    users[cleanEmail] = {
        id: userId,
        name,
        role,
        password,
        specialization
    };
    writeUsers(users);

    // Initialize default KPI configurations for the new consultant
    if (role === 'Consultant') {
        const configs = readConfigs();
        if (!configs[userId] || configs[userId].length === 0) {
            configs[userId] = [
                { id: 101, category: "Campaign Execution", label: "Meta, Google, LinkedIn Ads Setup & Optimization", points: 10 },
                { id: 102, category: "SEO Implementation", label: "Keyword Research & Ranking Improvements", points: 10 },
                { id: 103, category: "Website Management", label: "Landing Pages Created / Updates Done", points: 10 },
                { id: 104, category: "Market Research", label: "Competitor Analysis & Digital Audits", points: 10 }
            ];
            writeConfigs(configs);
        }
    }

    res.json({ message: 'User added successfully', user: { email: cleanEmail, name, role } });
});

// 10. Update a team member's account
app.put('/api/admin/users/:email', authenticateToken, requireAdmin, (req, res) => {
    const { email } = req.params;
    const { name, role, specialization, password } = req.body;

    const users = readUsers();
    const cleanEmail = email.toLowerCase().trim();
    const user = users[cleanEmail];

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    user.name = name || user.name;
    user.role = role || user.role;
    user.specialization = specialization || user.specialization;
    if (password) user.password = password;

    users[cleanEmail] = user;
    writeUsers(users);

    res.json({ message: 'User updated successfully', user });
});

// 11. Delete a team member's account
app.delete('/api/admin/users/:email', authenticateToken, requireAdmin, (req, res) => {
    const { email } = req.params;
    const users = readUsers();
    const cleanEmail = email.toLowerCase().trim();

    if (!users[cleanEmail]) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (cleanEmail === req.user.email) {
        return res.status(400).json({ error: 'You cannot delete your own administrative account' });
    }

    const userId = users[cleanEmail].id;
    delete users[cleanEmail];
    writeUsers(users);

    // Clean up configs
    const configs = readConfigs();
    if (configs[userId]) {
        delete configs[userId];
        writeConfigs(configs);
    }

    res.json({ message: 'User deleted successfully' });
});

// 12. Update KPI configs weights / items for a specific consultant
app.post('/api/admin/kpis/configs', authenticateToken, requireAdmin, (req, res) => {
    const { userId, items } = req.body;
    
    if (!userId || !Array.isArray(items)) {
        return res.status(400).json({ error: 'User ID and items array are required' });
    }

    const configs = readConfigs();
    configs[userId] = items;
    writeConfigs(configs);

    res.json({ message: 'KPI configurations saved successfully' });
});

// 13. Delete a daily submission
app.delete('/api/admin/submissions/:date/:userId', authenticateToken, requireAdmin, (req, res) => {
    const { date, userId } = req.params;
    const submissions = readSubmissions();

    if (submissions[date] && submissions[date][userId]) {
        delete submissions[date][userId];
        if (Object.keys(submissions[date]).length === 0) {
            delete submissions[date];
        }
        writeSubmissions(submissions);
        return res.json({ message: 'Submission deleted successfully' });
    }

    res.status(404).json({ error: 'Submission not found' });
});

// 14. Trend Analytics API (Day-by-Day points totals)
app.get('/api/admin/analytics/trends', authenticateToken, requireAdmin, (req, res) => {
    const submissions = readSubmissions();
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const dailyTotals = {};

    // Get all dates in submissions for the current month
    for (const date in submissions) {
        if (date.startsWith(currentMonth)) {
            let dayTotal = 0;
            const dayData = submissions[date];
            for (const userId in dayData) {
                dayTotal += dayData[userId].score;
            }
            dailyTotals[date] = dayTotal;
        }
    }

    // Sort by date key
    const sortedDates = Object.keys(dailyTotals).sort();
    const trend = sortedDates.map(date => ({
        date: date.substring(8, 10) + ' ' + new Date(date).toLocaleString('default', { month: 'short' }), // "16 Jul"
        score: dailyTotals[date]
    }));

    res.json(trend);
});

// 15. Get submissions for a specific consultant (Admin Only)
app.get('/api/admin/users/:userId/submissions', authenticateToken, requireAdmin, (req, res) => {
    const { userId } = req.params;
    const submissions = readSubmissions();
    const userSubmissions = [];

    for (const date in submissions) {
        if (submissions[date] && submissions[date][userId]) {
            userSubmissions.push({
                date,
                score: submissions[date][userId].score,
                items: submissions[date][userId].items
            });
        }
    }
    
    // Sort chronological descending
    userSubmissions.sort((a, b) => b.date.localeCompare(a.date));
    res.json(userSubmissions);
});

// Serve frontend single page index.html for all main paths
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Bradford KPI Development Server Live`);
    console.log(`Local Host: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
