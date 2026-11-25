<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';

if (isLoggedIn()) {
    $user = getCurrentUser();
    if ($user['role'] === 'FRONT_DESK') {
        header('Location: intake.php');
    } else {
        header('Location: dashboard.php');
    }
    exit;
}

$error = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = trim($_POST['password'] ?? '');

    if (empty($email) || empty($password)) {
        $error = "Please enter both email and password.";
    } else {
        $result = loginUser($pdo, $email, $password);
        if ($result['success']) {
            if ($result['user']['role'] === 'FRONT_DESK') {
                header('Location: intake.php');
            } else {
                header('Location: dashboard.php');
            }
            exit;
        } else {
            $error = $result['error'];
        }
    }
}
$pageTitle = "Sign In | ReapMind HR Operations";
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
<body class="bg-black text-white min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative selection:bg-reapmind-blue selection:text-white">

  <!-- Glow Background Effect -->
  <div class="absolute top-1/6 left-1/2 -translate-x-1/2 w-[550px] h-[350px] bg-reapmind-blue/[0.12] rounded-full blur-[140px] pointer-events-none"></div>

  <div class="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center mb-8">
    <img src="assets/images/reapmind-logo.png" alt="ReapMind Innovations" class="h-14 sm:h-16 w-auto object-contain mx-auto mb-4 brightness-0 invert">
    <h2 class="text-xl sm:text-2xl font-bold tracking-tight text-white">HR Operations & Candidate Portal</h2>
    <p class="mt-1 text-xs sm:text-sm text-neutral-400">ReapMind Innovations Pvt. Ltd. • Kolhapur Delivery Center</p>
  </div>

  <div class="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
    <div class="bg-reapmind-header border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      <?php if ($error): ?>
      <div class="mb-5 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
        <?= htmlspecialchars($error) ?>
      </div>
      <?php endif; ?>

      <form method="POST" action="login.php" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">Work Email Address</label>
          <input type="email" name="email" id="emailInput" required placeholder="name@reapmind.com" value="frontdesk@reapmind.com" class="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue transition">
        </div>

        <div>
          <label class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">Password</label>
          <input type="password" name="password" id="passwordInput" required value="Password@123" class="w-full px-4 py-3 bg-black/60 border border-white/[0.1] rounded-full text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-reapmind-blue transition">
        </div>

        <button type="submit" class="w-full py-3.5 px-6 rounded-full bg-reapmind-blue hover:bg-reapmind-blue-hover text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-reapmind-blue/25 transition">
          Sign In to HR Console →
        </button>
      </form>

      <!-- Student Banner -->
      <div class="mt-6 pt-5 border-t border-white/[0.08] text-center">
        <a href="apply.php" class="text-xs text-neutral-300 hover:text-white inline-flex items-center gap-1.5 transition">
          <span class="text-reapmind-yellow font-bold">Walk-in Student or Candidate?</span>
          <span class="underline">Self-register and submit resume directly here →</span>
        </a>
      </div>

      <!-- Quick Switcher for Evaluation -->
      <div class="mt-6 pt-5 border-t border-white/[0.08]">
        <label class="block text-[11px] uppercase font-bold text-neutral-500 mb-2.5 font-mono text-center">Quick Evaluation Switcher</label>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" onclick="fillCreds('frontdesk@reapmind.com')" class="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] rounded-full text-[11px] font-semibold text-neutral-300 transition">
            Front Desk
          </button>
          <button type="button" onclick="fillCreds('aayushi@reapmind.com')" class="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] rounded-full text-[11px] font-semibold text-neutral-300 transition">
            HR (Aayushi)
          </button>
          <button type="button" onclick="fillCreds('aroof@reapmind.com')" class="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] rounded-full text-[11px] font-semibold text-neutral-300 transition">
            Director (Aroof)
          </button>
          <button type="button" onclick="fillCreds('admin@reapmind.com')" class="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] rounded-full text-[11px] font-semibold text-neutral-300 transition">
            Admin
          </button>
        </div>
        <p class="text-[10px] text-neutral-500 text-center mt-2 font-mono">Password: Password@123</p>
      </div>
    </div>
  </div>

  <script>
    function fillCreds(email) {
      document.getElementById('emailInput').value = email;
      document.getElementById('passwordInput').value = 'Password@123';
    }
  </script>
</body>
</html>
