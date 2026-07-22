<?php
/**
 * BIA KPI Management Portal - Unified API Endpoint
 * Handles requests from client.js browser client.
 */

// Enable CORS and JSON Response Headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ---------------------------------------------------------
// DATABASE CONNECTION CONFIGURATION (MySQL / phpMyAdmin)
// ---------------------------------------------------------
$DB_HOST = "localhost";
$DB_USER = "root";
$DB_PASS = "";
$DB_NAME = "bia_kpi_db";

try {
    $pdo = new PDO("mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4", $DB_USER, $DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Database Connection Failed: " . $e->getMessage()]);
    exit();
}

// ---------------------------------------------------------
// COMPACT JWT-LIKE ENCODING UTILITIES (Self-contained)
// ---------------------------------------------------------
$JWT_SECRET = "bradford_intl_alliance_secret_key_2026";

function base64UrlEncode($data) {
    return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($data));
}

function base64UrlDecode($data) {
    return base64_decode(str_replace(['-', '_'], ['+', '/'], $data));
}

function generateToken($payload) {
    global $JWT_SECRET;
    $header = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
    $base64UrlHeader = base64UrlEncode($header);
    $base64UrlPayload = base64UrlEncode(json_encode($payload));
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $JWT_SECRET, true);
    $base64UrlSignature = base64UrlEncode($signature);
    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
}

function verifyToken($token) {
    global $JWT_SECRET;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    list($header, $payload, $signature) = $parts;
    $validSign = hash_hmac('sha256', $header . "." . $payload, $JWT_SECRET, true);
    if (hash_equals(base64UrlDecode($signature), $validSign)) {
        return json_decode(base64UrlDecode($payload), true);
    }
    return null;
}

// ---------------------------------------------------------
// SECURITY MIDDLEWARE FLOWS
// ---------------------------------------------------------
$currentUser = null;

function authenticate() {
    global $currentUser;
    $headers = getallheaders();
    $authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';
    
    // Check case-insensitive Authorization header
    if (!$authHeader) {
        foreach ($headers as $key => $val) {
            if (strtolower($key) === 'authorization') {
                $authHeader = $val;
                break;
            }
        }
    }

    if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        $user = verifyToken($matches[1]);
        if ($user) {
            $currentUser = $user;
            return true;
        }
    }
    
    http_response_code(401);
    echo json_encode(["error" => "Access token missing or expired"]);
    exit();
}

function requireAdmin() {
    global $currentUser;
    if (!$currentUser || $currentUser['role'] !== 'Admin') {
        http_response_code(403);
        echo json_encode(["error" => "Administrative privileges required"]);
        exit();
    }
}

// Get Request Body Data
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);
if ($input === null) $input = [];

// Resolve Endpoint URL path
$requestUri = $_SERVER['REQUEST_URI'];
$basePath = dirname($_SERVER['SCRIPT_NAME']);
$route = str_replace($basePath, '', $requestUri);
$route = parse_url($route, PHP_URL_PATH);
$route = trim($route, '/');

// Router mapping
$method = $_SERVER['REQUEST_METHOD'];

// Handle Auth endpoints
if ($route === 'api/auth/login' && $method === 'POST') {
    $email = isset($input['email']) ? trim($input['email']) : '';
    $password = isset($input['password']) ? $input['password'] : '';
    
    if (!$email || !$password) {
        http_response_code(400);
        echo json_encode(["error" => "Email and password are required"]);
        exit();
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(email) = ?");
    $stmt->execute([strtolower($email)]);
    $user = $stmt->fetch();

    if ($user && $user['password'] === $password) {
        $payload = [
            "id" => $user['id'],
            "name" => $user['name'],
            "email" => $user['email'],
            "role" => $user['role'],
            "specialization" => $user['specialization']
        ];
        $token = generateToken($payload);
        echo json_encode(["token" => $token, "user" => $payload]);
    } else {
        http_response_code(401);
        echo json_encode(["error" => "Invalid email or password"]);
    }
    exit();
}

if ($route === 'api/auth/change-password' && $method === 'POST') {
    authenticate();
    $oldPassword = isset($input['oldPassword']) ? $input['oldPassword'] : '';
    $newPassword = isset($input['newPassword']) ? $input['newPassword'] : '';

    if (!$oldPassword || !$newPassword) {
        http_response_code(400);
        echo json_encode(["error" => "Current and new passwords are required"]);
        exit();
    }

    $stmt = $pdo->prepare("SELECT password FROM users WHERE LOWER(email) = ?");
    $stmt->execute([strtolower($currentUser['email'])]);
    $user = $stmt->fetch();

    if (!$user || $user['password'] !== $oldPassword) {
        http_response_code(400);
        echo json_encode(["error" => "Current password verification failed"]);
        exit();
    }

    $update = $pdo->prepare("UPDATE users SET password = ? WHERE LOWER(email) = ?");
    $update->execute([$newPassword, strtolower($currentUser['email'])]);
    echo json_encode(["message" => "Password updated successfully"]);
    exit();
}

if ($route === 'api/kpis/configs' && $method === 'GET') {
    authenticate();
    $stmt = $pdo->query("SELECT * FROM kpi_configs");
    $rows = $stmt->fetchAll();
    $configs = [];
    foreach ($rows as $r) {
        if (!isset($configs[$r['user_id']])) $configs[$r['user_id']] = [];
        $configs[$r['user_id']][] = [
            "id" => (int)$r['metric_id'],
            "category" => $r['category'],
            "label" => $r['label'],
            "points" => (int)$r['points'],
            "weightage" => $r['weightage']
        ];
    }
    echo json_encode($configs);
    exit();
}

if ($route === 'api/kpis/submit' && $method === 'POST') {
    authenticate();
    $score = isset($input['score']) ? (int)$input['score'] : 0;
    $items = isset($input['items']) ? $input['items'] : [];
    $date = isset($input['date']) ? $input['date'] : '';

    if ($currentUser['role'] === 'Admin') {
        http_response_code(400);
        echo json_encode(["error" => "Administrators cannot submit daily KPIs"]);
        exit();
    }

    $submitDate = $date ? $date : date('Y-m-d');
    
    // Verification window (past 2 days)
    $submitTime = strtotime($submitDate);
    $todayStart = strtotime(date('Y-m-d'));
    $minAllowed = strtotime("-2 days", $todayStart);
    $maxAllowed = strtotime("+1 days", $todayStart);

    if ($submitTime < $minAllowed || $submitTime >= $maxAllowed) {
        http_response_code(400);
        echo json_encode(["error" => "Submissions are restricted to today and up to 2 days prior."]);
        exit();
    }

    try {
        $pdo->beginTransaction();
        
        // Upsert header
        $stmt = $pdo->prepare("
            INSERT INTO submissions (date, user_id, submitted_by, email, score) 
            VALUES (?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE score = VALUES(score), submitted_by = VALUES(submitted_by), email = VALUES(email)
        ");
        $stmt->execute([$submitDate, $currentUser['id'], $currentUser['name'], $currentUser['email'], $score]);

        // Delete items
        $del = $pdo->prepare("DELETE FROM submission_items WHERE date = ? AND user_id = ?");
        $del->execute([$submitDate, $currentUser['id']]);

        // Insert items
        if ($items) {
            $ins = $pdo->prepare("INSERT INTO submission_items (date, user_id, metric_id, qty, points, remarks) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($items as $metricId => $item) {
                $ins->execute([
                    $submitDate, 
                    $currentUser['id'], 
                    (int)$metricId, 
                    (int)$item['qty'], 
                    (int)$item['points'], 
                    isset($item['remarks']) ? $item['remarks'] : ''
                ]);
            }
        }

        $pdo->commit();
        echo json_encode(["message" => "KPI submitted successfully", "score" => $score]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(["error" => "Failed to submit KPI: " . $e->getMessage()]);
    }
    exit();
}

if ($route === 'api/kpis/leaderboard' && $method === 'GET') {
    authenticate();
    $currentMonth = date('Y-m');

    $users = $pdo->query("SELECT id, email, name, specialization FROM users WHERE role != 'Admin'")->fetchAll();
    $monthScores = [];
    foreach ($users as $u) {
        $monthScores[$u['id']] = [
            "id" => $u['id'],
            "email" => $u['email'],
            "name" => $u['name'],
            "specialization" => $u['specialization'],
            "score" => 0
        ];
    }

    $stmt = $pdo->prepare("SELECT user_id, SUM(score) as total_score FROM submissions WHERE date LIKE ? GROUP BY user_id");
    $stmt->execute([$currentMonth . '%']);
    $subs = $stmt->fetchAll();

    foreach ($subs as $s) {
        if (isset($monthScores[$s['user_id']])) {
            $monthScores[$s['user_id']]['score'] = (int)$s['total_score'];
        }
    }

    $sorted = array_values($monthScores);
    usort($sorted, function($a, $b) {
        return $b['score'] - $a['score'];
    });

    echo json_encode($sorted);
    exit();
}

if ($route === 'api/reports/daily' && $method === 'GET') {
    authenticate();
    $date = isset($_GET['date']) ? $_GET['date'] : '';
    if (!$date) {
        http_response_code(400);
        echo json_encode(["error" => "Date parameter is required"]);
        exit();
    }

    $stmt = $pdo->prepare("SELECT * FROM submissions WHERE date = ?");
    $stmt->execute([$date]);
    $subs = $stmt->fetchAll();

    $dayData = [];
    foreach ($subs as $sub) {
        $itemsStmt = $pdo->prepare("SELECT * FROM submission_items WHERE date = ? AND user_id = ?");
        $itemsStmt->execute([$date, $sub['user_id']]);
        $itemsRows = $itemsStmt->fetchAll();
        
        $itemsObj = [];
        foreach ($itemsRows as $i) {
            $itemsObj[$i['metric_id']] = [
                "qty" => (int)$i['qty'],
                "points" => (int)$i['points'],
                "remarks" => $i['remarks']
            ];
        }

        $dayData[$sub['user_id']] = [
            "submittedBy" => $sub['submitted_by'],
            "email" => $sub['email'],
            "score" => (int)$sub['score'],
            "items" => $itemsObj
        ];
    }
    echo json_encode($dayData);
    exit();
}

if ($route === 'api/reports/summary' && $method === 'GET') {
    authenticate();
    $mode = isset($_GET['mode']) ? $_GET['mode'] : 'all';
    $value = isset($_GET['value']) ? $_GET['value'] : '';

    $users = $pdo->query("SELECT id, email, name, specialization FROM users WHERE role != 'Admin'")->fetchAll();
    $reportMap = [];
    foreach ($users as $u) {
        $reportMap[$u['id']] = [
            "id" => $u['id'],
            "email" => $u['email'],
            "name" => $u['name'],
            "specialization" => $u['specialization'],
            "submissionsCount" => 0,
            "accumulatedPoints" => 0
        ];
    }

    $query = "SELECT user_id, COUNT(*) as subs_count, SUM(score) as total_pts FROM submissions";
    $params = [];

    if ($mode === 'month' && $value) {
        $query .= " WHERE date LIKE ?";
        $params[] = $value . '%';
    } elseif ($mode === 'day' && $value) {
        $query .= " WHERE date = ?";
        $params[] = $value;
    }
    $query .= " GROUP BY user_id";

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    foreach ($rows as $r) {
        if (isset($reportMap[$r['user_id']])) {
            $reportMap[$r['user_id']]['submissionsCount'] = (int)$r['subs_count'];
            $reportMap[$r['user_id']]['accumulatedPoints'] = (int)$r['total_pts'];
        }
    }

    $summaryList = array_values($reportMap);
    usort($summaryList, function($a, $b) {
        return $b['accumulatedPoints'] - $a['accumulatedPoints'];
    });

    echo json_encode($summaryList);
    exit();
}

// ---------------------------------------------------------
// ADMINISTRATIVE MANAGEMENT ENDPOINTS
// ---------------------------------------------------------
if ($route === 'api/admin/users' && $method === 'GET') {
    authenticate();
    requireAdmin();
    $users = $pdo->query("SELECT email, id, name, role, specialization FROM users")->fetchAll();
    echo json_encode($users);
    exit();
}

if ($route === 'api/admin/users' && $method === 'POST') {
    authenticate();
    requireAdmin();
    
    $email = isset($input['email']) ? trim($input['email']) : '';
    $name = isset($input['name']) ? trim($input['name']) : '';
    $role = isset($input['role']) ? trim($input['role']) : 'Consultant';
    $password = isset($input['password']) ? $input['password'] : '';
    $specialization = isset($input['specialization']) ? trim($input['specialization']) : '';

    if (!$email || !$name || !$role || !$password || !$specialization) {
        http_response_code(400);
        echo json_encode(["error" => "All fields are required"]);
        exit();
    }

    $cleanEmail = strtolower($email);

    $check = $pdo->prepare("SELECT email FROM users WHERE LOWER(email) = ?");
    $check->execute([$cleanEmail]);
    if ($check->fetch()) {
        http_response_code(400);
        echo json_encode(["error" => "A user with this email already exists"]);
        exit();
    }

    $userId = strtolower(preg_replace('/\s+/', '', $name));

    try {
        $pdo->beginTransaction();
        
        $ins = $pdo->prepare("INSERT INTO users (email, id, name, role, password, specialization) VALUES (?, ?, ?, ?, ?, ?)");
        $ins->execute([$cleanEmail, $userId, $name, $role, $password, $specialization]);

        // Auto initialize metrics config from template
        if ($role === 'Consultant') {
            $tmplStmt = $pdo->prepare("SELECT id FROM users WHERE role = 'Consultant' AND specialization = ? AND id != ? LIMIT 1");
            $tmplStmt->execute([$specialization, $userId]);
            $templateUser = $tmplStmt->fetch();

            if ($templateUser) {
                $metrics = $pdo->prepare("SELECT category, label, points, weightage FROM kpi_configs WHERE user_id = ?");
                $metrics->execute([$templateUser['id']]);
                $templateItems = $metrics->fetchAll();
            } else {
                $templateItems = [];
            }

            $confIns = $pdo->prepare("INSERT INTO kpi_configs (user_id, metric_id, category, label, points, weightage) VALUES (?, ?, ?, ?, ?, ?)");
            if (count($templateItems) > 0) {
                $idStart = rand(1000, 9999);
                foreach ($templateItems as $item) {
                    $confIns->execute([$userId, $idStart++, $item['category'], $item['label'], $item['points'], $item['weightage']]);
                }
            } else {
                $defaults = [
                    ["cat" => "Campaign Execution", "lbl" => "Meta, Google, LinkedIn Ads Setup & Optimization", "pts" => 10, "wt" => "25%"],
                    ["cat" => "SEO Implementation", "lbl" => "Keyword Research & Ranking Improvements", "pts" => 10, "wt" => "25%"],
                    ["cat" => "Website Management", "lbl" => "Landing Pages Created / Updates Done", "pts" => 10, "wt" => "25%"],
                    ["cat" => "Market Research", "lbl" => "Competitor Analysis & Digital Audits", "pts" => 10, "wt" => "25%"]
                ];
                $idStart = rand(1000, 9999);
                foreach ($defaults as $d) {
                    $confIns->execute([$userId, $idStart++, $d['cat'], $d['lbl'], $d['pts'], $d['wt']]);
                }
            }
        }

        $pdo->commit();
        echo json_encode(["message" => "User added successfully", "user" => ["email" => $cleanEmail, "name" => $name, "role" => $role]]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(["error" => "Failed to create user: " . $e->getMessage()]);
    }
    exit();
}

// Dynamic User PUT operations
if (preg_match('/^api\/admin\/users\/([^\/]+)$/', $route, $matches) && $method === 'PUT') {
    authenticate();
    requireAdmin();
    $email = urldecode($matches[1]);
    $cleanEmail = strtolower(trim($email));

    $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(email) = ?");
    $stmt->execute([$cleanEmail]);
    $user = $stmt->fetch();
    if (!$user) {
        http_response_code(404);
        echo json_encode(["error" => "User not found"]);
        exit();
    }

    $newName = isset($input['name']) ? trim($input['name']) : $user['name'];
    $newRole = isset($input['role']) ? trim($input['role']) : $user['role'];
    $newSpec = isset($input['specialization']) ? trim($input['specialization']) : $user['specialization'];
    $newPass = isset($input['password']) ? $input['password'] : $user['password'];

    $up = $pdo->prepare("UPDATE users SET name = ?, role = ?, specialization = ?, password = ? WHERE LOWER(email) = ?");
    $up->execute([$newName, $newRole, $newSpec, $newPass, $cleanEmail]);
    echo json_encode(["message" => "User updated successfully"]);
    exit();
}

if (preg_match('/^api\/admin\/users\/([^\/]+)$/', $route, $matches) && $method === 'DELETE') {
    authenticate();
    requireAdmin();
    $email = urldecode($matches[1]);
    
    $del = $pdo->prepare("DELETE FROM users WHERE LOWER(email) = ?");
    $del->execute([strtolower(trim($email))]);
    echo json_encode(["message" => "User account deleted"]);
    exit();
}

if (preg_match('/^api\/admin\/configs\/([^\/]+)$/', $route, $matches) && $method === 'PUT') {
    authenticate();
    requireAdmin();
    $userId = urldecode($matches[1]);
    $configsList = isset($input['configs']) ? $input['configs'] : [];

    if (!is_array($configsList)) {
        http_response_code(400);
        echo json_encode(["error" => "Configs list must be an array"]);
        exit();
    }

    try {
        $pdo->beginTransaction();
        
        $del = $pdo->prepare("DELETE FROM kpi_configs WHERE user_id = ?");
        $del->execute([$userId]);

        $ins = $pdo->prepare("INSERT INTO kpi_configs (user_id, metric_id, category, label, points, weightage) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($configsList as $item) {
            $metricId = isset($item['id']) && $item['id'] ? (int)$item['id'] : rand(1000, 9999);
            $points = isset($item['points']) ? (int)$item['points'] : 10;
            $ins->execute([$userId, $metricId, $item['category'], $item['label'], $points, isset($item['weightage']) ? $item['weightage'] : '']);
        }

        $pdo->commit();
        echo json_encode(["message" => "Configurations saved successfully"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(["error" => "Failed to save configs: " . $e->getMessage()]);
    }
    exit();
}

if ($route === 'api/admin/submissions' && $method === 'DELETE') {
    authenticate();
    requireAdmin();
    $date = isset($input['date']) ? $input['date'] : '';
    $userId = isset($input['userId']) ? $input['userId'] : '';

    if (!$date || !$userId) {
        http_response_code(400);
        echo json_encode(["error" => "Date and userId are required"]);
        exit();
    }

    try {
        $pdo->beginTransaction();
        $del1 = $pdo->prepare("DELETE FROM submission_items WHERE date = ? AND user_id = ?");
        $del1->execute([$date, $userId]);
        $del2 = $pdo->prepare("DELETE FROM submissions WHERE date = ? AND user_id = ?");
        $del2->execute([$date, $userId]);
        $pdo->commit();
        echo json_encode(["message" => "Submission voided successfully"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(["error" => "Failed to void submission: " . $e->getMessage()]);
    }
    exit();
}

if ($route === 'api/admin/audit-log' && $method === 'GET') {
    authenticate();
    requireAdmin();
    $date = isset($_GET['date']) ? $_GET['date'] : '';

    if (!$date) {
        http_response_code(400);
        echo json_encode(["error" => "Date parameter is required"]);
        exit();
    }

    $stmt = $pdo->prepare("
        SELECT si.date, si.user_id, si.metric_id, si.qty, si.points, si.remarks, s.submitted_by, s.email, kc.category, kc.label
        FROM submission_items si
        JOIN submissions s ON si.date = s.date AND si.user_id = s.user_id
        LEFT JOIN kpi_configs kc ON si.user_id = kc.user_id AND si.metric_id = kc.metric_id
        WHERE si.date = ?
    ");
    $stmt->execute([$date]);
    echo json_encode($stmt->fetchAll());
    exit();
}

if ($route === 'api/admin/monthly-trend' && $method === 'GET') {
    authenticate();
    requireAdmin();
    $currentMonth = date('Y-m');

    $stmt = $pdo->prepare("SELECT date, SUM(score) as daily_total FROM submissions WHERE date LIKE ? GROUP BY date ORDER BY date ASC");
    $stmt->execute([$currentMonth . '%']);
    $rows = $stmt->fetchAll();

    $trend = [];
    foreach ($rows as $r) {
        $trend[] = [
            "date" => date('d M', strtotime($r['date'])),
            "score" => (int)$r['daily_total']
        ];
    }
    echo json_encode($trend);
    exit();
}

// User-specific submissions query
if (preg_match('/^api\/admin\/users\/([^\/]+)\/submissions$/', $route, $matches) && $method === 'GET') {
    authenticate();
    requireAdmin();
    $userId = urldecode($matches[1]);
    $mode = isset($_GET['mode']) ? $_GET['mode'] : 'all';
    $value = isset($_GET['value']) ? $_GET['value'] : '';

    $query = "SELECT * FROM submissions WHERE user_id = ?";
    $params = [$userId];

    if ($mode === 'month' && $value) {
        $query .= " AND date LIKE ?";
        $params[] = $value . '%';
    } elseif ($mode === 'day' && $value) {
        $query .= " AND date = ?";
        $params[] = $value;
    }
    $query .= " ORDER BY date DESC";

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $subs = $stmt->fetchAll();

    $result = [];
    foreach ($subs as $sub) {
        $itemsStmt = $pdo->prepare("SELECT * FROM submission_items WHERE date = ? AND user_id = ?");
        $itemsStmt->execute([$sub['date'], $userId]);
        $itemsRows = $itemsStmt->fetchAll();

        $itemsObj = [];
        foreach ($itemsRows as $i) {
            $itemsObj[$i['metric_id']] = [
                "qty" => (int)$i['qty'],
                "points" => (int)$i['points'],
                "remarks" => $i['remarks']
            ];
        }

        $result[] = [
            "date" => $sub['date'],
            "score" => (int)$sub['score'],
            "items" => $itemsObj
        ];
    }
    echo json_encode($result);
    exit();
}

if ($route === 'api/admin/submissions/export' && $method === 'GET') {
    authenticate();
    requireAdmin();

    $stmt = $pdo->query("
        SELECT si.date, s.submitted_by as Name, s.email as Email, COALESCE(kc.label, si.metric_id) as Activity, si.qty as Quantity, si.points as 'Points Earned', si.remarks as Remarks
        FROM submission_items si
        JOIN submissions s ON si.date = s.date AND si.user_id = s.user_id
        LEFT JOIN kpi_configs kc ON si.user_id = kc.user_id AND si.metric_id = kc.metric_id
        ORDER BY si.date DESC
    ");
    echo json_encode($stmt->fetchAll());
    exit();
}

// Bulk excel rows import
if ($route === 'api/admin/submissions/bulk' && $method === 'POST') {
    authenticate();
    requireAdmin();

    $rows = isset($input['rows']) ? $input['rows'] : [];
    if (!is_array($rows)) {
        http_response_code(400);
        echo json_encode(["error" => "Rows array is required"]);
        exit();
    }

    $importedCount = 0;
    $skippedCount = 0;
    $errors = [];

    $usersList = $pdo->query("SELECT * FROM users")->fetchAll();
    $usersByEmail = [];
    foreach ($usersList as $u) {
        $usersByEmail[strtolower(trim($u['email']))] = $u;
    }

    try {
        $pdo->beginTransaction();

        foreach ($rows as $index => $row) {
            $date = isset($row['date']) ? $row['date'] : '';
            $email = isset($row['email']) ? $row['email'] : '';
            $activity = isset($row['activity']) ? $row['activity'] : '';
            $qty = isset($row['qty']) ? (int)$row['qty'] : 0;
            $remarks = isset($row['remarks']) ? $row['remarks'] : '';

            if (!$date || !$email || !$activity) {
                $skippedCount++;
                $errors[] = "Row " . ($index + 1) . ": Missing date, email, or activity name";
                continue;
            }

            $finalDate = trim($date);
            $cleanEmail = strtolower(trim($email));
            if (!isset($usersByEmail[$cleanEmail])) {
                $skippedCount++;
                $errors[] = "Row " . ($index + 1) . ": Consultant with email \"$email\" not found";
                continue;
            }
            $user = $usersByEmail[$cleanEmail];

            $matchedMetricStmt = $pdo->prepare("SELECT metric_id, points FROM kpi_configs WHERE user_id = ? AND LOWER(TRIM(label)) = ?");
            $matchedMetricStmt->execute([$user['id'], strtolower(trim($activity))]);
            $matchedMetric = $matchedMetricStmt->fetch();

            if (!$matchedMetric) {
                $skippedCount++;
                $errors[] = "Row " . ($index + 1) . ": Activity \"$activity\" not configured for " . $user['name'];
                continue;
            }

            if ($qty <= 0) {
                $skippedCount++;
                $errors[] = "Row " . ($index + 1) . ": Quantity must be greater than zero";
                continue;
            }

            $pointsEarned = $qty * $matchedMetric['points'];

            // Upsert header
            $header = $pdo->prepare("
                INSERT INTO submissions (date, user_id, submitted_by, email, score) 
                VALUES (?, ?, ?, ?, 0) 
                ON DUPLICATE KEY UPDATE submitted_by = VALUES(submitted_by)
            ");
            $header->execute([$finalDate, $user['id'], $user['name'], $cleanEmail]);

            // Insert item
            $insItem = $pdo->prepare("INSERT INTO submission_items (date, user_id, metric_id, qty, points, remarks) VALUES (?, ?, ?, ?, ?, ?)");
            $insItem->execute([$finalDate, $user['id'], (int)$matchedMetric['metric_id'], $qty, $pointsEarned, $remarks ? $remarks : "Imported historical log for $activity"]);

            // Recalculate score
            $sumStmt = $pdo->prepare("SELECT SUM(points) as total FROM submission_items WHERE date = ? AND user_id = ?");
            $sumStmt->execute([$finalDate, $user['id']]);
            $sumRow = $sumStmt->fetch();

            $upSub = $pdo->prepare("UPDATE submissions SET score = ? WHERE date = ? AND user_id = ?");
            $upSub->execute([(int)$sumRow['total'], $finalDate, $user['id']]);

            $importedCount++;
        }

        $pdo->commit();
        echo json_encode([
            "message" => "Successfully imported $importedCount record(s). Skipped $skippedCount record(s).",
            "importedCount" => $importedCount,
            "skippedCount" => $skippedCount,
            "errors" => $errors
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(["error" => "Bulk import failed: " . $e->getMessage()]);
    }
    exit();
}

// Fallback 404 for unknown API routes
http_response_code(404);
echo json_encode(["error" => "API Route Not Found"]);
exit();
