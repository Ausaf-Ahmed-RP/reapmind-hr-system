# ReapMind Innovations — HR Operations System (PHP + MySQL)
### Tailored for Cloudways Hosting

This directory (`php-app/`) contains the complete, production-ready PHP + MySQL edition of the **ReapMind HR Operations System**, configured with zero-Composer dependencies for drag-and-drop or Git deployment to **Cloudways**.

---

## 🚀 Cloudways Deployment Guide

### Step 1: Create or Select Application in Cloudways
1. Log in to your **Cloudways Console**.
2. Select your **Server** and add a **Custom PHP Application** (or choose your existing PHP application).
3. Select **PHP 8.1, 8.2, or 8.3**.

---

### Step 2: Import the Database
1. In Cloudways, go to **Application Management** > **Access Details**.
2. Click **Launch Database Manager** (phpMyAdmin / Cloudways DB Manager).
3. Select your application database.
4. Go to the **Import** tab:
   - Import `schema.sql` (Creates all 10 core tables: candidates, candidate_files, users, etc.).
   - Import `seed.sql` (Creates 8 staff accounts, master classification lists, and settings).

---

### Step 3: Configure Database Credentials
Open `config/db.php` on your server (via Cloudways File Manager, SSH, or SFTP):

```php
$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: '3306';
$db   = getenv('DB_NAME') ?: 'YOUR_CLOUDWAYS_DB_NAME';
$user = getenv('DB_USER') ?: 'YOUR_CLOUDWAYS_DB_USER';
$pass = getenv('DB_PASS') ?: 'YOUR_CLOUDWAYS_DB_PASSWORD';
```
Fill in the values from your Cloudways **Access Details** screen.

---

### Step 4: Deploy Files to `public_html/`
Copy or git pull all files from `php-app/` into the `public_html/` directory of your Cloudways application:
- `apply.php` -> `https://your-domain.com/apply.php` (Student Walk-in Kiosk)
- `login.php` -> `https://your-domain.com/login.php` (Staff Login)
- `dashboard.php` -> `https://your-domain.com/dashboard.php` (HR Operations Dashboard)
- `candidate.php` -> `https://your-domain.com/candidate.php?id=X` (Candidate Profile & Google Drive Fullscreen Viewer)
- `intake.php` -> `https://your-domain.com/intake.php` (Front Desk Intake Desk)
- `admin.php` -> `https://your-domain.com/admin.php` (Admin & DPDP Audit Trail)
- `download.php` -> `https://your-domain.com/download.php` (Secure document streaming)

Ensure the `uploads/` directory has write permissions:
```bash
chmod -R 755 uploads
```

---

## 🔐 Default Staff Accounts (from `seed.sql`)

| Name | Role | Email | Password |
|------|------|-------|----------|
| **Aditi Sharma** | `FRONT_DESK` | `aditi@reapmind.com` | `Password@123` |
| **Kavita Desai** | `FRONT_DESK` | `kavita@reapmind.com` | `Password@123` |
| **Rohan Joshi** | `INTERVIEWER` | `rohan@reapmind.com` | `Password@123` |
| **Sneha Patil** | `INTERVIEWER` | `sneha@reapmind.com` | `Password@123` |
| **Vikram Kulkarni** | `INTERVIEWER` | `vikram@reapmind.com` | `Password@123` |
| **Pooja Shinde** | `HR_OPS` | `pooja@reapmind.com` | `Password@123` |
| **Ananya Rao** | `HR_HEAD` | `ananya@reapmind.com` | `Password@123` |
| **System Admin** | `ADMIN` | `admin@reapmind.com` | `Password@123` |

*(Users can also quick-switch during login using the one-click evaluation switcher on `login.php`).*

---

## ✨ Solved Bugs & Enhanced Capabilities

1. **Dual Document Support (Resume File + Camera Scans)**:
   - When a candidate or front desk uploads a resume file AND takes camera snapshots, both are saved simultaneously without overwriting.
   - Generates individual high-res image pages and a consolidated PDF scan bundle.

2. **Separate Tabs & Google Drive Fullscreen Preview**:
   - In `candidate.php`, HR views documents in two distinct tabs:
     - **Tab 1: Uploaded Resume (PDF / Doc)**
     - **Tab 2: Camera Snapshots & Scans** (with thumbnails and page badges)
   - Clicking **Fullscreen** opens a 100% viewport modal identical to Google Drive:
     - Zoom In (`+`), Zoom Out (`-`), Fit/Reset
     - Rotate 90° Clockwise
     - Direct Download button
     - Keyboard navigation (`Esc` to close, `+`/`-` to zoom, `r` to rotate).

3. **15-Minute Edit Grace Period & Addendum Versions**:
   - Interviewers can edit their evaluation within 15 minutes of submission.
   - After 15 minutes, subsequent edits are preserved as immutable versioned addendums in `feedback_versions`.

4. **Front Desk Access Control**:
   - Front Desk role is strictly barred from viewing or editing interview feedback.

5. **DPDP Act 2023 Compliance**:
   - Voluntary consent flag recorded at check-in.
   - Append-only immutable audit trail tracks every `RESUME_VIEW`, `RESUME_DOWNLOAD`, `FEEDBACK_SUBMITTED`, and `CANDIDATE_CREATED` action with actor ID and IP address.
