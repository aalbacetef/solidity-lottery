# Lottery Smart Contract Project

This project implements a lottery system as a Solidity smart contract. The contract serves as a **toy project** or **demo** and is not intended for production use. Its design highlights key concepts in blockchain development, such as randomness, prize distribution, and ownership management.

---

## Features

- **Lottery Participation**:
  - Users can purchase lottery tickets with ETH.
  - Ticket numbers are uniquely generated for each participant.
  - Ensures fairness and prevents duplicate ticket assignments.

- **Winning and Prize Distribution**:
  - The lottery owner sets a winning number to conclude the game.
  - Participants with tickets matching the winning number (or partial matches) are rewarded based on a multi-tiered prize structure.
  - Winners can claim their prizes via the contract.

- **Ownership**:
  - Ownership can be securely transferred to another address.
  - Owners receive fees collected from ticket sales.

---

## Important Notes

This project is **for educational purposes only**. The current implementation of randomness uses a simple `_randMod` function based on `keccak256`, `block.timestamp`, and other deterministic inputs. This method is **not secure for production use**, as it can be manipulated by miners or other network participants. 

For a production-ready lottery system, consider integrating an external randomness oracle, such as [Chainlink VRF](https://chain.link/vrf).

---

## Smart Contract Overview

### Constructor

The constructor initializes the lottery with the following parameters:

- `_pricePerTicket`: Price of each ticket (in wei).
- `_ticketDigitLength`: Number of digits in ticket numbers.
- `_fees`: Amount deducted per ticket as fees for the owner.
- `_nonce`: Seed for random number generation.
- `_maxRetries`: Maximum retries for ensuring unique ticket numbers.
- `_prizeBrackets`: Percentage of the prize pool allocated to winners in each bracket.

### Key Functions

- **`buyTicket(uint numTickets)`**: Purchases tickets by sending ETH. Each ticket is uniquely generated and linked to the buyer.

- **`setWinningNumber(uint number)`**: Sets the winning number and finalizes the lottery. Only the contract owner can call this function.

- **`withdraw()`**: 
  - **For the owner**: Withdraws the accumulated fees.
  - **For winners**: Allows withdrawal of their prize amounts.

- **`ticketsForAddress(address participant)`**: Returns all tickets owned by a given address. Non-owners can only view their own tickets.

- **`transferOwnership(address newOwner)`**: Transfers contract ownership to a specified address.

---

## Events

- `PoolIncreased(uint amount)`: Emitted when the lottery pool grows due to ticket sales.
- `LotteryOver(uint drawnDigit)`: Emitted when the winning number is set and the lottery concludes.

---

## Educational Value

This project illustrates:

1. **Basic Lottery Mechanics**:
   - Ticket sales.
   - Prize distribution based on winning tiers.

2. **Smart Contract Development**:
   - Handling ETH transactions securely.
   - Implementing mappings and state variables for participant data.

3. **Key Blockchain Concepts**:
   - Transparency through public state variables.
   - Owner-only access control.

---

## Security Considerations

- **Randomness**: The current `_randMod` function is not secure. It is advised to replace this with a secure randomness oracle for any non-demo implementation.
- **Access Control**: Owner-restricted functions ensure key operations are limited to the intended party.
- **Withdrawal Safety**: Users can only withdraw their rightful balances, preventing malicious withdrawals.

