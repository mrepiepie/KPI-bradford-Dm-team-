const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'database.sqlite');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const CONFIGS_FILE = path.join(__dirname, 'data', 'kpi_configs.json');
const SUBMISSIONS_FILE = path.join(__dirname, 'data', 'submissions.json');

// Remove existing SQLite DB if initializing fresh
if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('Removed existing database.sqlite for clean migration.');
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    // 1. Create tables
    db.run(`CREATE TABLE users (
        email TEXT PRIMARY KEY,
        id TEXT,
        name TEXT,
        role TEXT,
        password TEXT,
        specialization TEXT
    )`);

    db.run(`CREATE TABLE kpi_configs (
        user_id TEXT,
        metric_id INTEGER,
        category TEXT,
        label TEXT,
        points INTEGER,
        weightage TEXT,
        PRIMARY KEY (user_id, metric_id)
    )`);

    db.run(`CREATE TABLE submissions (
        date TEXT,
        user_id TEXT,
        submitted_by TEXT,
        email TEXT,
        score INTEGER,
        PRIMARY KEY (date, user_id)
    )`);

    db.run(`CREATE TABLE submission_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        user_id TEXT,
        metric_id INTEGER,
        qty INTEGER,
        points INTEGER,
        remarks TEXT,
        FOREIGN KEY (date, user_id) REFERENCES submissions(date, user_id)
    )`);

    console.log('Database tables created successfully.');

    // 2. Migrate users.json
    if (fs.existsSync(USERS_FILE)) {
        const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const stmt = db.prepare(`INSERT INTO users (email, id, name, role, password, specialization) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const email in usersData) {
            const u = usersData[email];
            stmt.run(email.toLowerCase().trim(), u.id, u.name, u.role, u.password, u.specialization);
        }
        stmt.finalize();
        console.log('Users dataset migrated to SQLite.');
    }

    // 3. Migrate kpi_configs.json
    if (fs.existsSync(CONFIGS_FILE)) {
        const configsData = JSON.parse(fs.readFileSync(CONFIGS_FILE, 'utf8'));
        const stmt = db.prepare(`INSERT INTO kpi_configs (user_id, metric_id, category, label, points, weightage) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const userId in configsData) {
            const metrics = configsData[userId];
            metrics.forEach(m => {
                stmt.run(userId, m.id, m.category, m.label, m.points || 10, m.weightage || '');
            });
        }
        stmt.finalize();
        console.log('KPI Configs dataset migrated to SQLite.');
    }

    // 4. Migrate submissions.json
    if (fs.existsSync(SUBMISSIONS_FILE)) {
        const submissionsData = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
        const subStmt = db.prepare(`INSERT INTO submissions (date, user_id, submitted_by, email, score) VALUES (?, ?, ?, ?, ?)`);
        const itemStmt = db.prepare(`INSERT INTO submission_items (date, user_id, metric_id, qty, points, remarks) VALUES (?, ?, ?, ?, ?, ?)`);

        for (const date in submissionsData) {
            const dayObj = submissionsData[date];
            for (const userId in dayObj) {
                const userSub = dayObj[userId];
                subStmt.run(date, userId, userSub.submittedBy, userSub.email, userSub.score);

                if (userSub.items) {
                    for (const metricId in userSub.items) {
                        const item = userSub.items[metricId];
                        itemStmt.run(date, userId, parseInt(metricId, 10), item.qty, item.points, item.remarks || '');
                    }
                }
            }
        }
        subStmt.finalize();
        itemStmt.finalize();
        console.log('Submissions dataset migrated to SQLite.');
    }

    db.close(() => {
        console.log('SQLite Database Migration Complete -> database.sqlite');
    });
});
