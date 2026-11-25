<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/audit.php';
require_once __DIR__ . '/includes/pdf_helper.php';

// Fetch positions from master_lists
$posStmt = $pdo->query("SELECT value, label FROM master_lists WHERE category = 'POSITION' AND is_active = 1 ORDER BY sort_order ASC");
$positions = $posStmt->fetchAll();

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
    $consent     = isset($_POST['consent']);
    $cameraJson  = trim($_POST['camera_pages_json'] ?? '');

    $mobile = substr(preg_replace('/\D/', '', $mobileRaw), -10);

    if (empty($fullName)) {
        $error = "Please enter your full name.";
    } elseif (strlen($mobile) !== 10) {
        $error = "Please enter a valid 10-digit Indian mobile number.";
    } elseif (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = "Please enter a valid email address.";
    } elseif (!$consent) {
        $error = "You must confirm voluntary consent under the DPDP Act 2023.";
    } else {
        $hasResumeFile = isset($_FILES['resume_file']) && $_FILES['resume_file']['error'] === UPLOAD_ERR_OK;
        $hasCameraPages = !empty($cameraJson);

        if (!$hasResumeFile && !$hasCameraPages) {
            $error = "Please attach a resume file or snap a document photo using the camera.";
        } else {
            // Find default uploader (Front Desk id=1 or first user)
            $uploaderId = (int)$pdo->query("SELECT id FROM users WHERE role = 'FRONT_DESK' LIMIT 1")->fetchColumn() ?: 1;

            $candidateId = getNextCandidateId($pdo);

            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("
                    INSERT INTO candidates 
                    (candidate_id, full_name, mobile, email, position, college, passing_year, location, source, status, consent_flag, uploaded_by_id, created_at)
                    VALUES 
                    (:cid, :name, :mobile, :email, :position, :college, :passing_year, :location, 'Walk-in', 'New', 1, :uploader_id, NOW())
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
                    'uploader_id'  => $uploaderId,
                ]);

                $newCandDbId = (int)$pdo->lastInsertId();

                // Ensure upload directories exist
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
                            'uid'   => $uploaderId,
                        ]);
                    }
                }

                // 2. Process Camera Snapshots (if captured)
                if ($hasCameraPages) {
                    $pages = json_decode($cameraJson, true);
                    if (is_array($pages) && count($pages) > 0) {
                        $snapDiskPaths = [];

                        foreach ($pages as $p) {
                            $pageNo = (int)($p['pageNumber'] ?? 1);
                            $dataUrl = $p['dataUrl'] ?? '';
                            if (strpos($dataUrl, 'base64,') === false) continue;

                            $rawBase64 = explode('base64,', $dataUrl)[1];
                            $binary = base64_decode($rawBase64);
                            if (!$binary) continue;

                            $snapFileName = "snap_{$candidateId}_p{$pageNo}_" . bin2hex(random_bytes(4)) . ".jpg";
                            $snapFull = $snapDir . '/' . $snapFileName;
                            $snapRel  = 'uploads/snapshots/' . $snapFileName;

                            if (file_put_contents($snapFull, $binary)) {
                                $snapDiskPaths[] = $snapFull;

                                $fStmt = $pdo->prepare("
                                    INSERT INTO candidate_files 
                                    (candidate_id, file_type, file_path, file_name, mime_type, file_size, page_number, uploaded_by_id, created_at)
                                    VALUES
                                    (:cid, 'CAMERA_PAGE', :fpath, :fname, 'image/jpeg', :fsize, :pno, :uid, NOW())
                                ");
                                $fStmt->execute([
                                    'cid'   => $newCandDbId,
                                    'fpath' => $snapRel,
                                    'fname' => "Camera Snapshot Page {$pageNo}",
                                    'fsize' => strlen($binary),
                                    'pno'   => $pageNo,
                                    'uid'   => $uploaderId,
                                ]);
                            }
                        }

                        // Merge snapshots into a single PDF
                        if (!empty($snapDiskPaths)) {
                            $pdfFileName = "{$candidateId}_scanned_document.pdf";
                            $pdfFull = $resumeDir . '/' . $pdfFileName;
                            $pdfRel  = 'uploads/resumes/' . $pdfFileName;

                            if (SimpleImagePdf::createFromImages($snapDiskPaths, $pdfFull)) {
                                $fStmt = $pdo->prepare("
                                    INSERT INTO candidate_files 
                                    (candidate_id, file_type, file_path, file_name, mime_type, file_size, uploaded_by_id, created_at)
                                    VALUES
                                    (:cid, 'SCANNED_DOC', :fpath, :fname, 'application/pdf', :fsize, :uid, NOW())
                                ");
                                $fStmt->execute([
                                    'cid'   => $newCandDbId,
                                    'fpath' => $pdfRel,
                                    'fname' => "{$candidateId}-scanned-resume.pdf",
                                    'fsize' => (int)filesize($pdfFull),
                                    'uid'   => $uploaderId,
                                ]);
                            }
                        }
                    }
                }

                // Log audit
                logAudit($pdo, $uploaderId, 'Self-Registration Portal', 'CANDIDATE_INTAKE', 'Candidate', (string)$newCandDbId, "Walk-in application check-in submitted for {$fullName} ({$candidateId})", $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');

                // Broadcast in-app notification to HR and Directors
                broadcastNotification($pdo, ['HR', 'DIRECTOR', 'CEO'], $newCandDbId, "Walk-In: {$fullName}", "New walk-in candidate {$fullName} ({$position}) checked in.", "NEW_CANDIDATE");

                $pdo->commit();

                $successCandidate = [
                    'candidateId' => $candidateId,
                    'fullName'    => $fullName,
                    'position'    => $position,
                    'createdAt'   => date('d M Y, h:i A'),
                ];
            } catch (Exception $e) {
                $pdo->rollBack();
                $error = "Submission failed: " . $e->getMessage();
            }
        }
    }
}
$pageTitle = "Walk-In Check-In | ReapMind Innovations";
?>
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= $pageTitle ?></title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            reapmind: {
              obsidian: '#0A0A0B',
              header: '#121316',
              surface: '#18191E',
              blue: '#0066FF',
              'blue-hover': '#0052CC',
              yellow: '#F59E0B',
            }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-black text-white min-h-screen flex flex-col justify-between selection:bg-reapmind-blue selection:text-white">

  <!-- Glow Background -->
  <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-reapmind-blue/[0.14] rounded-full blur-[140px] pointer-events-none"></div>

  <!-- Header -->
  <header class="relative z-10 border-b border-white/[0.08] bg-black/60 backdrop-blur-md py-4 px-6">
    <div class="max-w-4xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-3">
        <img src="assets/images/reapmind-logo.png" alt="ReapMind Innovations" class="h-9 sm:h-10 w-auto object-contain brightness-0 invert">
        <div class="pl-3 border-l border-white/10 hidden sm:block">
          <span class="text-[10px] font-bold uppercase tracking-wider text-reapmind-yellow font-mono">WALK-IN CHECK-IN</span>
          <span class="text-xs text-neutral-400 block -mt-0.5">Kolhapur Office</span>
        </div>
      </div>
      <a href="login.php" class="text-xs text-neutral-400 hover:text-white px-3.5 py-1.5 rounded-full border border-white/[0.1] hover:bg-white/[0.05] transition">
        Staff Login →
      </a>
    </div>
  </header>

  <!-- Main Content -->
  <main class="relative z-10 max-w-2xl w-full mx-auto px-4 py-8 flex-1">
    <?php if ($successCandidate): ?>
    <!-- SUCCESS CHECK-IN PASS -->
    <div class="bg-reapmind-header border border-emerald-500/30 rounded-3xl p-8 sm:p-10 shadow-2xl text-center">
      <div class="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30 text-2xl font-bold">
        ✓
      </div>
      <span class="text-[11px] font-bold uppercase tracking-widest text-emerald-400 font-mono">CHECK-IN CONFIRMED</span>
      <h1 class="text-2xl sm:text-3xl font-extrabold text-white mt-1">Application Received!</h1>
      <p class="text-neutral-400 text-xs sm:text-sm mt-2 max-w-md mx-auto">
        Your details and resume documents have been submitted to the ReapMind HR operations team.
      </p>

      <div class="my-8 p-6 bg-black/80 rounded-2xl border border-white/[0.08] max-w-md mx-auto text-left">
        <span class="text-[10px] uppercase font-bold text-neutral-500 font-mono block">Your Candidate ID</span>
        <span class="text-2xl font-mono font-extrabold text-reapmind-yellow block my-1">
          <?= htmlspecialchars($successCandidate['candidateId']) ?>
        </span>
        <div class="mt-4 pt-4 border-t border-white/[0.08] text-xs text-neutral-400 space-y-1">
          <p><strong class="text-white">Name:</strong> <?= htmlspecialchars($successCandidate['fullName']) ?></p>
          <p><strong class="text-white">Applied For:</strong> <?= htmlspecialchars($successCandidate['position']) ?></p>
          <p><strong class="text-white">Time:</strong> <?= htmlspecialchars($successCandidate['createdAt']) ?></p>
        </div>
      </div>

      <div class="space-y-3">
        <p class="text-xs text-neutral-500">Please take a screenshot of your Candidate ID for desk verification.</p>
        <a href="apply.php" class="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold transition">
          Submit Another Application
        </a>
      </div>
    </div>

    <?php else: ?>
    <!-- REGISTRATION FORM -->
    <div class="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
      <div class="mb-8">
        <span class="text-[11px] font-bold uppercase tracking-wider text-reapmind-yellow font-mono block mb-1">
          STUDENT & CANDIDATE SELF-APPLY
        </span>
        <h1 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">Walk-In Registration</h1>
        <p class="text-xs sm:text-sm text-neutral-400 mt-1.5 leading-relaxed">
          Applying at ReapMind Innovations? Fill out your basic details and upload your resume below to check in.
        </p>
      </div>

      <?php if ($error): ?>
      <div class="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
        <?= htmlspecialchars($error) ?>
      </div>
      <?php endif; ?>

      <form method="POST" action="apply.php" enctype="multipart/form-data" class="space-y-5" id="applyForm">
        <!-- Hidden input for camera snapshots -->
        <input type="hidden" name="camera_pages_json" id="cameraPagesJson" value="">

        <!-- Full Name -->
        <div>
          <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
            Full Name <span class="text-rose-400">*</span>
          </label>
          <input type="text" name="full_name" required placeholder="e.g. Rahul Patil" class="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue transition">
        </div>

        <!-- Mobile & Email -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
              Mobile Number <span class="text-rose-400">*</span>
            </label>
            <div class="relative">
              <span class="absolute left-4 top-3 text-sm text-neutral-500 font-medium">+91</span>
              <input type="tel" name="mobile" required maxlength="10" placeholder="9876543210" class="w-full pl-12 pr-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue transition">
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
              Email Address <span class="text-rose-400">*</span>
            </label>
            <input type="email" name="email" required placeholder="rahul.patil@gmail.com" class="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue transition">
          </div>
        </div>

        <!-- Position Applied For -->
        <div>
          <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
            Position / Internship Applied For <span class="text-rose-400">*</span>
          </label>
          <select name="position" required class="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white focus:outline-none focus:border-reapmind-blue transition">
            <?php foreach ($positions as $p): ?>
              <option value="<?= htmlspecialchars($p['value']) ?>" class="bg-neutral-900"><?= htmlspecialchars($p['label']) ?></option>
            <?php endforeach; ?>
          </select>
        </div>

        <!-- College & Graduation Year -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">College / University</label>
            <input type="text" name="college" placeholder="e.g. DKTE / KIT / Shivaji Univ" class="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue transition">
          </div>
          <div>
            <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">Graduation Year / Experience</label>
            <select name="passing_year" class="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white focus:outline-none focus:border-reapmind-blue transition">
              <option value="2026 Batch (Final Year)" class="bg-neutral-900">2026 Batch (Final Year)</option>
              <option value="2025 Batch (Recent Grad)" class="bg-neutral-900">2025 Batch (Recent Grad)</option>
              <option value="2024 Batch" class="bg-neutral-900">2024 Batch</option>
              <option value="1–2 Years Experience" class="bg-neutral-900">1–2 Years Experience</option>
              <option value="3+ Years Experience" class="bg-neutral-900">3+ Years Experience</option>
            </select>
          </div>
        </div>

        <!-- Location -->
        <div>
          <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">Current City / Location</label>
          <input type="text" name="location" value="Kolhapur" placeholder="Kolhapur, Sangli, Pune..." class="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue transition">
        </div>

        <!-- DUAL RESUME ATTACHMENT SECTION (FILE + CAMERA SCAN) -->
        <div class="pt-2">
          <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
            Attach Resume / CV Document <span class="text-rose-400">*</span>
          </label>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- 1. File Upload Card -->
            <div class="relative">
              <label id="fileUploadLabel" class="w-full flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl cursor-pointer transition border-white/[0.1] bg-black/40 hover:border-reapmind-blue/60 hover:bg-black/60">
                <input type="file" name="resume_file" id="resumeFileInput" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" class="sr-only">
                <span class="text-2xl mb-1.5 text-neutral-400" id="fileIcon">📄</span>
                <span class="text-xs font-semibold text-white truncate max-w-[200px]" id="fileNameText">Upload File (PDF / Word)</span>
                <span class="text-[10px] text-neutral-500 mt-0.5" id="fileSizeText">Tap to browse on phone</span>
              </label>
              <button type="button" id="removeFileBtn" class="hidden absolute top-2 right-2 p-1.5 rounded-full bg-neutral-800 text-neutral-300 hover:bg-rose-500 hover:text-white transition" title="Remove file">
                ✕
              </button>
            </div>

            <!-- 2. Camera Snapshot Card -->
            <div class="relative">
              <button type="button" id="openCameraBtn" class="w-full flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl transition border-white/[0.1] bg-black/40 hover:border-reapmind-yellow/60 hover:bg-black/60">
                <span class="text-2xl mb-1.5 text-reapmind-yellow" id="cameraIcon">📷</span>
                <span class="text-xs font-semibold text-white" id="cameraTitleText">Snap / Scan Resume</span>
                <span class="text-[10px] text-neutral-500 mt-0.5" id="cameraSubText">Use phone/device camera</span>
              </button>
              <button type="button" id="removeCameraBtn" class="hidden absolute top-2 right-2 p-1.5 rounded-full bg-neutral-800 text-neutral-300 hover:bg-rose-500 hover:text-white transition" title="Remove camera snapshots">
                ✕
              </button>
            </div>
          </div>

          <p id="dualAttachedNote" class="hidden mt-2.5 text-xs text-emerald-400 font-medium text-center">
            ✓ Both uploaded resume file and camera snapshots will be submitted together.
          </p>
        </div>

        <!-- Privacy Consent -->
        <div class="pt-2">
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" name="consent" checked required class="mt-0.5 w-4 h-4 rounded border-neutral-700 text-reapmind-blue focus:ring-reapmind-blue bg-black/60">
            <span class="text-[11px] text-neutral-400 leading-relaxed">
              I confirm that my personal information and resume are submitted voluntarily for interview evaluation at ReapMind Innovations Pvt. Ltd. under the Digital Personal Data Protection Act, 2023.
            </span>
          </label>
        </div>

        <!-- Submit Button -->
        <div class="pt-3">
          <button type="submit" id="submitBtn" class="w-full py-4 px-8 rounded-full bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold uppercase tracking-wider shadow-xl shadow-reapmind-blue/25 transition flex items-center justify-center gap-2">
            <span>Check In & Submit Application →</span>
          </button>
        </div>
      </form>
    </div>
    <?php endif; ?>
  </main>

  <!-- CAMERA SCANNER MODAL (In-Browser Camera Scan with HTML5 MediaDevices) -->
  <div id="cameraModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
    <div class="bg-reapmind-header border border-white/[0.1] rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div>
          <h3 class="text-sm font-bold text-white">Document Camera Scanner</h3>
          <p class="text-[11px] text-neutral-400">Position resume page in frame and capture</p>
        </div>
        <button type="button" id="closeCameraBtn" class="text-neutral-400 hover:text-white text-lg">✕</button>
      </div>

      <!-- Video Feed & Captured Canvas Container -->
      <div class="relative bg-black rounded-2xl overflow-hidden aspect-[3/4] max-h-[460px] my-4 flex items-center justify-center border border-white/[0.06]">
        <video id="cameraVideo" autoplay playsinline class="w-full h-full object-cover"></video>
        <canvas id="cameraCanvas" class="hidden"></canvas>
      </div>

      <!-- Camera Capture Action Controls -->
      <div class="flex items-center justify-between pt-2">
        <button type="button" id="switchCameraBtn" class="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-full bg-white/[0.06]">
          🔄 Flip
        </button>
        <button type="button" id="captureBtn" class="px-6 py-2.5 bg-reapmind-yellow hover:bg-amber-400 text-black font-extrabold text-xs rounded-full shadow-lg transition">
          📸 Capture Page
        </button>
        <button type="button" id="doneCameraBtn" class="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs rounded-full transition">
          Done (<span id="capturedCount">0</span>)
        </button>
      </div>
    </div>
  </div>

  <footer class="relative z-10 border-t border-white/[0.08] py-4 text-center text-xs text-neutral-500">
    <p>© <?= date('Y') ?> ReapMind Innovations Pvt. Ltd. • Kolhapur Delivery Center</p>
  </footer>

  <!-- CLIENT-SIDE SCRIPT FOR DUAL UPLOAD & CAMERA SCANNER -->
  <script>
    let capturedPages = [];
    let videoStream = null;
    let currentFacingMode = 'environment';

    const resumeFileInput = document.getElementById('resumeFileInput');
    const fileUploadLabel = document.getElementById('fileUploadLabel');
    const fileNameText    = document.getElementById('fileNameText');
    const fileSizeText    = document.getElementById('fileSizeText');
    const removeFileBtn   = document.getElementById('removeFileBtn');

    const openCameraBtn   = document.getElementById('openCameraBtn');
    const cameraIcon      = document.getElementById('cameraIcon');
    const cameraTitleText = document.getElementById('cameraTitleText');
    const cameraSubText   = document.getElementById('cameraSubText');
    const removeCameraBtn = document.getElementById('removeCameraBtn');
    const dualAttachedNote= document.getElementById('dualAttachedNote');

    const cameraModal     = document.getElementById('cameraModal');
    const cameraVideo     = document.getElementById('cameraVideo');
    const cameraCanvas    = document.getElementById('cameraCanvas');
    const captureBtn      = document.getElementById('captureBtn');
    const doneCameraBtn   = document.getElementById('doneCameraBtn');
    const closeCameraBtn  = document.getElementById('closeCameraBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const capturedCount   = document.getElementById('capturedCount');
    const cameraPagesJson = document.getElementById('cameraPagesJson');

    // File input handler
    if (resumeFileInput) {
      resumeFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          const f = e.target.files[0];
          fileNameText.innerText = f.name;
          fileSizeText.innerText = (f.size / 1024 / 1024).toFixed(2) + ' MB attached';
          fileUploadLabel.classList.add('border-emerald-500', 'bg-emerald-500/10');
          fileUploadLabel.classList.remove('border-white/[0.1]', 'bg-black/40');
          removeFileBtn.classList.remove('hidden');
          updateDualNotice();
        }
      });

      removeFileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resumeFileInput.value = '';
        fileNameText.innerText = 'Upload File (PDF / Word)';
        fileSizeText.innerText = 'Tap to browse on phone';
        fileUploadLabel.classList.remove('border-emerald-500', 'bg-emerald-500/10');
        fileUploadLabel.classList.add('border-white/[0.1]', 'bg-black/40');
        removeFileBtn.classList.add('hidden');
        updateDualNotice();
      });
    }

    // Camera Handlers
    if (openCameraBtn) {
      openCameraBtn.addEventListener('click', async () => {
        cameraModal.classList.remove('hidden');
        startCameraStream();
      });

      closeCameraBtn.addEventListener('click', stopCameraStream);
      doneCameraBtn.addEventListener('click', stopCameraStream);

      switchCameraBtn.addEventListener('click', () => {
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        startCameraStream();
      });

      captureBtn.addEventListener('click', () => {
        if (!cameraVideo.videoWidth) return;
        cameraCanvas.width = cameraVideo.videoWidth;
        cameraCanvas.height = cameraVideo.videoHeight;
        const ctx = cameraCanvas.getContext('2d');
        ctx.drawImage(cameraVideo, 0, 0);
        const dataUrl = cameraCanvas.toDataURL('image/jpeg', 0.9);
        capturedPages.push({ pageNumber: capturedPages.length + 1, dataUrl: dataUrl });
        capturedCount.innerText = capturedPages.length;
        syncCameraState();
      });

      removeCameraBtn.addEventListener('click', (e) => {
        e.preventDefault();
        capturedPages = [];
        capturedCount.innerText = '0';
        syncCameraState();
      });
    }

    async function startCameraStream() {
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
      }
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: currentFacingMode }
        });
        cameraVideo.srcObject = videoStream;
      } catch (err) {
        alert("Camera permission denied or camera not found: " + err.message);
        cameraModal.classList.add('hidden');
      }
    }

    function stopCameraStream() {
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
      }
      cameraModal.classList.add('hidden');
      syncCameraState();
    }

    function syncCameraState() {
      if (capturedPages.length > 0) {
        cameraPagesJson.value = JSON.stringify(capturedPages);
        cameraTitleText.innerText = capturedPages.length + " Page(s) Captured ✓";
        cameraSubText.innerText = "Camera scan attached";
        openCameraBtn.classList.add('border-emerald-500', 'bg-emerald-500/10');
        openCameraBtn.classList.remove('border-white/[0.1]', 'bg-black/40');
        removeCameraBtn.classList.remove('hidden');
      } else {
        cameraPagesJson.value = '';
        cameraTitleText.innerText = "Snap / Scan Resume";
        cameraSubText.innerText = "Use phone/device camera";
        openCameraBtn.classList.remove('border-emerald-500', 'bg-emerald-500/10');
        openCameraBtn.classList.add('border-white/[0.1]', 'bg-black/40');
        removeCameraBtn.classList.add('hidden');
      }
      updateDualNotice();
    }

    function updateDualNotice() {
      const hasFile = resumeFileInput && resumeFileInput.files && resumeFileInput.files.length > 0;
      const hasCam  = capturedPages.length > 0;
      if (hasFile && hasCam) {
        dualAttachedNote.classList.remove('hidden');
      } else {
        dualAttachedNote.classList.add('hidden');
      }
    }
  </script>
</body>
</html>
