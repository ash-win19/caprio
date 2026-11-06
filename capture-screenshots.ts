import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function captureScreenshots() {
  const outputDir = '/opt/cursor/artifacts';
  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  // Navigate to Caprio
  await page.goto('http://127.0.0.1:4180');
  
  // Wait for page to load
  await page.waitForSelector('[aria-label="Primary"]', { timeout: 10000 });
  
  // Screenshot 1: Sidebar with conversation list (should show single-line items)
  await page.screenshot({ 
    path: join(outputDir, 'sidebar-conversation-list.png'),
    fullPage: false 
  });
  
  console.log('✓ Captured sidebar conversation list');

  // Screenshot 2: Profile menu interaction
  const profileButton = page.locator('button[aria-label*="account menu"]').first();
  if (await profileButton.isVisible()) {
    await profileButton.click();
    await page.waitForSelector('[role="menu"]', { state: 'visible' });
    await page.screenshot({ 
      path: join(outputDir, 'profile-menu-open.png'),
      fullPage: false 
    });
    console.log('✓ Captured open profile menu');
    
    // Close menu with Escape
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="menu"]', { state: 'hidden' });
    console.log('✓ Verified Escape closes menu');
  }

  // Screenshot 3: Collapsed sidebar with profile menu
  const collapseButton = page.locator('button[aria-label="Collapse sidebar"]').first();
  if (await collapseButton.isVisible()) {
    await collapseButton.click();
    await page.waitForTimeout(500); // Wait for animation
    await page.screenshot({ 
      path: join(outputDir, 'sidebar-collapsed.png'),
      fullPage: false 
    });
    console.log('✓ Captured collapsed sidebar');
    
    // Open profile menu in collapsed state
    const collapsedProfileButton = page.locator('button[aria-label*="account menu"]').first();
    if (await collapsedProfileButton.isVisible()) {
      await collapsedProfileButton.click();
      await page.waitForSelector('[role="menu"]', { state: 'visible' });
      await page.screenshot({ 
        path: join(outputDir, 'profile-menu-collapsed-sidebar.png'),
        fullPage: false 
      });
      console.log('✓ Captured profile menu in collapsed sidebar');
    }
  }

  await browser.close();
  console.log('\nAll screenshots saved to', outputDir);
}

captureScreenshots().catch(console.error);
