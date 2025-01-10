# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```


## Lottery design

This is a simple lotter design. 

Participants can buy tickets, each of which is assigned a unique sequence of digits. 

The participant who matches the drawn sequence exactly will be the winner.

Following that, there will be n - 1 tiers for participants who match the first digits.
