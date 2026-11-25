<?php
$pageTitle = "HR Dashboard | Candidate Pipeline - ReapMind Innovations";
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/audit.php';

requireAuth();
$currentUser = getCurrentUser();

// Front Desk staff belong in Intake Desk
if ($currentUser['role'] === 'FRONT_DESK') {
    header("Location: intake.php");
    exit;
}

// Handle Quick AJAX / POST Actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $candId = (int)($_POST['candidate_id'] ?? 0);

    if ($action === 'assign_interviewer' && $candId > 0) {
        $interviewerId = !empty($_POST['interviewer_id']) ? (int)$_POST['interviewer_id'] : null;
        
        $pdo->beginTransaction();
        try {
            // Update active assignment
            $pdo->prepare("UPDATE assignments SET is_active = 0 WHERE candidate_id = :cid")->execute(['cid' => $candId]);

            if ($interviewerId) {
                $stmt = $pdo->prepare("
                    INSERT INTO assignments (candidate_id, interviewer_id, assigned_by_id, is_active, assigned_at)
                    VALUES (:cid, :iid, :uid, 1, NOW())
                ");
                $stmt->execute(['cid' => $candId, 'iid' => $interviewerId, 'uid' => (int)$currentUser['id']]);

                // Update candidate status to Assigned if currently New
                $pdo->prepare("UPDATE candidates SET status = 'Assigned' WHERE id = :cid AND status = 'New'")->execute(['cid' => $candId]);

                $interviewerName = $pdo->query("SELECT name FROM users WHERE id = $interviewerId")->fetchColumn();
                logAudit($pdo, (int)$currentUser['id'], 'INTERVIEWER_ASSIGNED', 'CANDIDATE', (string)$candId, "Assigned to $interviewerName");
                
                // Notify interviewer
                createNotification($pdo, $interviewerId, $candId, 'New Candidate Assigned', "You have been assigned candidate ID #$candId for interview.", 'ASSIGNMENT');
            } else {
                logAudit($pdo, (int)$currentUser['id'], 'INTERVIEWER_UNASSIGNED', 'CANDIDATE', (string)$candId, "Unassigned interviewer");
            }
            $pdo->commit();
            header("Location: dashboard.php?msg=assigned");
            exit;
        } catch (Exception $e) {
            $pdo->rollBack();
            $error = $e->getMessage();
        }
    }

    if ($action === 'update_status' && $candId > 0) {
        $newStatus = trim($_POST['status'] ?? '');
        $allowed = ['New', 'Screening', 'Assigned', 'Interviewed', 'Selected', 'Rejected', 'On Hold'];
        if (in_array($newStatus, $allowed)) {
            $oldStatus = $pdo->query("SELECT status FROM candidates WHERE id = $candId")->fetchColumn();
            $stmt = $pdo->prepare("UPDATE candidates SET status = :status, updated_at = NOW() WHERE id = :id");
            $stmt->execute(['status' => $newStatus, 'id' => $candId]);

            logAudit($pdo, (int)$currentUser['id'], 'STATUS_CHANGE', 'CANDIDATE', (string)$candId, "Status changed from '$oldStatus' to '$newStatus'");
            header("Location: dashboard.php?msg=status_updated");
            exit;
        }
    }
}

// Query Filters
$search      = trim($_GET['search'] ?? '');
$filterPos   = trim($_GET['position'] ?? '');
$filterStat  = trim($_GET['status'] ?? '');
$filterInt   = trim($_GET['interviewer'] ?? '');
$filterDate  = trim($_GET['date'] ?? '');

$whereClauses = ["1=1"];
$params = [];

if (!empty($search)) {
    $whereClauses[] = "(c.full_name LIKE :s1 OR c.candidate_id LIKE :s2 OR c.mobile LIKE :s3 OR c.email LIKE :s4 OR c.college LIKE :s5)";
    $like = "%$search%";
    $params['s1'] = $like;
    $params['s2'] = $like;
    $params['s3'] = $like;
    $params['s4'] = $like;
    $params['s5'] = $like;
}

if (!empty($filterPos)) {
    $whereClauses[] = "c.position = :pos";
    $params['pos'] = $filterPos;
}

if (!empty($filterStat)) {
    $whereClauses[] = "c.status = :stat";
    $params['stat'] = $filterStat;
}

if (!empty($filterInt)) {
    $whereClauses[] = "a.interviewer_id = :interviewer_id AND a.is_active = 1";
    $params['interviewer_id'] = (int)$filterInt;
}

if (!empty($filterDate)) {
    $whereClauses[] = "DATE(c.created_at) = :cdate";
    $params['cdate'] = $filterDate;
}

$whereSql = implode(" AND ", $whereClauses);

// Check if Export CSV requested
if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    $exportSql = "
        SELECT 
            c.candidate_id, c.full_name, c.mobile, c.email, c.position, c.college, c.passing_year, 
            c.location, c.source, c.status, u_int.name as interviewer_name, c.created_at
        FROM candidates c
        LEFT JOIN assignments a ON a.candidate_id = c.id AND a.is_active = 1
        LEFT JOIN users u_int ON u_int.id = a.interviewer_id
        WHERE $whereSql
        ORDER BY c.id DESC
    ";
    $stmt = $pdo->prepare($exportSql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="candidates_' . date('Y-m-d_His') . '.csv"');
    $output = fopen('php://output', 'w');
    fputcsv($output, ['Candidate ID', 'Full Name', 'Mobile', 'Email', 'Position', 'College', 'Passing Year', 'Location', 'Source', 'Status', 'Interviewer', 'Date Registered']);

    foreach ($rows as $r) {
        fputcsv($output, [
            $r['candidate_id'],
            $r['full_name'],
            $r['mobile'],
            $r['email'],
            $r['position'],
            $r['college'],
            $r['passing_year'],
            $r['location'],
            $r['source'],
            $r['status'],
            $r['interviewer_name'] ?: 'Unassigned',
            $r['created_at']
        ]);
    }
    fclose($output);
    exit;
}

// Fetch KPI Metrics
$totalCand     = (int)$pdo->query("SELECT COUNT(*) FROM candidates")->fetchColumn();
$todayCand     = (int)$pdo->query("SELECT COUNT(*) FROM candidates WHERE DATE(created_at) = CURDATE()")->fetchColumn();
$newCand       = (int)$pdo->query("SELECT COUNT(*) FROM candidates WHERE status = 'New'")->fetchColumn();
$interviewCand = (int)$pdo->query("SELECT COUNT(*) FROM candidates WHERE status IN ('Assigned', 'Screening', 'Interviewed')")->fetchColumn();
$selectedCand  = (int)$pdo->query("SELECT COUNT(*) FROM candidates WHERE status = 'Selected'")->fetchColumn();

// Fetch Interviewers for dropdown
$interviewers = $pdo->query("SELECT id, name, role FROM users WHERE role IN ('INTERVIEWER', 'HR_HEAD', 'ADMIN') AND is_active = 1 ORDER BY name ASC")->fetchAll();

// Fetch Positions for filter
$positions = $pdo->query("SELECT value, label FROM master_lists WHERE category = 'POSITION' AND is_active = 1 ORDER BY sort_order ASC")->fetchAll();

// Fetch Candidates List
$listSql = "
    SELECT 
        c.*,
        a.interviewer_id,
        u_int.name as interviewer_name,
        (SELECT COUNT(*) FROM candidate_files WHERE candidate_id = c.id AND file_type = 'RESUME') as resume_count,
        (SELECT COUNT(*) FROM candidate_files WHERE candidate_id = c.id AND file_type = 'DOCUMENT_SCAN') as scan_count,
        f.overall_rating,
        f.recommendation
    FROM candidates c
    LEFT JOIN assignments a ON a.candidate_id = c.id AND a.is_active = 1
    LEFT JOIN users u_int ON u_int.id = a.interviewer_id
    LEFT JOIN interview_feedbacks f ON f.candidate_id = c.id
    WHERE $whereSql
    ORDER BY c.id DESC
    LIMIT 100
";
$candStmt = $pdo->prepare($listSql);
$candStmt->execute($params);
$candidates = $candStmt->fetchAll();

require_once __DIR__ . '/includes/header.php';
?>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

  <!-- Header & Export Action -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
    <div>
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-reapmind-blue/10 border border-reapmind-blue/20 text-reapmind-blue text-xs font-semibold mb-2">
        <span>HR Operations Center</span>
        <span class="text-neutral-500">•</span>
        <span class="text-neutral-400">Kolhapur Facility</span>
      </div>
      <h1 class="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white">Candidate Pipeline</h1>
      <p class="text-xs sm:text-sm text-neutral-400 mt-1">Real-time walk-in intake, interviewer assignment, document inspection, and hiring outcomes.</p>
    </div>
    <div class="flex items-center gap-3">
      <a href="intake.php" class="px-4 py-2 rounded-xl bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-reapmind-blue/20">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
        <span>New Intake</span>
      </a>
      <a href="?<?= http_build_query(array_merge($_GET, ['export' => 'csv'])) ?>" class="px-3.5 py-2 rounded-xl border border-white/10 hover:bg-white/[0.08] text-xs font-semibold text-neutral-300 transition flex items-center gap-1.5">
        <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <span>Export CSV</span>
      </a>
    </div>
  </div>

  <!-- KPI Metric Cards -->
  <div class="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 mb-8">
    <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-4 sm:p-5 backdrop-blur-sm">
      <div class="text-[11px] font-medium uppercase tracking-wider text-neutral-400 mb-1">Total Intake</div>
      <div class="text-2xl sm:text-3xl font-bold font-mono text-white"><?= number_format($totalCand) ?></div>
      <div class="text-[11px] text-neutral-500 mt-1">All recorded candidates</div>
    </div>

    <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-4 sm:p-5 backdrop-blur-sm">
      <div class="text-[11px] font-medium uppercase tracking-wider text-reapmind-blue mb-1">Today's Intake</div>
      <div class="text-2xl sm:text-3xl font-bold font-mono text-reapmind-blue"><?= number_format($todayCand) ?></div>
      <div class="text-[11px] text-neutral-500 mt-1">Checked in today</div>
    </div>

    <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-4 sm:p-5 backdrop-blur-sm">
      <div class="text-[11px] font-medium uppercase tracking-wider text-reapmind-yellow mb-1">Pending Review</div>
      <div class="text-2xl sm:text-3xl font-bold font-mono text-reapmind-yellow"><?= number_format($newCand) ?></div>
      <div class="text-[11px] text-neutral-500 mt-1">Status: New</div>
    </div>

    <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-4 sm:p-5 backdrop-blur-sm">
      <div class="text-[11px] font-medium uppercase tracking-wider text-indigo-400 mb-1">In Evaluation</div>
      <div class="text-2xl sm:text-3xl font-bold font-mono text-indigo-400"><?= number_format($interviewCand) ?></div>
      <div class="text-[11px] text-neutral-500 mt-1">Active interview loop</div>
    </div>

    <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-4 sm:p-5 backdrop-blur-sm col-span-2 lg:col-span-1">
      <div class="text-[11px] font-medium uppercase tracking-wider text-emerald-400 mb-1">Selected / Offered</div>
      <div class="text-2xl sm:text-3xl font-bold font-mono text-emerald-400"><?= number_format($selectedCand) ?></div>
      <div class="text-[11px] text-neutral-500 mt-1">Successful hires</div>
    </div>
  </div>

  <!-- Filters & Search Toolbar -->
  <form method="GET" class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-4 sm:p-5 mb-6 backdrop-blur-sm">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <!-- Search Input -->
      <div class="lg:col-span-2">
        <label class="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">Search Candidates</label>
        <div class="relative">
          <input type="text" name="search" value="<?= htmlspecialchars($search) ?>" placeholder="Search name, ID, mobile, email, college..."
            class="w-full pl-9 pr-3.5 py-2 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-reapmind-blue transition">
          <svg class="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
      </div>

      <!-- Position Filter -->
      <div>
        <label class="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">Position</label>
        <select name="position" class="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
          <option value="">All Positions</option>
          <?php foreach ($positions as $p): ?>
            <option value="<?= htmlspecialchars($p['value']) ?>" <?= ($filterPos === $p['value']) ? 'selected' : '' ?>>
              <?= htmlspecialchars($p['label']) ?>
            </option>
          <?php endforeach; ?>
        </select>
      </div>

      <!-- Status Filter -->
      <div>
        <label class="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">Status</label>
        <select name="status" class="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
          <option value="">All Statuses</option>
          <option value="New" <?= ($filterStat === 'New') ? 'selected' : '' ?>>New</option>
          <option value="Screening" <?= ($filterStat === 'Screening') ? 'selected' : '' ?>>Screening</option>
          <option value="Assigned" <?= ($filterStat === 'Assigned') ? 'selected' : '' ?>>Assigned</option>
          <option value="Interviewed" <?= ($filterStat === 'Interviewed') ? 'selected' : '' ?>>Interviewed</option>
          <option value="Selected" <?= ($filterStat === 'Selected') ? 'selected' : '' ?>>Selected</option>
          <option value="Rejected" <?= ($filterStat === 'Rejected') ? 'selected' : '' ?>>Rejected</option>
          <option value="On Hold" <?= ($filterStat === 'On Hold') ? 'selected' : '' ?>>On Hold</option>
        </select>
      </div>

      <!-- Filter Buttons -->
      <div class="flex items-end gap-2">
        <button type="submit" class="flex-1 py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-semibold transition border border-white/10 text-center">
          Filter
        </button>
        <?php if (!empty($search) || !empty($filterPos) || !empty($filterStat) || !empty($filterInt) || !empty($filterDate)): ?>
          <a href="dashboard.php" class="py-2 px-3 rounded-xl border border-white/10 hover:bg-white/[0.05] text-neutral-400 hover:text-white text-xs font-medium transition">
            Reset
          </a>
        <?php endif; ?>
      </div>
    </div>
  </form>

  <!-- Candidate Records Table -->
  <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead class="bg-white/[0.02] border-b border-white/[0.08] text-neutral-400 uppercase font-mono tracking-wider text-[11px]">
          <tr>
            <th class="py-3.5 px-4 font-semibold">Candidate ID</th>
            <th class="py-3.5 px-4 font-semibold">Candidate Details</th>
            <th class="py-3.5 px-4 font-semibold">Position & Source</th>
            <th class="py-3.5 px-4 font-semibold">Documents</th>
            <th class="py-3.5 px-4 font-semibold">Interviewer</th>
            <th class="py-3.5 px-4 font-semibold">Status</th>
            <th class="py-3.5 px-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/[0.05] text-neutral-300">
          <?php if (empty($candidates)): ?>
            <tr>
              <td colspan="7" class="py-12 text-center text-neutral-500">
                <svg class="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                No candidates found matching the active criteria.
              </td>
            </tr>
          <?php else: ?>
            <?php foreach ($candidates as $c): ?>
              <tr class="hover:bg-white/[0.02] transition">
                <!-- ID -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <a href="candidate.php?id=<?= $c['id'] ?>" class="font-mono font-bold text-reapmind-blue hover:underline">
                    <?= htmlspecialchars($c['candidate_id']) ?>
                  </a>
                  <div class="text-[10px] text-neutral-500 mt-0.5"><?= timeAgo($c['created_at']) ?></div>
                </td>

                <!-- Candidate Name & Contact -->
                <td class="py-3.5 px-4">
                  <div class="font-semibold text-white text-sm"><?= htmlspecialchars($c['full_name']) ?></div>
                  <div class="flex items-center gap-2 text-neutral-400 text-[11px] mt-0.5">
                    <span><?= htmlspecialchars($c['mobile']) ?></span>
                    <span>•</span>
                    <span class="truncate max-w-[150px]"><?= htmlspecialchars($c['email']) ?></span>
                  </div>
                  <?php if ($c['college']): ?>
                    <div class="text-[10px] text-neutral-500 mt-0.5 truncate max-w-[200px]"><?= htmlspecialchars($c['college']) ?> (<?= htmlspecialchars($c['passing_year'] ?: 'N/A') ?>)</div>
                  <?php endif; ?>
                </td>

                <!-- Position & Source -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <div class="font-medium text-white"><?= htmlspecialchars($c['position']) ?></div>
                  <div class="inline-flex items-center gap-1 text-[10px] text-neutral-400 mt-0.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-neutral-500"></span>
                    <span><?= htmlspecialchars($c['source']) ?></span>
                  </div>
                </td>

                <!-- Document Indicators (Both Tabs Supported) -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <div class="flex flex-col gap-1">
                    <?php if ($c['resume_count'] > 0): ?>
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-mono">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        Resume File
                      </span>
                    <?php endif; ?>

                    <?php if ($c['scan_count'] > 0): ?>
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
                        Camera Scans (<?= $c['scan_count'] ?>)
                      </span>
                    <?php endif; ?>
                  </div>
                </td>

                <!-- Interviewer Assignment -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <form method="POST" class="inline-block">
                    <input type="hidden" name="action" value="assign_interviewer">
                    <input type="hidden" name="candidate_id" value="<?= $c['id'] ?>">
                    <select name="interviewer_id" onchange="this.form.submit()" class="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-neutral-300 text-xs focus:outline-none focus:border-reapmind-blue transition">
                      <option value="">-- Unassigned --</option>
                      <?php foreach ($interviewers as $int): ?>
                        <option value="<?= $int['id'] ?>" <?= ($c['interviewer_id'] == $int['id']) ? 'selected' : '' ?>>
                          <?= htmlspecialchars($int['name']) ?>
                        </option>
                      <?php endforeach; ?>
                    </select>
                  </form>
                </td>

                <!-- Status Badge -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <form method="POST" class="inline-block">
                    <input type="hidden" name="action" value="update_status">
                    <input type="hidden" name="candidate_id" value="<?= $c['id'] ?>">
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
                      $badgeClass = $statusColors[$c['status']] ?? 'bg-white/10 text-white border-white/20';
                    ?>
                    <select name="status" onchange="this.form.submit()" class="px-2.5 py-1 rounded-full text-[11px] font-semibold border <?= $badgeClass ?> bg-black/60 focus:outline-none transition cursor-pointer">
                      <option value="New" <?= ($c['status'] === 'New') ? 'selected' : '' ?>>New</option>
                      <option value="Screening" <?= ($c['status'] === 'Screening') ? 'selected' : '' ?>>Screening</option>
                      <option value="Assigned" <?= ($c['status'] === 'Assigned') ? 'selected' : '' ?>>Assigned</option>
                      <option value="Interviewed" <?= ($c['status'] === 'Interviewed') ? 'selected' : '' ?>>Interviewed</option>
                      <option value="Selected" <?= ($c['status'] === 'Selected') ? 'selected' : '' ?>>Selected</option>
                      <option value="Rejected" <?= ($c['status'] === 'Rejected') ? 'selected' : '' ?>>Rejected</option>
                      <option value="On Hold" <?= ($c['status'] === 'On Hold') ? 'selected' : '' ?>>On Hold</option>
                    </select>
                  </form>
                </td>

                <!-- Actions -->
                <td class="py-3.5 px-4 whitespace-nowrap text-right">
                  <a href="candidate.php?id=<?= $c['id'] ?>" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-reapmind-blue/15 hover:bg-reapmind-blue text-reapmind-blue hover:text-white font-medium text-xs transition">
                    <span>View Profile</span>
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                  </a>
                </td>
              </tr>
            <?php endforeach; ?>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>

</div>

<?php require_once __DIR__ . '/includes/footer.php'; ?>
