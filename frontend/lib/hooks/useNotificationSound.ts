/**
 * Custom hook for playing notification sounds
 * Monitors unread notification count and plays sound when new notifications arrive
 */

import { useEffect, useRef, useState } from 'react';

interface UseNotificationSoundOptions {
    enabled?: boolean;
    unreadCount: number;
}

export function useNotificationSound({ enabled = true, unreadCount }: UseNotificationSoundOptions) {
    const previousCountRef = useRef<number>(unreadCount);
    const audioContextRef = useRef<AudioContext | null>(null);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
        // Check local storage for user preference
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('notification_sound_enabled');
            return stored !== null ? stored === 'true' : true; // Default to enabled
        }
        return true;
    });

    // Update local storage when preference changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('notification_sound_enabled', soundEnabled.toString());
        }
    }, [soundEnabled]);

    // Initialize AudioContext on first user interaction
    useEffect(() => {
        const initAudioContext = () => {
            if (!audioContextRef.current && typeof window !== 'undefined') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            // Ensure we try to resume if suspended (common in Chrome/Edge)
            if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume().catch(e => console.debug("Audio resume failed (waiting for user gesture):", e));
            }
        };

        // Listen for user interaction to enable/resume audio
        // We keep this active to handle cases where browser suspends audio after inactivity
        if (typeof window !== 'undefined') {
            window.addEventListener('click', initAudioContext);
            window.addEventListener('keydown', initAudioContext);
            window.addEventListener('touchstart', initAudioContext);
        }

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('click', initAudioContext);
                window.removeEventListener('keydown', initAudioContext);
                window.removeEventListener('touchstart', initAudioContext);
            }
        };
    }, []);

    // Synthesized sound generator (Fallback)
    const playOscillator = (type: string) => {
        try {
            const context = audioContextRef.current;
            if (!context) return;

            // Resume context if suspended
            if (context.state === 'suspended') {
                context.resume().catch(e => console.debug("Audio resume failed during play:", e));
            }

            const now = context.currentTime;

            // Customize sound based on type
            if (type === 'roadside' || type === 'critical') {
                // Urgent/Critical Sound (High pitch, repeating)
                const osc = context.createOscillator();
                const gain = context.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(880, now); // A5
                osc.frequency.setValueAtTime(1760, now + 0.1); // A6
                osc.frequency.setValueAtTime(880, now + 0.2); // A5

                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

                osc.connect(gain);
                gain.connect(context.destination);
                osc.start(now);
                osc.stop(now + 0.4);
            }
            else if (['vehicle_ready', 'invoice', 'payment', 'estimate', 'work_order_approved'].includes(type)) {
                // Success/Money Sound (Major chord arpeggio)
                [523.25, 659.25, 783.99].forEach((freq, i) => { // C Major
                    const osc = context.createOscillator();
                    const gain = context.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + i * 0.1);

                    gain.gain.setValueAtTime(0.05, now + i * 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);

                    osc.connect(gain);
                    gain.connect(context.destination);
                    osc.start(now + i * 0.1);
                    osc.stop(now + i * 0.1 + 0.3);
                });
            }
            else {
                // Standard Default Notification (Two-tone sine)
                const osc1 = context.createOscillator();
                const osc2 = context.createOscillator();
                const gain = context.createGain();

                osc1.type = 'sine';
                osc2.type = 'sine';

                osc1.frequency.setValueAtTime(600, now);
                osc2.frequency.setValueAtTime(800, now + 0.1);

                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(context.destination);

                osc1.start(now);
                osc1.stop(now + 0.3);
                osc2.start(now + 0.1);
                osc2.stop(now + 0.3);
            }

        } catch (error) {
            console.error('Error playing notification sound:', error);
        }
    };

    // Play notification sound based on type
    const playNotificationSound = (type: string = 'default') => {
        if (!soundEnabled || !enabled) return;

        // Try playing custom sound file first
        // User requested 'sound_notify.mp3' for ALL notifications
        const audio = new Audio('/sounds/sound_notify.mp3');

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        audio.play().catch((err) => {
            // Fallback to oscillator if file not found or playback error
            playOscillator(type);
        });
    };

    // Monitor for new notifications
    useEffect(() => {
        const previousCount = previousCountRef.current;

        // Play sound if unread count increased (new notification arrived)
        if (unreadCount > previousCount && previousCount >= 0) {
            // Optimization: Fetch the latest notification to determine sound type
            // We use the imported API client directly
            import('@/lib/api/notifications').then(({ notificationsApi }) => {
                notificationsApi.list({}).then((response) => {
                    const latest = response.results[0];
                    const type = latest ? latest.notification_type : 'default';
                    // Special check for roadside priority
                    const soundType = (latest?.priority === 'high' && type === 'work_order') ? 'critical' : type;
                    playNotificationSound(soundType);
                }).catch(err => {
                    console.error("Failed to fetch latest notification for sound:", err);
                    playNotificationSound('default'); // Fallback
                });
            });
        }

        // Update ref for next comparison
        previousCountRef.current = unreadCount;
    }, [unreadCount, soundEnabled, enabled]);

    return {
        soundEnabled,
        setSoundEnabled,
        playNotificationSound,
    };
}
