<?php
/**
 * Authentication and Role-Based Access Control (RBAC)
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/audit.php';

function isLoggedIn(): bool {
    return isset($_SESSION['user_id']) && !empty($_SESSION['user_id']);
}

function getCurrentUser(): ?array {
    if (!isLoggedIn()) return null;
    return [
        'id'    => $_SESSION['user_id'],
        'name'  => $_SESSION['user_name'] ?? 'User',
        'email' => $_SESSION['user_email'] ?? '',
        'role'  => $_SESSION['user_role'] ?? 'HR',
    ];
}

function requireLogin(): void {
    if (!isLoggedIn()) {
        header('Location: login.php');
        exit;
    }
}

function requireRole(array $allowedRoles): void {
    requireLogin();
    $user = getCurrentUser();
    if (!in_array($user['role'], $allowedRoles, true)) {
        http_response_code(403);
        die("<div style='font-family:sans-serif;padding:30px;background:#111;color:#fff;border-radius:12px;max-width:500px;margin:50px auto;border:1px solid #333;text-align:center;'>
            <h2 style='color:#f43f5e;'>403 Forbidden</h2>
            <p style='color:#aaa;font-size:14px;'>Your account role ({$user['role']}) does not have permission to view this section.</p>
            <a href='dashboard.php' style='display:inline-block;margin-top:15px;padding:10px 20px;background:#0284c7;color:#fff;text-decoration:none;border-radius:999px;font-size:12px;font-weight:bold;'>Return to Dashboard</a>
        </div>");
    }
}

function loginUser(PDO $pdo, string $email, string $password): array {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email AND is_active = 1 LIMIT 1");
    $stmt->execute(['email' => trim($email)]);
    $user = $stmt->fetch();

    if (!$user) {
        return ['success' => false, 'error' => 'Invalid email address or deactivated account.'];
    }

    if (!password_verify($password, $user['password_hash'])) {
        return ['success' => false, 'error' => 'Incorrect password.'];
    }

    // Regenerate session ID to prevent session fixation
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['user_name'] = $user['name'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['user_role'] = $user['role'];

    // Update last_login
    $updateStmt = $pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = :id");
    $updateStmt->execute(['id' => $user['id']]);

    // Log login audit
    logAudit($pdo, (int)$user['id'], $user['name'], 'LOGIN', 'User', (string)$user['id'], 'User signed in successfully', $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');

    return ['success' => true, 'user' => $user];
}

function logoutUser(PDO $pdo): void {
    if (isLoggedIn()) {
        $user = getCurrentUser();
        logAudit($pdo, (int)$user['id'], $user['name'], 'LOGOUT', 'User', (string)$user['id'], 'User logged out', $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
    }
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    session_destroy();
}
