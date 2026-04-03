import type { Task, TaskChange } from './types';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mockPrioritize(
  input: string,
  tasks: Task[]
): Promise<{ tasks: Task[]; changes: TaskChange[] }> {
  await delay(1500);

  const lower = input.toLowerCase();
  const result = [...tasks.filter((t) => !t.completed)];
  const changes: TaskChange[] = [];

  if (/gym|workout|tired|exhausted/.test(lower)) {
    const gymTasks = result.filter((t) => t.category === 'Gym');
    const others = result.filter((t) => t.category !== 'Gym');
    const reordered = [...others, ...gymTasks];
    gymTasks.forEach((t) => changes.push({ taskId: t.id, direction: 'down', reason: 'Gym deprioritized — energy/availability concern' }));
    others.slice(0, 2).forEach((t) => changes.push({ taskId: t.id, direction: 'up', reason: 'Moved up after gym deprioritization' }));
    return { tasks: reordered.map((t, i) => ({ ...t, order: i })), changes };
  }

  if (/deadline|urgent|client/.test(lower)) {
    const work = result.filter((t) => t.category === 'Work');
    const rest = result.filter((t) => t.category !== 'Work');
    const reordered = [...work, ...rest];
    work.forEach((t) => changes.push({ taskId: t.id, direction: 'up', reason: 'Urgency signal detected' }));
    rest.slice(0, 2).forEach((t) => changes.push({ taskId: t.id, direction: 'down', reason: 'Deprioritized due to urgency elsewhere' }));
    return { tasks: reordered.map((t, i) => ({ ...t, order: i })), changes };
  }

  if (/meeting|call/.test(lower)) {
    const sorted = result.sort((a, b) => {
      if (a.category === 'Work' && b.category !== 'Work') return -1;
      if (a.category !== 'Work' && b.category === 'Work') return 1;
      return (a.duration || 999) - (b.duration || 999);
    });
    sorted.slice(0, 3).forEach((t) => changes.push({ taskId: t.id, direction: 'up', reason: 'Meeting context — short tasks first' }));
    return { tasks: sorted.map((t, i) => ({ ...t, order: i })), changes };
  }

  if (/only.*hours?|limited time/.test(lower)) {
    const sorted = result.sort((a, b) => (a.duration || 999) - (b.duration || 999));
    sorted.forEach((t, i) => changes.push({
      taskId: t.id,
      direction: i < result.length / 2 ? 'up' : 'down',
      reason: 'Time constraint — shortest tasks prioritized',
    }));
    return { tasks: sorted.map((t, i) => ({ ...t, order: i })), changes };
  }

  // Default shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  result.forEach((t) => changes.push({ taskId: t.id, direction: Math.random() > 0.5 ? 'up' : 'down', reason: 'Reprioritized by Caprio' }));
  return { tasks: result.map((t, i) => ({ ...t, order: i })), changes };
}
