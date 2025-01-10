import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseGwei } from "viem";

type Settings = {
  pricePerTicket: number;
  ticketDigitLength: number;
  fees: number;
  nonce: number;
  maxRetries: number;
};


describe("Lottery", function() {
  async function deploySimpleLotteryContract() {
    const defaultSettings: Settings = {
      pricePerTicket: 3500, // in gwei
      ticketDigitLength: 5,
      fees: 500, // in gwei
      nonce: 15,
      maxRetries: 5,
    }

    const pricePerTicket = parseGwei("" + defaultSettings.pricePerTicket);
    const fees = parseGwei("" + defaultSettings.fees);
    const { ticketDigitLength, nonce, maxRetries } = defaultSettings;

    const lottery = await hre.viem.deployContract(
      "Lottery",
      [pricePerTicket, ticketDigitLength, fees, nonce, maxRetries],
      {
        value: parseGwei("0"),
      }
    );

    const publicClient = await hre.viem.getPublicClient();

    return {
      defaultSettings,
      lottery,
      publicClient,
    };
  }

  describe("deployment", () => {
    it("should set the right owner", async () => {
      const { lottery } = await loadFixture(deploySimpleLotteryContract);

      const wallets = await hre.viem.getWalletClients();
      const addr = wallets[0].account.address;
      const owner = await lottery.read.owner();

      expect(owner.toLowerCase()).to.eq(addr.toLowerCase(), "owner should equal address");
    });
  });


});
