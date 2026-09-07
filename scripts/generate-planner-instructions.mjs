import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../src/mastra/agents/daily-planner.md', import.meta.url);
const outputDirectory = new URL('../src/mastra/agents/generated/', import.meta.url);
const output = new URL('daily-planner-instructions.ts', outputDirectory);
const instructions = (await readFile(source, 'utf8')).trim();

if (!instructions) throw new Error('The daily planner instructions must not be empty.');

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  output,
  '// Generated from ../daily-planner.md. Edit the Markdown source.\n' +
    `export const dailyPlannerInstructions = ${JSON.stringify(instructions)};\n`,
);
