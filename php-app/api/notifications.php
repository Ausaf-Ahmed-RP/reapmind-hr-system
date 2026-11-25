<?php
/**
 * Notifications API
 */
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';

requireAuth();
$currentUser = getCurrentUser();

$action = $_GET['action'] ?? $_POST['action'] ?? 'list';

if ($action === 'mark_all_read') {
    $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = :uid");
    $stmt->execute(['uid' => (int)$currentUser['id']]);
    echo json_encode(['success' => true]);
    exit;
}

// Default: fetch latest notifications
$stmt = $pdo->prepare("
    SELECT * FROM notifications 
    WHERE user_id = :uid 
    ORDER BY id DESC 
    LIMIT 20
");
$stmt->execute(['uid' => (int)$currentUser['id']]);
$notifs = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(['notifications' => $notifs]);
