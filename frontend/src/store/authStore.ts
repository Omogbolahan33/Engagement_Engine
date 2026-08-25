import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}

export type LoginOutcome =
  | { mfaRequired: true; mfaToken: string }
  | { mfaRequired: false };

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /**
   * Resolves to a challenge when the account has 2FA enabled — no session is
   * issued until `completeMfaLogin` succeeds.
   */
  login: (email: string, password: string) => Promise<LoginOutcome>;
  completeMfaLogin: (mfaToken: string, code: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    organizationName?: string;
  }) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/auth/login', { email, password });

          // Password accepted but 2FA is on: hand the challenge back to the
          // caller rather than establishing a session.
          if (response.data?.mfaRequired) {
            set({ isLoading: false });
            return { mfaRequired: true, mfaToken: response.data.mfaToken };
          }

          const { user, tokens } = response.data;

          api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;

          set({
            user,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          return { mfaRequired: false };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      completeMfaLogin: async (mfaToken: string, code: string) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/auth/login/2fa', { mfaToken, code });
          const { user, tokens } = response.data;

          api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;

          set({
            user,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          await api.post('/auth/register', data);
          set({ isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        const { accessToken } = get();
        if (accessToken) {
          api.post('/auth/logout').catch(() => {});
        }
        delete api.defaults.headers.common['Authorization'];
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;

        try {
          const response = await api.post('/auth/refresh', { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = response.data;

          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

          set({
            accessToken,
            refreshToken: newRefreshToken,
          });
        } catch {
          get().logout();
        }
      },

      setUser: (user: User) => set({ user }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
