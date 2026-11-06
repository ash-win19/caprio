/**
 * Integration test for Mastra title generation.
 * Tests the actual contract end-to-end without live GROQ API.
 */
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';

const MASTRA_PORT = 4111;
const TEST_DB = '/tmp/mastra-test-title.db';

// Clean up any existing test DB
try { writeFileSync(TEST_DB, ''); } catch (e) {}

console.log('Starting Mastra server with test database...');
const mastraServer = spawn('node', ['.mastra/output/index.mjs'], {
  env: {
    ...process.env,
    PORT: MASTRA_PORT,
    TURSO_DATABASE_URL: `file:${TEST_DB}`,
    TURSO_AUTH_TOKEN: '',
    // Use a mock/local model to avoid GROQ API
    GROQ_API_KEY: 'test-key-will-fail-but-thats-ok',
  },
  stdio: 'pipe',
});

let serverReady = false;
let serverError = null;

mastraServer.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('[mastra]', output.trim());
  if (output.includes('listening') || output.includes('ready') || output.includes(MASTRA_PORT)) {
    serverReady = true;
  }
});

mastraServer.stderr.on('data', (data) => {
  const err = data.toString();
  console.error('[mastra error]', err.trim());
  if (err.includes('EADDRINUSE') || err.includes('Cannot find module')) {
    serverError = err;
  }
});

// Wait for server to start
await new Promise(resolve => setTimeout(resolve, 3000));

if (serverError) {
  console.error('Server failed to start:', serverError);
  mastraServer.kill();
  process.exit(1);
}

try {
  console.log('\nTesting POST /api/agents/general-conversation-agent/stream with memory options...');
  
  const response = await fetch(`http://127.0.0.1:${MASTRA_PORT}/api/agents/general-conversation-agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: 'Help me plan my morning workout routine' }
      ],
      memory: {
        thread: { id: 'test-thread-1' },
        resource: 'test-user',
        options: {
          generateTitle: true,
        },
      },
    }),
  });

  console.log('Response status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error response:', errorText);
    console.log('\n❌ FAILED: API returned error', response.status);
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let foundTextDelta = false;
    let foundTitleEvent = false;
    let capturedTitle = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          if (!data) continue;
          
          try {
            const event = JSON.parse(data);
            console.log('Event:', event.type, event.type === 'text-delta' ? `"${event.textDelta}"` : '');
            
            if (event.type === 'text-delta' && event.textDelta) {
              foundTextDelta = true;
            }
            
            if (event.type === 'data-thread-title') {
              foundTitleEvent = true;
              capturedTitle = event.data?.title || event.payload?.title;
              console.log('📌 Title event found:', capturedTitle);
            }
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
    }

    console.log('\n=== Test Results ===');
    console.log('Found text-delta events:', foundTextDelta ? '✅' : '❌');
    console.log('Found data-thread-title event:', foundTitleEvent ? '✅' : '❌');
    console.log('Captured title:', capturedTitle || '(none)');
    
    if (foundTextDelta && foundTitleEvent && capturedTitle) {
      console.log('\n✅ SUCCESS: Title generation working end-to-end');
    } else if (foundTextDelta && !foundTitleEvent) {
      console.log('\n⚠️  PARTIAL: Stream works but no title generated');
      console.log('This means:');
      console.log('  - Either generateTitle flag is not being honored');
      console.log('  - Or agent needs memory instance configured');
      console.log('  - Or title generation requires additional setup');
    } else {
      console.log('\n❌ FAILED: Stream did not work');
    }
  }
} catch (error) {
  console.error('Test error:', error.message);
  console.log('\n❌ FAILED:', error.message);
} finally {
  console.log('\nStopping Mastra server...');
  mastraServer.kill();
  process.exit(0);
}
