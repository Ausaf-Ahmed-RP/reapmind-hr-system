<?php
$pageTitle = "Intake Desk | Candidate Onboarding - ReapMind Innovations";
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/audit.php';
require_once __DIR__ . '/includes/pdf_helper.php';

requireAuth();
$currentUser = getCurrentUser();

// Fetch positions & sources
$posStmt = $pdo->query("SELECT value, label FROM master_lists WHERE category = 'POSITION' AND is_active = 1 ORDER BY sort_order ASC");
$positions = $posStmt->fetchAll();

$srcStmt = $pdo->query("SELECT value, label FROM master_lists WHERE category = 'SOURCE' AND is_active = 1 ORDER BY sort_order ASC");
$sources = $srcStmt->fetchAll();

$successCandidate = null;
$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $fullName    = trim($_POST['full_name'] ?? '');
    $mobileRaw   = trim($_POST['mobile'] ?? '');
    $email       = trim($_POST['email'] ?? '');
    $position    = trim($_POST['position'] ?? '');
    $college     = trim($_POST['college'] ?? '');
    $passingYear = trim($_POST['passing_year'] ?? '');
    $location    = trim($_POST['location'] ?? 'Kolhapur');
    $source      = trim($_POST['source'] ?? 'Walk-in');
    $referredBy  = trim($_POST['referred_by'] ?? '');
    $consent     = isset($_POST['consent']);
    $cameraJson  = trim($_POST['camera_pages_json'] ?? '');

    $mobile = substr(preg_replace('/\D/', '', $mobileRaw), -10);

    if (empty($fullName)) {
        $error = "Please enter the candidate's full name.";
    } elseif (strlen($mobile) !== 10) {
        $error = "Please enter a valid 10-digit mobile number.";
    } elseif (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = "Please enter a valid email address.";
    } elseif (!$consent) {
        $error = "Candidate consent under DPDP Act 2023 is mandatory.";
    } else {
        $hasResumeFile = isset($_FILES['resume_file']) && $_FILES['resume_file']['error'] === UPLOAD_ERR_OK;
        $hasCameraPages = !empty($cameraJson);

        if (!$hasResumeFile && !$hasCameraPages) {
            $error = "Please attach a resume file or take a camera snapshot of the document.";
        } else {
            $candidateId = getNextCandidateId($pdo);

            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("
                    INSERT INTO candidates 
                    (candidate_id, full_name, mobile, email, position, college, passing_year, location, source, referred_by, status, consent_flag, uploaded_by_id, created_at)
                    VALUES 
                    (:cid, :name, :mobile, :email, :position, :college, :passing_year, :location, :source, :ref, 'New', 1, :uploader_id, NOW())
                ");
                $stmt->execute([
                    'cid'          => $candidateId,
                    'name'         => $fullName,
                    'mobile'       => $mobile,
                    'email'        => $email,
                    'position'     => $position,
                    'college'      => $college,
                    'passing_year' => $passingYear,
                    'location'     => $location,
                    'source'       => $source,
                    'ref'          => $referredBy ?: null,
                    'uploader_id'  => (int)$currentUser['id'],
                ]);

                $newCandDbId = (int)$pdo->lastInsertId();

                $uploadBase = __DIR__ . '/uploads';
                $resumeDir = $uploadBase . '/resumes';
                $snapDir   = $uploadBase . '/snapshots';
                @mkdir($resumeDir, 0755, true);
                @mkdir($snapDir, 0755, true);

                // 1. Process Uploaded Resume File (if attached)
                if ($hasResumeFile) {
                    $origName = basename($_FILES['resume_file']['name']);
                    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
                    $cleanName = bin2hex(random_bytes(10)) . '.' . $ext;
                    $destPath = $resumeDir . '/' . $cleanName;
                    $relPath  = 'uploads/resumes/' . $cleanName;

                    if (move_uploaded_file($_FILES['resume_file']['tmp_name'], $destPath)) {
                        $fStmt = $pdo->prepare("
                            INSERT INTO candidate_files 
                            (candidate_id, file_type, file_path, file_name, mime_type, file_size, uploaded_by_id, created_at)
                            VALUES
                            (:cid, 'RESUME', :fpath, :fname, :mime, :fsize, :uid, NOW())
                        ");
                        $fStmt->execute([
                            'cid'   => $newCandDbId,
                            'fpath' => $relPath,
                            'fname' => $origName,
                            'mime'  => $_FILES['resume_file']['type'] ?: 'application/octet-stream',
                            'fsize' => (int)$_FILES['resume_file']['size'],
                            'uid'   => (int)$currentUser['id'],
                        ]);
                    }
                }

                // 2. Process Camera Snapshots (if captured)
                if ($hasCameraPages) {
                    $pages = json_decode($cameraJson, true);
                    if (is_array($pages) && count($pages) > 0) {
                        $savedPagePaths = [];
                        foreach ($pages as $idx => $base64Data) {
                            $cleanData = preg_replace('/^data:image\/\w+;base64,/', '', $base64Data);
                            $cleanData = trim($cleanData);
                            $imgBin = base64_decode($cleanData);
                            if ($imgBin) {
                                $snapName = 'snap_' . $candidateId . '_p' . ($idx + 1) . '_' . bin2hex(random_bytes(4)) . '.jpg';
                                $snapDest = $snapDir . '/' . $snapName;
                                if (file_put_contents($snapDest, $imgBin)) {
                                    $savedPagePaths[] = $snapDest;
                                    $sStmt = $pdo->prepare("
                                        INSERT INTO candidate_files 
                                        (candidate_id, file_type, file_path, file_name, mime_type, file_size, page_number, uploaded_by_id, created_at)
                                        VALUES
                                        (:cid, 'DOCUMENT_SCAN', :fpath, :fname, 'image/jpeg', :fsize, :pnum, :uid, NOW())
                                    ");
                                    $sStmt->execute([
                                        'cid'   => $newCandDbId,
                                        'fpath' => 'uploads/snapshots/' . $snapName,
                                        'fname' => 'Camera Scan Page ' . ($idx + 1) . '.jpg',
                                        'fsize' => strlen($imgBin),
                                        'pnum'  => $idx + 1,
                                        'uid'   => (int)$currentUser['id'],
                                    ]);
                                }
                            }
                        }

                        // Generate merged PDF for camera scans
                        if (!empty($savedPagePaths)) {
                            $pdfName = 'scan_bundle_' . $candidateId . '_' . bin2hex(random_bytes(4)) . '.pdf';
                            $pdfDest = $snapDir . '/' . $pdfName;
                            if (SimpleImagePdf::createFromImages($savedPagePaths, $pdfDest)) {
                                $pStmt = $pdo->prepare("
                                    INSERT INTO candidate_files 
                                    (candidate_id, file_type, file_path, file_name, mime_type, file_size, uploaded_by_id, created_at)
                                    VALUES
                                    (:cid, 'DOCUMENT_SCAN', :fpath, :fname, 'application/pdf', :fsize, :uid, NOW())
                                ");
                                $pStmt->execute([
                                    'cid'   => $newCandDbId,
                                    'fpath' => 'uploads/snapshots/' . $pdfName,
                                    'fname' => 'Consolidated Camera Scans (' . count($savedPagePaths) . ' Pages).pdf',
                                    'fsize' => filesize($pdfDest),
                                    'uid'   => (int)$currentUser['id'],
                                ]);
                            }
                        }
                    }
                }

                // Audit Log
                logAudit(
                    $pdo,
                    (int)$currentUser['id'],
                    'CANDIDATE_CREATED',
                    'CANDIDATE',
                    (string)$newCandDbId,
                    "Front Desk intake registered candidate $fullName ($candidateId) via $source"
                );

                // Notifications to HR Ops
                broadcastNotification(
                    $pdo,
                    ['HR_OPS', 'HR_HEAD'],
                    $newCandDbId,
                    'New Candidate Registered',
                    "$fullName has been registered at the Intake Desk for $position.",
                    'CANDIDATE_CREATED'
                );

                $pdo->commit();

                $successCandidate = [
                    'id'           => $newCandDbId,
                    'candidate_id' => $candidateId,
                    'full_name'    => $fullName,
                    'position'     => $position,
                    'source'       => $source
                ];
            } catch (Exception $e) {
                $pdo->rollBack();
                $error = "Registration failed: " . $e->getMessage();
            }
        }
    }
}

require_once __DIR__ . '/includes/header.php';
?>

<div class="max-w-4xl mx-auto px-4 py-8">

  <!-- Header Banner -->
  <div class="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
    <div>
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-reapmind-blue/10 border border-reapmind-blue/20 text-reapmind-blue text-xs font-semibold mb-2">
        <span class="w-1.5 h-1.5 rounded-full bg-reapmind-blue animate-pulse"></span>
        Front Desk Intake Console
      </div>
      <h1 class="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white">Candidate Registration</h1>
      <p class="text-sm text-neutral-400 mt-1">Register walk-in candidates, capture high-res resume scans, and route to interviewers.</p>
    </div>
    <div class="flex items-center gap-3">
      <a href="apply.php" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-neutral-300 transition">
        <svg class="w-4 h-4 text-reapmind-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
        <span>Student Self-Apply Kiosk ↗</span>
      </a>
    </div>
  </div>

  <?php if ($successCandidate): ?>
  <!-- Success Confirmation Card -->
  <div class="bg-gradient-to-b from-emerald-950/40 to-neutral-900 border border-emerald-500/30 rounded-2xl p-6 sm:p-8 text-center mb-8 shadow-2xl">
    <div class="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
      <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    </div>
    <h2 class="text-2xl font-bold text-white mb-2">Candidate Successfully Registered!</h2>
    <p class="text-neutral-400 text-sm max-w-md mx-auto mb-6">Candidate profile has been created and files have been archived securely.</p>
    
    <div class="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-white/[0.05] border border-white/10 mb-8">
      <span class="text-xs text-neutral-400">Assigned Candidate ID:</span>
      <span class="text-lg font-mono font-bold text-emerald-400"><?= htmlspecialchars($successCandidate['candidate_id']) ?></span>
    </div>

    <div class="flex flex-wrap items-center justify-center gap-4">
      <a href="intake.php" class="px-5 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white text-sm font-semibold transition border border-white/10">
        + Register Another Candidate
      </a>
      <a href="candidate.php?id=<?= $successCandidate['id'] ?>" class="px-5 py-2.5 rounded-xl bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-sm font-semibold transition shadow-lg shadow-reapmind-blue/20">
        Open Candidate Profile →
      </a>
    </div>
  </div>
  <?php else: ?>

  <?php if ($error): ?>
  <div class="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-3">
    <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
    <span><?= htmlspecialchars($error) ?></span>
  </div>
  <?php endif; ?>

  <!-- Duplicate Check Alert Banner -->
  <div id="duplicateAlert" class="hidden mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
    <div class="flex items-start gap-3">
      <svg class="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      <div>
        <div class="font-semibold text-white">Possible Duplicate Record Detected</div>
        <div id="duplicateMsg" class="text-xs text-neutral-300 mt-0.5"></div>
        <a id="duplicateLink" href="#" target="_blank" class="inline-block mt-2 text-xs font-semibold text-amber-400 hover:underline">
          View Existing Profile ↗
        </a>
      </div>
    </div>
  </div>

  <form method="POST" enctype="multipart/form-data" class="space-y-6" id="intakeForm">
    
    <!-- Candidate Info Card -->
    <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-6 sm:p-7 backdrop-blur-sm">
      <h2 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
        <span class="w-6 h-6 rounded-lg bg-reapmind-blue/20 text-reapmind-blue flex items-center justify-center text-xs font-bold">1</span>
        Basic Candidate Information
      </h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div class="sm:col-span-2">
          <label class="block text-xs font-medium text-neutral-300 mb-1.5">Candidate Full Name <span class="text-red-400">*</span></label>
          <input type="text" name="full_name" required placeholder="e.g. Atharva Kulkarni" value="<?= htmlspecialchars($_POST['full_name'] ?? '') ?>"
            class="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-reapmind-blue focus:ring-1 focus:ring-reapmind-blue transition">
        </div>

        <div>
          <label class="block text-xs font-medium text-neutral-300 mb-1.5">Mobile Number (10 digits) <span class="text-red-400">*</span></label>
          <input type="tel" name="mobile" id="mobileInput" required placeholder="9876543210" maxlength="10" value="<?= htmlspecialchars($_POST['mobile'] ?? '') ?>"
            class="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-reapmind-blue focus:ring-1 focus:ring-reapmind-blue transition font-mono">
        </div>

        <div>
          <label class="block text-xs font-medium text-neutral-300 mb-1.5">Email Address <span class="text-red-400">*</span></label>
          <input type="email" name="email" required placeholder="name@domain.com" value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"
            class="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-reapmind-blue focus:ring-1 focus:ring-reapmind-blue transition">
        </div>

        <div>
          <label class="block text-xs font-medium text-neutral-300 mb-1.5">Position Applied For <span class="text-red-400">*</span></label>
          <select name="position" required class="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-sm focus:outline-none focus:border-reapmind-blue focus:ring-1 focus:ring-reapmind-blue transition">
            <option value="">-- Select Position --</option>
            <?php foreach ($positions as $pos): ?>
              <option value="<?= htmlspecialchars($pos['value']) ?>" <?= (($_POST['position'] ?? '') == $pos['value']) ? 'selected' : '' ?>>
                <?= htmlspecialchars($pos['label']) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>

        <div>
          <label class="block text-xs font-medium text-neutral-300 mb-1.5">Interview Source</label>
          <select name="source" id="sourceSelect" class="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-sm focus:outline-none focus:border-reapmind-blue focus:ring-1 focus:ring-reapmind-blue transition">
            <option value="Walk-in">Walk-in Drive</option>
            <option value="Referral">Employee Referral</option>
            <option value="Campus">Campus Recruitment</option>
            <option value="Job Portal">Job Portal (Naukri / LinkedIn)</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div id="referredByDiv" class="hidden sm:col-span-2">
          <label class="block text-xs font-medium text-neutral-300 mb-1.5">Referred By (Employee Name / ID)</label>
          <input type="text" name="referred_by" placeholder="e.g. Rahul Patil (RM-ENG-04)"
            class="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-reapmind-blue transition">
        </div>

        <div>
          <label class="block text-xs font-medium text-neutral-300 mb-1.5">College / University</label>
          <input type="text" name="college" placeholder="e.g. Shivaji University / KITCOEK" value="<?= htmlspecialchars($_POST['college'] ?? '') ?>"
            class="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-reapmind-blue transition">
        </div>

        <div>
          <label class="block text-xs font-medium text-neutral-300 mb-1.5">Passing Year</label>
          <input type="number" name="passing_year" min="2018" max="2027" placeholder="e.g. 2024" value="<?= htmlspecialchars($_POST['passing_year'] ?? '') ?>"
            class="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-reapmind-blue transition font-mono">
        </div>
      </div>
    </div>

    <!-- Dual Document Intake Card -->
    <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-6 sm:p-7 backdrop-blur-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-white flex items-center gap-2">
          <span class="w-6 h-6 rounded-lg bg-reapmind-blue/20 text-reapmind-blue flex items-center justify-center text-xs font-bold">2</span>
          Document & Resume Intake
        </h2>
        <span class="text-xs text-neutral-400">Both digital file & camera scan supported</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <!-- Option A: File Upload -->
        <div class="p-5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-2 text-sm font-medium text-white mb-1">
              <svg class="w-4 h-4 text-reapmind-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
              Attach Digital Resume
            </div>
            <p class="text-xs text-neutral-400 mb-4">Upload PDF, DOC, or DOCX file (Max 15 MB).</p>
            
            <input type="file" name="resume_file" id="resumeFileInput" accept=".pdf,.doc,.docx" class="hidden">
            <button type="button" onclick="document.getElementById('resumeFileInput').click()" class="w-full py-3 px-4 rounded-xl border border-dashed border-white/20 hover:border-reapmind-blue bg-white/[0.02] hover:bg-white/[0.05] text-xs font-medium text-neutral-300 transition text-center flex flex-col items-center gap-1.5">
              <svg class="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
              <span id="fileChosenLabel">Browse Computer for Resume</span>
            </button>
          </div>
          <div id="filePreviewInfo" class="hidden mt-3 p-2.5 rounded-lg bg-reapmind-blue/10 border border-reapmind-blue/20 text-xs text-reapmind-blue flex items-center justify-between">
            <span id="fileNameDisplay" class="truncate font-mono"></span>
            <button type="button" onclick="clearFileSelection()" class="text-neutral-400 hover:text-white ml-2 text-base">&times;</button>
          </div>
        </div>

        <!-- Option B: Camera Document Scanner -->
        <div class="p-5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-2 text-sm font-medium text-white mb-1">
              <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
              Camera Document Scanner
            </div>
            <p class="text-xs text-neutral-400 mb-4">Snap live photos of physical resume or marksheets.</p>
            
            <button type="button" onclick="openCameraModal()" class="w-full py-3 px-4 rounded-xl border border-dashed border-white/20 hover:border-emerald-400 bg-white/[0.02] hover:bg-white/[0.05] text-xs font-medium text-neutral-300 transition text-center flex flex-col items-center gap-1.5">
              <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
              <span id="cameraStatusLabel">Launch High-Res Camera Scanner</span>
            </button>
          </div>
          <div id="cameraThumbnails" class="hidden mt-3 flex flex-wrap gap-2"></div>
        </div>

      </div>
      <input type="hidden" name="camera_pages_json" id="cameraPagesJson" value="">
    </div>

    <!-- DPDP Act Consent -->
    <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm">
      <label class="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" name="consent" required checked class="mt-1 rounded bg-black/50 border-white/20 text-reapmind-blue focus:ring-reapmind-blue">
        <span class="text-xs text-neutral-400 leading-relaxed">
          I confirm that the candidate has granted voluntary consent under the <strong class="text-neutral-200">Digital Personal Data Protection (DPDP) Act 2023</strong> for ReapMind Innovations to process their personal data, resume, and contact information strictly for hiring and evaluation purposes.
        </span>
      </label>
    </div>

    <!-- Submit Button -->
    <div class="flex items-center justify-end gap-4 pt-2">
      <a href="dashboard.php" class="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/[0.05] text-neutral-400 hover:text-white text-sm font-semibold transition">
        Cancel
      </a>
      <button type="submit" class="px-6 py-2.5 rounded-xl bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-sm font-semibold transition shadow-lg shadow-reapmind-blue/20 flex items-center gap-2">
        <span>Complete Intake Registration</span>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
      </button>
    </div>

  </form>
  <?php endif; ?>

</div>

<!-- Camera Modal -->
<div id="cameraModal" class="hidden fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
  <div class="bg-neutral-900 border border-white/15 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
    <div class="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
        <h3 class="text-base font-semibold text-white">Live Document Camera Scanner</h3>
      </div>
      <button type="button" onclick="closeCameraModal()" class="text-neutral-400 hover:text-white text-xl font-bold">&times;</button>
    </div>

    <div class="relative bg-black rounded-xl overflow-hidden aspect-[4/3] flex items-center justify-center">
      <video id="cameraVideo" autoplay playsinline class="w-full h-full object-cover"></video>
      <canvas id="cameraCanvas" class="hidden"></canvas>
      <div class="absolute inset-4 border-2 border-dashed border-white/30 rounded-lg pointer-events-none flex items-center justify-center">
        <span class="text-xs text-white/50 bg-black/60 px-3 py-1 rounded-full">Align resume sheet inside frame</span>
      </div>
    </div>

    <div class="mt-4 flex items-center justify-between gap-4">
      <div class="text-xs text-neutral-400">
        Captured Pages: <span id="pageCountDisplay" class="font-bold text-white">0</span>
      </div>
      <div class="flex items-center gap-3">
        <button type="button" onclick="switchCameraFacing()" class="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white font-medium transition">
          Flip Camera
        </button>
        <button type="button" onclick="captureSnapshot()" class="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-xs text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
          Snap Page
        </button>
        <button type="button" onclick="saveAndCloseCamera()" class="px-4 py-2 rounded-lg bg-reapmind-blue hover:bg-reapmind-blue-hover text-xs text-white font-bold transition">
          Done
        </button>
      </div>
    </div>
  </div>
</div>

<script>
// Duplicate Check on Mobile Input
let debounceTimer;
const mobileInput = document.getElementById('mobileInput');
const duplicateAlert = document.getElementById('duplicateAlert');
const duplicateMsg = document.getElementById('duplicateMsg');
const duplicateLink = document.getElementById('duplicateLink');

if (mobileInput) {
  mobileInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const val = e.target.value.replace(/\D/g, '').slice(-10);
    if (val.length === 10) {
      debounceTimer = setTimeout(() => {
        fetch(`api/check_duplicate.php?mobile=${val}`)
          .then(res => res.json())
          .then(data => {
            if (data.exists) {
              duplicateAlert.classList.remove('hidden');
              duplicateMsg.textContent = `${data.candidate.full_name} (${data.candidate.candidate_id}) already applied for ${data.candidate.position} on ${data.candidate.created_at}. Status: ${data.candidate.status}`;
              duplicateLink.href = `candidate.php?id=${data.candidate.id}`;
            } else {
              duplicateAlert.classList.add('hidden');
            }
          })
          .catch(() => {});
      }, 350);
    } else {
      duplicateAlert.classList.add('hidden');
    }
  });
}

// Referral field toggle
const sourceSelect = document.getElementById('sourceSelect');
const refDiv = document.getElementById('referredByDiv');
if (sourceSelect) {
  sourceSelect.addEventListener('change', () => {
    if (sourceSelect.value === 'Referral') {
      refDiv.classList.remove('hidden');
    } else {
      refDiv.classList.add('hidden');
    }
  });
}

// File Input Handling
const resumeFileInput = document.getElementById('resumeFileInput');
const fileChosenLabel = document.getElementById('fileChosenLabel');
const filePreviewInfo = document.getElementById('filePreviewInfo');
const fileNameDisplay = document.getElementById('fileNameDisplay');

if (resumeFileInput) {
  resumeFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      fileNameDisplay.textContent = `${file.name} (${(file.size / (1024*1024)).toFixed(2)} MB)`;
      filePreviewInfo.classList.remove('hidden');
      fileChosenLabel.textContent = 'Change Selected File';
    }
  });
}

function clearFileSelection() {
  resumeFileInput.value = '';
  filePreviewInfo.classList.add('hidden');
  fileChosenLabel.textContent = 'Browse Computer for Resume';
}

// Camera Scanner Handling
let mediaStream = null;
let capturedPages = [];
let facingMode = 'environment';

function openCameraModal() {
  document.getElementById('cameraModal').classList.remove('hidden');
  startCameraStream();
}

function closeCameraModal() {
  stopCameraStream();
  document.getElementById('cameraModal').classList.add('hidden');
}

async function startCameraStream() {
  try {
    if (mediaStream) stopCameraStream();
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    document.getElementById('cameraVideo').srcObject = mediaStream;
  } catch (err) {
    alert("Camera permission denied or camera unavailable: " + err.message);
    closeCameraModal();
  }
}

function stopCameraStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}

function switchCameraFacing() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  startCameraStream();
}

function captureSnapshot() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64 = canvas.toDataURL('image/jpeg', 0.88);
  capturedPages.push(base64);
  document.getElementById('pageCountDisplay').textContent = capturedPages.length;
}

function saveAndCloseCamera() {
  document.getElementById('cameraPagesJson').value = JSON.stringify(capturedPages);
  renderCameraThumbnails();
  closeCameraModal();
}

function renderCameraThumbnails() {
  const container = document.getElementById('cameraThumbnails');
  const label = document.getElementById('cameraStatusLabel');
  container.innerHTML = '';

  if (capturedPages.length > 0) {
    container.classList.remove('hidden');
    label.textContent = `Scanned ${capturedPages.length} Page(s) (Click to retake/add)`;

    capturedPages.forEach((p, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'relative w-16 h-20 rounded-lg overflow-hidden border border-emerald-500/40';
      wrap.innerHTML = `
        <img src="${p}" class="w-full h-full object-cover">
        <span class="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center text-white font-mono">P${idx+1}</span>
      `;
      container.appendChild(wrap);
    });
  } else {
    container.classList.add('hidden');
    label.textContent = 'Launch High-Res Camera Scanner';
  }
}
</script>

<?php require_once __DIR__ . '/includes/footer.php'; ?>
