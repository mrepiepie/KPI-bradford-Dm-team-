const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'bradford_intl_alliance_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use(express.static(process.cwd()));

// Resolve SQLite Database file location
const DB_PATH = fs.existsSync(path.join(__dirname, 'database.sqlite'))
    ? path.join(__dirname, 'database.sqlite')
    : path.join(process.cwd(), 'database.sqlite');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Failed to open SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database at:', DB_PATH);
    }
});

// Helper wrapper for DB queries (Promises)
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
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
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const user = await dbGet('SELECT * FROM users WHERE LOWER(email) = ?', [email.toLowerCase().trim()]);

        if (user && user.password === password) {
            const payload = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                specialization: user.specialization
            };

            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
            res.json({ token, user: payload });
        } else {
            res.status(401).json({ error: 'Invalid email or password' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Database query error: ' + err.message });
    }
});

// 2. Change Password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    try {
        const user = await dbGet('SELECT * FROM users WHERE LOWER(email) = ?', [req.user.email.toLowerCase()]);

        if (!user || user.password !== oldPassword) {
            return res.status(400).json({ error: 'Current password verification failed' });
        }

        await dbRun('UPDATE users SET password = ? WHERE LOWER(email) = ?', [newPassword, req.user.email.toLowerCase()]);
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Database update error' });
    }
});

// 3. Get KPI configuration (for form loading)
app.get('/api/kpis/configs', authenticateToken, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM kpi_configs');
        const configs = {};

        rows.forEach(r => {
            if (!configs[r.user_id]) configs[r.user_id] = [];
            configs[r.user_id].push({
                id: r.metric_id,
                category: r.category,
                label: r.label,
                points: r.points,
                weightage: r.weightage
            });
        });

        res.json(configs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch KPI configs' });
    }
});

// 4. Submit Daily KPI
app.post('/api/kpis/submit', authenticateToken, async (req, res) => {
    const { score, items, date } = req.body;
    
    if (req.user.role === 'Admin') {
        return res.status(400).json({ error: 'Administrators cannot submit daily KPIs' });
    }

    const submitDate = date || new Date().toISOString().split('T')[0];
    
    // Server-side verification: Date must be within today and past 2 days
    const submitTime = new Date(submitDate).getTime();
    const today = new Date();
    today.setHours(0,0,0,0);
    const minAllowedTime = new Date(today);
    minAllowedTime.setDate(today.getDate() - 2);
    
    const maxAllowedTime = new Date(today);
    maxAllowedTime.setDate(today.getDate() + 1); 

    if (submitTime < minAllowedTime.getTime() || submitTime >= maxAllowedTime.getTime()) {
        return res.status(400).json({ error: 'Submissions are restricted to today and up to 2 days prior.' });
    }

    try {
        // Upsert submission header record
        await dbRun(
            `INSERT INTO submissions (date, user_id, submitted_by, email, score) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT(date, user_id) DO UPDATE SET score=excluded.score, submitted_by=excluded.submitted_by, email=excluded.email`,
            [submitDate, req.user.id, req.user.name, req.user.email, score]
        );

        // Clear existing items for that user on that date and re-insert
        await dbRun('DELETE FROM submission_items WHERE date = ? AND user_id = ?', [submitDate, req.user.id]);

        if (items) {
            for (const metricId in items) {
                const item = items[metricId];
                await dbRun(
                    `INSERT INTO submission_items (date, user_id, metric_id, qty, points, remarks) VALUES (?, ?, ?, ?, ?, ?)`,
                    [submitDate, req.user.id, parseInt(metricId, 10), item.qty, item.points, item.remarks || '']
                );
            }
        }

        res.json({ message: 'KPI submitted successfully', score });
    } catch (err) {
        res.status(500).json({ error: 'Failed to record KPI submission: ' + err.message });
    }
});

// 5. Leaderboard View
app.get('/api/kpis/leaderboard', authenticateToken, async (req, res) => {
    try {
        const users = await dbAll(`SELECT * FROM users WHERE role != 'Admin'`);
        const currentMonth = new Date().toISOString().substring(0, 7); // e.g. "2026-07"

        const monthScores = {};
        users.forEach(u => {
            monthScores[u.id] = {
                id: u.id,
                email: u.email,
                name: u.name,
                specialization: u.specialization,
                score: 0
            };
        });

        const subs = await dbAll(`SELECT user_id, SUM(score) as total_score FROM submissions WHERE date LIKE ? GROUP BY user_id`, [`${currentMonth}%`]);

        subs.forEach(s => {
            if (monthScores[s.user_id]) {
                monthScores[s.user_id].score = s.total_score || 0;
            }
        });

        const sorted = Object.values(monthScores).sort((a, b) => b.score - a.score);
        res.json(sorted);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate leaderboard' });
    }
});

// 6. Daily Report (Admin Only)
app.get('/api/reports/daily', authenticateToken, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Date query parameter is required' });
    }

    try {
        const subs = await dbAll('SELECT * FROM submissions WHERE date = ?', [date]);
        const dayData = {};

        for (const sub of subs) {
            const itemsRows = await dbAll('SELECT * FROM submission_items WHERE date = ? AND user_id = ?', [date, sub.user_id]);
            const itemsObj = {};
            itemsRows.forEach(i => {
                itemsObj[i.metric_id] = {
                    qty: i.qty,
                    points: i.points,
                    remarks: i.remarks
                };
            });

            dayData[sub.user_id] = {
                submittedBy: sub.submitted_by,
                email: sub.email,
                score: sub.score,
                items: itemsObj
            };
        }

        res.json(dayData);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate daily report' });
    }
});

// 7. General Summary Report (Supports All-Time, Monthly, and Daily filters)
app.get('/api/reports/summary', authenticateToken, async (req, res) => {
    const { mode, value } = req.query; // mode: 'all', 'month', 'day'; value: e.g., '2026-07' or '2026-07-16'

    try {
        const users = await dbAll(`SELECT * FROM users WHERE role != 'Admin'`);
        const reportMap = {};

        users.forEach(u => {
            reportMap[u.id] = {
                id: u.id,
                email: u.email,
                name: u.name,
                specialization: u.specialization,
                submissionsCount: 0,
                accumulatedPoints: 0
            };
        });

        let query = 'SELECT user_id, COUNT(*) as subs_count, SUM(score) as total_pts FROM submissions';
        let params = [];

        if (mode === 'month' && value) {
            query += ' WHERE date LIKE ?';
            params.push(`${value}%`);
        } else if (mode === 'day' && value) {
            query += ' WHERE date = ?';
            params.push(value);
        }

        query += ' GROUP BY user_id';

        const rows = await dbAll(query, params);

        rows.forEach(r => {
            if (reportMap[r.user_id]) {
                reportMap[r.user_id].submissionsCount = r.subs_count || 0;
                reportMap[r.user_id].accumulatedPoints = r.total_pts || 0;
            }
        });

        const summaryList = Object.values(reportMap).sort((a, b) => b.accumulatedPoints - a.accumulatedPoints);
        res.json(summaryList);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch summary report' });
    }
});

// 8. Get team member list (Admin Only)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await dbAll(`SELECT email, id, name, role, specialization FROM users`);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// 9. Add a new team member
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    const { email, name, role, password, specialization } = req.body;
    
    if (!email || !name || !role || !password || !specialization) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    try {
        const existing = await dbGet('SELECT email FROM users WHERE LOWER(email) = ?', [cleanEmail]);
        if (existing) {
            return res.status(400).json({ error: 'A user with this email already exists' });
        }

        const userId = name.toLowerCase().replace(/\s+/g, '');
        await dbRun(
            'INSERT INTO users (email, id, name, role, password, specialization) VALUES (?, ?, ?, ?, ?, ?)',
            [cleanEmail, userId, name, role, password, specialization]
        );

        // Auto initialize default KPI configurations based on specialization template
        if (role === 'Consultant') {
            const templateUser = await dbGet(`SELECT id FROM users WHERE role = 'Consultant' AND specialization = ? AND id != ? LIMIT 1`, [specialization, userId]);
            let templateItems = [];

            if (templateUser) {
                templateItems = await dbAll('SELECT category, label, points, weightage FROM kpi_configs WHERE user_id = ?', [templateUser.id]);
            }

            if (templateItems.length > 0) {
                let idStart = Math.floor(Math.random() * 10000) + 1000;
                for (const item of templateItems) {
                    await dbRun(
                        'INSERT INTO kpi_configs (user_id, metric_id, category, label, points, weightage) VALUES (?, ?, ?, ?, ?, ?)',
                        [userId, idStart++, item.category, item.label, item.points || 10, item.weightage || '10%']
                    );
                }
            } else {
                const defaults = [
                    { id: Math.floor(Math.random() * 10000) + 1000, category: "Campaign Execution", label: "Meta, Google, LinkedIn Ads Setup & Optimization", points: 10, weightage: "25%" },
                    { id: Math.floor(Math.random() * 10000) + 1000, category: "SEO Implementation", label: "Keyword Research & Ranking Improvements", points: 10, weightage: "25%" },
                    { id: Math.floor(Math.random() * 10000) + 1000, category: "Website Management", label: "Landing Pages Created / Updates Done", points: 10, weightage: "25%" },
                    { id: Math.floor(Math.random() * 10000) + 1000, category: "Market Research", label: "Competitor Analysis & Digital Audits", points: 10, weightage: "25%" }
                ];
                for (const d of defaults) {
                    await dbRun(
                        'INSERT INTO kpi_configs (user_id, metric_id, category, label, points, weightage) VALUES (?, ?, ?, ?, ?, ?)',
                        [userId, d.id, d.category, d.label, d.points, d.weightage]
                    );
                }
            }
        }

        res.json({ message: 'User added successfully', user: { email: cleanEmail, name, role } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create user: ' + err.message });
    }
});

// 10. Update a team member's account
app.put('/api/admin/users/:email', authenticateToken, requireAdmin, async (req, res) => {
    const { email } = req.params;
    const { name, role, specialization, password } = req.body;

    const cleanEmail = email.toLowerCase().trim();

    try {
        const user = await dbGet('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newName = name || user.name;
        const newRole = role || user.role;
        const newSpec = specialization || user.specialization;
        const newPass = password || user.password;

        await dbRun(
            'UPDATE users SET name = ?, role = ?, specialization = ?, password = ? WHERE LOWER(email) = ?',
            [newName, newRole, newSpec, newPass, cleanEmail]
        );

        res.json({ message: 'User updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// 11. Save KPI configurations for a consultant (Admin Only)
app.put('/api/admin/configs/:userId', authenticateToken, requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { configs } = req.body; // array of items

    if (!Array.isArray(configs)) {
        return res.status(400).json({ error: 'Configs array is required' });
    }

    try {
        await dbRun('DELETE FROM kpi_configs WHERE user_id = ?', [userId]);

        for (const item of configs) {
            await dbRun(
                'INSERT INTO kpi_configs (user_id, metric_id, category, label, points, weightage) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, item.id || (Math.floor(Math.random() * 10000) + 1000), item.category, item.label, item.points || 10, item.weightage || '']
            );
        }

        res.json({ message: 'Configurations saved successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save configurations: ' + err.message });
    }
});

// 12. Void a specific daily submission (Admin Only)
app.delete('/api/admin/submissions', authenticateToken, requireAdmin, async (req, res) => {
    const { date, userId } = req.body;

    if (!date || !userId) {
        return res.status(400).json({ error: 'Date and userId are required' });
    }

    try {
        await dbRun('DELETE FROM submission_items WHERE date = ? AND user_id = ?', [date, userId]);
        await dbRun('DELETE FROM submissions WHERE date = ? AND user_id = ?', [date, userId]);
        res.json({ message: `Submission for ${userId} on ${date} has been voided.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to void submission' });
    }
});

// 13. Audit Log - Get all entries for a specific date across all consultants (Admin Only)
app.get('/api/admin/audit-log', authenticateToken, requireAdmin, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Date is required' });
    }

    try {
        const rows = await dbAll(`
            SELECT si.date, si.user_id, si.metric_id, si.qty, si.points, si.remarks, s.submitted_by, s.email, kc.category, kc.label
            FROM submission_items si
            JOIN submissions s ON si.date = s.date AND si.user_id = s.user_id
            LEFT JOIN kpi_configs kc ON si.user_id = kc.user_id AND si.metric_id = kc.metric_id
            WHERE si.date = ?
        `, [date]);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch audit logs: ' + err.message });
    }
});

// 14. Monthly Performance Trend for Team (Admin Only)
app.get('/api/admin/monthly-trend', authenticateToken, requireAdmin, async (req, res) => {
    const currentMonth = new Date().toISOString().substring(0, 7); // e.g. "2026-07"

    try {
        const rows = await dbAll(`SELECT date, SUM(score) as daily_total FROM submissions WHERE date LIKE ? GROUP BY date ORDER BY date ASC`, [`${currentMonth}%`]);

        const trend = rows.map(r => ({
            date: r.date.substring(8, 10) + ' ' + new Date(r.date).toLocaleString('default', { month: 'short' }),
            score: r.daily_total
        }));

        res.json(trend);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch monthly trend' });
    }
});

// 15. Get submissions for a specific consultant (Admin Only, supports filters)
app.get('/api/admin/users/:userId/submissions', authenticateToken, requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { mode, value } = req.query;

    try {
        let query = 'SELECT * FROM submissions WHERE user_id = ?';
        let params = [userId];

        if (mode === 'month' && value) {
            query += ' AND date LIKE ?';
            params.push(`${value}%`);
        } else if (mode === 'day' && value) {
            query += ' AND date = ?';
            params.push(value);
        }

        query += ' ORDER BY date DESC';

        const subs = await dbAll(query, params);
        const result = [];

        for (const sub of subs) {
            const itemsRows = await dbAll('SELECT * FROM submission_items WHERE date = ? AND user_id = ?', [sub.date, userId]);
            const itemsObj = {};
            itemsRows.forEach(i => {
                itemsObj[i.metric_id] = {
                    qty: i.qty,
                    points: i.points,
                    remarks: i.remarks
                };
            });

            result.push({
                date: sub.date,
                score: sub.score,
                items: itemsObj
            });
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user submissions' });
    }
});

// 15b. Export Submissions Data (Admin Only)
app.get('/api/admin/submissions/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT si.date, s.submitted_by as Name, s.email as Email, COALESCE(kc.label, si.metric_id) as Activity, si.qty as Quantity, si.points as 'Points Earned', si.remarks as Remarks
            FROM submission_items si
            JOIN submissions s ON si.date = s.date AND si.user_id = s.user_id
            LEFT JOIN kpi_configs kc ON si.user_id = kc.user_id AND si.metric_id = kc.metric_id
            ORDER BY si.date DESC
        `);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to export submissions' });
    }
});

// 16. Bulk Import Submissions via Excel Rows (Admin Only)
app.post('/api/admin/submissions/bulk', authenticateToken, requireAdmin, async (req, res) => {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
        return res.status(400).json({ error: 'Rows array is required' });
    }

    let importedCount = 0;
    let skippedCount = 0;
    const errors = [];

    try {
        const usersList = await dbAll('SELECT * FROM users');
        const usersByEmail = {};
        usersList.forEach(u => usersByEmail[u.email.toLowerCase().trim()] = u);

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            const { date, email, activity, qty, remarks } = row;
            if (!date || !email || !activity) {
                skippedCount++;
                errors.push(`Row ${index + 1}: Missing date, email, or activity name`);
                continue;
            }

            let finalDate = date;
            if (typeof date === 'number') {
                const utcDays  = Math.floor(date - 25569);
                const utcValue = utcDays * 86400;
                const dateInfo = new Date(utcValue * 1000);
                const year = dateInfo.getFullYear();
                const month = String(dateInfo.getMonth() + 1).padStart(2, '0');
                const day = String(dateInfo.getDate()).padStart(2, '0');
                finalDate = `${year}-${month}-${day}`;
            } else {
                finalDate = String(date).trim();
            }

            const cleanEmail = email.toLowerCase().trim();
            const user = usersByEmail[cleanEmail];
            if (!user) {
                skippedCount++;
                errors.push(`Row ${index + 1}: Consultant with email "${email}" not found`);
                continue;
            }

            const matchedMetric = await dbGet(`SELECT metric_id, points FROM kpi_configs WHERE user_id = ? AND LOWER(TRIM(label)) = ?`, [user.id, activity.toLowerCase().trim()]);
            if (!matchedMetric) {
                skippedCount++;
                errors.push(`Row ${index + 1}: Activity "${activity}" not configured for ${user.name}`);
                continue;
            }

            const parsedQty = parseInt(qty, 10) || 0;
            if (parsedQty <= 0) {
                skippedCount++;
                errors.push(`Row ${index + 1}: Quantity must be greater than zero`);
                continue;
            }

            const pointsEarned = parsedQty * matchedMetric.points;

            // Upsert header
            await dbRun(
                `INSERT INTO submissions (date, user_id, submitted_by, email, score) 
                 VALUES (?, ?, ?, ?, 0) 
                 ON CONFLICT(date, user_id) DO NOTHING`,
                [finalDate, user.id, user.name, cleanEmail]
            );

            // Upsert or insert item
            await dbRun(
                `INSERT INTO submission_items (date, user_id, metric_id, qty, points, remarks) VALUES (?, ?, ?, ?, ?, ?)`,
                [finalDate, user.id, matchedMetric.metric_id, parsedQty, pointsEarned, remarks || `Imported historical log for ${activity}`]
            );

            // Recalculate daily score
            const sumRow = await dbGet(`SELECT SUM(points) as total FROM submission_items WHERE date = ? AND user_id = ?`, [finalDate, user.id]);
            await dbRun(`UPDATE submissions SET score = ? WHERE date = ? AND user_id = ?`, [sumRow.total || 0, finalDate, user.id]);

            importedCount++;
        }

        res.json({
            message: `Successfully imported ${importedCount} record(s). Skipped ${skippedCount} record(s).`,
            importedCount,
            skippedCount,
            errors
        });
    } catch (err) {
        res.status(500).json({ error: 'Bulk import failed: ' + err.message });
    }
});

app.get('/client.js', (req, res) => {
    const clientPath = fs.existsSync(path.join(__dirname, 'client.js'))
        ? path.join(__dirname, 'client.js')
        : path.join(process.cwd(), 'client.js');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(clientPath);
});

// Serve frontend single page index.html for all main paths
app.get('*', (req, res) => {
    const indexPath = fs.existsSync(path.join(__dirname, 'index.html'))
        ? path.join(__dirname, 'index.html')
        : path.join(process.cwd(), 'index.html');
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(indexPath);
});

// Export for server deployment
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`Bradford KPI Production Server Live on SQLite`);
        console.log(`Local Host: http://localhost:${PORT}`);
        console.log(`====================================================`);
    });
}

module.exports = app;
