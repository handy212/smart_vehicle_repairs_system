import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '@/lib/api/client';

// The apiClient is already mocked in vitest.setup.ts

describe('API Client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('HTTP Methods', () => {
        it('should have get method', () => {
            expect(apiClient.get).toBeDefined();
            expect(typeof apiClient.get).toBe('function');
        });

        it('should have post method', () => {
            expect(apiClient.post).toBeDefined();
            expect(typeof apiClient.post).toBe('function');
        });

        it('should have put method', () => {
            expect(apiClient.put).toBeDefined();
            expect(typeof apiClient.put).toBe('function');
        });

        it('should have delete method', () => {
            expect(apiClient.delete).toBeDefined();
            expect(typeof apiClient.delete).toBe('function');
        });
    });

    describe('Interceptors', () => {
        it('should have request interceptors', () => {
            expect(apiClient.interceptors.request).toBeDefined();
            expect(apiClient.interceptors.request.use).toBeDefined();
        });

        it('should have response interceptors', () => {
            expect(apiClient.interceptors.response).toBeDefined();
            expect(apiClient.interceptors.response.use).toBeDefined();
        });
    });
});
