export function formatAmount(amount) {
  return Number(amount).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function formatAmountShort(amount) {
  const num = Number(amount);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSOL(amount) {
  return Number(amount).toFixed(6);
}
