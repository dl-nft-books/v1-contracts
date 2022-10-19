const TokenFactory = artifacts.require("TokenFactory");
const TokenContract = artifacts.require("TokenContract");
const PublicERC1967Proxy = artifacts.require("PublicERC1967Proxy");

const { logTransaction } = require("../runners/logger/logger");

require("dotenv").config();

module.exports = async (deployer) => {
  const tokenFactoryImpl = await deployer.deploy(TokenFactory);

  console.log(`TokenFactory implementation address ----- ${tokenFactoryImpl.address}`);

  const tokenFactoryProxy = await PublicERC1967Proxy.new(tokenFactoryImpl.address, "0x");
  const tokenFactory = await TokenFactory.at(tokenFactoryProxy.address);
  const tokenContractImpl = await deployer.deploy(TokenContract);

  const priceDecimals = process.env.PRICE_DECIMALS;

  await tokenFactory.__TokenFactory_init(priceDecimals);

  console.log(`TokenFactory address ----- ${tokenFactory.address}`);
  console.log(`TokenFactory deployed with next params
    PRICE_DECIMALS: ${priceDecimals}
  `);

  logTransaction(
    await tokenFactory.setNewImplementation(tokenContractImpl.address),
    "Set up new TokenContract implementation."
  );
};
