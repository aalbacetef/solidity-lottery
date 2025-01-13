// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract Lottery {
  address payable public owner;
  uint public pool;
  bool public isOver;
  bool alreadyDistributed;
  uint public winningNumber; 

  mapping(uint => address) participantTickets;
  mapping(uint => bool) isAlreadySet;
  mapping(address => bool) alreadyWithdrew;
  mapping(uint => uint) ticketBrackets;
  mapping(address => uint) winnerBalances;
  mapping(address => uint[]) ticketsForParticipant;

  uint fees;
  uint pricePerTicket;
  uint nonce;
  uint maxRetries;
  uint[] tickets;
  uint[] winningTickets;
  uint[] prizeBrackets;
  uint[] winnersPerBracket;
  uint ticketDigitLength;
  uint ownerBalance;

  event PoolIncreased(uint amount);
  event LotteryOver(uint drawnDigit);

  error MustBeOwner();

  modifier onlyOwner() {
    if(msg.sender != owner) {
      revert MustBeOwner();
    }
    _;
  }

  constructor(
    uint _pricePerTicket, 
    uint _ticketDigitLength, 
    uint _fees, 
    uint _nonce, 
    uint _maxRetries,
    uint[] memory _prizeBrackets
  ) payable {
    require(_fees > 0, "fees must be larger than 0");
    require(_pricePerTicket > _fees, "price per ticket must be larger than the amount paid for fees");
    require(_ticketDigitLength > 0, "ticket digit length must be larger than 0");
    require(_maxRetries > 0, "max retries must be larger than 0");
    require(_prizeBrackets.length == _ticketDigitLength, "prize brackets length must equal ticket digit length");

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
    alreadyDistributed = false;
  }

  function buyTicket(uint numTickets) external payable { 
    require(numTickets > 0, "must have purchased at least one ticket");
    require(msg.value == (pricePerTicket * numTickets), "must send exact amount required to purchase tickets");
    require(!isOver, "lottery is over");
    
    uint total = numTickets * pricePerTicket;
    uint totalFees = numTickets * fees;

    // to prevent DoS, we count all retries in a given contract/transaction.
    uint retries = 0;
  
    uint maxDigit = 10 ** ticketDigitLength;

    for(uint k = 0; k < numTickets; k++) {
      uint ticket = _generateTicket(maxDigit);

      while(isAlreadySet[ticket]) {
        ticket = _generateTicket(maxDigit);

        retries++;
        if(retries > maxRetries) {
          revert("max retries exceeded");
        }
      }

      isAlreadySet[ticket] = true;
      participantTickets[ticket] = msg.sender;
      ticketsForParticipant[msg.sender].push(ticket);

      tickets.push(ticket);
    }

    uint amount = total - totalFees;
    ownerBalance += totalFees;

    pool += amount;
      
    emit PoolIncreased(amount);
  }


  function withdraw() external payable {
    require(!alreadyWithdrew[msg.sender], "already withdrew prize");

    if(msg.sender == owner) {
      require(ownerBalance > 0, "there is nothing to withdraw");

      uint shouldTransfer = ownerBalance;
      alreadyWithdrew[owner] = true;
      ownerBalance = 0;
      owner.transfer(shouldTransfer);
      return;
    }

    uint winnerBalance = winnerBalances[msg.sender];
    require(winnerBalance > 0, "no prize");

    alreadyWithdrew[msg.sender] = true;
    winnerBalances[msg.sender] = 0;
    payable(msg.sender).transfer(winnerBalance);     
  }

  // emptyBalance will empty the lottery account's balance to the owner's account.
  // it will also:
  //  - set pool=0
  //  - set ownerBalance=0
  //  - set isOver=true
  function emptyBalance() external payable onlyOwner {
    uint currentBalance = address(this).balance;
    require(currentBalance > 0, "balance is empty");

    pool = 0;
    ownerBalance = 0;
    isOver = true;
    alreadyWithdrew[msg.sender] = true;
    owner.transfer(currentBalance);
  }

  // setWinningNumber sets the winning number and can only be called by the owner.
  function setWinningNumber(uint number) external {
    require(msg.sender == owner, "can only be executed by the owner");
    require(!isOver, "lottery is already over");

    isOver = true;
    winningNumber = number;

    distributePrizes();

    emit LotteryOver(number);
  }

  function distributePrizes() private {
    require(!alreadyDistributed, "prizes already distributed");

    for(uint k = 0; k < tickets.length; k++) {
      uint ticket = tickets[k];
      uint bracket = _determineBracket(ticket);

      if(bracket == 0) {
        continue;
      }

      ticketBrackets[tickets[k]] = bracket;
      winnersPerBracket[bracket - 1]++; 
      winningTickets.push(ticket);
    }

    for(uint k = 0; k < winningTickets.length; k++) {
      uint ticket = winningTickets[k];
      address participant = participantTickets[ticket];
      uint bracket = ticketBrackets[ticket];
      uint winnerCount = winnersPerBracket[bracket - 1];

      // note: shouldn't happen as in theory we're in a bracket being awarded.
      if(winnerCount == 0) {
        continue;
      }

      uint amountForUser = _calculatePrize(bracket, winnerCount);
      winnerBalances[participant] += amountForUser;
    }

    alreadyDistributed = true;
  }

  function ticketsForAddress(address participant) external view returns(uint[] memory) {
    if(msg.sender != owner){
      require(msg.sender == participant, "can only see your own tickets");
    }

    return ticketsForParticipant[participant];
  }

  // NOTE: transferring ownership to a participant is not expected.
  function transferOwnership(address newOwner) external onlyOwner {
    require(msg.sender == owner, "can only be called by the owner");
    owner = payable(newOwner);
  }
  
  function _calculatePrize(uint bracket, uint winnerCount) private view returns (uint) {
    uint amountPerBracket = (prizeBrackets[bracket - 1]  * pool) / 100;
    return amountPerBracket / winnerCount;
  }

  function _determineBracket(uint ticket) private view returns(uint) {
    for(uint k = 0; k < ticketDigitLength; k++) {
      uint mask = 10 ** k;
      uint maskedTicket = (ticket / mask);
      uint maskedWinningNumber = (winningNumber/mask);

      if(maskedTicket == maskedWinningNumber) {
        return k + 1;
      }
    }

    return 0;
  }

  function _prizePerBracket(uint index) private view returns(uint) {
    require(index >= 1 && index <= prizeBrackets.length, 'index should be in bounds [1,n]');

    return prizeBrackets[index - 1];
  }

  function _generateTicket(uint _mod) private returns(uint) {
    // TODO: replace _randMode with a call to ChainLink VRF.
    return _randMod(_mod);
  }
    
  function _randMod(uint _modulus) private returns(uint) {
    nonce++;
    return uint(keccak256(abi.encodePacked(block.timestamp,msg.sender, nonce))) % (_modulus + 1);
  }
}
