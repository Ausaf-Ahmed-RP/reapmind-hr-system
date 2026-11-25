-- ====================================================================
-- ReapMind HR Operations System - Seed Data
-- ====================================================================

-- 1. Default Users (Password: Password@123)
-- Password Hash: $2y$10$K4rO5c6T1EaG5ZkX1z2Vhe2Wj7uG8n3Xk2lM9p4Q7r6S5t4U3v2W1
INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `mobile`, `is_active`) VALUES
(1, 'Front Desk Executive', 'frontdesk@reapmind.com', '$2y$10$1MhC3H3WdG2V9uO0m.vWJOG0VlhQ37lD5q34F7RkgD5R5H9k8F7C6', 'FRONT_DESK', '9876543201', 1),
(2, 'Aayushi', 'aayushi@reapmind.com', '$2y$10$1MhC3H3WdG2V9uO0m.vWJOG0VlhQ37lD5q34F7RkgD5R5H9k8F7C6', 'HR', '9876543202', 1),
(3, 'Hema', 'hema@reapmind.com', '$2y$10$1MhC3H3WdG2V9uO0m.vWJOG0VlhQ37lD5q34F7RkgD5R5H9k8F7C6', 'HR', '9876543203', 1),
(4, 'Mahwash', 'mahwash@reapmind.com', '$2y$10$1MhC3H3WdG2V9uO0m.vWJOG0VlhQ37lD5q34F7RkgD5R5H9k8F7C6', 'HR', '9876543204', 1),
(5, 'HR Lead', 'hrlead@reapmind.com', '$2y$10$1MhC3H3WdG2V9uO0m.vWJOG0VlhQ37lD5q34F7RkgD5R5H9k8F7C6', 'HR', '9876543205', 1),
(6, 'Aroof (Director)', 'aroof@reapmind.com', '$2y$10$1MhC3H3WdG2V9uO0m.vWJOG0VlhQ37lD5q34F7RkgD5R5H9k8F7C6', 'DIRECTOR', '9876543206', 1),
(7, 'CEO', 'ceo@reapmind.com', '$2y$10$1MhC3H3WdG2V9uO0m.vWJOG0VlhQ37lD5q34F7RkgD5R5H9k8F7C6', 'CEO', '9876543207', 1),
(8, 'System Admin', 'admin@reapmind.com', '$2y$10$1MhC3H3WdG2V9uO0m.vWJOG0VlhQ37lD5q34F7RkgD5R5H9k8F7C6', 'ADMIN', '9876543208', 1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- 2. Master Lists (Positions)
INSERT INTO `master_lists` (`category`, `label`, `value`, `is_active`, `sort_order`) VALUES
('POSITION', 'Full Stack Developer', 'Full Stack Developer', 1, 0),
('POSITION', 'Frontend Developer', 'Frontend Developer', 1, 1),
('POSITION', 'Backend Developer', 'Backend Developer', 1, 2),
('POSITION', 'React Native Developer', 'React Native Developer', 1, 3),
('POSITION', 'QA Automation Engineer', 'QA Automation Engineer', 1, 4),
('POSITION', 'UI/UX Designer', 'UI/UX Designer', 1, 5),
('POSITION', 'DevOps Engineer', 'DevOps Engineer', 1, 6),
('POSITION', 'HR Operations Executive', 'HR Operations Executive', 1, 7),
('POSITION', 'Software Engineering Intern', 'Software Engineering Intern', 1, 8);

-- 3. Master Lists (Sources)
INSERT INTO `master_lists` (`category`, `label`, `value`, `is_active`, `sort_order`) VALUES
('SOURCE', 'Walk-in', 'Walk-in', 1, 0),
('SOURCE', 'Referral', 'Referral', 1, 1),
('SOURCE', 'Job portal', 'Job portal', 1, 2),
('SOURCE', 'Consultant', 'Consultant', 1, 3),
('SOURCE', 'Other', 'Other', 1, 4);

-- 4. Master Lists (Interview Rounds)
INSERT INTO `master_lists` (`category`, `label`, `value`, `is_active`, `sort_order`) VALUES
('ROUND', 'Screening', 'Screening', 1, 0),
('ROUND', 'Technical', 'Technical', 1, 1),
('ROUND', 'HR', 'HR', 1, 2),
('ROUND', 'Final', 'Final', 1, 3);

-- 5. Master Lists (Candidate Statuses)
INSERT INTO `master_lists` (`category`, `label`, `value`, `is_active`, `sort_order`) VALUES
('STATUS', 'New', 'New', 1, 0),
('STATUS', 'Assigned', 'Assigned', 1, 1),
('STATUS', 'Interview Pending', 'Interview Pending', 1, 2),
('STATUS', 'Interviewed', 'Interviewed', 1, 3),
('STATUS', 'Shortlisted', 'Shortlisted', 1, 4),
('STATUS', 'On Hold', 'On Hold', 1, 5),
('STATUS', 'Rejected', 'Rejected', 1, 6);

-- 6. System Settings
INSERT INTO `system_settings` (`key_name`, `value_text`) VALUES
('FRONT_DESK_ASSIGNMENT_ALLOWED', 'false'),
('SESSION_TIMEOUT_MINUTES', '30'),
('FEEDBACK_EDIT_WINDOW_MINUTES', '15'),
('FRONT_DESK_EDIT_WINDOW_MINUTES', '30'),
('RETENTION_PERIOD_MONTHS', '12')
ON DUPLICATE KEY UPDATE `value_text`=VALUES(`value_text`);
