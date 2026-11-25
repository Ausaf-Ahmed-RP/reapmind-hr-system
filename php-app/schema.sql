-- ====================================================================
-- ReapMind HR Operations System - MySQL Database Schema
-- Compatible with MySQL 5.7+, MySQL 8.0+, MariaDB 10.3+ (Cloudways)
-- ====================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `feedback_versions`;
DROP TABLE IF EXISTS `interview_feedbacks`;
DROP TABLE IF EXISTS `assignments`;
DROP TABLE IF EXISTS `candidate_files`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `candidates`;
DROP TABLE IF EXISTS `system_settings`;
DROP TABLE IF EXISTS `master_lists`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Users Table
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('FRONT_DESK', 'HR', 'DIRECTOR', 'CEO', 'ADMIN') NOT NULL DEFAULT 'HR',
  `mobile` VARCHAR(20) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Candidates Table
CREATE TABLE `candidates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `candidate_id` VARCHAR(50) NOT NULL UNIQUE, -- e.g. RM-CAN-000101
  `full_name` VARCHAR(200) NOT NULL,
  `mobile` VARCHAR(20) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `position` VARCHAR(150) NOT NULL,
  `college` VARCHAR(200) NULL,
  `passing_year` VARCHAR(100) NULL,
  `location` VARCHAR(150) NULL,
  `source` VARCHAR(100) NOT NULL DEFAULT 'Walk-in',
  `status` VARCHAR(50) NOT NULL DEFAULT 'New', -- New, Assigned, Interview Pending, Interviewed, Shortlisted, On Hold, Rejected
  `remarks` TEXT NULL,
  `consent_flag` TINYINT(1) NOT NULL DEFAULT 1,
  `uploaded_by_id` INT NOT NULL,
  `assigned_to_id` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_cand_uploader` FOREIGN_KEY (`uploaded_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cand_assigned` FOREIGN_KEY (`assigned_to_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_cand_mobile` (`mobile`),
  INDEX `idx_cand_status` (`status`),
  INDEX `idx_cand_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Candidate Files Table
CREATE TABLE `candidate_files` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `candidate_id` INT NOT NULL,
  `file_type` ENUM('RESUME', 'CAMERA_PAGE', 'SCANNED_DOC', 'DOCUMENT') NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `file_size` INT NOT NULL,
  `page_number` INT NULL,
  `uploaded_by_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_cfile_candidate` FOREIGN_KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cfile_uploader` FOREIGN_KEY (`uploaded_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_cfile_cand_type` (`candidate_id`, `file_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Assignments History Table
CREATE TABLE `assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `candidate_id` INT NOT NULL,
  `assigned_to_id` INT NOT NULL,
  `assigned_by_id` INT NOT NULL,
  `round` VARCHAR(50) NOT NULL DEFAULT 'Screening',
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_assign_candidate` FOREIGN_KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assign_to` FOREIGN_KEY (`assigned_to_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assign_by` FOREIGN_KEY (`assigned_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Interview Feedbacks Table (Zero Deletions Allowed)
CREATE TABLE `interview_feedbacks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `candidate_id` INT NOT NULL,
  `interviewer_id` INT NOT NULL,
  `interviewer_name` VARCHAR(150) NOT NULL,
  `round` VARCHAR(50) NOT NULL, -- Screening, Technical, HR, Final
  `interview_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `rating` INT NOT NULL, -- 1 to 5
  `recommendation` ENUM('Select', 'Hold', 'Reject', 'Next round') NOT NULL,
  `comments` TEXT NOT NULL,
  `strengths` TEXT NULL,
  `concerns` TEXT NULL,
  `expected_ctc` VARCHAR(100) NULL,
  `notice_period` VARCHAR(100) NULL,
  `version` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `edited_at` DATETIME NULL,
  CONSTRAINT `fk_fb_candidate` FOREIGN_KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fb_interviewer` FOREIGN_KEY (`interviewer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_fb_cand` (`candidate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Feedback Versions Table (Version History & Addendums)
CREATE TABLE `feedback_versions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `feedback_id` INT NOT NULL,
  `version_number` INT NOT NULL,
  `previous_comments` TEXT NOT NULL,
  `edited_by_id` INT NOT NULL,
  `edited_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_fbv_feedback` FOREIGN_KEY (`feedback_id`) REFERENCES `interview_feedbacks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fbv_user` FOREIGN_KEY (`edited_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Notifications Table
CREATE TABLE `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `candidate_id` INT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `type` VARCHAR(50) NOT NULL, -- NEW_CANDIDATE, ASSIGNED, FEEDBACK, STATUS_CHANGE
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_notif_user` FOREIGN_KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_candidate` FOREIGN_KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE SET NULL,
  INDEX `idx_notif_user_read` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Audit Logs Table (Append-Only)
CREATE TABLE `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `user_name` VARCHAR(150) NULL,
  `action` VARCHAR(100) NOT NULL, -- LOGIN, CANDIDATE_INTAKE, RESUME_VIEW, RESUME_DOWNLOAD, ASSIGNMENT, FEEDBACK_ADDED, FEEDBACK_EDITED, STATUS_CHANGED, USER_MANAGED, SETTINGS_CHANGED
  `entity` VARCHAR(100) NOT NULL,
  `entity_id` VARCHAR(100) NULL,
  `details` TEXT NULL,
  `ip_address` VARCHAR(50) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_audit_user` FOREIGN_KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_audit_action` (`action`),
  INDEX `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Master Lists Table
CREATE TABLE `master_lists` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category` ENUM('POSITION', 'SOURCE', 'STATUS', 'ROUND') NOT NULL,
  `label` VARCHAR(150) NOT NULL,
  `value` VARCHAR(150) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  INDEX `idx_ml_cat_active` (`category`, `is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. System Settings Table
CREATE TABLE `system_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key_name` VARCHAR(100) NOT NULL UNIQUE,
  `value_text` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
