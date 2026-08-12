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

// In-Memory cache mimicking database for serverless Vercel (so it can write changes)
let usersCache = {
  "balu@bradfordia.org": {
    "email": "balu@bradfordia.org",
    "id": "balu",
    "name": "Balu",
    "role": "Admin",
    "password": "123456",
    "specialization": "Digital Marketing Coordinator"
  },
  "mufeeda@bradfordia.org": {
    "email": "mufeeda@bradfordia.org",
    "id": "mufeeda",
    "name": "Mufeeda",
    "role": "Consultant",
    "password": "123456",
    "specialization": "Campaigns & SEO Specialist"
  },
  "sakshi@bradfordia.org": {
    "email": "sakshi@bradfordia.org",
    "id": "sakshi",
    "name": "Sakshi",
    "role": "Consultant",
    "password": "123456",
    "specialization": "SEO Content Writer"
  },
  "anas@bradfordia.org": {
    "email": "anas@bradfordia.org",
    "id": "anas",
    "name": "Anas",
    "role": "Consultant",
    "password": "123456",
    "specialization": "SEO & PPC Campaign Manager"
  },
  "minhaj@bradfordia.org": {
    "email": "minhaj@bradfordia.org",
    "id": "minhaj",
    "name": "Minhaj",
    "role": "Consultant",
    "password": "123456",
    "specialization": "Campaign & Web Analytics Lead"
  },
  "john@bradfordia.org": {
    "email": "john@bradfordia.org",
    "id": "john",
    "name": "John",
    "role": "Consultant",
    "password": "123456",
    "specialization": "AI Animator & Motion Graphics Animator"
  },
  "absal@bradfordia.org": {
    "email": "absal@bradfordia.org",
    "id": "absal",
    "name": "Absal",
    "role": "Consultant",
    "password": "123456",
    "specialization": "Lead Visual/Banner Designer"
  },
  "manahil@bradfordia.org": {
    "email": "manahil@bradfordia.org",
    "id": "manahil",
    "name": "Manahil",
    "role": "Consultant",
    "password": "123456",
    "specialization": "Brand Designer & Visual Artist"
  }
};

let configsCache = {
  "mufeeda": [
    { "id": 1, "category": "Campaign Execution", "label": "Meta, Google, LinkedIn Ads Setup & Optimization", "points": 10, "weightage": "25%" },
    { "id": 2, "category": "SEO Implementation", "label": "Keyword Research & Ranking Improvements", "points": 10, "weightage": "25%" },
    { "id": 3, "category": "Website Management & Web Designing", "label": "Landing Pages Created / Updates Done", "points": 10, "weightage": "20%" },
    { "id": 4, "category": "Blog Posting", "label": "Articles Written & Uploaded", "points": 5, "weightage": "15%" },
    { "id": 5, "category": "Market Research", "label": "Competitor Analysis & Digital Audits", "points": 10, "weightage": "15%" }
  ],
  "sakshi": [
    { "id": 11, "category": "Content Output", "label": "Creative Copywriting & Content Drafts", "points": 5, "weightage": "30%" },
    { "id": 12, "category": "SEO Content", "label": "Optimized SEO Copy & Blog Drafts", "points": 10, "weightage": "30%" },
    { "id": 13, "category": "Campaign Support", "label": "Visual Design Assistance & Content Curation", "points": 5, "weightage": "20%" },
    { "id": 16, "category": "Social Media Growth", "label": "Audience Growth & Post Optimization Logs", "points": 15, "weightage": "20%" }
  ],
  "anas": [
    { "id": 21, "category": "Campaign Execution", "label": "Google Ads Setup & Campaign Bidding Adjustments", "points": 10, "weightage": "40%" },
    { "id": 22, "category": "SEO Implementation", "label": "On-Page Optimization & Technical Fixes", "points": 10, "weightage": "30%" },
    { "id": 27, "category": "Sapio Academy / Services / SCUBE / GEO", "label": "Technical Integration Work & Database Maintenance", "points": 15, "weightage": "30%" }
  ],
  "minhaj": [
    { "id": 41, "category": "Campaign Execution", "label": "PPC Management & Bid Adjustments", "points": 10, "weightage": "40%" },
    { "id": 47, "category": "Sapio Academy / Services / SCUBE / GEO", "label": "Technical Integrations & Web Audits", "points": 15, "weightage": "40%" },
    { "id": 49, "category": "Reporting & Insights", "label": "Daily Analytics Reports & Trend Analysis Logs", "points": 5, "weightage": "20%" }
  ],
  "john": [
    { "id": 61, "category": "Video Reels", "label": "Standard/Motion Video Reels Filmed, Edited & Published", "points": 15, "weightage": "30%" },
    { "id": 62, "category": "AI Reels: Images Created", "label": "Generative AI Images Rendered (Midjourney/Stable Diffusion)", "points": 5, "weightage": "20%" },
    { "id": 63, "category": "AI Reels: Prompts Engineered", "label": "Detailed AI Prompts Written & Optimized", "points": 5, "weightage": "15%" },
    { "id": 64, "category": "AI Reels: Videos Rendered", "label": "AI Video Generation (Runway, Sora, Kling) & Final Animation Reels Output", "points": 20, "weightage": "25%" },
    { "id": 65, "category": "Campaign Support", "label": "Media Asset Assets Provided & Content Research", "points": 10, "weightage": "10%" }
  ],
  "absal": [
    { "id": 71, "category": "Creatives Delivered", "label": "Graphic Banners, Flyers & Ad Creatives Produced", "points": 10, "weightage": "60%" },
    { "id": 74, "category": "Campaign Support", "label": "Design Revisions & Visual Edits", "points": 10, "weightage": "40%" }
  ],
  "manahil": [
    { "id": 81, "category": "Creatives Delivered", "label": "Branding Kit, Visual Assets & Design Mockups", "points": 10, "weightage": "60%" },
    { "id": 84, "category": "Campaign Support", "label": "Creative Asset Delivery & Iteration Adjustments", "points": 10, "weightage": "40%" }
  ]
};

// Seed initial submissions to showcase John's 30 points log in the demo dashboard
let submissionsCache = {
  "2026-08-12": {
    "john": {
      "submittedBy": "John",
      "email": "john@bradfordia.org",
      "score": 30,
      "items": {
        "61": { "qty": 2, "points": 30, "remarks": "Created two motion video reels for Pinnacle branches." }
      }
    }
  }
};

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

function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(403).json({ error: 'Administrative privileges required' });
    }
}

// API ENDPOINTS

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = usersCache[email.toLowerCase().trim()];
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
});

app.post('/api/auth/change-password', authenticateToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = usersCache[req.user.email.toLowerCase()];
    if (!user || user.password !== oldPassword) {
        return res.status(400).json({ error: 'Current password verification failed' });
    }
    user.password = newPassword;
    res.json({ message: 'Password updated successfully' });
});

app.get('/api/kpis/configs', authenticateToken, (req, res) => {
    res.json(configsCache);
});

app.post('/api/kpis/submit', authenticateToken, (req, res) => {
    const { score, items, date } = req.body;
    if (req.user.role === 'Admin') {
        return res.status(400).json({ error: 'Administrators cannot submit daily KPIs' });
    }
    const submitDate = date || new Date().toISOString().split('T')[0];

    if (!submissionsCache[submitDate]) submissionsCache[submitDate] = {};
    submissionsCache[submitDate][req.user.id] = {
        submittedBy: req.user.name,
        email: req.user.email,
        score: score,
        items: items || {}
    };
    res.json({ message: 'KPI submitted successfully', score });
});

app.get('/api/kpis/leaderboard', authenticateToken, (req, res) => {
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const sorted = Object.values(usersCache)
        .filter(u => u.role !== 'Admin')
        .map(u => {
            let total = 0;
            for (const date in submissionsCache) {
                if (date.startsWith(currentMonth) && submissionsCache[date][u.id]) {
                    total += submissionsCache[date][u.id].score;
                }
            }
            return {
                id: u.id,
                email: u.email,
                name: u.name,
                specialization: u.specialization,
                score: total
            };
        })
        .sort((a, b) => b.score - a.score);
    res.json(sorted);
});

app.get('/api/reports/daily', authenticateToken, (req, res) => {
    const { date } = req.query;
    res.json(submissionsCache[date] || {});
});

app.get('/api/reports/summary', authenticateToken, (req, res) => {
    const { mode, value } = req.query;
    const currentMonth = new Date().toISOString().substring(0, 7);

    const data = Object.values(usersCache)
        .filter(u => u.role !== 'Admin')
        .map(u => {
            let total = 0;
            let activeDays = 0;
            for (const date in submissionsCache) {
                let match = false;
                if (!mode || mode === 'all') match = true;
                else if (mode === 'month' && value && date.startsWith(value)) match = true;
                else if (mode === 'day' && value && date === value) match = true;

                if (match && submissionsCache[date][u.id]) {
                    total += submissionsCache[date][u.id].score;
                    activeDays++;
                }
            }
            return {
                id: u.id,
                email: u.email,
                name: u.name,
                specialization: u.specialization,
                submissionsCount: activeDays,
                accumulatedPoints: total
            };
        })
        .sort((a, b) => b.accumulatedPoints - a.accumulatedPoints);
    res.json(data);
});

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    res.json(Object.values(usersCache));
});

app.post('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    const { email, name, role, password, specialization } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    if (usersCache[cleanEmail]) return res.status(400).json({ error: 'User already exists' });

    const userId = name.toLowerCase().replace(/\s+/g, '');
    usersCache[cleanEmail] = { email: cleanEmail, id: userId, name, role, password, specialization };

    // Seed default metrics
    configsCache[userId] = [
        { "id": randId(), "category": "Campaign Execution", "label": "Meta/Google Ads Optimizations", "points": 10, "weightage": "50%" },
        { "id": randId(), "category": "SEO Implementation", "label": "On-Page SEO Configurations", "points": 10, "weightage": "50%" }
    ];

    res.json({ message: 'User created' });
});

app.put('/api/admin/users/:email', authenticateToken, requireAdmin, (req, res) => {
    const { email } = req.params;
    const { name, role, specialization, password } = req.body;
    const user = usersCache[email.toLowerCase().trim()];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (name) user.name = name;
    if (role) user.role = role;
    if (specialization) user.specialization = specialization;
    if (password) user.password = password;

    res.json({ message: 'User updated' });
});

app.delete('/api/admin/users/:email', authenticateToken, requireAdmin, (req, res) => {
    delete usersCache[req.params.email.toLowerCase().trim()];
    res.json({ message: 'User deleted' });
});

app.post('/api/admin/kpis/configs', authenticateToken, requireAdmin, (req, res) => {
    const { userId, items } = req.body;
    configsCache[userId] = items || [];
    res.json({ message: 'Configs saved' });
});

app.delete('/api/admin/submissions/:date/:userId', authenticateToken, requireAdmin, (req, res) => {
    const { date, userId } = req.params;
    if (submissionsCache[date] && submissionsCache[date][userId]) {
        delete submissionsCache[date][userId];
    }
    res.json({ message: 'Submission deleted' });
});

app.get('/api/admin/monthly-trend', authenticateToken, requireAdmin, (req, res) => {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const dailyTotals = {};

    for (const date in submissionsCache) {
        if (date.startsWith(currentMonth)) {
            let dayTotal = 0;
            for (const u in submissionsCache[date]) {
                dayTotal += submissionsCache[date][u].score;
            }
            dailyTotals[date] = dayTotal;
        }
    }

    const sorted = Object.keys(dailyTotals).sort();
    const trend = sorted.map(d => ({
        date: d.substring(8, 10) + ' ' + new Date(d).toLocaleString('default', { month: 'short' }),
        score: dailyTotals[d]
    }));
    res.json(trend);
});

app.get('/api/admin/users/:userId/submissions', authenticateToken, requireAdmin, (req, res) => {
    const { userId } = req.params;
    const { mode, value } = req.query;
    const results = [];

    for (const date in submissionsCache) {
        let match = false;
        if (!mode || mode === 'all') match = true;
        else if (mode === 'month' && value && date.startsWith(value)) match = true;
        else if (mode === 'day' && value && date === value) match = true;

        if (match && submissionsCache[date][userId]) {
            results.push({
                date,
                score: submissionsCache[date][userId].score,
                items: submissionsCache[date][userId].items
            });
        }
    }
    res.json(results.sort((a,b) => b.date.localeCompare(a.date)));
});

app.get('/style.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'style.css'));
});

app.get('/client.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'client.js'));
});

app.get('*', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'index.html'));
});

function randId() {
    return Math.floor(Math.random() * 9000) + 1000;
}

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Node development server live on port ${PORT}`);
    });
}

module.exports = app;
