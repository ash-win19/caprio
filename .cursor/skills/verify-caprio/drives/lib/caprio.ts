// Shared helpers for verify-caprio drive specs. Specs run from a scratch copy
// created by `control-caprio drive`, so import this as '../lib/caprio'.
import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const env = {
  run: process.env.CAPRIO_VERIFY_RUN ?? '',
  mode: process.env.CAPRIO_VERIFY_MODE as 'stack' | 'mock',
  url: process.env.CAPRIO_VERIFY_URL ?? '',
  api: process.env.CAPRIO_VERIFY_API ?? '',
  databaseUrl: process.env.CAPRIO_VERIFY_DATABASE_URL ?? '',
  out: process.env.CAPRIO_VERIFY_OUT ?? '',
};

/** Fail (never skip) when a spec is driven against the wrong kind of instance. */
export function requireMode(mode: 'stack' | 'mock') {
  if (env.mode !== mode) throw new Error(`This spec needs a ${mode}-mode run; current run ${env.run} is ${env.mode}. Start one with: control-caprio up --mode ${mode}`);
}

/** Write a text artifact into this drive's evidence directory. */
export function saveEvidence(name: string, content: string) {
  const path = join(env.out, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`);
  return path;
}

/** Read-only query against the run's throwaway Postgres. Tab-separated rows. */
export function sql(query: string, save?: string): string {
  if (!env.databaseUrl) throw new Error('sql() needs a stack-mode run');
  const rows = execFileSync('psql', [env.databaseUrl, '-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' },
  }).toString().trim();
  if (save) saveEvidence(save, `-- ${query}\n${rows}`);
  return rows;
}

/** Screenshot plus ARIA snapshot of the page, named for the step. */
export async function proof(page: Page, step: string) {
  await page.screenshot({ path: join(env.out, `${step}.png`), fullPage: true, animations: 'disabled' });
  saveEvidence(`${step}.aria.yml`, `# ${page.url()}\n${await page.locator('body').ariaSnapshot()}`);
}

/** The browser's local calendar day, the same value the app's useLocalDay() uses. */
export function localDay(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

/**
 * Sign in the way a local user does: Login -> "Continue as demo user" (shown in
 * Vite dev mode). In stack mode the API's dev bypass maps this session to
 * dev@caprio.app in the throwaway database. Finishes onboarding through the UI
 * when the account is new.
 */
export async function enterAsDemoUser(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /Continue as demo user/ }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await expect(page.getByText('Loading your day...')).toHaveCount(0, { timeout: 20_000 });
  if (new URL(page.url()).pathname === '/onboarding') {
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await page.getByRole('button', { name: 'Gym', exact: true }).click();
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/prefs$/);
    await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
    await expect(page).toHaveURL(/\/new/);
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
}
