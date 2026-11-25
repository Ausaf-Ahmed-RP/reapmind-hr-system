<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/functions.php';

$currentUser = getCurrentUser();
$unreadNotifs = $currentUser ? getUnreadNotificationCount($pdo, (int)$currentUser['id']) : 0;
?>
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= htmlspecialchars($pageTitle ?? 'ReapMind Innovations | HR Operations & Candidate Portal') ?></title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
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
          },
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            display: ['"Plus Jakarta Sans"', 'sans-serif'],
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #0A0A0B; color: #FFFFFF; font-family: 'Inter', sans-serif; }
  </style>
</head>
<body class="bg-reapmind-obsidian text-white antialiased min-h-screen flex flex-col selection:bg-reapmind-blue selection:text-white">

<?php if ($currentUser): ?>
<header class="sticky top-0 z-40 border-b border-white/[0.08] bg-black/70 backdrop-blur-xl">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
    <!-- Brand / Logo -->
    <div class="flex items-center gap-6">
      <a href="dashboard.php" class="flex items-center gap-3">
        <img src="assets/images/reapmind-logo.png" alt="ReapMind Innovations" class="h-8 sm:h-9 w-auto brightness-0 invert">
        <div class="hidden sm:block border-l border-white/10 pl-3">
          <span class="text-[10px] font-bold uppercase tracking-wider text-reapmind-blue font-mono block">HR Operations</span>
          <span class="text-xs text-neutral-400 font-medium -mt-0.5 block">Kolhapur Delivery Center</span>
        </div>
      </a>

      <!-- Navigation Links -->
      <nav class="hidden md:flex items-center gap-1">
        <?php if ($currentUser['role'] !== 'FRONT_DESK'): ?>
        <a href="dashboard.php" class="px-3.5 py-1.5 rounded-full text-xs font-semibold <?= (basename($_SERVER['PHP_SELF']) == 'dashboard.php') ? 'bg-reapmind-blue text-white' : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]' ?> transition">
          Dashboard
        </a>
        <?php endif; ?>

        <a href="intake.php" class="px-3.5 py-1.5 rounded-full text-xs font-semibold <?= (basename($_SERVER['PHP_SELF']) == 'intake.php') ? 'bg-reapmind-blue text-white' : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]' ?> transition">
          Intake Desk
        </a>

        <?php if ($currentUser['role'] === 'ADMIN'): ?>
        <a href="admin.php" class="px-3.5 py-1.5 rounded-full text-xs font-semibold <?= (basename($_SERVER['PHP_SELF']) == 'admin.php') ? 'bg-reapmind-blue text-white' : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]' ?> transition">
          Administration
        </a>
        <?php endif; ?>

        <a href="apply.php" target="_blank" class="px-3.5 py-1.5 rounded-full text-xs font-semibold text-neutral-400 hover:text-reapmind-yellow hover:bg-white/[0.05] transition flex items-center gap-1.5">
          <span>Student Check-in ↗</span>
        </a>
      </nav>
    </div>

    <!-- Right: User info & logout -->
    <div class="flex items-center gap-3">
      <div class="text-right hidden sm:block">
        <span class="text-xs font-bold text-white block"><?= htmlspecialchars($currentUser['name']) ?></span>
        <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/10 text-neutral-300">
          <?= htmlspecialchars($currentUser['role']) ?>
        </span>
      </div>

      <a href="logout.php" class="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/[0.06] hover:bg-rose-500/20 text-neutral-300 hover:text-rose-300 border border-white/[0.08] transition">
        Sign Out
      </a>
    </div>
  </div>
</header>
<?php endif; ?>
