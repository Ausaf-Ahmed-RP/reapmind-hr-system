<?php
/**
 * Real-time Duplicate Check API
 */
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';

$mobile = trim($_GET['mobile'] ?? '');
$cleanMobile = substr(preg_replace('/\D/', '', $mobile), -10);

if (strlen($cleanMobile) !== 10) {
    echo json_encode(['exists' => false, 'message' => 'Invalid mobile number']);
    exit;
}

$stmt = $pdo->prepare("
    SELECT id, candidate_id, full_name, email, position, status, created_at 
    FROM candidates 
    WHERE mobile = :mobile 
    ORDER BY id DESC 
    LIMIT 1
");
$stmt->execute(['mobile' => $cleanMobile]);
$candidate = $stmt->fetch();

if ($candidate) {
    echo json_encode([
        'exists' => true,
        'candidate' => [
            'id'           => $candidate['id'],
            'candidate_id' => $candidate['candidate_id'],
            'full_name'    => $candidate['full_name'],
            'email'        => $candidate['email'],
            'position'     => $candidate['position'],
            'status'       => $candidate['status'],
            'created_at'   => date('d M Y, h:i A', strtotime($candidate['created_at']))
        ]
    ]);
} else {
    echo json_encode(['exists' => false]);
}
