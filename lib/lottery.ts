
export type LotterySettings = {
  pricePerTicket: bigint;
  fees: bigint;
  ticketDigitLength: number;
  prizeBrackets: number[];
  nonce: number;
  maxRetries: number;
};
