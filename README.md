# NFT Books contracts

## Install Dependencies

`npm install`

## Compile Contracts

`npm run compile`

## Run Tests

`npm run test`

## Deployment

Before deploying, you need to create an **.env** file following the example of **.env.example**

Contents of **.env.example**:

```bash
PRIVATE_KEY = "YOUR PRIVATE KEY"
INFURA_KEY = "INFURA PROJECT ID"
ETHERSCAN_KEY = "ETHERSCAN API KEY"
BSCSCAN_KEY = "BSCSCAN API KEY"
COINMARKETCAP_KEY = "COINMARKETCAP API KEY"

# Available targets: 'ethers-v5', 'truffle-v5' and 'web3-v1'
# By default 'ethers-v5'
TYPECHAIN_TARGET = "TYPECHAIN TARGET"
TYPECHAIN_FORCE = "FORCE FLAG"
```

Next, you need to fill out file **deploy/data/tokenFactoryParams.json**, which is the configuration for the **TokenFactory** contract deployment

Example of **tokenFactoryParams.json**:

```json
{
  "admins":["0x6B175474E89094C44Da98b954EedeAC495271d0F"],
  "baseTokenContractsURI":"base_URI/",
  "priceDecimals":"18"
}
```

Next, call command `npm run deploy <network>` (**network** is the name of the network, which should be in **hardhat.config.js**)

## Verifing

To verify the contract you must use the command `npx hardhat --network <network> verify --constructor-args constructorArgs.js <contract-address>`. Where:
- Contract address - deployed contract address
- Network - the network to which the contract was attached
- ConstructorArgs.js - file with constructor arguments of the deployed contract

Or set up **CONFIRMATIONS** and **VERIFY** fields in your **.env** file for autoverification during deployment