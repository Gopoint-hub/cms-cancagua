export type CashRegisterTotalsInput = {
  reservationIncomeClp: number;
  manualIncomeClp: number;
  withdrawalsClp: number;
};

export function calculateCashBalance(input: CashRegisterTotalsInput) {
  const reservationIncomeClp = Math.max(0, Math.round(input.reservationIncomeClp));
  const manualIncomeClp = Math.max(0, Math.round(input.manualIncomeClp));
  const withdrawalsClp = Math.max(0, Math.round(input.withdrawalsClp));
  const incomeClp = reservationIncomeClp + manualIncomeClp;
  return {
    reservationIncomeClp,
    manualIncomeClp,
    withdrawalsClp,
    incomeClp,
    balanceClp: incomeClp - withdrawalsClp,
  };
}
