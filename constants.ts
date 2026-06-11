// PRICING — CLIENT/SERVER INVARIANT
// `PREMIUM_PRICE_NGN * 100` MUST equal `KOBO_PER_CREDIT` in functions/index.js
// (10,000 NGN * 100 = 1,000,000 kobo per credit). The webhook is
// authoritative — it rejects any payment that isn't a whole multiple of
// KOBO_PER_CREDIT. If you change one constant, change the other in the
// same commit. The client value here is for display only.
export const PREMIUM_PRICE_NGN = 10000;
export const CREDITS_PER_PURCHASE = 1;
export const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

export const ACADEMIC_FORMAT = {
  font: 'Times New Roman',
  fontSize: '12pt',
  headingSize: '14pt',
  lineSpacing: 2.0,
  alignment: 'justify',
  margins: '1 inch',
};

export const NIGERIAN_CITIES = [
  'Lagos', 'Abuja', 'Port Harcourt', 'Ibadan',
  'Enugu', 'Kano', 'Benin City',
];
