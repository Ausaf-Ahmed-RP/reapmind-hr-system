<?php
/**
 * ReapMind HR Operations System
 * Database Configuration (PDO MySQL)
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Database Credentials (Can be configured or read from Cloudways environment)
$db_host = getenv('DB_HOST') ?: 'localhost';
$db_name = getenv('DB_NAME') ?: 'reapmind_hr';
$db_user = getenv('DB_USER') ?: 'root';
$db_pass = getenv('DB_PASS') ?: '';
$db_port = getenv('DB_PORT') ?: '3306';

try {
    $dsn = "mysql:host={$db_host};port={$db_port};dbname={$db_name};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, $db_user, $db_pass, $options);
} catch (PDOException $e) {
    // Return friendly error if database not connected yet
    die("<div style='font-family:sans-serif;padding:30px;background:#111;color:#fff;border-radius:12px;max-width:600px;margin:50px auto;border:1px solid #333;text-align:center;'>
        <h2 style='color:#ef4444;'>Database Connection Failed</h2>
        <p style='color:#bbb;font-size:14px;line-height:1.6;'>Please ensure your MySQL database is created on Cloudways and update your credentials in <code>config/db.php</code> or environment variables.</p>
        <p style='color:#666;font-size:12px;font-family:monospace;'>Error: " . htmlspecialchars($e->getMessage()) . "</p>
    </div>");
}
