// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { parseEther } from 'viem';
import { LotterySettings } from '../../lib';

const settings: LotterySettings = {
  pricePerTicket: parseEther('0.004'),
  ticketDigitLength: 5,
  fees: parseEther('0.001'),
  nonce: 15,
  maxRetries: 5,
  prizeBrackets: [
    60, // jackpot winner
    20, // 2nd group
    10, // 3rd group
    6, // 4th group
    4, // 5th group
  ],
};

const LotteryModule = buildModule('LotteryModule', (m) => {
  const lottery = m.contract('Lottery', [
    settings.pricePerTicket,
    settings.ticketDigitLength,
    settings.fees,
    settings.nonce,
    settings.maxRetries,
    settings.prizeBrackets,
  ]);

  return { lottery };
});

export default LotteryModule;
