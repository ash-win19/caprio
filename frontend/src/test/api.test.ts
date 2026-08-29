import { describe, it, expect, vi } from 'vitest';
import * as api from '@/lib/api';

global.fetch = vi.fn();
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should include auth token in requests when available', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('test-token');
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tasks: [] }),
      } as Response);

      await api.getTodayTasks();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should handle 401 errors by redirecting to login', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('expired-token');
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      // Mock window.location.href setter
      const hrefSpy = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { href: hrefSpy },
        writable: true,
      });

      await expect(api.getTodayTasks()).rejects.toThrow('Unauthorized');
      expect(localStorage.removeItem).toHaveBeenCalledWith('caprio_session');
      expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token');
      expect(localStorage.removeItem).toHaveBeenCalledWith('onboarding_complete');
    });
  });

  describe('Error Handling', () => {
    it('should handle 500 errors', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(api.getTodayTasks()).rejects.toThrow('Internal server error');
    });

    it('should handle network errors', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      await expect(api.getTodayTasks()).rejects.toThrow('Network error');
    });
  });

  describe('Task Operations', () => {
    it('should create a task', async () => {
      const mockTask: api.BackendTask = {
        id: '1',
        title: 'Test task',
        user_id: 'user1',
        urgency: 'medium' as const,
        source: 'manual',
        completed: false,
        sort_order: 0,
        planned_for_date: '2024-01-01',
        status: 'planned',
        defer_count: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockTask,
      } as Response);

      const result = await api.createTask({
        title: 'Test task',
        sortOrder: 0,
      });

      expect(result.title).toBe('Test task');
    });

    it('should update a task', async () => {
      const mockTask: Partial<api.BackendTask> = {
        id: '1',
        completed: true,
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTask,
      } as Response);

      await api.updateTask('1', { completed: true });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks/1'),
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });

    it('should delete a task', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deleted: true }),
      } as Response);

      await api.deleteTask('1');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks/1'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should reorder tasks', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ reordered: true }),
      } as Response);

      await api.reorderTasks([
        { id: '1', sortOrder: 0 },
        { id: '2', sortOrder: 1 },
      ]);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks/reorder'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });
});
