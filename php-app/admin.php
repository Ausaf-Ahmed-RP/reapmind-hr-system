<?php
$pageTitle = "Administration & Governance | ReapMind Innovations";
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/audit.php';

requireAuth();
$currentUser = getCurrentUser();

// Only ADMIN can access administration console
if ($currentUser['role'] !== 'ADMIN') {
    header("Location: dashboard.php?error=forbidden");
    exit;
}

$tab = $_GET['tab'] ?? 'users';
$msg = null;
$error = null;

// Handle Admin Actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    // Create New User
    if ($action === 'create_user') {
        $name     = trim($_POST['name'] ?? '');
        $email    = trim($_POST['email'] ?? '');
        $role     = trim($_POST['role'] ?? '');
        $password = trim($_POST['password'] ?? '');

        $validRoles = ['FRONT_DESK', 'INTERVIEWER', 'HR_OPS', 'HR_HEAD', 'ADMIN'];
        if (empty($name) || empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = "Please provide a valid name and email address.";
        } elseif (!in_array($role, $validRoles)) {
            $error = "Please select a valid staff role.";
        } elseif (strlen($password) < 6) {
            $error = "Password must be at least 6 characters.";
        } else {
            // Check email uniqueness
            $chk = $pdo->prepare("SELECT id FROM users WHERE email = :email");
            $chk->execute(['email' => $email]);
            if ($chk->fetch()) {
                $error = "A user account with this email address already exists.";
            } else {
                $hash = password_hash($password, PASSWORD_BCRYPT);
                $stmt = $pdo->prepare("
                    INSERT INTO users (name, email, role, password_hash, is_active, created_at, updated_at)
                    VALUES (:name, :email, :role, :hash, 1, NOW(), NOW())
                ");
                $stmt->execute(['name' => $name, 'email' => $email, 'role' => $role, 'hash' => $hash]);
                $newUid = $pdo->lastInsertId();

                logAudit($pdo, (int)$currentUser['id'], 'USER_CREATED', 'USER', (string)$newUid, "Admin created user account for $name ($email, $role)");
                $msg = "Staff account for $name created successfully.";
            }
        }
    }

    // Toggle User Active Status
    if ($action === 'toggle_user_status') {
        $uid = (int)($_POST['user_id'] ?? 0);
        if ($uid > 0 && $uid !== (int)$currentUser['id']) {
            $curStatus = (int)$pdo->query("SELECT is_active FROM users WHERE id = $uid")->fetchColumn();
            $newStatus = $curStatus ? 0 : 1;
            $pdo->prepare("UPDATE users SET is_active = :st, updated_at = NOW() WHERE id = :uid")->execute(['st' => $newStatus, 'uid' => $uid]);
            $uname = $pdo->query("SELECT name FROM users WHERE id = $uid")->fetchColumn();
            
            $act = $newStatus ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
            logAudit($pdo, (int)$currentUser['id'], $act, 'USER', (string)$uid, "Admin changed active status of $uname to " . ($newStatus ? 'Active' : 'Inactive'));
            $msg = "Account for $uname has been " . ($newStatus ? 'activated' : 'deactivated') . ".";
        }
    }

    // Add Master List Option
    if ($action === 'add_master_item') {
        $cat   = trim($_POST['category'] ?? '');
        $val   = trim($_POST['value'] ?? '');
        $label = trim($_POST['label'] ?? '');
        if (!empty($cat) && !empty($val) && !empty($label)) {
            $sort = (int)$pdo->query("SELECT IFNULL(MAX(sort_order), 0) + 10 FROM master_lists WHERE category = " . $pdo->quote($cat))->fetchColumn();
            $ins = $pdo->prepare("INSERT INTO master_lists (category, value, label, sort_order, is_active) VALUES (:cat, :val, :lbl, :so, 1)");
            $ins->execute(['cat' => $cat, 'val' => $val, 'lbl' => $label, 'so' => $sort]);
            logAudit($pdo, (int)$currentUser['id'], 'MASTER_LIST_UPDATED', 'SETTINGS', $val, "Added master list item '$label' to category '$cat'");
            $msg = "Master list item added successfully.";
        }
    }
}

// Fetch Staff Users
$users = $pdo->query("SELECT id, name, email, role, is_active, last_login_at, created_at FROM users ORDER BY id ASC")->fetchAll();

// Fetch Master Lists
$masterItems = $pdo->query("SELECT * FROM master_lists ORDER BY category ASC, sort_order ASC")->fetchAll();

// Fetch Audit Logs with Pagination / Filter
$auditSearch = trim($_GET['audit_search'] ?? '');
$auditAction = trim($_GET['audit_action'] ?? '');
$auditWhere = ["1=1"];
$auditParams = [];

if (!empty($auditSearch)) {
    $auditWhere[] = "(a.details LIKE :as1 OR u.name LIKE :as2 OR a.entity_id LIKE :as3)";
    $like = "%$auditSearch%";
    $auditParams['as1'] = $like;
    $auditParams['as2'] = $like;
    $auditParams['as3'] = $like;
}
if (!empty($auditAction)) {
    $auditWhere[] = "a.action = :act";
    $auditParams['act'] = $auditAction;
}
$auditWhereSql = implode(" AND ", $auditWhere);

$auditStmt = $pdo->prepare("
    SELECT a.*, u.name as actor_name, u.role as actor_role
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE $auditWhereSql
    ORDER BY a.id DESC
    LIMIT 100
");
$auditStmt->execute($auditParams);
$auditRows = $auditStmt->fetchAll();

require_once __DIR__ . '/includes/header.php';
?>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

  <!-- Header -->
  <div class="mb-8">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold mb-2">
      <span>System Administrator Console</span>
      <span class="text-neutral-500">•</span>
      <span>Strict Governance</span>
    </div>
    <h1 class="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white">Administration & Audit Controls</h1>
    <p class="text-xs sm:text-sm text-neutral-400 mt-1">Manage staff user roles, master list classifications, and inspect the immutable DPDP audit trail.</p>
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

  <!-- Navigation Tabs -->
  <div class="flex items-center gap-2 border-b border-white/10 mb-8 overflow-x-auto">
    <a href="?tab=users" class="px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 <?= ($tab === 'users') ? 'border-b-2 border-reapmind-blue text-white bg-white/[0.03]' : 'text-neutral-400 hover:text-white' ?>">
      <svg class="w-4 h-4 text-reapmind-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
      <span>Staff User Directory</span>
      <span class="px-1.5 py-0.2 rounded-full bg-white/10 text-neutral-300 text-[10px] font-mono"><?= count($users) ?></span>
    </a>

    <a href="?tab=masters" class="px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 <?= ($tab === 'masters') ? 'border-b-2 border-reapmind-yellow text-white bg-white/[0.03]' : 'text-neutral-400 hover:text-white' ?>">
      <svg class="w-4 h-4 text-reapmind-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
      <span>Master Classifications</span>
      <span class="px-1.5 py-0.2 rounded-full bg-white/10 text-neutral-300 text-[10px] font-mono"><?= count($masterItems) ?></span>
    </a>

    <a href="?tab=audit" class="px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 <?= ($tab === 'audit') ? 'border-b-2 border-emerald-400 text-white bg-white/[0.03]' : 'text-neutral-400 hover:text-white' ?>">
      <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
      <span>Append-Only Audit Trail</span>
      <span class="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono">Immutable</span>
    </a>
  </div>

  <!-- TAB 1: USERS -->
  <?php if ($tab === 'users'): ?>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <!-- Users Table (2 cols) -->
      <div class="lg:col-span-2 bg-neutral-900/60 border border-white/[0.08] rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
        <div class="p-5 border-b border-white/10 flex items-center justify-between">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider">Authorized Staff Accounts</h2>
          <span class="text-xs text-neutral-400"><?= count($users) ?> registered users</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-white/[0.02] border-b border-white/10 text-neutral-400 uppercase font-mono text-[10px]">
              <tr>
                <th class="py-3 px-4">Staff Member</th>
                <th class="py-3 px-4">Role</th>
                <th class="py-3 px-4">Status</th>
                <th class="py-3 px-4">Last Activity</th>
                <th class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/[0.05] text-neutral-300">
              <?php foreach ($users as $u): ?>
                <tr class="hover:bg-white/[0.02] transition">
                  <td class="py-3 px-4">
                    <div class="font-semibold text-white"><?= htmlspecialchars($u['name']) ?></div>
                    <div class="text-[11px] text-neutral-400"><?= htmlspecialchars($u['email']) ?></div>
                  </td>
                  <td class="py-3 px-4 whitespace-nowrap">
                    <?php
                      $roleColors = [
                        'ADMIN'       => 'bg-red-500/15 text-red-300 border-red-500/30',
                        'HR_HEAD'     => 'bg-purple-500/15 text-purple-300 border-purple-500/30',
                        'HR_OPS'      => 'bg-blue-500/15 text-blue-300 border-blue-500/30',
                        'INTERVIEWER' => 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                        'FRONT_DESK'  => 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                      ];
                      $rc = $roleColors[$u['role']] ?? 'bg-white/10 text-white border-white/20';
                    ?>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border <?= $rc ?>">
                      <?= htmlspecialchars($u['role']) ?>
                    </span>
                  </td>
                  <td class="py-3 px-4 whitespace-nowrap">
                    <?php if ($u['is_active']): ?>
                      <span class="inline-flex items-center gap-1.5 text-emerald-400 text-xs">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active
                      </span>
                    <?php else: ?>
                      <span class="inline-flex items-center gap-1.5 text-neutral-500 text-xs">
                        <span class="w-1.5 h-1.5 rounded-full bg-neutral-600"></span> Inactive
                      </span>
                    <?php endif; ?>
                  </td>
                  <td class="py-3 px-4 text-neutral-500 text-[11px] whitespace-nowrap">
                    <?= $u['last_login_at'] ? timeAgo($u['last_login_at']) : 'Never' ?>
                  </td>
                  <td class="py-3 px-4 text-right whitespace-nowrap">
                    <?php if ($u['id'] !== (int)$currentUser['id']): ?>
                      <form method="POST" class="inline-block" onsubmit="return confirm('Toggle status for <?= htmlspecialchars(addslashes($u['name'])) ?>?')">
                        <input type="hidden" name="action" value="toggle_user_status">
                        <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
                        <button type="submit" class="px-2.5 py-1 rounded-lg text-xs font-semibold <?= $u['is_active'] ? 'bg-red-500/15 hover:bg-red-500 text-red-300 hover:text-white' : 'bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-white' ?> transition">
                          <?= $u['is_active'] ? 'Deactivate' : 'Activate' ?>
                        </button>
                      </form>
                    <?php else: ?>
                      <span class="text-[10px] text-neutral-600 italic">Current Session</span>
                    <?php endif; ?>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add New User Form (1 col) -->
      <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm shadow-xl">
        <h2 class="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <svg class="w-4 h-4 text-reapmind-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
          Provision Staff Account
        </h2>

        <form method="POST" class="space-y-4">
          <input type="hidden" name="action" value="create_user">

          <div>
            <label class="block text-xs font-medium text-neutral-300 mb-1">Full Name</label>
            <input type="text" name="name" required placeholder="e.g. Satej Bhosale"
              class="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
          </div>

          <div>
            <label class="block text-xs font-medium text-neutral-300 mb-1">Official Email Address</label>
            <input type="email" name="email" required placeholder="satej@reapmind.com"
              class="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
          </div>

          <div>
            <label class="block text-xs font-medium text-neutral-300 mb-1">System Role</label>
            <select name="role" required class="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
              <option value="INTERVIEWER">INTERVIEWER (Evaluate & Rate)</option>
              <option value="HR_OPS">HR_OPS (Intake, Pipeline, Assign)</option>
              <option value="FRONT_DESK">FRONT_DESK (Intake & Scans Only)</option>
              <option value="HR_HEAD">HR_HEAD (Senior Evaluation & Audit)</option>
              <option value="ADMIN">ADMIN (Full Governance)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-neutral-300 mb-1">Temporary Password</label>
            <input type="password" name="password" required minlength="6" placeholder="At least 6 characters"
              class="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition font-mono">
          </div>

          <div class="pt-2">
            <button type="submit" class="w-full py-2.5 rounded-xl bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold transition shadow-lg shadow-reapmind-blue/20">
              Create Staff Account
            </button>
          </div>
        </form>
      </div>

    </div>
  <?php endif; ?>

  <!-- TAB 2: MASTER LISTS -->
  <?php if ($tab === 'masters'): ?>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <!-- Existing Master Classifications (2 cols) -->
      <div class="lg:col-span-2 bg-neutral-900/60 border border-white/[0.08] rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
        <div class="p-5 border-b border-white/10">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider">Classification Master Records</h2>
          <p class="text-xs text-neutral-400 mt-0.5">Configurable dropdown items used in Candidate Intake and Pipeline.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-white/[0.02] border-b border-white/10 text-neutral-400 uppercase font-mono text-[10px]">
              <tr>
                <th class="py-3 px-4">Category</th>
                <th class="py-3 px-4">Code / Value</th>
                <th class="py-3 px-4">Display Label</th>
                <th class="py-3 px-4">Order</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/[0.05] text-neutral-300">
              <?php foreach ($masterItems as $m): ?>
                <tr class="hover:bg-white/[0.02] transition">
                  <td class="py-3 px-4 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded bg-white/10 text-white font-mono text-[10px] font-semibold">
                      <?= htmlspecialchars($m['category']) ?>
                    </span>
                  </td>
                  <td class="py-3 px-4 font-mono text-neutral-300"><?= htmlspecialchars($m['value']) ?></td>
                  <td class="py-3 px-4 font-medium text-white"><?= htmlspecialchars($m['label']) ?></td>
                  <td class="py-3 px-4 text-neutral-500 font-mono"><?= $m['sort_order'] ?></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add New Option (1 col) -->
      <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm shadow-xl">
        <h2 class="text-sm font-bold text-white uppercase tracking-wider mb-4">Add Classification Item</h2>
        
        <form method="POST" class="space-y-4">
          <input type="hidden" name="action" value="add_master_item">

          <div>
            <label class="block text-xs font-medium text-neutral-300 mb-1">Target Category</label>
            <select name="category" required class="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
              <option value="POSITION">POSITION (Job Roles)</option>
              <option value="SOURCE">SOURCE (Recruitment Sources)</option>
              <option value="LOCATION">LOCATION (Office Branches)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-neutral-300 mb-1">Internal Code / Value</label>
            <input type="text" name="value" required placeholder="e.g. AI Engineer"
              class="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
          </div>

          <div>
            <label class="block text-xs font-medium text-neutral-300 mb-1">Display Label</label>
            <input type="text" name="label" required placeholder="e.g. Generative AI Engineer"
              class="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
          </div>

          <div class="pt-2">
            <button type="submit" class="w-full py-2.5 rounded-xl bg-reapmind-yellow hover:bg-amber-600 text-black text-xs font-bold transition shadow-lg">
              Add Item to Master List
            </button>
          </div>
        </form>
      </div>

    </div>
  <?php endif; ?>

  <!-- TAB 3: AUDIT TRAIL -->
  <?php if ($tab === 'audit'): ?>
    <div class="bg-neutral-900/60 border border-white/[0.08] rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
      
      <!-- Filter Toolbar -->
      <form method="GET" class="p-4 border-b border-white/10 flex flex-wrap items-center gap-3">
        <input type="hidden" name="tab" value="audit">
        <input type="text" name="audit_search" value="<?= htmlspecialchars($auditSearch) ?>" placeholder="Search actor, entity ID, or description..."
          class="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
        
        <select name="audit_action" class="px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-reapmind-blue transition">
          <option value="">All Actions</option>
          <option value="USER_LOGIN" <?= ($auditAction === 'USER_LOGIN') ? 'selected' : '' ?>>USER_LOGIN</option>
          <option value="CANDIDATE_CREATED" <?= ($auditAction === 'CANDIDATE_CREATED') ? 'selected' : '' ?>>CANDIDATE_CREATED</option>
          <option value="RESUME_VIEW" <?= ($auditAction === 'RESUME_VIEW') ? 'selected' : '' ?>>RESUME_VIEW</option>
          <option value="RESUME_DOWNLOAD" <?= ($auditAction === 'RESUME_DOWNLOAD') ? 'selected' : '' ?>>RESUME_DOWNLOAD</option>
          <option value="FEEDBACK_SUBMITTED" <?= ($auditAction === 'FEEDBACK_SUBMITTED') ? 'selected' : '' ?>>FEEDBACK_SUBMITTED</option>
          <option value="INTERVIEWER_ASSIGNED" <?= ($auditAction === 'INTERVIEWER_ASSIGNED') ? 'selected' : '' ?>>INTERVIEWER_ASSIGNED</option>
        </select>

        <button type="submit" class="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition">
          Filter Trail
        </button>
      </form>

      <!-- Immutable Log Table -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead class="bg-white/[0.02] border-b border-white/10 text-neutral-400 uppercase text-[10px]">
            <tr>
              <th class="py-3 px-4">Timestamp</th>
              <th class="py-3 px-4">Actor</th>
              <th class="py-3 px-4">Action</th>
              <th class="py-3 px-4">Entity</th>
              <th class="py-3 px-4">Details</th>
              <th class="py-3 px-4 text-right">IP Address</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.05] text-neutral-300">
            <?php if (empty($auditRows)): ?>
              <tr>
                <td colspan="6" class="py-12 text-center text-neutral-500 font-sans">No audit events found.</td>
              </tr>
            <?php else: ?>
              <?php foreach ($auditRows as $ar): ?>
                <tr class="hover:bg-white/[0.02] transition">
                  <td class="py-2.5 px-4 text-neutral-400 whitespace-nowrap text-[11px]">
                    <?= date('Y-m-d H:i:s', strtotime($ar['created_at'])) ?>
                  </td>
                  <td class="py-2.5 px-4 whitespace-nowrap">
                    <span class="text-white font-medium font-sans"><?= htmlspecialchars($ar['actor_name'] ?: 'System') ?></span>
                    <span class="text-[10px] text-neutral-500 block"><?= htmlspecialchars($ar['actor_role'] ?: '') ?></span>
                  </td>
                  <td class="py-2.5 px-4 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px]">
                      <?= htmlspecialchars($ar['action']) ?>
                    </span>
                  </td>
                  <td class="py-2.5 px-4 text-neutral-400 whitespace-nowrap">
                    <?= htmlspecialchars($ar['entity_type']) ?> #<?= htmlspecialchars($ar['entity_id'] ?: '-') ?>
                  </td>
                  <td class="py-2.5 px-4 font-sans text-neutral-300 max-w-md truncate">
                    <?= htmlspecialchars($ar['details'] ?: '') ?>
                  </td>
                  <td class="py-2.5 px-4 text-right text-neutral-500 text-[11px]">
                    <?= htmlspecialchars($ar['ip_address'] ?: '127.0.0.1') ?>
                  </td>
                </tr>
              <?php endforeach; ?>
            <?php endif; ?>
          </tbody>
        </table>
      </div>

    </div>
  <?php endif; ?>

</div>

<?php require_once __DIR__ . '/includes/footer.php'; ?>
