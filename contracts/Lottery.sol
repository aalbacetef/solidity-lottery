// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "./TicketManager.sol";

contract Lottery {
    /**
     * @dev The owner of the contract, who can manage the lottery and withdraw owner fees.
     */
    address payable public owner;

    /**
     * @dev The total amount of funds in the prize pool.
     */
    uint public pool;

    /**
     * @dev Indicates whether the lottery is over.
     */
    bool public isOver;

    /**
     * @dev The winning number for the lottery.
     */
    uint public winningNumber;

    /**
     * @dev Private instance of the TicketManager contract to handle ticket-related operations.
     */
    TicketManager private ticketManager;

    /**
     * @dev The fee deducted by the contract owner for each ticket purchase.
     */
    uint public fees;

    /**
     * @dev The price per lottery ticket.
     */
    uint public pricePerTicket;

    /**
     * @dev A nonce value for generating random numbers.
     */
    uint private nonce;

    /**
     * @dev Maximum number of retries allowed for generating a unique ticket number.
     */
    uint private maxRetries;

    /**
     * @dev Array defining the percentage of the pool allocated to each prize bracket.
     */
    uint[] public prizeBrackets;

    /**
     * @dev Array storing the number of winners in each prize bracket.
     */
    uint[] public winnersPerBracket;

    /**
     * @dev The length (number of digits) of the lottery ticket numbers.
     */
    uint public ticketDigitLength;

    /**
     * @dev The balance accumulated by the owner from ticket fees.
     */
    uint public ownerBalance;

    /**
     * @dev Mapping of participant address to their balance of winnings.
     */
    mapping(address => uint) private winnerBalances;

    event PoolIncreased(uint amount);
    event LotteryOver(uint drawnDigit);
    event OwnershipChanged(address from, address to);

    error MustBeOwner();
    error NotAllowed(address addr);
    error NothingToWithdraw();
    error LotteryAlreadyOver();
    error InvalidAmount(uint want, uint got);
    error OutOfBounds(uint index, uint low, uint high);
    error MaxRetriesExceeded();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert MustBeOwner();
        }
        _;
    }

    modifier onlyIfNotOver() {
        if (isOver) {
            revert LotteryAlreadyOver();
        }
        _;
    }

    /**
     * @dev Initializes the contract with required parameters.
     * @param _pricePerTicket The price per ticket.
     * @param _ticketDigitLength The number of digits in the ticket numbers.
     * @param _fees The fee deducted for each ticket.
     * @param _nonce The initial nonce for random number generation.
     * @param _maxRetries The maximum retries for generating tickets during a buyTicket request.
     * @param _prizeBrackets The percentages allocated to each prize bracket.
     */
    constructor(
        uint _pricePerTicket,
        uint _ticketDigitLength,
        uint _fees,
        uint _nonce,
        uint _maxRetries,
        uint[] memory _prizeBrackets
    ) payable {
        require(_fees > 0, "fees must be larger than 0");
        require(
            _pricePerTicket > _fees,
            "price per ticket must be larger than the amount paid for fees"
        );
        require(
            _ticketDigitLength > 0,
            "ticket digit length must be larger than 0"
        );
        require(_maxRetries > 0, "max retries must be larger than 0");
        require(
            _prizeBrackets.length == _ticketDigitLength,
            "prize brackets length must equal ticket digit length"
        );

        owner = payable(msg.sender);
        nonce = _nonce;
        maxRetries = _maxRetries;
        pricePerTicket = _pricePerTicket;
        fees = _fees;
        prizeBrackets = _prizeBrackets;
        ticketDigitLength = _ticketDigitLength;

        isOver = false;
        winningNumber = 0;
        winnersPerBracket = new uint[](_ticketDigitLength);
        ownerBalance = 0;

        ticketManager = new TicketManager();
    }

    /**
     * @dev Allows participants to purchase tickets.
     * Reverts if the payment amount is incorrect or if the lottery is over.
     * @param numTickets The number of tickets to purchase.
     */
    function buyTicket(uint numTickets) external payable onlyIfNotOver {
        if (numTickets == 0) {
            revert InvalidAmount(1, 0);
        }

        uint amountWanted = pricePerTicket * numTickets;

        if (msg.value != amountWanted) {
            revert InvalidAmount(amountWanted, msg.value);
        }

        uint total = numTickets * pricePerTicket;
        uint totalFees = numTickets * fees;

        // to prevent DoS, we count all retries in a given contract/transaction.
        uint retries = 0;

        uint maxDigit = 10 ** ticketDigitLength;

        for (uint k = 0; k < numTickets; k++) {
            uint ticket = _generateTicket(maxDigit);

            while (ticketManager.ticketExists(ticket)) {
                ticket = _generateTicket(maxDigit);

                retries++;
                if (retries > maxRetries) {
                    revert MaxRetriesExceeded();
                }
            }

            ticketManager.addTicket(ticket, msg.sender);
        }

        uint amount = total - totalFees;

        ownerBalance += totalFees;
        pool += amount;

        emit PoolIncreased(amount);
    }

    /**
     * @dev Allows the owner to withdraw the owner's accumulated
     * balance or for participants to withdraw their balance when the lottery
     * is over.
     * Reverts if there is nothing to withdraw.
     */
    function withdraw() external payable {
        if (msg.sender == owner) {
            uint toTransfer = ownerBalance;

            if (toTransfer == 0) {
                revert NothingToWithdraw();
            }

            ownerBalance = 0;
            owner.transfer(toTransfer);

            return;
        }

        // participants must wait for the lottery to be over
        if (!isOver) {
            revert NotAllowed(msg.sender);
        }

        uint winnerBalance = winnerBalances[msg.sender];
        if (winnerBalance == 0) {
            revert NothingToWithdraw();
        }

        winnerBalances[msg.sender] = 0;
        payable(msg.sender).transfer(winnerBalance);
    }

    /**
     * @dev Empties the lottery contract's balance and sends it to the owner.
     * Sets the pool and owner balance to 0, and sets the lottery as over.
     * Reverts if there is nothing to withdraw.
     */
    function emptyBalance() external payable onlyOwner {
        uint currentBalance = address(this).balance;

        if (currentBalance == 0) {
            revert NothingToWithdraw();
        }

        pool = 0;
        ownerBalance = 0;
        isOver = true;
        owner.transfer(currentBalance);
    }

    /**
     * @dev Ends the lottery by setting the winning number.
     * Distributes prizes to winners after determining the brackets.
     * @param number The winning number.
     */
    function setWinningNumber(uint number) external onlyOwner onlyIfNotOver {
        isOver = true;
        winningNumber = number;

        _distributePrizes();

        emit LotteryOver(number);
    }

    /**
     * @dev Allows participants or the owner to view their tickets.
     * @param participant The address of the participant.
     * @return The array of tickets assigned to the participant.
     */
    function ticketsForAddress(
        address participant
    ) external view returns (uint[] memory) {
        bool isOwner = msg.sender == owner;
        bool isOwnAddress = msg.sender == participant;

        if (!isOwner && !isOwnAddress) {
            revert NotAllowed(participant);
        }

        return ticketManager.getTicketsForParticipant(participant);
    }

    /**
     * @dev Allows the owner to transfer ownership of the contract.
     * @param newOwner The address of the new owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = payable(newOwner);

        emit OwnershipChanged(oldOwner, newOwner);
    }

    /**
     * @dev Distributes prizes to the winners after determining the brackets.
     */
    function _distributePrizes() private {
        uint[] memory allTickets = ticketManager.getAll();
        uint[] memory ticketBrackets = new uint[](allTickets.length);

        for (uint k = 0; k < allTickets.length; k++) {
            uint ticket = allTickets[k];
            uint bracket = _determineBracket(ticket);
            ticketBrackets[k] = bracket;

            if (bracket == 0) {
                continue;
            }

            winnersPerBracket[bracket - 1]++;
        }

        for (uint k = 0; k < allTickets.length; k++) {
            uint ticket = allTickets[k];
            address participant = ticketManager.getParticipantForTicket(ticket);
            uint bracket = ticketBrackets[k];

            if (bracket == 0) {
                continue;
            }

            uint winnerCount = winnersPerBracket[bracket - 1];

            if (winnerCount == 0) {
                continue;
            }

            uint amountForUser = _calculatePrize(bracket, winnerCount);
            winnerBalances[participant] += amountForUser;
        }
    }

    /**
     * @dev Calculates the prize for a given bracket and the number of winners.
     * @param bracket The prize bracket.
     * @param winnerCount The number of winners in the bracket.
     * @return The amount for each winner.
     */
    function _calculatePrize(
        uint bracket,
        uint winnerCount
    ) private view returns (uint) {
        uint amountPerBracket = (prizeBrackets[bracket - 1] * pool) / 100;
        return amountPerBracket / winnerCount;
    }

    /**
     * @dev Determines the prize bracket for a given ticket.
     * @param ticket The ticket number.
     * @return The bracket number (1-based).
     */
    function _determineBracket(uint ticket) private view returns (uint) {
        for (uint k = 0; k < ticketDigitLength; k++) {
            uint mask = 10 ** k;
            uint maskedTicket = (ticket / mask);
            uint maskedWinningNumber = (winningNumber / mask);

            if (maskedTicket == maskedWinningNumber) {
                return k + 1;
            }
        }

        return 0;
    }

    /**
     * @dev Generates a random ticket number.
     * @param _mod The modulus used to constrain the generated ticket number.
     * @return A random ticket number.
     */
    function _generateTicket(uint _mod) private returns (uint) {
        return _randMod(_mod);
    }

    /**
     * @dev Generates a pseudo-random number based on the block timestamp, sender, and nonce.
     * @param _modulus The modulus for constraining the random number.
     * @return A random number.
     */
    function _randMod(uint _modulus) private returns (uint) {
        nonce++;
        return
            uint(
                keccak256(abi.encodePacked(block.timestamp, msg.sender, nonce))
            ) % (_modulus + 1);
    }
}
