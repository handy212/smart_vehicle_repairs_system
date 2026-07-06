import { TaxConfig } from "@/lib/api/billing";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

interface TaxComputationInput {
  taxableTotal: number;
  subtotal: number;
  discountAmount: number;
  config?: TaxConfig;
}

export interface TaxComputationResult {
  taxableSubtotal: number;
  nhilAmount: number;
  getfundAmount: number;
  hrlAmount: number;
  vatAmount: number;
  totalTax: number;
  regime?: string;
}

export const computeGhanaTaxBreakdown = ({
  taxableTotal,
  subtotal,
  discountAmount,
  config,
}: TaxComputationInput): TaxComputationResult => {
  if (!config || !config.enabled) {
    return {
      taxableSubtotal: 0,
      nhilAmount: 0,
      getfundAmount: 0,
      hrlAmount: 0,
      vatAmount: 0,
      totalTax: 0,
      regime: config?.regime,
    };
  }

  const vatRate = parseFloat(config.vat_rate || "0");
  const nhilRate = parseFloat(config.nhil_rate || "0");
  const getfundRate = parseFloat(config.getfund_rate || "0");

  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxableDiscount = round2(taxableTotal * discountRatio);
  const taxableAfterDiscount = Math.max(round2(taxableTotal - taxableDiscount), 0);

  const nhilAmount = round2(taxableAfterDiscount * (nhilRate / 100));
  const getfundAmount = round2(taxableAfterDiscount * (getfundRate / 100));
  // COVID levy removed in 2026 reforms
  const hrlAmount = 0;

  // VAT reform 2026: VAT is decoupled from levies, calculated on base value
  const vatBase = taxableAfterDiscount;
  const vatAmount = round2(vatBase * (vatRate / 100));
  const totalTax = round2(nhilAmount + getfundAmount + hrlAmount + vatAmount);

  return {
    taxableSubtotal: taxableAfterDiscount,
    nhilAmount,
    getfundAmount,
    hrlAmount,
    vatAmount,
    totalTax,
    regime: config.regime,
  };
};

// Simple helper for calculating tax breakdown from just taxable subtotal
export const calculateGhanaTax = (
  taxableSubtotal: number,
  config?: TaxConfig
): { nhil: number; getfund: number; hrl: number; vat: number; total: number } => {
  if (!config || !config.enabled) {
    return { nhil: 0, getfund: 0, hrl: 0, vat: 0, total: 0 };
  }

  const vatRate = parseFloat(config.vat_rate || "0");
  const nhilRate = parseFloat(config.nhil_rate || "0");
  const getfundRate = parseFloat(config.getfund_rate || "0");

  const nhil = round2(taxableSubtotal * (nhilRate / 100));
  const getfund = round2(taxableSubtotal * (getfundRate / 100));
  // COVID levy removed in 2026 reforms
  const hrl = 0;

  // VAT reform 2026: VAT is decoupled from levies, calculated on base value
  const vatBase = taxableSubtotal;
  const vat = round2(vatBase * (vatRate / 100));
  const total = round2(nhil + getfund + hrl + vat);

  return { nhil, getfund, hrl, vat, total };
};

