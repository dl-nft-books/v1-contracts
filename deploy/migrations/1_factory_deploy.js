const TokenFactory = artifacts.require("TokenFactory");
const TokenContract = artifacts.require("TokenContract");
const PublicERC1967Proxy = artifacts.require("PublicERC1967Proxy");

const { parseTokenFactoryParams } = require("../helpers/deployHelper");
const { logTransaction } = require("../runners/logger/logger");

require("dotenv").config();

module.exports = async (deployer) => {
  const tokenFactoryParams = parseTokenFactoryParams("./deploy/data/tokenFactoryParams.json");

  const tokenFactoryImpl = await deployer.deploy(TokenFactory);
  const tokenFactoryProxy = await deployer.deploy(PublicERC1967Proxy, tokenFactoryImpl.address, "0x");
  const tokenFactory = await TokenFactory.at(tokenFactoryProxy.address);

  const tokenContractImpl = await deployer.deploy(TokenContract);

  logTransaction(
    await tokenFactory.__TokenFactory_init(tokenFactoryParams.admins, tokenFactoryParams.priceDecimals),
    "Init TokenFactory contract"
  );

  console.log(`TokenFactory implementation address ----- ${tokenFactoryImpl.address}`);
  console.log(`TokenFactory address ----- ${tokenFactory.address}`);
  console.log(`TokenFactory deployed with next params
    ADMINS: ${tokenFactoryParams.admins}
    PRICE_DECIMALS: ${tokenFactoryParams.priceDecimals}
  `);

  logTransaction(
    await tokenFactory.setNewImplementation(tokenContractImpl.address),
    "Set up new TokenContract implementation"
  );
};
