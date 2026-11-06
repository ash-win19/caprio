import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

test('capture sidebar UI screenshots', async ({ page }) => {
  const outputDir = '/opt/cursor/artifacts';
  mkdirSync(outputDir, { recursive: true });

  await page.goto('http://127.0.0.1:4180');
  await page.waitForSelector('[aria-label="Primary"]', { timeout: 10000 });
  
  // Screenshot 1: Sidebar with conversation list
  await page.screenshot({ 
    path: join(outputDir, 'sidebar-conversation-list.png'),
    fullPage: false 
  });
  console.log('✓ Captured sidebar conversation list');

  // Screenshot 2: Profile menu open
  const profileButton = page.locator('button[aria-label*="account menu"]').first();
  await profileButton.click();
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
  await page.screenshot({ 
    path: join(outputDir, 'profile-menu-open.png'),
    fullPage: false 
  });
  console.log('✓ Captured open profile menu');
  
  // Verify Settings link exists
  await expect(page.locator('[role="menuitem"] a[href="/settings"]')).toBeVisible();
  
  // Close with Escape
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="menu"]')).not.toBeVisible();
  console.log('✓ Verified Escape closes menu');

  // Screenshot 3: Collapsed sidebar
  const collapseButton = page.locator('button[aria-label="Collapse sidebar"]').first();
  if (await collapseButton.isVisible()) {
    await collapseButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({ 
      path: join(outputDir, 'sidebar-collapsed.png'),
      fullPage: false 
    });
    console.log('✓ Captured collapsed sidebar');
    
    // Screenshot 4: Profile menu in collapsed sidebar
    await page.locator('button[aria-label*="account menu"]').first().click();
    await page.waitForSelector('[role="menu"]', { state: 'visible' });
    await page.screenshot({ 
      path: join(outputDir, 'profile-menu-collapsed.png'),
      fullPage: false 
    });
    console.log('✓ Captured profile menu in collapsed sidebar');
  }
});
