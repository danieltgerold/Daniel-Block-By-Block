import { expect, test } from '@playwright/test';

test('compiled Java core matches every reference in this browser engine', async ({ page }) => {
  const pageErrors = [], failedRequests = [], failedResponses = [];
  await page.addInitScript(() => {
    window.addEventListener('error', event => {
      window.__parityError = event.error?.stack ?? event.message ??
        `Resource failed: ${event.target?.src ?? event.target?.href ?? 'unknown'}`;
    }, true);
    window.addEventListener('unhandledrejection', event => {
      window.__parityError = String(event.reason);
    });
  });
  // Diagnostics have a finite cap even if a broken loader repeats failures.
  page.on('pageerror', error => { if (pageErrors.length < 50) pageErrors.push(error.message); });
  page.on('requestfailed', request => {
    if (failedRequests.length < 50) failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`);
  });
  page.on('response', response => {
    if (response.status() >= 400 && failedResponses.length < 50)
      failedResponses.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto('/tools/parity/parity.html');
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() => window.__parity || window.__parityError, null, { timeout: 120_000 });
  const { result, error } = await page.evaluate(() => ({ result: window.__parity, error: window.__parityError }));
  expect(error, 'Core, runner and fixture loading must complete successfully').toBeUndefined();
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(failedResponses).toEqual([]);
  expect(result.checked).toBe(167_638);
  expect(result.mismatchCount).toBe(0);
  expect(result.mismatches).toEqual([]);
});
