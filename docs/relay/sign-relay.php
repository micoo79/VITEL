<?php
/**
 * VITEL - aláírás-relay (saját tárhelyre)
 * -------------------------------------------------------------
 * Egyetlen fájl, adatbázis nélkül. A telefon feltölti ide az aláírást
 * egy véletlen tokennel, az asztali böngésző pedig lekéri ugyanazzal a
 * tokennel. Lekérés után (vagy pár perc múlva) a fájl törlődik.
 *
 * Telepítés:
 *   1) Töltsd fel ezt a fájlt a tárhelyedre, pl. https://sajat-domain.hu/vitel/sign-relay.php
 *   2) A docs/config.js-ben állítsd be ugyanerre az URL-re a VITEL_SIGN_RELAY-t.
 *
 * Végpontok:
 *   POST ?token=XXXX   törzs = az aláírás PNG data URL (text/plain)   -> feltöltés
 *   GET  ?token=XXXX                                                  -> lekérés (egyszeri), {"sig": "..."} vagy {"sig": null}
 *
 * Biztonság/adatvédelem:
 *   - A token 128 bites véletlen (kitalálhatatlan).
 *   - Az adat csak néhány percig él, lekérés után azonnal törlődik.
 *   - Semmilyen adat nem megy harmadik félhez; csak a te szervereden halad át.
 */

// ---- beállítások ----
const TTL_SECONDS = 600;          // meddig éljen a feltöltött aláírás (10 perc)
const MAX_BYTES   = 3_000_000;    // max törzsméret (~3 MB) – egy aláírás-PNG ennél jóval kisebb
$STORE = __DIR__ . '/_sigstore';  // tároló könyvtár a fájl mellett

// ---- CORS ----
header('Access-Control-Allow-Origin: *');          // a token a titok, süti/hitelesítés nincs
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ---- token ----
$token = isset($_GET['token']) ? $_GET['token'] : '';
if (!preg_match('/^[A-Za-z0-9_-]{16,64}$/', $token)) {
  http_response_code(400);
  header('Content-Type: application/json');
  echo json_encode(['error' => 'invalid token']);
  exit;
}

// ---- tároló előkészítése + lejárt fájlok takarítása ----
if (!is_dir($STORE)) { @mkdir($STORE, 0700, true); }
// direkt elérés tiltása (Apache); nginxen a token-véletlenség + TTL véd
if (!file_exists($STORE . '/.htaccess')) { @file_put_contents($STORE . '/.htaccess', "Require all denied\nDeny from all\n"); }
if (!file_exists($STORE . '/index.html')) { @file_put_contents($STORE . '/index.html', ''); }
foreach (glob($STORE . '/*.sig') ?: [] as $f) {
  if (time() - filemtime($f) > TTL_SECONDS) { @unlink($f); }
}

$path = $STORE . '/' . $token . '.sig';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = file_get_contents('php://input', false, null, 0, MAX_BYTES + 1);
  if ($body === false || strlen($body) === 0) { http_response_code(400); exit; }
  if (strlen($body) > MAX_BYTES) { http_response_code(413); exit; }
  // csak PNG data URL-t fogadunk el
  if (strncmp($body, 'data:image/png;base64,', 22) !== 0) { http_response_code(415); exit; }
  if (@file_put_contents($path, $body, LOCK_EX) === false) { http_response_code(500); exit; }
  @chmod($path, 0600);
  header('Content-Type: application/json');
  echo json_encode(['ok' => true]);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  header('Content-Type: application/json');
  if (is_file($path) && (time() - filemtime($path) <= TTL_SECONDS)) {
    $sig = file_get_contents($path);
    @unlink($path);                 // egyszeri lekérés – utána törlünk
    echo json_encode(['sig' => $sig]);
  } else {
    if (is_file($path)) { @unlink($path); }
    echo json_encode(['sig' => null]);
  }
  exit;
}

http_response_code(405);
