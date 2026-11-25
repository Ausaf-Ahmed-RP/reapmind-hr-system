<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/audit.php';

requireAuth();
$currentUser = getCurrentUser();

$candId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($candId <= 0) {
    header("Location: dashboard.php");
    exit;
}

// Fetch Candidate details
$stmt = $pdo->prepare("
    SELECT c.*, u_up.name as uploaded_by_name,
           a.interviewer_id, u_int.name as interviewer_name, a.assigned_at
    FROM candidates c
    LEFT JOIN users u_up ON u_up.id = c.uploaded_by_id
    LEFT JOIN assignments a ON a.candidate_id = c.id AND a.is_active = 1
    LEFT JOIN users u_int ON u_int.id = a.interviewer_id
    WHERE c.id = :id
    LIMIT 1
");
$stmt->execute(['id' => $candId]);
$candidate = $stmt->fetch();

if (!$candidate) {
    header("Location: dashboard.php?error=not_found");
    exit;
}

$pageTitle = htmlspecialchars($candidate['full_name']) . " (" . htmlspecialchars($candidate['candidate_id']) . ") | ReapMind HR";

$msg = null;
$error = null;

// Handle Feedback Submission & Re-assignment
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    // Interview Feedback Submission (Restricted for Front Desk)
    if ($action === 'submit_feedback' && $currentUser['role'] !== 'FRONT_DESK') {
        $techRating   = (int)($_POST['technical_rating'] ?? 0);
        $commRating   = (int)($_POST['communication_rating'] ?? 0);
        $fitRating    = (int)($_POST['cultural_fit_rating'] ?? 0);
        $overallScore = (int)($_POST['overall_rating'] ?? 0);
        $recommend    = trim($_POST['recommendation'] ?? '');
        $comments     = trim($_POST['comments'] ?? '');
        $currentCtc   = !empty($_POST['current_ctc']) ? floatval($_POST['current_ctc']) : null;
        $expectedCtc  = !empty($_POST['expected_ctc']) ? floatval($_POST['expected_ctc']) : null;
        $noticePeriod = !empty($_POST['notice_period_days']) ? (int)$_POST['notice_period_days'] : null;

        if (empty($recommend)) {
            $error = "Please choose a hiring recommendation.";
        } elseif (strlen($comments) < 20) {
            $error = "Mandatory comments must be at least 20 characters in length.";
        } else {
            // Check existing feedback
            $fbStmt = $pdo->prepare("SELECT * FROM interview_feedbacks WHERE candidate_id = :cid LIMIT 1");
            $fbStmt->execute(['cid' => $candId]);
            $existingFb = $fbStmt->fetch();

            $pdo->beginTransaction();
            try {
                if (!$existingFb) {
                    // Fresh feedback creation
                    $ins = $pdo->prepare("
                        INSERT INTO interview_feedbacks 
                        (candidate_id, interviewer_id, technical_rating, communication_rating, cultural_fit_rating, overall_rating, recommendation, comments, current_ctc, expected_ctc, notice_period_days, submitted_at, updated_at)
                        VALUES 
                        (:cid, :uid, :tr, :cr, :fr, :ov, :rec, :comm, :cctc, :ectc, :np, NOW(), NOW())
                    ");
                    $ins->execute([
                        'cid'  => $candId,
                        'uid'  => (int)$currentUser['id'],
                        'tr'   => $techRating,
                        'cr'   => $commRating,
                        'fr'   => $fitRating,
                        'ov'   => $overallScore,
                        'rec'  => $recommend,
                        'comm' => $comments,
                        'cctc' => $currentCtc,
                        'ectc' => $expectedCtc,
                        'np'   => $noticePeriod,
                    ]);

                    // Update candidate status
                    $newStatus = ($recommend === 'Strong Hire' || $recommend === 'Hire') ? 'Interviewed' : (($recommend === 'Reject') ? 'Rejected' : 'Interviewed');
                    $pdo->prepare("UPDATE candidates SET status = :st, updated_at = NOW() WHERE id = :cid")->execute(['st' => $newStatus, 'cid' => $candId]);

                    logAudit($pdo, (int)$currentUser['id'], 'FEEDBACK_SUBMITTED', 'FEEDBACK', (string)$candId, "Evaluation submitted: Recommendation '$recommend', Rating $overallScore/5");
                    $msg = "Interview evaluation submitted successfully.";
                } else {
                    // Check 15-minute grace period
                    $submittedTime = strtotime($existingFb['submitted_at']);
                    $minutesDiff   = (time() - $submittedTime) / 60;

                    if ($minutesDiff <= 15 && $existingFb['interviewer_id'] == $currentUser['id']) {
                        // In grace period: In-place update
                        $upd = $pdo->prepare("
                            UPDATE interview_feedbacks
                            SET technical_rating = :tr, communication_rating = :cr, cultural_fit_rating = :fr, 
                                overall_rating = :ov, recommendation = :rec, comments = :comm, 
                                current_ctc = :cctc, expected_ctc = :ectc, notice_period_days = :np, updated_at = NOW()
                            WHERE id = :id
                        ");
                        $upd->execute([
                            'tr'   => $techRating,
                            'cr'   => $commRating,
                            'fr'   => $fitRating,
                            'ov'   => $overallScore,
                            'rec'  => $recommend,
                            'comm' => $comments,
                            'cctc' => $currentCtc,
                            'ectc' => $expectedCtc,
                            'np'   => $noticePeriod,
                            'id'   => $existingFb['id'],
                        ]);
                        logAudit($pdo, (int)$currentUser['id'], 'FEEDBACK_UPDATED', 'FEEDBACK', (string)$candId, "Feedback updated within 15-min grace period.");
                        $msg = "Evaluation updated successfully within grace period.";
                    } else {
                        // After 15 minutes: Append to feedback_versions
                        $nextVer = (int)$pdo->query("SELECT IFNULL(MAX(version_number), 1) + 1 FROM feedback_versions WHERE feedback_id = {$existingFb['id']}")->fetchColumn();
                        $addendum = $pdo->prepare("
                            INSERT INTO feedback_versions
                            (feedback_id, version_number, overall_rating, recommendation, comments, edited_by_id, created_at)
                            VALUES
                            (:fid, :ver, :ov, :rec, :comm, :uid, NOW())
                        ");
                        $addendum->execute([
                            'fid'  => $existingFb['id'],
                            'ver'  => $nextVer,
                            'ov'   => $overallScore,
                            'rec'  => $recommend,
                            'comm' => $comments,
                            'uid'  => (int)$currentUser['id'],
                        ]);

                        // Also reflect latest state in primary row
                        $pdo->prepare("UPDATE interview_feedbacks SET overall_rating = :ov, recommendation = :rec, comments = :comm, updated_at = NOW() WHERE id = :id")->execute([
                            'ov'   => $overallScore,
                            'rec'  => $recommend,
                            'comm' => $comments,
                            'id'   => $existingFb['id'],
                        ]);

                        logAudit($pdo, (int)$currentUser['id'], 'FEEDBACK_AMENDED', 'FEEDBACK', (string)$candId, "Feedback addendum version #$nextVer added after 15-min lock.");
                        $msg = "Versioned evaluation addendum #$nextVer recorded.";
                    }
                }
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                $error = "Error saving feedback: " . $e->getMessage();
            }
        }
    }

    // Interviewer Reassignment
    if ($action === 'reassign_interviewer') {
        $interviewerId = !empty($_POST['interviewer_id']) ? (int)$_POST['interviewer_id'] : null;
        $pdo->prepare("UPDATE assignments SET is_active = 0 WHERE candidate_id = :cid")->execute(['cid' => $candId]);
        if ($interviewerId) {
            $pdo->prepare("INSERT INTO assignments (candidate_id, interviewer_id, assigned_by_id, is_active, assigned_at) VALUES (:cid, :iid, :uid, 1, NOW())")
                ->execute(['cid' => $candId, 'iid' => $interviewerId, 'uid' => (int)$currentUser['id']]);
            $pdo->prepare("UPDATE candidates SET status = 'Assigned' WHERE id = :cid AND status = 'New'")->execute(['cid' => $candId]);
            createNotification($pdo, $interviewerId, $candId, 'Candidate Assigned', "Candidate {$candidate['candidate_id']} assigned for interview.", 'ASSIGNMENT');
        }
        logAudit($pdo, (int)$currentUser['id'], 'INTERVIEWER_REASSIGNED', 'CANDIDATE', (string)$candId, "Interviewer assignment modified.");
        header("Location: candidate.php?id=$candId&msg=reassigned");
        exit;
    }
}

// Fetch candidate files separated by type
$resumesStmt = $pdo->prepare("SELECT * FROM candidate_files WHERE candidate_id = :cid AND file_type = 'RESUME' ORDER BY id ASC");
$resumesStmt->execute(['cid' => $candId]);
$resumeFiles = $resumesStmt->fetchAll();

$scansStmt = $pdo->prepare("SELECT * FROM candidate_files WHERE candidate_id = :cid AND file_type = 'DOCUMENT_SCAN' ORDER BY id ASC");
$scansStmt->execute(['cid' => $candId]);
$scanFiles = $scansStmt->fetchAll();

// Fetch Interview Feedback & Versions
$feedbackStmt = $pdo->prepare("
    SELECT f.*, u.name as interviewer_name, u.role as interviewer_role
    FROM interview_feedbacks f
    JOIN users u ON u.id = f.interviewer_id
    WHERE f.candidate_id = :cid
    LIMIT 1
");
$feedbackStmt->execute(['cid' => $candId]);
$feedback = $feedbackStmt->fetch();

$versions = [];
if ($feedback) {
    $vStmt = $pdo->prepare("
        SELECT v.*, u.name as edited_by_name
        FROM feedback_versions v
        JOIN users u ON u.id = v.edited_by_id
        WHERE v.feedback_id = :fid
        ORDER BY v.version_number DESC
    ");
    $vStmt->execute(['fid' => $feedback['id']]);
    $versions = $vStmt->fetchAll();
}

// Fetch Interviewers for Assignment Dropdown
$interviewers = $pdo->query("SELECT id, name, role FROM users WHERE role IN ('INTERVIEWER', 'HR_HEAD', 'ADMIN') AND is_active = 1 ORDER BY name ASC")->fetchAll();

// Fetch Audit Trail for this candidate
$auditStmt = $pdo->prepare("
    SELECT a.*, u.name as actor_name
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.entity_type IN ('CANDIDATE', 'FEEDBACK', 'CANDIDATE_FILE') AND a.entity_id = :eid
    ORDER BY a.id DESC
    LIMIT 15
");
$auditStmt->execute(['eid' => (string)$candId]);
$auditLogs = $auditStmt->fetchAll();

require_once __DIR__ . '/includes/header.php';
?>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

  <!-- Breadcrumbs & Navigation -->
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-2 text-xs text-neutral-400">
      <a href="dashboard.php" class="hover:text-white transition">Dashboard</a>
      <span>/</span>
      <span class="text-neutral-500 font-mono"><?= htmlspecialchars($candidate['candidate_id']) ?></span>
      <span>/</span>
      <span class="text-white font-medium"><?= htmlspecialchars($candidate['full_name']) ?></span>
    </div>
    <div class="flex items-center gap-3">
      <a href="dashboard.php" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.08] text-xs text-neutral-300 transition">
        ← Back to Pipeline
      </a>
    </div>
  </div>

  <?php if ($msg): ?>
    <div class="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2">
      <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
      <span><?= htmlspecialchars($msg) ?></span>
    </div>
  <?php endif; ?>

  <?php if ($error): ?>
    <div class="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
      <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      <span><?= htmlspecialchars($error) ?></span>
    </div>
  <?php endif; ?>

  <!-- Candidate Summary Header Card -->
  <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-6 mb-8 backdrop-blur-sm shadow-xl">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
      
      <!-- Left: Identity & Core Details -->
      <div class="flex items-start gap-4">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-reapmind-blue to-indigo-600 text-white font-bold text-xl flex items-center justify-center shadow-lg shadow-reapmind-blue/20 flex-shrink-0 font-display">
          <?= strtoupper(substr($candidate['full_name'], 0, 1)) ?>
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-2xl font-bold font-display text-white"><?= htmlspecialchars($candidate['full_name']) ?></h1>
            <span class="font-mono text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-neutral-300 border border-white/10">
              <?= htmlspecialchars($candidate['candidate_id']) ?>
            </span>
            <?php
              $statusColors = [
                'New'         => 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                'Screening'   => 'bg-blue-500/15 text-blue-300 border-blue-500/30',
                'Assigned'    => 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
                'Interviewed' => 'bg-purple-500/15 text-purple-300 border-purple-500/30',
                'Selected'    => 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                'Rejected'    => 'bg-red-500/15 text-red-300 border-red-500/30',
                'On Hold'     => 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30',
              ];
              $badgeClass = $statusColors[$candidate['status']] ?? 'bg-white/10 text-white border-white/20';
            ?>
            <span class="px-3 py-0.5 rounded-full text-xs font-semibold border <?= $badgeClass ?>">
              <?= htmlspecialchars($candidate['status']) ?>
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 mt-3 text-xs text-neutral-300">
            <div>
              <span class="text-neutral-500">Position:</span>
              <span class="font-medium text-white ml-1"><?= htmlspecialchars($candidate['position']) ?></span>
            </div>
            <div>
              <span class="text-neutral-500">Mobile:</span>
              <a href="tel:<?= htmlspecialchars($candidate['mobile']) ?>" class="font-mono text-reapmind-blue hover:underline ml-1">
                <?= htmlspecialchars($candidate['mobile']) ?>
              </a>
            </div>
            <div>
              <span class="text-neutral-500">Email:</span>
              <a href="mailto:<?= htmlspecialchars($candidate['email']) ?>" class="text-white hover:underline ml-1 truncate">
                <?= htmlspecialchars($candidate['email']) ?>
              </a>
            </div>
            <div>
              <span class="text-neutral-500">Source:</span>
              <span class="text-white ml-1"><?= htmlspecialchars($candidate['source']) ?></span>
            </div>
            <div>
              <span class="text-neutral-500">College:</span>
              <span class="text-white ml-1"><?= htmlspecialchars($candidate['college'] ?: 'Not specified') ?></span>
            </div>
            <div>
              <span class="text-neutral-500">Passing Year:</span>
              <span class="text-white ml-1"><?= htmlspecialchars($candidate['passing_year'] ?: 'N/A') ?></span>
            </div>
            <div>
              <span class="text-neutral-500">Location:</span>
              <span class="text-white ml-1"><?= htmlspecialchars($candidate['location']) ?></span>
            </div>
            <div>
              <span class="text-neutral-500">Applied:</span>
              <span class="text-white ml-1"><?= date('d M Y, h:i A', strtotime($candidate['created_at'])) ?></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Interviewer Assignment Form -->
      <div class="flex-shrink-0 bg-black/40 border border-white/10 rounded-xl p-4 min-w-[280px]">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">Interviewer Assignment</div>
        <form method="POST">
          <input type="hidden" name="action" value="reassign_interviewer">
          <div class="flex items-center gap-2">
            <select name="interviewer_id" class="w-full px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/15 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
              <option value="">-- Unassigned --</option>
              <?php foreach ($interviewers as $int): ?>
                <option value="<?= $int['id'] ?>" <?= ($candidate['interviewer_id'] == $int['id']) ? 'selected' : '' ?>>
                  <?= htmlspecialchars($int['name']) ?> (<?= htmlspecialchars($int['role']) ?>)
                </option>
              <?php endforeach; ?>
            </select>
            <button type="submit" class="px-3 py-1.5 rounded-lg bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-semibold transition">
              Save
            </button>
          </div>
        </form>
        <?php if ($candidate['interviewer_name']): ?>
          <div class="text-[11px] text-neutral-400 mt-2 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Assigned to <strong class="text-white"><?= htmlspecialchars($candidate['interviewer_name']) ?></strong>
          </div>
        <?php endif; ?>
      </div>

    </div>
  </div>

  <!-- Main Grid: Documents (Left) & Feedback/Audit (Right) -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
    
    <!-- LEFT COLUMN: Dual-Tab Document Viewer (7 cols) -->
    <div class="lg:col-span-7 space-y-6">
      
      <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
        
        <!-- Tab Bar Header -->
        <div class="border-b border-white/10 px-6 pt-4 flex items-center justify-between bg-white/[0.01]">
          <div class="flex items-center gap-2">
            <!-- Tab 1: Uploaded Resume -->
            <button type="button" onclick="switchDocTab('resume')" id="tabBtnResume"
              class="px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 border-reapmind-blue text-white bg-white/[0.03]">
              <svg class="w-4 h-4 text-reapmind-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <span>Uploaded Resume (PDF / Doc)</span>
              <span class="px-1.5 py-0.2 rounded-full bg-reapmind-blue/20 text-reapmind-blue text-[10px] font-mono"><?= count($resumeFiles) ?></span>
            </button>

            <!-- Tab 2: Camera Snapshot & Scans -->
            <button type="button" onclick="switchDocTab('scans')" id="tabBtnScans"
              class="px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 border-transparent text-neutral-400 hover:text-white">
              <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
              <span>Camera Snapshots & Scans</span>
              <span class="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono"><?= count($scanFiles) ?></span>
            </button>
          </div>
        </div>

        <!-- TAB 1 CONTENT: Uploaded Resume -->
        <div id="tabContentResume" class="p-6">
          <?php if (empty($resumeFiles)): ?>
            <div class="py-12 text-center text-neutral-500">
              <svg class="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <p class="text-xs">No digital resume file attached for this candidate.</p>
              <p class="text-[11px] text-neutral-600 mt-1">Check the Camera Snapshots tab if physical scans were taken.</p>
            </div>
          <?php else: ?>
            <?php foreach ($resumeFiles as $rf): ?>
              <div class="bg-black/50 border border-white/10 rounded-xl p-4 flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-reapmind-blue/15 text-reapmind-blue flex items-center justify-center font-bold text-xs uppercase">
                    <?= pathinfo($rf['file_name'], PATHINFO_EXTENSION) ?: 'DOC' ?>
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-white truncate max-w-xs"><?= htmlspecialchars($rf['file_name']) ?></div>
                    <div class="text-[11px] text-neutral-400 font-mono mt-0.5">
                      <?= number_format($rf['file_size'] / 1024, 1) ?> KB • Uploaded <?= timeAgo($rf['created_at']) ?>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <!-- Google Drive Style Fullscreen Button -->
                  <button type="button" onclick="openDriveViewer('download.php?id=<?= $rf['id'] ?>&mode=inline', '<?= htmlspecialchars(addslashes($rf['file_name'])) ?>', '<?= $rf['mime_type'] ?>', 'download.php?id=<?= $rf['id'] ?>&mode=download')"
                    class="px-3 py-1.5 rounded-lg bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md shadow-reapmind-blue/20">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                    <span>Fullscreen</span>
                  </button>

                  <a href="download.php?id=<?= $rf['id'] ?>&mode=download" class="p-2 rounded-lg border border-white/10 hover:bg-white/10 text-neutral-300 hover:text-white transition" title="Download Document">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  </a>
                </div>
              </div>

              <!-- Inline Preview Frame -->
              <div class="rounded-xl overflow-hidden border border-white/10 bg-black aspect-[3/4] max-h-[600px] relative">
                <?php if (str_starts_with($rf['mime_type'], 'application/pdf')): ?>
                  <iframe src="download.php?id=<?= $rf['id'] ?>&mode=inline#toolbar=0" class="w-full h-full border-0"></iframe>
                <?php else: ?>
                  <div class="w-full h-full flex flex-col items-center justify-center p-8 text-center text-neutral-400">
                    <svg class="w-12 h-12 text-neutral-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    <p class="text-sm font-medium text-white mb-1"><?= htmlspecialchars($rf['file_name']) ?></p>
                    <p class="text-xs text-neutral-400 mb-4">Microsoft Word documents are downloaded to your device for viewing.</p>
                    <a href="download.php?id=<?= $rf['id'] ?>&mode=download" class="px-4 py-2 rounded-xl bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-semibold transition">
                      Download <?= htmlspecialchars($rf['file_name']) ?>
                    </a>
                  </div>
                <?php endif; ?>
              </div>
            <?php endforeach; ?>
          <?php endif; ?>
        </div>

        <!-- TAB 2 CONTENT: Camera Snapshots & Scans -->
        <div id="tabContentScans" class="hidden p-6">
          <?php if (empty($scanFiles)): ?>
            <div class="py-12 text-center text-neutral-500">
              <svg class="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
              <p class="text-xs">No camera scans or physical photos taken for this candidate.</p>
            </div>
          <?php else: ?>
            
            <!-- Snapshot gallery toolbar -->
            <div class="flex items-center justify-between mb-4">
              <span class="text-xs font-semibold text-neutral-300">
                <?= count($scanFiles) ?> Scan <?= count($scanFiles) === 1 ? 'Page' : 'Pages' ?> Recorded
              </span>
              <div class="text-[11px] text-neutral-400">Click any page to expand fullscreen</div>
            </div>

            <!-- Thumbnail Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <?php foreach ($scanFiles as $sIdx => $sf): ?>
                <div onclick="openDriveViewer('download.php?id=<?= $sf['id'] ?>&mode=inline', '<?= htmlspecialchars(addslashes($sf['file_name'])) ?>', '<?= $sf['mime_type'] ?>', 'download.php?id=<?= $sf['id'] ?>&mode=download')"
                  class="group relative rounded-xl overflow-hidden border border-white/10 hover:border-emerald-400/50 bg-black/40 aspect-[3/4] cursor-pointer transition shadow-md">
                  <?php if (str_starts_with($sf['mime_type'], 'image/')): ?>
                    <img src="download.php?id=<?= $sf['id'] ?>&mode=inline" alt="<?= htmlspecialchars($sf['file_name']) ?>" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                  <?php else: ?>
                    <div class="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-emerald-950/20">
                      <svg class="w-8 h-8 text-emerald-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                      <span class="text-[11px] font-bold text-white"><?= htmlspecialchars($sf['file_name']) ?></span>
                    </div>
                  <?php endif; ?>

                  <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2.5">
                    <div class="flex items-center justify-between w-full">
                      <span class="text-[10px] font-mono text-emerald-400 font-bold bg-black/60 px-1.5 py-0.5 rounded">
                        <?= $sf['page_number'] ? 'Page ' . $sf['page_number'] : 'PDF Bundle' ?>
                      </span>
                      <svg class="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                    </div>
                  </div>
                </div>
              <?php endforeach; ?>
            </div>

            <!-- Default First Scan Large Viewer -->
            <?php $firstScan = $scanFiles[0]; ?>
            <div class="bg-black border border-white/10 rounded-xl overflow-hidden aspect-[3/4] max-h-[600px] relative flex items-center justify-center">
              <?php if (str_starts_with($firstScan['mime_type'], 'application/pdf')): ?>
                <iframe src="download.php?id=<?= $firstScan['id'] ?>&mode=inline#toolbar=0" class="w-full h-full border-0"></iframe>
              <?php else: ?>
                <img src="download.php?id=<?= $firstScan['id'] ?>&mode=inline" class="w-full h-full object-contain">
              <?php endif; ?>
              <button type="button" onclick="openDriveViewer('download.php?id=<?= $firstScan['id'] ?>&mode=inline', '<?= htmlspecialchars(addslashes($firstScan['file_name'])) ?>', '<?= $firstScan['mime_type'] ?>', 'download.php?id=<?= $firstScan['id'] ?>&mode=download')"
                class="absolute bottom-4 right-4 px-3.5 py-2 rounded-xl bg-black/80 hover:bg-black text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition flex items-center gap-1.5 shadow-xl">
                <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                <span>Expand Fullscreen (Google Drive Mode)</span>
              </button>
            </div>

          <?php endif; ?>
        </div>

      </div>

    </div>

    <!-- RIGHT COLUMN: Evaluation & Audit History (5 cols) -->
    <div class="lg:col-span-5 space-y-6">
      
      <!-- Interview Evaluation Form Card (Hidden from FRONT_DESK) -->
      <?php if ($currentUser['role'] !== 'FRONT_DESK'): ?>
      <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm shadow-xl">
        <div class="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-reapmind-yellow"></span>
            <h2 class="text-base font-bold text-white">Interview Evaluation & Rating</h2>
          </div>
          <?php if ($feedback): ?>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Evaluated
            </span>
          <?php endif; ?>
        </div>

        <form method="POST" class="space-y-4">
          <input type="hidden" name="action" value="submit_feedback">

          <!-- Ratings Grid -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-medium text-neutral-300 mb-1">Technical Skills (1-5)</label>
              <select name="technical_rating" required class="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
                <?php for ($i=5; $i>=1; $i--): ?>
                  <option value="<?= $i ?>" <?= (($feedback['technical_rating'] ?? 4) == $i) ? 'selected' : '' ?>><?= $i ?> Stars</option>
                <?php endfor; ?>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-medium text-neutral-300 mb-1">Communication (1-5)</label>
              <select name="communication_rating" required class="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
                <?php for ($i=5; $i>=1; $i--): ?>
                  <option value="<?= $i ?>" <?= (($feedback['communication_rating'] ?? 4) == $i) ? 'selected' : '' ?>><?= $i ?> Stars</option>
                <?php endfor; ?>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-medium text-neutral-300 mb-1">Cultural Fit (1-5)</label>
              <select name="cultural_fit_rating" required class="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
                <?php for ($i=5; $i>=1; $i--): ?>
                  <option value="<?= $i ?>" <?= (($feedback['cultural_fit_rating'] ?? 4) == $i) ? 'selected' : '' ?>><?= $i ?> Stars</option>
                <?php endfor; ?>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-medium text-neutral-300 mb-1">Overall Score (1-5)</label>
              <select name="overall_rating" required class="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
                <?php for ($i=5; $i>=1; $i--): ?>
                  <option value="<?= $i ?>" <?= (($feedback['overall_rating'] ?? 4) == $i) ? 'selected' : '' ?>><?= $i ?> / 5 Overall</option>
                <?php endfor; ?>
              </select>
            </div>
          </div>

          <!-- Recommendation -->
          <div>
            <label class="block text-[11px] font-medium text-neutral-300 mb-1">Hiring Recommendation <span class="text-red-400">*</span></label>
            <select name="recommendation" required class="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
              <option value="">-- Choose Decision --</option>
              <option value="Strong Hire" <?= (($feedback['recommendation'] ?? '') === 'Strong Hire') ? 'selected' : '' ?>>Strong Hire (High Priority)</option>
              <option value="Hire" <?= (($feedback['recommendation'] ?? '') === 'Hire') ? 'selected' : '' ?>>Hire</option>
              <option value="Hold" <?= (($feedback['recommendation'] ?? '') === 'Hold') ? 'selected' : '' ?>>Hold (Review with Team)</option>
              <option value="Next Round" <?= (($feedback['recommendation'] ?? '') === 'Next Round') ? 'selected' : '' ?>>Next Round (Technical / Executive)</option>
              <option value="Reject" <?= (($feedback['recommendation'] ?? '') === 'Reject') ? 'selected' : '' ?>>Reject</option>
            </select>
          </div>

          <!-- Mandatory Feedback Comments -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-[11px] font-medium text-neutral-300">Detailed Feedback (Min 20 chars) <span class="text-red-400">*</span></label>
              <span id="charCountLabel" class="text-[10px] text-neutral-500 font-mono">0 chars</span>
            </div>
            <textarea name="comments" id="feedbackComments" required rows="4" placeholder="Detail candidate's algorithmic grasp, architecture reasoning, strengths, and observed flags..."
              class="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-reapmind-blue transition leading-relaxed"><?= htmlspecialchars($feedback['comments'] ?? '') ?></textarea>
          </div>

          <!-- CTC & Notice Details -->
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="block text-[10px] text-neutral-400 mb-1">Current CTC (LPA)</label>
              <input type="number" step="0.1" name="current_ctc" placeholder="e.g. 4.5" value="<?= htmlspecialchars($feedback['current_ctc'] ?? '') ?>"
                class="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-reapmind-blue transition">
            </div>
            <div>
              <label class="block text-[10px] text-neutral-400 mb-1">Expected CTC (LPA)</label>
              <input type="number" step="0.1" name="expected_ctc" placeholder="e.g. 6.5" value="<?= htmlspecialchars($feedback['expected_ctc'] ?? '') ?>"
                class="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-reapmind-blue transition">
            </div>
            <div>
              <label class="block text-[10px] text-neutral-400 mb-1">Notice (Days)</label>
              <input type="number" name="notice_period_days" placeholder="e.g. 30" value="<?= htmlspecialchars($feedback['notice_period_days'] ?? '') ?>"
                class="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-reapmind-blue transition">
            </div>
          </div>

          <!-- Submission Button -->
          <div class="pt-2">
            <button type="submit" class="w-full py-2.5 rounded-xl bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold transition shadow-lg shadow-reapmind-blue/20">
              <?= $feedback ? 'Update Evaluation' : 'Record Evaluation & Decision' ?>
            </button>
            <?php if ($feedback): ?>
              <div class="text-[10px] text-neutral-500 text-center mt-2">
                Last updated <?= timeAgo($feedback['updated_at']) ?> by <?= htmlspecialchars($feedback['interviewer_name']) ?>.
                15-minute grace period applies for in-place edit; subsequent edits become versioned addendums.
              </div>
            <?php endif; ?>
          </div>
        </form>

        <!-- Versioned Addendums History -->
        <?php if (!empty($versions)): ?>
          <div class="mt-6 pt-5 border-t border-white/10">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-3">Evaluation Version History</div>
            <div class="space-y-3">
              <?php foreach ($versions as $v): ?>
                <div class="p-3 rounded-lg bg-black/40 border border-white/10 text-xs">
                  <div class="flex items-center justify-between text-neutral-400 text-[10px] mb-1">
                    <span>Addendum v<?= $v['version_number'] ?> • by <?= htmlspecialchars($v['edited_by_name']) ?></span>
                    <span><?= timeAgo($v['created_at']) ?></span>
                  </div>
                  <div class="font-semibold text-white mb-1">
                    Score: <?= $v['overall_rating'] ?>/5 • Decision: <?= htmlspecialchars($v['recommendation']) ?>
                  </div>
                  <div class="text-neutral-300 italic text-[11px] leading-relaxed">
                    "<?= htmlspecialchars($v['comments']) ?>"
                  </div>
                </div>
              <?php endforeach; ?>
            </div>
          </div>
        <?php endif; ?>

      </div>
      <?php endif; ?>

      <!-- Audit Trail Card -->
      <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm shadow-xl">
        <h3 class="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4 flex items-center gap-2">
          <svg class="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Candidate Activity Trail (DPDP Compliant)
        </h3>

        <div class="space-y-3">
          <?php if (empty($auditLogs)): ?>
            <div class="text-xs text-neutral-500 text-center py-4">No audit events recorded yet.</div>
          <?php else: ?>
            <?php foreach ($auditLogs as $al): ?>
              <div class="flex items-start gap-2.5 text-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-reapmind-blue mt-1.5 flex-shrink-0"></span>
                <div class="flex-1">
                  <div class="text-neutral-300">
                    <strong class="text-white"><?= htmlspecialchars($al['actor_name'] ?: 'System') ?></strong>
                    <span class="text-neutral-500 font-mono text-[10px] ml-1">[<?= htmlspecialchars($al['action']) ?>]</span>
                  </div>
                  <div class="text-[11px] text-neutral-400 mt-0.5"><?= htmlspecialchars($al['details'] ?: '') ?></div>
                  <div class="text-[10px] text-neutral-600 mt-0.5 font-mono"><?= timeAgo($al['created_at']) ?></div>
                </div>
              </div>
            <?php endforeach; ?>
          <?php endif; ?>
        </div>
      </div>

    </div>

  </div>

</div>

<!-- ========================================================================= -->
<!-- GOOGLE DRIVE STYLE FULLSCREEN PREVIEW MODAL                                -->
<!-- User Requirement: View on whole screen like Google Drive, Zoom, Rotate, Esc -->
<!-- ========================================================================= -->
<div id="driveModal" class="hidden fixed inset-0 z-50 bg-black/95 flex flex-col backdrop-blur-lg select-none">
  
  <!-- Header Toolbar (Drive Style) -->
  <div class="h-14 border-b border-white/10 px-4 sm:px-6 flex items-center justify-between bg-neutral-900/80">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg bg-reapmind-blue/20 text-reapmind-blue flex items-center justify-center font-bold text-xs">
        RM
      </div>
      <div>
        <div id="driveDocTitle" class="text-xs sm:text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-md"></div>
        <div id="drivePageIndicator" class="text-[10px] text-neutral-400 font-mono">Viewing Mode: 100% Fullscreen</div>
      </div>
    </div>

    <!-- Center Zoom & Rotate Controls -->
    <div class="hidden sm:flex items-center gap-1.5 bg-black/60 border border-white/10 rounded-xl px-2 py-1">
      <button type="button" onclick="zoomDoc(-0.15)" class="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition" title="Zoom Out (-)">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>
      </button>
      <span id="zoomPercentLabel" class="text-xs font-mono text-neutral-300 px-2 min-w-[50px] text-center">100%</span>
      <button type="button" onclick="zoomDoc(0.15)" class="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition" title="Zoom In (+)">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
      </button>
      <div class="w-px h-4 bg-white/20 mx-1"></div>
      <button type="button" onclick="resetZoomDoc()" class="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition text-xs font-mono" title="Reset Zoom">
        Fit
      </button>
      <button type="button" onclick="rotateDoc()" class="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition" title="Rotate 90° Clockwise">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
      </button>
    </div>

    <!-- Actions (Download & Close) -->
    <div class="flex items-center gap-2">
      <a id="driveDownloadBtn" href="#" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
        <span class="hidden sm:inline">Download</span>
      </a>
      <button type="button" onclick="closeDriveViewer()" class="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition text-xl font-bold" title="Close (Esc)">
        &times;
      </button>
    </div>
  </div>

  <!-- Center Viewport -->
  <div class="flex-1 overflow-auto flex items-center justify-center p-4 relative" id="driveViewport">
    <div id="driveContentContainer" class="transition-transform duration-150 origin-center max-w-full max-h-full flex items-center justify-center">
      <!-- Injected iframe or image -->
    </div>
  </div>

</div>

<script>
// Tab Switching: Resume vs Scans
function switchDocTab(tab) {
  const resumeBtn = document.getElementById('tabBtnResume');
  const scansBtn  = document.getElementById('tabBtnScans');
  const resumeBox = document.getElementById('tabContentResume');
  const scansBox  = document.getElementById('tabContentScans');

  if (tab === 'resume') {
    resumeBtn.className = "px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 border-reapmind-blue text-white bg-white/[0.03]";
    scansBtn.className  = "px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 border-transparent text-neutral-400 hover:text-white";
    resumeBox.classList.remove('hidden');
    scansBox.classList.add('hidden');
  } else {
    scansBtn.className  = "px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 border-emerald-400 text-white bg-white/[0.03]";
    resumeBtn.className = "px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 border-transparent text-neutral-400 hover:text-white";
    scansBox.classList.remove('hidden');
    resumeBox.classList.add('hidden');
  }
}

// Google Drive Style Fullscreen Modal
let currentScale = 1.0;
let currentRotation = 0;

function openDriveViewer(url, title, mimeType, downloadUrl) {
  document.getElementById('driveDocTitle').textContent = title;
  document.getElementById('driveDownloadBtn').href = downloadUrl;

  const container = document.getElementById('driveContentContainer');
  container.innerHTML = '';
  currentScale = 1.0;
  currentRotation = 0;
  applyTransform();

  if (mimeType.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = url;
    img.className = 'max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg';
    container.appendChild(img);
  } else if (mimeType.startsWith('application/pdf')) {
    const iframe = document.createElement('iframe');
    iframe.src = url + '#toolbar=0';
    iframe.className = 'w-[85vw] h-[85vh] rounded-lg border border-white/20 bg-white';
    container.appendChild(iframe);
  } else {
    container.innerHTML = `
      <div class="text-center p-8 bg-neutral-900 border border-white/15 rounded-2xl max-w-md">
        <h4 class="text-white text-base font-bold mb-2">${title}</h4>
        <p class="text-xs text-neutral-400 mb-6">Document preview is available by downloading to your device.</p>
        <a href="${downloadUrl}" class="px-5 py-2.5 rounded-xl bg-reapmind-blue text-white text-xs font-bold">Download File</a>
      </div>
    `;
  }

  document.getElementById('driveModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeDriveViewer() {
  document.getElementById('driveModal').classList.add('hidden');
  document.getElementById('driveContentContainer').innerHTML = '';
  document.body.style.overflow = 'auto';
}

function zoomDoc(delta) {
  currentScale = Math.max(0.4, Math.min(3.5, currentScale + delta));
  applyTransform();
}

function resetZoomDoc() {
  currentScale = 1.0;
  currentRotation = 0;
  applyTransform();
}

function rotateDoc() {
  currentRotation = (currentRotation + 90) % 360;
  applyTransform();
}

function applyTransform() {
  const container = document.getElementById('driveContentContainer');
  container.style.transform = `scale(${currentScale}) rotate(${currentRotation}deg)`;
  document.getElementById('zoomPercentLabel').textContent = Math.round(currentScale * 100) + '%';
}

// Keyboard shortcuts for Fullscreen modal
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('driveModal');
  if (!modal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      closeDriveViewer();
    } else if (e.key === '+' || e.key === '=') {
      zoomDoc(0.15);
    } else if (e.key === '-') {
      zoomDoc(-0.15);
    } else if (e.key.toLowerCase() === 'r') {
      rotateDoc();
    }
  }
});

// Feedback Character Counter
const feedbackComments = document.getElementById('feedbackComments');
const charCountLabel   = document.getElementById('charCountLabel');
if (feedbackComments && charCountLabel) {
  feedbackComments.addEventListener('input', () => {
    const len = feedbackComments.value.trim().length;
    charCountLabel.textContent = `${len} chars`;
    if (len >= 20) {
      charCountLabel.className = 'text-[10px] text-emerald-400 font-mono';
    } else {
      charCountLabel.className = 'text-[10px] text-amber-400 font-mono';
    }
  });
}
</script>

<?php require_once __DIR__ . '/includes/footer.php'; ?>
