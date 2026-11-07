// Used only by `control-caprio drive`; it supplies the env below.
import { defineConfig, devices } from '@playwright/test';

const out = process.env.CAPRIO_VERIFY_OUT;
const baseURL = process.env.CAPRIO_VERIFY_URL;
if (!out || !baseURL) throw new Error('Run specs with `control-caprio drive <spec>`, not `playwright test` directly.');

export default defineConfig({
  testDir: '.',
  outputDir: `${out}/playwright`,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: `${out}/report.json` }]],
  use: { baseURL, reducedMotion: 'reduce', trace: 'on', screenshot: 'on' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
