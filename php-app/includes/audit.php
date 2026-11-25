<?php
/**
 * Append-Only Audit Logging
 */

function logAudit(
    PDO $pdo,
    ?int $userId,
    ?string $userName,
    string $action,
    string $entity,
    ?string $entityId = null,
    ?string $details = null,
    ?string $ipAddress = null
): void {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details, ip_address, created_at)
            VALUES (:user_id, :user_name, :action, :entity, :entity_id, :details, :ip_address, NOW())
        ");
        $stmt->execute([
            'user_id'    => $userId,
            'user_name'  => $userName,
            'action'     => $action,
            'entity'     => $entity,
            'entity_id'  => $entityId,
            'details'    => $details,
            'ip_address' => $ipAddress ?: ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'),
        ]);
    } catch (Exception $e) {
        error_log("Failed to write audit log: " . $e->getMessage());
    }
}
