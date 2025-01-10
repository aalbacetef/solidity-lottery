// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract Lottery {
  address payable public owner;
  uint pool;
  bool isOver;

  mapping(uint => address) participantTickets;
  mapping(uint => bool) isAlreadySet;
  mapping(uint => address[]) winners;

  uint fees;
  uint pricePerTicket;
  uint nonce;
  uint maxRetries;
  uint[] tickets;

  event PoolIncreased(uint amount);
  event LotteryOver(uint winningTicket);

  constructor(uint _pricePerTicket, uint _ticketDigitLength, uint _fees, uint _nonce, uint _maxRetries) payable {
    require(_pricePerTicket > fees, "price per ticket must be larger than the amount paid for fees");
    require(_ticketDigitLength > 0, "ticket digit length must be larger than 0");
    require(_fees > 0, "fees must be larger than 0");
    require(_maxRetries > 0, "max retries must be larger than 0");

    owner = payable(msg.sender);
    isOver = false;
    nonce = _nonce;
    maxRetries = _maxRetries;
  }

  function buyTicket(uint numTickets) payable public {
    require(numTickets > 0, "must have purchased at least one ticket");
    require(msg.value != (pricePerTicket * numTickets), "must send exact amount required to purchase tickets");

    require(!isOver, "lottery is over");
    
    uint total = numTickets * pricePerTicket;
    uint totalFees = numTickets * fees;

    // to prevent DoS, we count all retries in a given contract/transaction.
    uint retries = 0;

    for(uint k = 0; k < numTickets; k++) {
      uint ticket = _generateTicket(pricePerTicket);

      while(isAlreadySet[ticket]) {
        ticket = _generateTicket(pricePerTicket);

        retries++;
        if(retries > maxRetries) {
          revert("max retries exceeded");
        }
      }

      isAlreadySet[ticket] = true;
      participantTickets[ticket] = msg.sender;

      tickets.push(ticket);
    }
      
    emit PoolIncreased(total - totalFees);
  }


  // setWinningNumber sets the winning number and can only be called by the owner.
  function setWinningNumber(uint number) public {
    require(msg.sender == owner, "can only be executed by the owner");
    isOver = true;
    
    emit LotteryOver(number);
  }

  function _generateTicket(uint _mod) private returns(uint) {
    return _randMod(_mod);
  }
    
  function _randMod(uint _modulus) private returns(uint) {
      nonce++;

      return uint(keccak256(abi.encodePacked(block.timestamp,msg.sender, nonce))) % _modulus;
  }
}
