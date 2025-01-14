import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { parseEther } from 'viem';

import { LotterySettings } from '@/lib';
import {
  shouldFulfill,
  shouldEqualIgnoreCase,
  shouldFailWithError,
  type waitForable,
} from './helpers';

const defaultSettings: LotterySettings = {
  pricePerTicket: parseEther('0.1'),
  fees: parseEther('0.02'),
  ticketDigitLength: 5,
  nonce: 0,
  maxRetries: 5,
  prizeBrackets: [
    60, // jackpot winner
    20, // 2nd group
    10, // 3rd group
    6, // 4th group
    4, // 5th group
  ],
};

async function deploySimpleLotteryContract(settings: LotterySettings) {
  const {
    pricePerTicket,
    fees,
    ticketDigitLength,
    nonce,
    maxRetries,
    prizeBrackets,
  } = settings;

  const _prizeBrackets = prizeBrackets.map((v) => BigInt(v));

  const lottery = await hre.viem.deployContract(
    'Lottery',
    [
      pricePerTicket,
      BigInt(ticketDigitLength),
      fees,
      BigInt(nonce),
      BigInt(maxRetries),
      _prizeBrackets,
    ],
    { value: 0n }
  );

  const publicClient = await hre.viem.getPublicClient();

  return {
    settings,
    lottery,
    publicClient,
  };
}

describe('Lottery', function () {
  async function deployDefault() {
    return deploySimpleLotteryContract(defaultSettings);
  }

  describe('deployment', () => {
    it('should set the right owner', async () => {
      const { lottery } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const addr = wallets[0].account.address.toLowerCase();
      const owner = (await lottery.read.owner()).toLowerCase();

      expect(owner).to.eq(addr, 'owner should equal address');
    });

    it('should fail if fees is invalid', async () => {
      async function deployWithInvalidFees() {
        const settings = Object.assign({}, defaultSettings, { fees: -1n });
        return deploySimpleLotteryContract(settings);
      }

      return expect(loadFixture(deployWithInvalidFees)).to.be.eventually
        .rejected;
    });

    it('should fail if pricePerTicket is lower than fees', async () => {
      async function deployWithPriceLowerThanFees() {
        const settings = Object.assign({}, defaultSettings, {
          pricePerTicket: defaultSettings.fees / 2n,
        });

        return deploySimpleLotteryContract(settings);
      }

      return expect(loadFixture(deployWithPriceLowerThanFees)).to.be.eventually
        .rejected;
    });

    it('should fail if ticketDigitLength is invalid', async () => {
      async function deployWithInvalidTicketDigitLength() {
        const settings = Object.assign({}, defaultSettings, {
          ticketDigitLength: 0,
        });
        return deploySimpleLotteryContract(settings);
      }

      return expect(loadFixture(deployWithInvalidTicketDigitLength)).to.be
        .eventually.rejected;
    });

    it('should fail if maxRetries is invalid', async () => {
      async function deployWithInvalidMaxRetries() {
        const settings = Object.assign({}, defaultSettings, { maxRetries: 0 });
        return deploySimpleLotteryContract(settings);
      }

      return expect(loadFixture(deployWithInvalidMaxRetries)).to.be.eventually
        .rejected;
    });
  });

  describe('buy ticket', async () => {
    async function deployDefault() {
      return deploySimpleLotteryContract(defaultSettings);
    }

    it('should fail if purchasing no tickets', async () => {
      const { lottery } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];

      await shouldFailWithError(
        lottery.write.buyTicket([0n], { account: wallet.account, value: 0n }),
        'InvalidAmount(1, 0)'
      );
    });

    it('should fail if purchasing with an invalid amount', async () => {
      const { lottery, settings } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];

      const insufficientPayment = defaultSettings.pricePerTicket - 1n;

      const want = settings.pricePerTicket;

      await shouldFailWithError(
        lottery.write.buyTicket([1n], {
          account: wallet.account,
          value: insufficientPayment,
        }),
        `InvalidAmount(${want}, ${insufficientPayment})`
      );
    });

    it('should purchase a ticket', async () => {
      const { lottery, settings, publicClient } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];

      await shouldFulfill(
        publicClient,
        lottery.write.buyTicket([1n], {
          account: wallet.account,
          value: settings.pricePerTicket,
        })
      );
    });

    it('should purchase n tickets', async () => {
      const { lottery, settings, publicClient } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];

      const tickets = 5n;

      await shouldFulfill(
        publicClient,
        lottery.write.buyTicket([tickets], {
          account: wallet.account,
          value: tickets * settings.pricePerTicket,
        })
      );
    });

    it('should update the pool correctly', async () => {
      const { lottery, settings, publicClient } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];

      const tickets = 5n;
      const amountPaid = tickets * settings.pricePerTicket;

      await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.buyTicket([tickets], {
          account: wallet.account,
          value: amountPaid,
        }),
      });

      const pool = await lottery.read.pool();
      const amountFees = tickets * settings.fees;
      const gweiPaid = amountPaid;
      const want = gweiPaid - amountFees;

      expect(pool).to.be.equal(
        want,
        'pool should equal amountPaid - totalFees'
      );
    });

    it('should emit the PoolIncreased event correctly', async () => {
      const { lottery, settings, publicClient } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];

      const tickets = 5n;
      const amountPaid = tickets * settings.pricePerTicket;

      const txHash = await lottery.write.buyTicket([tickets], {
        account: wallet.account,
        value: amountPaid,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      const amountFees = tickets * settings.fees;
      const gweiPaid = amountPaid;
      const want = gweiPaid - amountFees;

      const events = await lottery.getEvents.PoolIncreased();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.amount).to.be.equal(
        want,
        'event should be emitted with correct amount'
      );
    });

    it("should update the lottery's balance correctly", async () => {
      const { lottery, settings, publicClient } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];

      const startingLotteryBalance = await publicClient.getBalance({
        address: lottery.address,
      });

      const tickets = 5n;
      const amountPaid = tickets * settings.pricePerTicket;

      await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.buyTicket([tickets], {
          account: wallet.account,
          value: amountPaid,
        }),
      });

      const lotteryBalance = await publicClient.getBalance({
        address: lottery.address,
      });

      expect(lotteryBalance - startingLotteryBalance).to.be.equal(
        amountPaid,
        "lottery balance should've increased by the amount going to the pool"
      );
    });

    it("should update the owner's balance correctly", async () => {
      const { lottery, settings, publicClient } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();
      const ownerWallet = wallets[0];
      const wallet = wallets[1];

      const owner = await lottery.read.owner();
      const startingOwnerBalance = await publicClient.getBalance({
        address: owner,
      });

      const tickets = 5n;
      const amountPaid = tickets * settings.pricePerTicket;

      await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.buyTicket([tickets], {
          account: wallet.account,
          value: amountPaid,
        }),
      });

      const amountFees = tickets * settings.fees;

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.withdraw({ account: ownerWallet.account }),
      });
      const gas = receipt.gasUsed * receipt.effectiveGasPrice;

      const want = amountFees - gas;

      const ownerBalance = await publicClient.getBalance({ address: owner });
      expect(ownerBalance - startingOwnerBalance).to.be.equal(
        want,
        'owner balance should have amount fees'
      );
    });
  });

  describe('set winning number', () => {
    it('should update the state variables', async () => {
      const { lottery, publicClient } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const chosen = wallets[0];

      const want = 5n;

      const startingWinningNumber = await lottery.read.winningNumber();
      expect(startingWinningNumber).to.be.equal(
        0n,
        'initial winning number should be 0'
      );

      await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.setWinningNumber([want], {
          account: chosen.account,
        }),
      });

      const got = await lottery.read.winningNumber();
      expect(got).to.be.equal(
        want,
        'winning number state variable was not updated'
      );

      const isOver = await lottery.read.isOver();
      expect(isOver).to.be.equal(true, 'isOver should be set to true');
    });

    it('should fail if not executed by the owner', async () => {
      const { lottery } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const chosen = wallets[2];

      const want = 5n;

      return shouldFailWithError(
        lottery.write.setWinningNumber([want], { account: chosen.account }),
        'MustBeOwner'
      );
    });

    it('should emit the event', async () => {
      const { lottery, publicClient } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const chosen = wallets[0];

      const want = 5n;

      await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.setWinningNumber([want], {
          account: chosen.account,
        }),
      });

      const events = await lottery.getEvents.LotteryOver();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.drawnDigit).to.be.equal(
        want,
        'event was not emitted'
      );
    });

    it('should fail if called when already over', async () => {
      const { lottery, publicClient } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const chosen = wallets[0];

      const want = 5n;

      await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.setWinningNumber([want], {
          account: chosen.account,
        }),
      });

      await shouldFailWithError(
        lottery.write.setWinningNumber([want], { account: chosen.account }),
        'LotteryAlreadyOver'
      );
    });
  });

  describe('distribute prizes', () => {
    async function deployWithTwoDigitLength() {
      const settings = Object.assign({}, defaultSettings, {
        ticketDigitLength: 2,
        prizeBrackets: [60, 40],
      });

      return deploySimpleLotteryContract(settings);
    }

    it('should distribute the jackpot correctly', async () => {
      const { lottery, publicClient, settings } = await loadFixture(
        deployWithTwoDigitLength
      );
      const wallets = await hre.viem.getWalletClients();

      const owner = wallets[0];
      const participants = wallets.slice(1, 8);

      await play(publicClient, participants, settings.pricePerTicket, lottery);

      const winningIndex = 5;
      let tickets = [];

      for (let k = 0; k < participants.length; k++) {
        const p = participants[k];
        const v = await lottery.read.ticketsForAddress([p.account.address]);

        tickets[k] = v.slice(0);
      }

      const pool = await lottery.read.pool();

      const winningNumber = tickets[winningIndex][0];
      const winner = participants[winningIndex];

      await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.setWinningNumber([winningNumber], {
          account: owner.account,
        }),
      });

      const startingWinnerBalance = await publicClient.getBalance({
        address: winner.account.address,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.withdraw({ account: winner.account }),
      });
      const gas = receipt.gasUsed * receipt.effectiveGasPrice;

      const finalWinnerBalance = await publicClient.getBalance({
        address: winner.account.address,
      });

      const amountWon = finalWinnerBalance - startingWinnerBalance;
      const expected = (pool * BigInt(settings.prizeBrackets[0])) / 100n - gas;

      expect(amountWon).to.be.equal(expected);
    });
  });

  describe('empty lottery balance', () => {
    it('should not empty the lottery balance to non-owners', async () => {
      const { lottery, publicClient, settings } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();

      const participants = wallets.slice(1, 8);

      await play(publicClient, participants, settings.pricePerTicket, lottery);

      await shouldFailWithError(
        lottery.write.emptyBalance({ account: wallets[1].account }),
        'MustBeOwner'
      );
    });

    it('should empty the lottery balance to the owner', async () => {
      const { lottery, publicClient, settings } = await loadFixture(
        deployDefault
      );

      async function getBalance(addr: `0x${string}`) {
        return await publicClient.getBalance({ address: addr });
      }

      const wallets = await hre.viem.getWalletClients();

      const owner = wallets[0];
      const participants = wallets.slice(1, 8);

      await play(publicClient, participants, settings.pricePerTicket, lottery);

      const startingLotteryBalance = await getBalance(lottery.address);
      const startingOwnerBalance = await getBalance(owner.account.address);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: await lottery.write.emptyBalance({ account: owner.account }),
      });

      const gasFees = receipt.gasUsed * receipt.effectiveGasPrice;

      const finalLotteryBalance = await getBalance(lottery.address);
      const finalOwnerBalance = await getBalance(owner.account.address);
      const amountReceived = finalOwnerBalance - startingOwnerBalance;

      expect(finalLotteryBalance).to.be.equal(
        0n,
        'the final lottery balance should be 0'
      );

      expect(amountReceived + gasFees).to.be.equal(
        startingLotteryBalance,
        'owner should have received the lottery balance'
      );

      const finalPool = await lottery.read.pool();
      expect(finalPool).to.be.equal(0n, 'pool should have been set to 0');

      await shouldFailWithError(
        lottery.write.emptyBalance({ account: owner.account }),
        'NothingToWithdraw'
      );

      await shouldFailWithError(
        lottery.write.withdraw({ account: owner.account }),
        'NothingToWithdraw'
      );
    });
  });

  describe('transfer ownership', () => {
    it('fails if not requested by owner', async () => {
      const { lottery } = await loadFixture(deployDefault);

      const wallets = await hre.viem.getWalletClients();
      const notOwner = wallets[1];
      const target = wallets[2];

      await expect(
        lottery.write.transferOwnership([target.account.address], {
          account: notOwner.account,
        })
      ).to.be.eventually.rejectedWith(`MustBeOwner`);
    });

    it('succeeds if done by owner', async () => {
      const { lottery, publicClient } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();

      shouldEqualIgnoreCase(
        await lottery.read.owner(),
        wallets[0].account.address
      );

      const targetAddress = wallets[1].account.address;

      await shouldFulfill(
        publicClient,
        lottery.write.transferOwnership([targetAddress], {
          account: wallets[0].account,
        })
      );

      shouldEqualIgnoreCase(await lottery.read.owner(), targetAddress);

      const events = await lottery.getEvents.OwnershipChanged();
      expect(events).to.be.lengthOf(1);
      shouldEqualIgnoreCase(events[0].args.from!, wallets[0].account.address);
      shouldEqualIgnoreCase(events[0].args.to!, targetAddress);
    });
  });

  describe('tickets for address', () => {
    it('should allow the owner to see any tickets', async () => {
      const { lottery, settings, publicClient } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();

      const owner = wallets[0];
      const target = wallets[1];
      const participants = wallets.slice(1, 5);
      await play(publicClient, participants, settings.pricePerTicket, lottery);

      await expect(
        lottery.read.ticketsForAddress([target.account.address], {
          account: owner.account,
        })
      ).to.be.eventually.fulfilled;
    });

    it('should fail if not the owner', async () => {
      const { lottery, settings, publicClient } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();

      const target = wallets[1];
      const participants = wallets.slice(1, 5);
      await play(publicClient, participants, settings.pricePerTicket, lottery);

      const want = target.account.address;

      await shouldFailWithError(
        lottery.read.ticketsForAddress([want], { account: wallets[2].account }),
        'NotAllowed'
      );
    });

    it("should allow to see one's own tickets", async () => {
      const { lottery, settings, publicClient } = await loadFixture(
        deployDefault
      );
      const wallets = await hre.viem.getWalletClients();

      const target = wallets[1];
      const participants = wallets.slice(1, 5);
      await play(publicClient, participants, settings.pricePerTicket, lottery);

      await expect(
        lottery.read.ticketsForAddress([target.account.address], {
          account: target.account,
        })
      ).to.be.eventually.fulfilled;
    });
  });
});

// helper function for playing the lottery with a set of participants.
async function play(
  publicClient: waitForable,
  participants: any,
  pricePerTicket: bigint,
  lottery: { write: any }
) {
  const ticketsPerParticipant = 2n;
  const amount = pricePerTicket * ticketsPerParticipant;

  for (let k = 0; k < participants.length; k++) {
    const p = participants[k];
    await publicClient.waitForTransactionReceipt({
      hash: await lottery.write.buyTicket([ticketsPerParticipant], {
        account: p.account,
        value: amount,
      }),
    });
  }
}
