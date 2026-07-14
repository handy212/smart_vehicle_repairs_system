/**
 * Google Login Button Component
 *
 * Uses the Google Identity Services code client (popup) and exchanges the
 * authorization code with the backend BFF at /api/auth/google/login.
 *
 * Client ID resolution (first non-empty wins):
 * 1. `clientId` prop
 * 2. public integrations API (`google_oauth_client_id`)
 * 3. `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
 *
 * When no client ID is configured, the button renders nothing.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { User } from '@/lib/api/auth';
import { adminApi } from '@/lib/api/admin';
import { getUserFacingError } from '@/lib/api/errors';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initCodeClient: (config: Record<string, unknown>) => { requestCode: () => void };
        };
      };
    };
  }
}

interface GoogleLoginButtonProps {
  clientId?: string | null;
  onSuccess?: (data: { access: string; refresh: string; user: User }) => void;
  onError?: (error: string) => void;
  // Backend registration payload shape varies; keep permissive to match callers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRegistrationRequired?: (data: { user_data: any; google_token_info: any }) => void;
  redirectUrl?: string;
  className?: string;
}

function loadGsiScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Sign-In is only available in the browser.'));
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In.')), {
        once: true,
      });
      // Script may already be loaded without oauth2 ready yet — poll briefly.
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        if (window.google?.accounts?.oauth2) {
          window.clearInterval(timer);
          resolve();
        } else if (attempts >= 50) {
          window.clearInterval(timer);
          reject(new Error('Google Sign-In timed out. Please refresh and try again.'));
        }
      }, 100);
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In.'));
    document.head.appendChild(script);
  });
}

export default function GoogleLoginButton({
  clientId: clientIdProp,
  onSuccess,
  onError,
  onRegistrationRequired,
  redirectUrl = '/dashboard',
  className = '',
}: GoogleLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const router = useRouter();

  const { data: integrations } = useQuery({
    queryKey: ['settings', 'integrations', 'public'],
    queryFn: () => adminApi.settings.publicIntegrations(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    // Skip the network trip when a client ID is already provided by the parent/env.
    enabled: !clientIdProp && !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim(),
  });

  const clientId =
    (clientIdProp || '').trim() ||
    (integrations?.google_oauth_client_id || '').trim() ||
    (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim() ||
    '';

  useEffect(() => {
    if (!clientId) {
      setSdkReady(false);
      return;
    }

    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (!cancelled) setSdkReady(true);
      })
      .catch((err) => {
        console.error('[GoogleLogin] SDK load error:', err);
        if (!cancelled) setSdkReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const handleCodeResponse = useCallback(
    async (code: string) => {
      try {
        const apiResponse = await fetch(`/api/auth/google/login`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}));
          throw new Error(
            getUserFacingError({ response: { data: errorData } }, 'Authentication failed'),
          );
        }

        const data = await apiResponse.json();

        if (data.registration_required) {
          onRegistrationRequired?.({
            user_data: data.user_data,
            google_token_info: data.google_token_info,
          });
          return;
        }

        onSuccess?.(data);
        router.push(redirectUrl);
      } catch (error: unknown) {
        console.error('[GoogleLogin] Authentication error:', error);
        onError?.(getUserFacingError(error, 'Authentication failed'));
      } finally {
        setLoading(false);
      }
    },
    [onError, onRegistrationRequired, onSuccess, redirectUrl, router],
  );

  const handleGoogleLogin = async () => {
    if (!clientId) {
      onError?.('Google Sign-In is not configured. Ask an admin to set the Google OAuth Client ID.');
      return;
    }

    setLoading(true);
    try {
      await loadGsiScript();
      const google = window.google;
      if (!google?.accounts?.oauth2) {
        throw new Error('Google Sign-In is still loading. Please try again in a moment.');
      }

      const client = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: (response: { code?: string }) => {
          if (response.code) {
            void handleCodeResponse(response.code);
          } else {
            setLoading(false);
            onError?.('Sign-in was cancelled or failed. Please try again.');
          }
        },
        error_callback: (error: unknown) => {
          console.error('Google OAuth Error:', error);
          setLoading(false);
          onError?.(getUserFacingError(error, 'Google sign-in failed. Please try again.'));
        },
      });

      client.requestCode();
    } catch (error: unknown) {
      console.error('Google login error:', error);
      onError?.(getUserFacingError(error, 'Google sign-in is not available. Please refresh and try again.'));
      setLoading(false);
    }
  };

  // Not configured — don't show a broken Google button.
  if (!clientId) {
    return null;
  }

  return (
    <button
      onClick={() => void handleGoogleLogin()}
      disabled={loading || !sdkReady}
      className={`flex items-center justify-center gap-3 w-full px-4 py-3 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      type="button"
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      )}
      <span className="text-sm font-medium text-foreground">
        {loading ? 'Signing in...' : sdkReady ? 'Continue with Google' : 'Loading Google…'}
      </span>
    </button>
  );
}
