import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { shouldEqualIgnoreCase, shouldFailWithError } from './helpers';

async function deployTicketManagerContract() {
  const ticketManager = await hre.viem.deployContract('TicketManager');

  const publicClient = await hre.viem.getPublicClient();

  return {
    ticketManager,
    publicClient,
  };
}

describe('TicketManager', function () {
  describe('add ticket', () => {
    it('should correctly add a ticket', async () => {
      const { ticketManager, publicClient } = await loadFixture(
        deployTicketManagerContract
      );
      const wallets = await hre.viem.getWalletClients();

      const ticket = 1010n;
      const account = wallets[1].account;

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([ticket, account.address], {
          account,
        }),
      });

      const events = await ticketManager.getEvents.TicketAdded();
      expect(events).to.be.lengthOf(1, 'should have 1 event emitted');
      expect(events[0].args.ticket).to.be.equal(ticket);
      expect(events[0].args.participant?.toLowerCase()).to.be.equal(
        account.address.toLowerCase()
      );
    });

    it('should fail if ticket already exists', async () => {
      const { ticketManager, publicClient } = await loadFixture(
        deployTicketManagerContract
      );
      const wallets = await hre.viem.getWalletClients();

      const ticket = 1010n;
      const account = wallets[1].account;

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([ticket, account.address], {
          account,
        }),
      });

      await shouldFailWithError(
        ticketManager.write.addTicket([ticket, account.address], { account }),
        'TicketAlreadyExists'
      );
    });
  });

  describe('get tickets', async () => {
    it('should return a participants tickets', async () => {
      const { ticketManager, publicClient } = await loadFixture(
        deployTicketManagerContract
      );
      const wallets = await hre.viem.getWalletClients();

      const tickets = [1010n, 11001n];
      const account = wallets[1].account;
      const second = wallets[2].account;
      const secondTicket = 11192n;

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([
          tickets[0],
          account.address,
        ]),
      });

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([
          tickets[1],
          account.address,
        ]),
      });

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([
          secondTicket,
          second.address,
        ]),
      });

      const got = await ticketManager.read.getTicketsForParticipant([
        account.address,
      ]);

      expect(got).to.be.lengthOf(2);
      expect(got[0]).to.be.equal(tickets[0]);
      expect(got[1]).to.be.equal(tickets[1]);
    });

    it('should handle the empty case', async () => {
      const { ticketManager } = await loadFixture(deployTicketManagerContract);
      const wallets = await hre.viem.getWalletClients();

      const got = await ticketManager.read.getTicketsForParticipant([
        wallets[0].account.address,
      ]);

      expect(got).to.be.lengthOf(0);
    });

    it('should return a participant for a given ticket', async () => {
      const { ticketManager, publicClient } = await loadFixture(
        deployTicketManagerContract
      );
      const wallets = await hre.viem.getWalletClients();

      const tickets = [1010n, 11001n];
      const account = wallets[1].account;

      const second = wallets[2].account;
      const secondTicket = 11192n;

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([
          tickets[0],
          account.address,
        ]),
      });

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([
          tickets[1],
          account.address,
        ]),
      });

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([
          secondTicket,
          second.address,
        ]),
      });

      shouldEqualIgnoreCase(
        await ticketManager.read.getParticipantForTicket([tickets[0]]),
        account.address
      );

      shouldEqualIgnoreCase(
        await ticketManager.read.getParticipantForTicket([tickets[1]]),
        account.address
      );

      shouldEqualIgnoreCase(
        await ticketManager.read.getParticipantForTicket([secondTicket]),
        second.address
      );
    });

    it('should return all tickets', async () => {
      const { ticketManager, publicClient } = await loadFixture(
        deployTicketManagerContract
      );
      const wallets = await hre.viem.getWalletClients();

      const tickets = [1010n, 11001n];
      const account = wallets[1].account;

      const second = wallets[2].account;
      const secondTicket = 11192n;

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([
          tickets[0],
          account.address,
        ]),
      });

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([
          tickets[1],
          account.address,
        ]),
      });

      await publicClient.waitForTransactionReceipt({
        hash: await ticketManager.write.addTicket([
          secondTicket,
          second.address,
        ]),
      });

      const allTickets = await ticketManager.read.getAll();

      expect(allTickets).to.be.lengthOf(3);

      expect(allTickets[0]).to.be.equal(tickets[0]);
      expect(allTickets[1]).to.be.equal(tickets[1]);
      expect(allTickets[2]).to.be.equal(secondTicket);
    });
  });
});
