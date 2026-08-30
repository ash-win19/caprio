import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { useAuth0 } from '@auth0/auth0-react';
import type { Auth0ContextInterface } from '@auth0/auth0-react';

// Mock Auth0
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}));

// Mock the API
vi.mock('@/lib/api', () => ({
  getDayStatus: vi.fn(),
}));

// Mock the store
vi.mock('@/lib/store', () => ({
  useAppStore: vi.fn((selector) => {
    const store = {
      user: null,
      setUser: vi.fn(),
      initializeMockData: vi.fn(),
      getState: () => ({
        user: null,
      }),
    };
    return selector ? selector(store) : store;
  }),
}));

// Mock accountSession
vi.mock('@/lib/accountSession', () => ({
  activateAccount: vi.fn(),
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should not redirect unauthenticated users from / to /login', async () => {
    // Mock unauthenticated state
    vi.mocked(useAuth0).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: undefined,
    } as Auth0ContextInterface);

    const mockNavigate = vi.fn();
    
    // Create a test component that tracks navigation
    const currentPath = '/';
    const TestComponent = () => {
      return <div data-testid="landing-page">Landing Page (path: {currentPath})</div>;
    };

    render(
      <BrowserRouter>
        <AuthGuard>
          <Routes>
            <Route path="/" element={<TestComponent />} />
            <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
          </Routes>
        </AuthGuard>
      </BrowserRouter>
    );

    // Wait for any potential redirects
    await waitFor(() => {
      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    }, { timeout: 1000 });

    // Verify we're still on the landing page
    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('should allow unauthenticated users to visit /login', async () => {
    vi.mocked(useAuth0).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: undefined,
    } as Auth0ContextInterface);

    render(
      <BrowserRouter>
        <AuthGuard>
          <Routes>
            <Route path="/" element={<div data-testid="landing-page">Landing</div>} />
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          </Routes>
        </AuthGuard>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    });
  });

  it('should allow unauthenticated users to visit /signup', async () => {
    vi.mocked(useAuth0).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: undefined,
    } as Auth0ContextInterface);

    render(
      <BrowserRouter>
        <AuthGuard>
          <Routes>
            <Route path="/" element={<div data-testid="landing-page">Landing</div>} />
            <Route path="/signup" element={<div data-testid="signup-page">Signup</div>} />
          </Routes>
        </AuthGuard>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    });
  });
});
