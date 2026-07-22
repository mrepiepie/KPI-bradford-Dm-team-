-- MySQL Database Setup for KPI Tracker Portal

CREATE TABLE IF NOT EXISTS users (
    email VARCHAR(191) PRIMARY KEY,
    id VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    password VARCHAR(100) NOT NULL,
    specialization VARCHAR(191) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kpi_configs (
    user_id VARCHAR(100) NOT NULL,
    metric_id INT NOT NULL,
    category VARCHAR(150) NOT NULL,
    label VARCHAR(255) NOT NULL,
    points INT DEFAULT 10,
    weightage VARCHAR(50) DEFAULT '',
    PRIMARY KEY (user_id, metric_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS submissions (
    date DATE NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    submitted_by VARCHAR(100) NOT NULL,
    email VARCHAR(191) NOT NULL,
    score INT DEFAULT 0,
    PRIMARY KEY (date, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS submission_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    metric_id INT NOT NULL,
    qty INT NOT NULL,
    points INT NOT NULL,
    remarks TEXT,
    FOREIGN KEY (date, user_id) REFERENCES submissions(date, user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default user accounts
INSERT INTO users (email, id, name, role, password, specialization) VALUES
('balu@bradfordia.org', 'balu', 'Balu', 'Admin', '123456', 'Digital Marketing Coordinator'),
('mufeeda@bradfordia.org', 'mufeeda', 'Mufeeda', 'Consultant', '123456', 'Campaigns & SEO Specialist'),
('sakshi@bradfordia.org', 'sakshi', 'Sakshi', 'Consultant', '123456', 'Content & Social Media Writer'),
('anas@bradfordia.org', 'anas', 'Anas', 'Consultant', '123456', 'SEO & PPC Campaign Manager'),
('minhaj@bradfordia.org', 'minhaj', 'Minhaj', 'Consultant', '123456', 'Campaign & Web Analytics Lead'),
('john@bradfordia.org', 'john', 'John', 'Consultant', '123456', 'Multimedia & Reel Specialist'),
('absal@bradfordia.org', 'absal', 'Absal', 'Consultant', '123456', 'Lead Visual/Banner Designer'),
('manahil@bradfordia.org', 'manahil', 'Manahil', 'Consultant', '123456', 'Brand Designer & Visual Artist')
ON DUPLICATE KEY UPDATE password=VALUES(password);

-- Seed default configs
INSERT INTO kpi_configs (user_id, metric_id, category, label, points, weightage) VALUES
-- Mufeeda Configs
('mufeeda', 1, 'Campaign Execution', 'Meta, Google, LinkedIn Ads Setup & Optimization', 10, '25%'),
('mufeeda', 2, 'SEO Implementation', 'Keyword Research & Ranking Improvements', 10, '25%'),
('mufeeda', 3, 'Website Management & Web Designing', 'Landing Pages Created / Updates Done', 10, '20%'),
('mufeeda', 4, 'Blog Posting', 'Articles Written & Uploaded', 5, '15%'),
('mufeeda', 5, 'Market Research', 'Competitor Analysis & Digital Audits', 10, '15%'),

-- Sakshi Configs
('sakshi', 11, 'Content Output', 'Creative Copywriting & Content Drafts', 5, '30%'),
('sakshi', 12, 'SEO Content', 'Optimized SEO Copy & Blog Drafts', 10, '30%'),
('sakshi', 13, 'Campaign Support', 'Visual Design Assistance & Content Curation', 5, '20%'),
('sakshi', 16, 'Social Media Growth', 'Audience Growth & Post Optimization Logs', 15, '20%'),

-- Anas Configs
('anas', 21, 'Campaign Execution', 'Google Ads Setup & Campaign Bidding Adjustments', 10, '40%'),
('anas', 22, 'SEO Implementation', 'On-Page Optimization & Technical Fixes', 10, '30%'),
('anas', 27, 'Sapio Academy / Services / SCUBE / GEO', 'Technical Integration Work & Database Maintenance', 15, '30%'),

-- Minhaj Configs
('minhaj', 41, 'Campaign Execution', 'PPC Management & Bid Adjustments', 10, '40%'),
('minhaj', 47, 'Sapio Academy / Services / SCUBE / GEO', 'Technical Integrations & Web Audits', 15, '40%'),
('minhaj', 49, 'Reporting & Insights', 'Daily Analytics Reports & Trend Analysis Logs', 5, '20%'),

-- John Configs
('john', 61, 'Videos / Reels Produced', 'Reels Filmed, Edited & Published', 15, '60%'),
('john', 64, 'Campaign Support', 'Media Asset Assets Provided & Content Research', 10, '40%'),

-- Absal Configs
('absal', 71, 'Creatives Delivered', 'Graphic Banners, Flyers & Ad Creatives Produced', 10, '60%'),
('absal', 74, 'Campaign Support', 'Design Revisions & Visual Edits', 10, '40%'),

-- Manahil Configs
('manahil', 81, 'Creatives Delivered', 'Branding Kit, Visual Assets & Design Mockups', 10, '60%'),
('manahil', 84, 'Campaign Support', 'Creative Asset Delivery & Iteration Adjustments', 10, '40%')
ON DUPLICATE KEY UPDATE points=VALUES(points);
