/**
 * Headless PWA smoke checks against a running production Next server.
 * Usage: node scripts/pwa-verify.mjs [baseURL] [apiURL]
 */
import { chromium } from '@playwright/test';

const baseURL = process.argv[2] || 'http://127.0.0.1:3002';
const apiURL = process.argv[3] || 'http://127.0.0.1:8001';

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

async function waitForServiceWorkerReady(timeoutMs = 15000) {
  await page.evaluate(
    ({ timeoutMs: timeout }) =>
      new Promise((resolve, reject) => {
        if (!('serviceWorker' in navigator)) {
          reject(new Error('serviceWorker not supported'));
          return;
        }
        const timer = setTimeout(() => reject(new Error('service worker ready timeout')), timeout);
        navigator.serviceWorker.ready
          .then((reg) => {
            clearTimeout(timer);
            resolve(reg);
          })
          .catch(reject);
      }),
    { timeoutMs }
  );
}

async function waitForCaches(minCount = 1, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const keys = await page.evaluate(async () => ('caches' in window ? caches.keys() : []));
    if (keys.length >= minCount) return keys;
    await page.waitForTimeout(500);
  }
  return page.evaluate(async () => ('caches' in window ? caches.keys() : []));
}

try {
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForServiceWorkerReady();

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  record('Manifest linked in HTML', Boolean(manifestHref), manifestHref || 'missing');

  const swRegistration = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      return { supported: true, registered: false };
    }
    return {
      supported: true,
      registered: true,
      scope: reg.scope,
      activeScript: reg.active?.scriptURL || null,
      state: reg.active?.state || null,
    };
  });

  record('Service worker API available', swRegistration.supported === true);
  record(
    'Service worker registered and active',
    swRegistration.registered === true && swRegistration.state === 'activated',
    swRegistration.registered
      ? `${swRegistration.activeScript || 'no script'} (${swRegistration.state})`
      : 'no registration'
  );

  const caches = await waitForCaches(1);
  record('Workbox/runtime caches present', caches.length > 0, caches.join(', ') || 'none');

  const manifestResponse = await page.request.get(`${baseURL}/manifest.json`);
  record('Manifest HTTP 200', manifestResponse.ok(), String(manifestResponse.status()));

  const swResponse = await page.request.get(`${baseURL}/sw.js`);
  const swBody = await swResponse.text();
  record('Service worker HTTP 200', swResponse.ok(), String(swResponse.status()));
  record(
    'Custom worker referenced in sw.js',
    swBody.includes('worker-') && swBody.includes('importScripts'),
    swBody.match(/worker-[a-f0-9]+\.js/)?.[0] || 'hash not found'
  );

  const workerMatch = swBody.match(/worker-[a-f0-9]+\.js/);
  if (workerMatch) {
    const workerPath = `/${workerMatch[0]}`;
    const workerResponse = await page.request.get(`${baseURL}${workerPath}`);
    const workerText = await workerResponse.text();
    const contentType = workerResponse.headers()['content-type'] || '';
    const isJavaScript =
      contentType.includes('javascript') ||
      (workerText.includes('addEventListener') && !workerText.trimStart().startsWith('<!'));
    record(
      'Custom worker serves JavaScript (not auth HTML)',
      workerResponse.ok() && isJavaScript,
      `${workerPath} — ${contentType || 'no content-type'}`
    );
    record(
      'Push + notificationclick handlers in worker',
      /addEventListener\s*\(\s*["']push["']/.test(workerText) &&
        /addEventListener\s*\(\s*["']notificationclick["']/.test(workerText),
      workerMatch[0]
    );
  } else {
    record('Custom worker serves JavaScript (not auth HTML)', false, 'worker hash not found');
    record('Push + notificationclick handlers in worker', false, 'n/a');
  }

  const offlineResponse = await page.request.get(`${baseURL}/offline`);
  record('Offline fallback page reachable (online)', offlineResponse.ok(), String(offlineResponse.status()));

  // Precache /offline while online, then verify offline shell
  await page.goto(`${baseURL}/offline`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    const offlineText = await page.getByText(/you.?re offline/i).count();
    record('Offline page renders while offline', offlineText > 0, 'reload after precache');
  } catch (error) {
    record(
      'Offline page renders while offline',
      false,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    await context.setOffline(false);
  }

  await page.goto(`${baseURL}/notifications/preferences`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  const pushApis = await page.evaluate(() => ({
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
  }));
  record(
    'Browser push APIs available',
    pushApis.serviceWorker && pushApis.pushManager && pushApis.notification,
    JSON.stringify(pushApis)
  );

  const currentUrl = page.url();
  record(
    'Push preferences route exists',
    currentUrl.includes('/notifications/preferences') || currentUrl.includes('/login'),
    currentUrl
  );

  try {
    const vapidResponse = await page.request.get(
      `${apiURL}/api/notifications/push-subscriptions/public_key/`
    );
    const status = vapidResponse.status();
    const exists = status === 200 || status === 401;
    let detail = `HTTP ${status}`;
    if (status === 200) {
      const vapid = await vapidResponse.json();
      detail = vapid.configured ? 'configured (authenticated)' : 'not configured';
    } else if (status === 401) {
      detail = 'requires auth (endpoint exists)';
    }
    record('Backend VAPID public_key endpoint', exists, detail);
  } catch (error) {
    record(
      'Backend VAPID public_key endpoint',
      false,
      error instanceof Error ? error.message : String(error)
    );
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\nSummary: ${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
