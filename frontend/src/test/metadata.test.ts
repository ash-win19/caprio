import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('application metadata', () => {
  const document = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it('uses Caprio branding for the browser tab', () => {
    expect(document).toContain('<title>Caprio</title>');
    expect(document).toContain('href="/favicon.svg"');
    expect(document).not.toContain('Lovable App');
    expect(document).not.toContain('lovable.dev/opengraph-image');
  });
});
