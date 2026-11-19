// Dynamic imports keep failed core/runner loads inside the explicit failure path.
try {
  const [core, { runParity }] = await Promise.all([
    import('/web-core/build/generated/teavm/js/core.js'),
    import('./run-parity.mjs'),
  ]);
  const readText = async path => {
    const response = await fetch(`/tests/golden/${path}`);
    if (!response.ok) throw new Error(`Fixture ${path}: HTTP ${response.status}`);
    return response.text();
  };
  window.__parity = await runParity(core, readText);
  document.querySelector('#status').textContent =
    `${window.__parity.checked} values checked; ${window.__parity.mismatchCount} mismatches`;
} catch (error) {
  window.__parityError = error instanceof Error ? error.stack ?? error.message : String(error);
  document.querySelector('#status').textContent = window.__parityError;
}
