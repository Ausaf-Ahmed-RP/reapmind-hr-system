<?php
/**
 * Secure Document Streamer & Downloader
 * ReapMind Innovations HR System
 */
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/audit.php';

requireAuth();
$currentUser = getCurrentUser();

$fileId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$mode   = ($_GET['mode'] ?? 'inline') === 'download' ? 'download' : 'inline';

if ($fileId <= 0) {
    http_response_code(400);
    die("Invalid file ID.");
}

$stmt = $pdo->prepare("
    SELECT cf.*, c.candidate_id as cand_code, c.full_name as cand_name 
    FROM candidate_files cf
    JOIN candidates c ON c.id = cf.candidate_id
    WHERE cf.id = :id
    LIMIT 1
");
$stmt->execute(['id' => $fileId]);
$file = $stmt->fetch();

if (!$file) {
    http_response_code(404);
    die("Document record not found.");
}

$filePath = __DIR__ . '/' . ltrim($file['file_path'], '/\\');

if (!file_exists($filePath)) {
    http_response_code(404);
    die("File content missing on server: " . htmlspecialchars($file['file_name']));
}

// Log audit trail
$action = ($mode === 'download') ? 'RESUME_DOWNLOAD' : 'RESUME_VIEW';
logAudit(
    $pdo,
    (int)$currentUser['id'],
    $action,
    'CANDIDATE_FILE',
    (string)$fileId,
    "User {$currentUser['name']} accessed document '{$file['file_name']}' for candidate {$file['cand_code']} ({$file['cand_name']}) in $mode mode."
);

$mimeType = $file['mime_type'] ?: 'application/octet-stream';
$fileName = $file['file_name'];
$fileSize = filesize($filePath);

// Clean any previous output
if (ob_get_level()) {
    ob_end_clean();
}

header('Content-Type: ' . $mimeType);
header('Content-Length: ' . $fileSize);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=3600, must-revalidate');

if ($mode === 'download') {
    header('Content-Disposition: attachment; filename="' . addslashes($fileName) . '"');
} else {
    header('Content-Disposition: inline; filename="' . addslashes($fileName) . '"');
}

readfile($filePath);
exit;
