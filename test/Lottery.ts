import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { formatGwei, getAddress, parseGwei } from "viem";

type Settings = {
  pricePerTicket: number;
  ticketDigitLength: number;
  fees: number;
  nonce: number;
  maxRetries: number;
};

const defaultSettings: Settings = {
  pricePerTicket: 3500, // in gwei
  ticketDigitLength: 5,
  fees: 500, // in gwei
  nonce: 15,
  maxRetries: 5,
};

async function deploySimpleLotteryContract(settings: Settings) {
  const pricePerTicket = parseGwei("" + settings.pricePerTicket);
  const fees = parseGwei("" + settings.fees);
  const { ticketDigitLength, nonce, maxRetries } = settings;

  const lottery = await hre.viem.deployContract(
    "Lottery",
    [pricePerTicket, ticketDigitLength, fees, nonce, maxRetries],
    {
      value: parseGwei("0"),
    }
  );

  const publicClient = await hre.viem.getPublicClient();

  return {
    settings,
    lottery,
    publicClient,
  };
}


describe("Lottery", function() {

  async function deployDefault() {
    return deploySimpleLotteryContract(defaultSettings);
  }

  describe("deployment", () => {
    it("should set the right owner", async () => {
      const { lottery } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const addr = wallets[0].account.address;
      const owner = await lottery.read.owner();

      expect(owner.toLowerCase()).to.eq(addr.toLowerCase(), "owner should equal address");
    });

    it("should fail if fees is invalid", async () => {
      async function deployWithInvalidFees() {
        const settings = Object.assign(
          {},
          defaultSettings,
          { fees: -1 },
        );
        return deploySimpleLotteryContract(settings);
      }

      return expect(loadFixture(deployWithInvalidFees)).to.eventually.be.rejected;
    });

    it("should fail if pricePerTicket is lower than fees ", async () => {
      async function deployWithPriceLowerThanFees() {
        const settings = Object.assign(
          {},
          defaultSettings,
          { pricePerTicket: 0.5 * defaultSettings.fees },
        );

        return deploySimpleLotteryContract(settings);
      }

      return expect(loadFixture(deployWithPriceLowerThanFees)).to.eventually.be.rejected;
    });

    it("should fail if ticketDigitLength is invalid", async () => {
      async function deployWithInvalidTicketDigitLength() {
        const settings = Object.assign(
          {},
          defaultSettings,
          { ticketDigitLength: 0 },
        );
        return deploySimpleLotteryContract(settings);
      }

      return expect(loadFixture(deployWithInvalidTicketDigitLength)).to.eventually.be.rejected;
    });

    it("should fail if maxRetries is invalid", async () => {
      async function deployWithInvalidMaxRetries() {
        const settings = Object.assign(
          {},
          defaultSettings,
          { maxRetries: 0 },
        );
        return deploySimpleLotteryContract(settings);
      }

      return expect(loadFixture(deployWithInvalidMaxRetries)).to.eventually.be.rejected;
    });
  });

  describe("buy ticket", async () => {
    async function deployDefault() {
      return deploySimpleLotteryContract(defaultSettings);
    }

    it("should fail if purchasing no tickets", async () => {
      const { lottery } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);

      await expect(contract.write.buyTicket(
        [0n], { account: wallet.account, value: parseGwei("0") }
      )).to.be.rejectedWith("must have purchased at least one ticket");
    });

    it("should fail if purchasing with an invalid amount", async () => {
      const { lottery } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);

      const insufficientPayment = defaultSettings.pricePerTicket - 1;

      return expect(contract.write.buyTicket(
        [1n], { account: wallet.account, value: parseGwei("" + insufficientPayment) }
      )).to.be.rejectedWith("must send exact amount required to purchase tickets");
    });

    it("should purchase a ticket", async () => {
      const { lottery, settings } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);

      return expect(contract.write.buyTicket(
        [1n],
        { account: wallet.account, value: parseGwei("" + (settings.pricePerTicket)) },

      )).to.not.be.rejected;
    });

    it("should purchase n tickets", async () => {
      const { lottery, settings } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);

      const tickets = 5;

      return expect(contract.write.buyTicket(
        [BigInt(tickets)],
        { account: wallet.account, value: parseGwei("" + (tickets * settings.pricePerTicket)) },

      )).to.not.be.rejected;
    });

    it("should update the pool correctly", async () => {
      const { lottery, settings } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);

      const tickets = 5;
      const amountPaid = tickets * settings.pricePerTicket;

      await contract.write.buyTicket(
        [BigInt(tickets)],
        { account: wallet.account, value: parseGwei("" + amountPaid) },
      );

      const pool = await contract.read.pool();
      const amountFees = parseGwei('' + (tickets * settings.fees));
      const gweiPaid = parseGwei(amountPaid + '');
      const want = gweiPaid - amountFees;

      expect(pool).to.be.equal(
        want,
        'pool should equal amountPaid - totalFees',
      );
    });

    it("should emit the PoolIncreased event correctly", async () => {
      const { lottery, settings } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);

      const tickets = 5;
      const amountPaid = tickets * settings.pricePerTicket;

      await contract.write.buyTicket(
        [BigInt(tickets)],
        { account: wallet.account, value: parseGwei("" + amountPaid) },
      );

      const amountFees = parseGwei('' + (tickets * settings.fees));
      const gweiPaid = parseGwei(amountPaid + '');
      const want = gweiPaid - amountFees;

      const [event] = await contract.getEvents.PoolIncreased()
      expect(event.args.amount).to.be.equal(
        want, 'event should be emitted with correct amount'
      );
    });

    it("should update the lottery's balance correctly", async () => {
      const { lottery, settings, publicClient } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);

      const startingLotteryBalance = await publicClient.getBalance({
        address: lottery.address
      });

      const tickets = 5;
      const amountPaid = tickets * settings.pricePerTicket;

      await contract.write.buyTicket(
        [BigInt(tickets)],
        { account: wallet.account, value: parseGwei("" + amountPaid) },
      );

      const amountFees = parseGwei('' + (tickets * settings.fees));
      const gweiPaid = parseGwei(amountPaid + '');
      const want = gweiPaid - amountFees;

      const lotteryBalance = await publicClient.getBalance({
        address: lottery.address
      });

      expect(lotteryBalance - startingLotteryBalance).to.be.equal(
        want,
        'lottery balance should\'ve increased by the amount going to the pool',
      );
    });

    it("should update the owner's balance correctly", async () => {
      const { lottery, settings, publicClient } = await loadFixture(deployDefault);
      const wallets = await hre.viem.getWalletClients();
      const wallet = wallets[1];
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);

      const owner = await lottery.read.owner();
      const startingOwnerBalance = await publicClient.getBalance({ address: owner });


      const tickets = 5;
      const amountPaid = tickets * settings.pricePerTicket;

      await contract.write.buyTicket(
        [BigInt(tickets)],
        { account: wallet.account, value: parseGwei("" + amountPaid) },
      );

      const amountFees = parseGwei('' + (tickets * settings.fees));

      const ownerBalance = await publicClient.getBalance({ address: owner });
      expect(ownerBalance - startingOwnerBalance).to.be.equal(
        amountFees,
        'owner balance should have amount fees',
      );
    });
  });

  describe("set winning number", () => {
    it("should update the state variables", async () => {
      const { lottery } = await loadFixture(deployDefault);
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);
      const wallets = await hre.viem.getWalletClients();
      const chosen = wallets[0];

      const want = 5;

      const startingWinningNumber = await contract.read.winningNumber();
      expect(startingWinningNumber).to.be.equal(
        BigInt(0), 'initial winning number should be 0',
      );

      await contract.write.setWinningNumber(
        [BigInt(want)],
        { account: chosen.account }
      );

      const got = await contract.read.winningNumber();
      expect(got).to.be.equal(
        BigInt(want), 'winning number state variable was not updated'
      );

      const isOver = await contract.read.isOver();
      expect(isOver).to.be.equal(true, 'isOver should be set to true');
    });

    it("should fail if not executed by the owner", async () => {
      const { lottery, publicClient } = await loadFixture(deployDefault);
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);
      const wallets = await hre.viem.getWalletClients();
      const chosen = wallets[2];

      const want = 5;

      return expect(contract.write.setWinningNumber(
        [BigInt(want)],
        { account: chosen.account }
      )).to.be.rejectedWith('can only be executed by the owner');
    });

    it("should emit the event", async () => {
      const { lottery } = await loadFixture(deployDefault);
      const contract = await hre.viem.getContractAt("Lottery", lottery.address);
      const wallets = await hre.viem.getWalletClients();
      const chosen = wallets[0];

      const want = 5;

      await contract.write.setWinningNumber(
        [BigInt(want)],
        { account: chosen.account }
      );

      const [event] = await contract.getEvents.LotteryOver();
      expect(event.args.drawnDigit).to.be.equal(
        BigInt(want), 'event was not emitted'
      );
    });
  });
});






