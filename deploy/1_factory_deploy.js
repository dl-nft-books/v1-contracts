const TokenFactory = artifacts.require("TokenFactory");
const TokenContract = artifacts.require("TokenContract");
const PublicERC1967Proxy = artifacts.require("PublicERC1967Proxy");

const { parseTokenFactoryParams } = require("./helpers/deployHelper");

require("dotenv").config();

module.exports = async (deployer, logger) => {
  const tokenFactoryParams = parseTokenFactoryParams("./deploy/data/tokenFactoryParams.json");

  const tokenFactoryImpl = await deployer.deploy(TokenFactory);
  const tokenFactoryProxy = await deployer.deploy(PublicERC1967Proxy, tokenFactoryImpl.address, "0x");
  const tokenFactory = await TokenFactory.at(tokenFactoryProxy.address);

  const tokenContractImpl = await deployer.deploy(TokenContract);

  logger.logTransaction(
    await tokenFactory.__TokenFactory_init(
      tokenFactoryParams.admins,
      tokenFactoryParams.baseTokenContractsURI,
      tokenFactoryParams.priceDecimals
    ),
    "Init TokenFactory contract"
  );

  console.log(`TokenFactory implementation address ----- ${tokenFactoryImpl.address}`);
  console.log(`TokenFactory address ----- ${tokenFactory.address}`);
  console.log(`TokenFactory deployed with next params
    ADMINS: ${tokenFactoryParams.admins}
    BASE_TOKEN_CONTRACTS_URI: ${tokenFactoryParams.baseTokenContractsURI}
    PRICE_DECIMALS: ${tokenFactoryParams.priceDecimals}
  `);

  logger.logTransaction(
    await tokenFactory.setNewImplementation(tokenContractImpl.address),
    "Set up new TokenContract implementation"
  );
};
