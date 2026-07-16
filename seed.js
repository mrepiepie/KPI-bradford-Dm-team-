const fs = require('fs');
const path = require('path');

const ROLES = {
    "mufeeda": { name: "Mufeeda", email: "mufeeda@bradfordia.org" },
    "sakshi": { name: "Sakshi", email: "sakshi@bradfordia.org" },
    "anas": { name: "Anas", email: "anas@bradfordia.org" },
    "minhaj": { name: "Minhaj", email: "minhaj@bradfordia.org" },
    "john": { name: "John", email: "john@bradfordia.org" },
    "absal": { name: "Absal", email: "absal@bradfordia.org" },
    "manahil": { name: "Manahil", email: "manahil@bradfordia.org" }
};

const KPI_CONFIG = {
    "mufeeda": [
        { id: 1, category: "Campaign Execution", points: 10 },
        { id: 2, category: "SEO Implementation", points: 10 },
        { id: 3, category: "Website Management", points: 10 },
        { id: 4, category: "Blog Posting", points: 5 },
        { id: 5, category: "Market Research", points: 10 }
    ],
    "sakshi": [
        { id: 11, category: "Content Output", points: 5 },
        { id: 12, category: "SEO Content", points: 10 },
        { id: 13, category: "Campaign Support", points: 5 },
        { id: 16, category: "Social Media Growth", points: 15 }
    ],
    "anas": [
        { id: 21, category: "Campaign Execution", points: 10 },
        { id: 22, category: "SEO Implementation", points: 10 },
        { id: 27, category: "Sapio Academy / Services", points: 15 }
    ],
    "minhaj": [
        { id: 41, category: "Campaign Execution", points: 10 },
        { id: 47, category: "Sapio Academy / Services", points: 15 },
        { id: 49, category: "Reporting & Insights", points: 5 }
    ],
    "john": [
        { id: 61, category: "Videos / Reels Produced", points: 15 },
        { id: 64, category: "Campaign Support", points: 10 }
    ],
    "absal": [
        { id: 71, category: "Creatives Delivered", points: 10 },
        { id: 74, category: "Campaign Support", points: 10 }
    ],
    "manahil": [
        { id: 81, category: "Creatives Delivered", points: 10 },
        { id: 84, category: "Campaign Support", points: 10 }
    ]
};

function generateMockDatabase() {
    const db = {};
    const users = Object.keys(ROLES);
    
    // We will generate data for two timeframes:
    // 1. May 2026 (matching the user's PC time of May 28, 2026)
    // 2. July 2026 (matching the server's current date of July 16, 2026)
    const baseDates = [
        new Date('2026-07-16'),
        new Date('2026-05-28')
    ];

    baseDates.forEach(baseDate => {
        for (let d = 0; d < 18; d++) {
            const dateString = new Date(baseDate.getTime() - d * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            db[dateString] = {};

            users.forEach(userId => {
                const user = ROLES[userId];
                if (Math.random() > 0.15) {
                    const kpiItems = KPI_CONFIG[userId] || [];
                    const submissions = {};
                    let dailyScore = 0;

                    kpiItems.forEach(item => {
                        const qty = Math.floor(Math.random() * 2) + 1; // force some active values
                        submissions[item.id] = {
                            qty: qty,
                            points: item.points * qty,
                            remarks: `Completed ${qty} task(s) for ${item.category}`
                        };
                        dailyScore += (item.points * qty);
                    });

                    if (dailyScore > 0) {
                        db[dateString][userId] = {
                            submittedBy: user.name,
                            email: user.email,
                            score: dailyScore,
                            items: submissions
                        };
                    }
                }
            });
        }
    });
    return db;
}

const db = generateMockDatabase();
const dir = path.join(__dirname, 'data');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}
fs.writeFileSync(path.join(dir, 'submissions.json'), JSON.stringify(db, null, 2));
console.log('Successfully seeded database to data/submissions.json');
