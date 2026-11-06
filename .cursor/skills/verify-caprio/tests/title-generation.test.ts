/**
 * Integration test for conversation title generation end-to-end:
 * - Mastra agent generates title
 * - Backend captures data-thread-title SSE event
 * - Title persists in daily_plans.conversation_title
 * - Sidebar loads title via ListChatSessionsByUser
 * 
 * Tests the production contract with graceful failure handling.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Mocked Mastra response with title generation
const MOCK_MASTRA_STREAM_WITH_TITLE = `data: {"type":"start"}

data: {"type":"step-start"}

data: {"type":"text-delta","textDelta":"Let"}

data: {"type":"text-delta","textDelta":"'s"}

data: {"type":"text-delta","textDelta":" plan"}

data: {"type":"text-delta","textDelta":" your"}

data: {"type":"text-delta","textDelta":" day!"}

data: {"type":"data-thread-title","data":{"title":"Morning Workout Planning"}}

data: {"type":"step-finish"}

data: {"type":"finish"}

data: [DONE]

`;

// Mocked Mastra response when title generation fails  
const MOCK_MASTRA_STREAM_NO_TITLE = `data: {"type":"start"}

data: {"type":"step-start"}

data: {"type":"text-delta","textDelta":"Here's"}

data: {"type":"text-delta","textDelta":" your"}

data: {"type":"text-delta","textDelta":" plan"}

data: {"type":"step-finish"}

data: {"type":"finish"}

data: [DONE]

`;

test.describe('Conversation Title Generation', () => {
  test('should generate and display conversation titles', async ({ page }) => {
    // Mock Mastra to return a stream with title event
    await page.route('**/api/agents/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: MOCK_MASTRA_STREAM_WITH_TITLE,
      });
    });

    // Complete onboarding and reach Today page
    await page.goto('/');
    // TODO: Complete proper auth/onboarding sequence or inject session
    
    // Create a new conversation by sending a message
    await page.fill('[placeholder="Tell me about your day..."]', 'Help me plan my workout');
    await page.click('button[type="submit"]');
    
    // Wait for response
    await page.waitForSelector('text=Let\'s plan your day!');
    
    // Navigate back to Today page to see sidebar
    await page.goto('/today');
    
    // Verify sidebar shows the generated title, not the raw message
    await expect(page.locator('.sidebar')).toContainText('Morning Workout Planning');
    await expect(page.locator('.sidebar')).not.toContainText('Help me plan my workout');
  });

  test('should fallback gracefully when title generation fails', async ({ page }) => {
    // Mock Mastra to return stream WITHOUT title event (simulates LLM failure or config issue)
    await page.route('**/api/agents/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: MOCK_MASTRA_STREAM_NO_TITLE,
      });
    });

    await page.goto('/');
    
    // Create conversation
    await page.fill('[placeholder="Tell me about your day..."]', 'What should I do today?');
    await page.click('button[type="submit"]');
    
    // Wait for response
    await page.waitForSelector('text=Here\'s your plan');
    
    // Verify sidebar shows fallback (first message content or "Daily plan")
    await page.goto('/today');
    await expect(page.locator('.sidebar')).toContainText(/What should I do today\?|Daily plan/);
    
    // Crucially: verify the app didn't crash
    await expect(page.locator('.sidebar')).toBeVisible();
  });
});
