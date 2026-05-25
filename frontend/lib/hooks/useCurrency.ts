import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';

export const useCurrency = () => {
    const { data: settings, isLoading } = useQuery({
        queryKey: ['settings', 'public-display'],
        queryFn: () => adminApi.settings.publicDisplay(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
    });

    const currencyCode = settings?.find((s) => s.key === 'currency')?.value || 'USD';
    const currencySymbol = settings?.find((s) => s.key === 'currency_symbol')?.value || '$';

    const formatCurrency = (
        amount: number | string | null | undefined,
        options?: Intl.NumberFormatOptions
    ) => {
        if (amount === null || amount === undefined) return '';
        const num = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(num)) return '';

        const formatOptions: Intl.NumberFormatOptions = {
            useGrouping: true,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
            ...options,
        };
        let minDigits = formatOptions.minimumFractionDigits ?? 2;
        let maxDigits = formatOptions.maximumFractionDigits ?? 2;
        if (minDigits > maxDigits) {
            minDigits = maxDigits;
        }
        formatOptions.minimumFractionDigits = minDigits;
        formatOptions.maximumFractionDigits = maxDigits;

        const formattedNumber = new Intl.NumberFormat('en-US', formatOptions).format(num);

        // Use the configured currency symbol from settings
        return `${currencySymbol}${formattedNumber}`;
    };

    return {
        currency: currencyCode,
        currencySymbol,
        formatCurrency,
        isLoading,
    };
};
