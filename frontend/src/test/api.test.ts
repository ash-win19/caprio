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
    api.setAccessTokenProvider(null);
  });

  describe('Authentication', () => {
    it('should include auth token in requests when available', async () => {
      api.setAccessTokenProvider(async () => 'test-token');
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

    it('should report an expired session without deleting the Auth0 session', async () => {
      const expired = vi.fn();
      window.addEventListener('caprio:session-expired', expired, { once: true });
      api.setAccessTokenProvider(async () => 'expired-token');
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      await expect(api.getTodayTasks()).rejects.toThrow('Your session expired');
      expect(expired).toHaveBeenCalledOnce();
      expect(localStorage.removeItem).not.toHaveBeenCalled();
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

  describe('Chat Operations', () => {
    it('should send a chat message and receive response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ text: 'Hello! How can I help you?' }),
      } as Response);

      const result = await api.sendChatMessage('Hello', '2026-09-06', '92fc090b-0111-42cc-9a34-a8c0052205e9');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: 'Hello',
            date: '2026-09-06',
            requestId: '92fc090b-0111-42cc-9a34-a8c0052205e9',
          }),
        })
      );
      expect(result.text).toBe('Hello! How can I help you?');
    });

    it('should handle chat errors', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(api.sendChatMessage('Hello')).rejects.toThrow('Internal server error');
    });
  });

  describe('Task Operations', () => {
    it('should create a task', async () => {
      const mockTask: api.BackendTask = {
        id: '1',
        title: 'Test task',
        userId: 'user1',
        urgency: 'medium' as const,
        source: 'manual',
        completed: false,
        sortOrder: 0,
        plannedForDate: '2024-01-01',
        status: 'planned',
        deferCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
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
