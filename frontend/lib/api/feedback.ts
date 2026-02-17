import client from './client';

export interface FeedbackData {
    message: string;
    category: 'suggestion' | 'complaint' | 'compliment' | 'other';
    branch?: number;
    is_anonymous?: boolean;
    name?: string;
    email?: string;
    phone?: string;
    recaptcha_token?: string;
}

export const feedbackApi = {
    /**
     * Submit anonymous or identified feedback
     */
    submitFeedback: async (data: FeedbackData) => {
        const response = await client.post('/feedback/', data);
        return response.data;
    },

    /**
     * List all feedback (Admin/Manager only)
     */
    getFeedback: async (params?: any) => {
        const response = await client.get('/feedback/', { params });
        return response.data;
    },

    /**
     * Get single feedback detail
     */
    getFeedbackDetail: async (id: number) => {
        const response = await client.get(`/feedback/${id}/`);
        return response.data;
    },
    /**
     * Update feedback (Admin/Manager only - status, notes)
     */
    updateFeedback: async (id: number, data: Partial<FeedbackData>) => {
        const response = await client.patch(`/feedback/${id}/`, data);
        return response.data;
    }
};

export default feedbackApi;
