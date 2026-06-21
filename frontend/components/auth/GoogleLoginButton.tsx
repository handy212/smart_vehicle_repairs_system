/**
 * Google Login Button Component
 * 
 * This component provides a "Sign in with Google" button that handles
 * the Google OAuth flow and returns JWT tokens for API authentication.
 * 
 * Prerequisites:
 * 1. Add Google Sign-In SDK to your HTML (in _app.tsx or _document.tsx):
 *    <script src="https://accounts.google.com/gsi/client" async defer></script>
 * 
 * 2. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your .env.local
 */


'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/api/auth';
import { getUserFacingError } from '@/lib/api/errors';

interface GoogleLoginButtonProps {

    onSuccess?: (data: { access: string; refresh: string; user: User }) => void;
    onError?: (error: string) => void;

    onRegistrationRequired?: (data: { user_data: any, google_token_info: any }) => void;
    redirectUrl?: string;
    className?: string;
}

export default function GoogleLoginButton({
    onSuccess,
    onError,
    onRegistrationRequired,
    redirectUrl = '/dashboard',
    className = ''
}: GoogleLoginButtonProps) {
    const [loading, setLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // Check if script is already loaded
        const checkScript = () => {

            if ((window as any).google?.accounts?.id) {
                setScriptLoaded(true);
                initializeGoogle();
            } else {
                // Poll for script
                setTimeout(checkScript, 100);
            }
        };

        checkScript();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const initializeGoogle = () => {
        try {

            const google = (window as any).google;
            const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();

            if (!google || !clientId) return;

        } catch (error) {
            console.error('[GoogleLogin] Initialization error:', error);
        }
    };

    const handleGoogleLogin = () => {
        setLoading(true);
        try {

            const google = (window as any).google;
            const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();

            if (!google || !clientId) {
                throw new Error('Google Sign-In not initialized. Please refresh.');
            }

            // USE Code Client instead of ID prompt
            // This triggers a reliable popup window
            const client = google.accounts.oauth2.initCodeClient({
                client_id: clientId,
                scope: 'openid email profile',
                ux_mode: 'popup',

                callback: (response: any) => {
                    if (response.code) {
                        handleCodeResponse(response.code);
                    } else {
                        console.error('No code returned from Google');
                        setLoading(false);
                        if (onError) onError('Sign-in was cancelled or failed. Please try again.');
                    }
                },

                error_callback: (error: any) => {
                    console.error('Google OAuth Error:', error);
                    setLoading(false);
                    if (onError) onError(getUserFacingError(error, 'Google sign-in failed. Please try again.'));
                },
            });

            client.requestCode();


        } catch (error: any) {
            console.error('Google login error:', error);
            if (onError) onError(getUserFacingError(error, 'Google sign-in is not available. Please refresh and try again.'));
            setLoading(false);
        }
    };

    const handleCodeResponse = async (code: string) => {
        try {
            const apiResponse = await fetch(`/api/auth/google/login`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: code,
                }),
            });

            if (!apiResponse.ok) {
                const errorData = await apiResponse.json();
                throw new Error(getUserFacingError({ response: { data: errorData } }, 'Authentication failed'));
            }

            const data = await apiResponse.json();

            // Handle multi-step registration
            if (data.registration_required) {
                if (onRegistrationRequired) {
                    onRegistrationRequired({
                        user_data: data.user_data,
                        google_token_info: data.google_token_info
                    });
                }
                setLoading(false);
                return;
            }

            // HttpOnly cookies set by Django proxy response
            if (onSuccess) {
                onSuccess(data);
            }

            router.push(redirectUrl);


        } catch (error: any) {
            console.error('[GoogleLogin] Authentication error:', error);
            if (onError) onError(getUserFacingError(error, 'Authentication failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className={`flex items-center justify-center gap-3 w-full px-4 py-3 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            type="button"
        >
            {loading ? (
                <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
            ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                {loading ? 'Signing in...' : 'Continue with Google'}
            </span>
        </button>
    );
}
