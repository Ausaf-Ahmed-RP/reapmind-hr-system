<?php
/**
 * Core Application Functions & Helpers
 */

require_once __DIR__ . '/../config/db.php';

function sanitize(string $data): string {
    return htmlspecialchars(trim($data), ENT_QUOTES, 'UTF-8');
}

/**
 * Sequential Unique Candidate ID: RM-CAN-000101
 */
function getNextCandidateId(PDO $pdo): string {
    $stmt = $pdo->query("SELECT candidate_id FROM candidates ORDER BY id DESC LIMIT 1");
    $last = $stmt->fetchColumn();

    if (!$last) {
        return "RM-CAN-000101";
    }

    // Extract numerical sequence
    if (preg_match('/RM-CAN-(\d+)/', $last, $matches)) {
        $num = intval($matches[1]) + 1;
        return sprintf("RM-CAN-%06d", $num);
    }

    return "RM-CAN-000101";
}

function createNotification(
    PDO $pdo,
    int $userId,
    ?int $candidateId,
    string $title,
    string $message,
    string $type
): void {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO notifications (user_id, candidate_id, title, message, type, is_read, created_at)
            VALUES (:user_id, :candidate_id, :title, :message, :type, 0, NOW())
        ");
        $stmt->execute([
            'user_id'      => $userId,
            'candidate_id' => $candidateId,
            'title'        => $title,
            'message'      => $message,
            'type'         => $type,
        ]);
    } catch (Exception $e) {
        error_log("Notification error: " . $e->getMessage());
    }
}

function broadcastNotification(
    PDO $pdo,
    array $targetRoles,
    ?int $candidateId,
    string $title,
    string $message,
    string $type
): void {
    if (empty($targetRoles)) return;
    $placeholders = implode(',', array_fill(0, count($targetRoles), '?'));
    $stmt = $pdo->prepare("SELECT id FROM users WHERE role IN ($placeholders) AND is_active = 1");
    $stmt->execute($targetRoles);
    $users = $stmt->fetchAll(PDO::FETCH_COLUMN);

    foreach ($users as $uid) {
        createNotification($pdo, (int)$uid, $candidateId, $title, $message, $type);
    }
}

function getUnreadNotificationCount(PDO $pdo, int $userId): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND is_read = 0");
    $stmt->execute(['uid' => $userId]);
    return (int)$stmt->fetchColumn();
}

function timeAgo(string $datetime): string {
    $time = strtotime($datetime);
    $diff = time() - $time;
    if ($diff < 60) return "Just now";
    if ($diff < 3600) return floor($diff / 60) . "m ago";
    if ($diff < 86400) return floor($diff / 3600) . "h ago";
    if ($diff < 604800) return floor($diff / 86400) . "d ago";
    return date("M j, Y", $time);
}
