const { wei, accounts, toBN } = require("../scripts/utils/utils");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");
const { sign2612 } = require("./helpers/signatures");

const truffleAssert = require("truffle-assertions");
const Reverter = require("./helpers/reverter");
const { assert } = require("chai");

const TokenFactory = artifacts.require("TokenFactoryMock");
const TokenContract = artifacts.require("TokenContract");
const ERC20Mock = artifacts.require("ERC20Mock");
const PublicERC1967Proxy = artifacts.require("PublicERC1967Proxy");

TokenFactory.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe("TokenFactory", () => {
  const reverter = new Reverter();

  const ADDRESS_NULL = "0x0000000000000000000000000000000000000000";
  const OWNER_PK = "3473fa67faf1b0433c89babc1d7216f43c3019ae3f32fc848004d76d11e887b2";

  const priceDecimals = toBN(18);
  const signDuration = 10000;
  const defaultTokenURI = "some uri";
  const baseTokenContractsURI = "base uri/";
  let defaultEndTime;

  let OWNER;
  let USER1;
  let ADMIN1;
  let ADMIN2;

  let tokenFactory;
  let tokenFactoryImpl;

  function signMint({
    tokenContract,
    privateKey = OWNER_PK,
    paymentTokenAddress = ADDRESS_NULL,
    paymentTokenPrice = "0",
    endTimestamp = defaultEndTime.toFixed(),
    tokenURI = defaultTokenURI,
  }) {
    const buffer = Buffer.from(privateKey, "hex");

    const domain = {
      name: "some name",
      verifyingContract: tokenContract,
    };

    const create = {
      paymentTokenAddress,
      paymentTokenPrice,
      endTimestamp,
      tokenURI: web3.utils.soliditySha3(tokenURI),
    };

    return sign2612(domain, create, buffer);
  }

  before("setup", async () => {
    OWNER = await accounts(0);
    USER1 = await accounts(1);
    ADMIN1 = await accounts(2);
    ADMIN2 = await accounts(3);

    tokenFactoryImpl = await TokenFactory.new();
    const _tokenFactoryProxy = await PublicERC1967Proxy.new(tokenFactoryImpl.address, "0x");

    tokenFactory = await TokenFactory.at(_tokenFactoryProxy.address);

    await tokenFactory.__TokenFactory_init([ADMIN1, ADMIN2], baseTokenContractsURI, 18);

    assert.equal((await tokenFactory.priceDecimals()).toString(), priceDecimals.toString());

    const _tokenContractImpl = await TokenContract.new();

    await tokenFactory.setNewImplementation(_tokenContractImpl.address);

    assert.equal(await tokenFactory.getTokenContractsImpl(), _tokenContractImpl.address);

    defaultEndTime = toBN(await getCurrentBlockTime()).plus(signDuration);

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("creation", () => {
    it("should get exception if try to call init function several times", async () => {
      const reason = "Initializable: contract is already initialized";

      await truffleAssert.reverts(
        tokenFactory.__TokenFactory_init([ADMIN1, ADMIN2], baseTokenContractsURI, 18),
        reason
      );
    });
  });

  describe("TokenFactory upgradability", () => {
    it("should correctly upgrade pool to new impl", async () => {
      const _newTokenFactoryImpl = await TokenFactory.new();

      await tokenFactory.upgradeTo(_newTokenFactoryImpl.address);

      assert.equal(
        await (await PublicERC1967Proxy.at(tokenFactory.address)).implementation(),
        _newTokenFactoryImpl.address
      );
    });

    it("should get exception if nonowner try to upgrade", async () => {
      const _newTokenFactoryImpl = await TokenFactory.new();
      const reason = "Ownable: caller is not the owner";

      await truffleAssert.reverts(tokenFactory.upgradeTo(_newTokenFactoryImpl.address, { from: USER1 }), reason);
    });
  });

  describe("setBaseTokenContractsURI", () => {
    it("should correctly update base token contracts URI", async () => {
      const newBaseTokenContractsURI = "new base URI/";

      const tx = await tokenFactory.setBaseTokenContractsURI(newBaseTokenContractsURI);

      assert.equal(await tokenFactory.baseTokenContractsURI(), newBaseTokenContractsURI);

      assert.equal(tx.receipt.logs[0].event, "BaseTokenContractsURIUpdated");
      assert.equal(tx.receipt.logs[0].args.newBaseTokenContractsURI, newBaseTokenContractsURI);
    });

    it("should get exception if nonowner try to call this function", async () => {
      const reason = "Ownable: caller is not the owner";

      await truffleAssert.reverts(tokenFactory.setBaseTokenContractsURI("", { from: USER1 }), reason);
    });
  });

  describe("setNewImplementation", () => {
    it("should correctly set new implementation of the TokenContract", async () => {
      const _newTokenContractImpl = await TokenContract.new();

      await tokenFactory.setNewImplementation(_newTokenContractImpl.address);
      assert.equal(await tokenFactory.getTokenContractsImpl(), _newTokenContractImpl.address);

      await tokenFactory.setNewImplementation(_newTokenContractImpl.address);
      assert.equal(await tokenFactory.getTokenContractsImpl(), _newTokenContractImpl.address);
    });

    it("should get exception if nonowner try to call this function", async () => {
      const _newTokenContractImpl = await TokenContract.new();
      const reason = "Ownable: caller is not the owner";

      await truffleAssert.reverts(
        tokenFactory.setNewImplementation(_newTokenContractImpl.address, { from: USER1 }),
        reason
      );
    });
  });

  describe("updateAdmins", () => {
    let adminsToAdd;

    beforeEach("setup", async () => {
      adminsToAdd = [await accounts(7), await accounts(8), await accounts(9)];
    });

    it("should correctly add new tokens", async () => {
      let expectedArr = [ADMIN1, ADMIN2].concat(adminsToAdd);

      const tx = await tokenFactory.updateAdmins(adminsToAdd, true);

      assert.deepEqual(await tokenFactory.getAdmins(), expectedArr);

      assert.equal(tx.receipt.logs[0].event, "AdminsUpdated");
      assert.deepEqual(tx.receipt.logs[0].args.adminsToUpdate, adminsToAdd);
      assert.equal(tx.receipt.logs[0].args.isAdding, true);
    });

    it("should correctly remove tokens", async () => {
      await tokenFactory.updateAdmins(adminsToAdd, true);

      let expectedArr = [ADMIN1, ADMIN2].concat(adminsToAdd[2]);

      const tx = await tokenFactory.updateAdmins(adminsToAdd.slice(0, 2), false);

      assert.deepEqual(await tokenFactory.getAdmins(), expectedArr);

      assert.equal(tx.receipt.logs[0].event, "AdminsUpdated");
      assert.deepEqual(tx.receipt.logs[0].args.adminsToUpdate, adminsToAdd.slice(0, 2));
      assert.equal(tx.receipt.logs[0].args.isAdding, false);
    });

    it("should get exception if pass zero address", async () => {
      const reason = "PoolFactory: Bad address.";

      await truffleAssert.reverts(tokenFactory.updateAdmins(adminsToAdd.concat(ADDRESS_NULL), true), reason);
    });

    it("should get exception if non admin try to call this function", async () => {
      const reason = "Ownable: caller is not the owner";

      await truffleAssert.reverts(tokenFactory.updateAdmins(adminsToAdd, true, { from: USER1 }), reason);
    });
  });

  describe("deployTokenContract", () => {
    it("should correctly deploy new TokenContract", async () => {
      const tokenName = "some name";
      const tokenSymbol = "some symbol";
      const pricePerOneToken = wei(10, priceDecimals);

      const tx = await tokenFactory.deployTokenContract(tokenName, tokenSymbol, pricePerOneToken, { from: ADMIN1 });

      assert.equal(tx.receipt.logs[1].event, "TokenContractDeployed");
      assert.equal(tx.receipt.logs[1].args.newTokenContractAddr, await tokenFactory.getTokenContractByIndex(0));
      assert.equal(toBN(tx.receipt.logs[1].args.pricePerOneToken).toString(), pricePerOneToken.toString());
      assert.equal(tx.receipt.logs[1].args.tokenName, tokenName);
      assert.equal(tx.receipt.logs[1].args.tokenSymbol, tokenSymbol);
    });

    it("should get exception if pass invalid token name", async () => {
      const reason = "TokenFactory: Invalid token name.";

      await truffleAssert.reverts(tokenFactory.deployTokenContract("", "some symbol", 0, { from: ADMIN1 }), reason);
    });

    it("should get exception if pass invalid token symbol", async () => {
      const reason = "TokenFactory: Invalid token symbol.";

      await truffleAssert.reverts(tokenFactory.deployTokenContract("some name", "", 0, { from: ADMIN1 }), reason);
    });

    it("should get exception if nonowner try to call this function", async () => {
      const reason = "TokenFactory: Only admin can call this function.";

      await truffleAssert.reverts(
        tokenFactory.deployTokenContract("some name", "some symbol", 0, { from: USER1 }),
        reason
      );
    });
  });

  describe("getBaseTokenContractsInfo", () => {
    it("should return correct base token contracts info", async () => {
      const tokenName = "some name";
      const tokenSymbol = "some symbol";
      let pricePerOneToken = wei(10, priceDecimals);

      await tokenFactory.deployTokenContract(tokenName, tokenSymbol, pricePerOneToken, { from: ADMIN1 });

      pricePerOneToken = wei(20, priceDecimals);
      await tokenFactory.deployTokenContract(tokenName, tokenSymbol, pricePerOneToken, { from: ADMIN1 });

      pricePerOneToken = wei(30, priceDecimals);
      await tokenFactory.deployTokenContract(tokenName, tokenSymbol, pricePerOneToken, { from: ADMIN1 });

      const tokenContractsArr = await tokenFactory.getTokenContractsPart(0, 10);

      const result = await tokenFactory.getBaseTokenContractsInfo(tokenContractsArr);

      for (let i = 0; i < tokenContractsArr.length; i++) {
        assert.equal(result[i].tokenContractAddr, tokenContractsArr[i]);
        assert.equal(result[i].pricePerOneToken.toString(), wei(10 * (i + 1), priceDecimals).toFixed());
      }
    });
  });

  describe("getUserNFTsInfo", () => {
    it("should return correct user NFTs info arr", async () => {
      await tokenFactory.updateAdmins([OWNER], true);

      const tokenName = "some name";
      const tokenSymbol = "some symbol";
      const pricePerOneToken = wei(10, priceDecimals);

      await tokenFactory.deployTokenContract(tokenName, tokenSymbol, pricePerOneToken, { from: ADMIN1 });
      await tokenFactory.deployTokenContract(tokenName, tokenSymbol, pricePerOneToken, { from: ADMIN1 });
      await tokenFactory.deployTokenContract(tokenName, tokenSymbol, pricePerOneToken, { from: ADMIN1 });

      const tokenContractsArr = await tokenFactory.getTokenContractsPart(0, 10);

      let sig = signMint({ tokenContract: tokenContractsArr[0] });

      await (
        await TokenContract.at(tokenContractsArr[0])
      ).mintToken(ADDRESS_NULL, 0, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      sig = signMint({ tokenContract: tokenContractsArr[0], tokenURI: defaultTokenURI + 1 });

      await (
        await TokenContract.at(tokenContractsArr[0])
      ).mintToken(ADDRESS_NULL, 0, defaultEndTime, defaultTokenURI + 1, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      sig = signMint({ tokenContract: tokenContractsArr[2], tokenURI: defaultTokenURI + 2 });

      await (
        await TokenContract.at(tokenContractsArr[2])
      ).mintToken(ADDRESS_NULL, 0, defaultEndTime, defaultTokenURI + 2, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      const result = await tokenFactory.getUserNFTsInfo(USER1);

      assert.equal(result[0].tokenContractAddr, tokenContractsArr[0]);
      assert.equal(result[0].tokenIDs.length, 2);
      assert.equal(result[0].tokenIDs[0], "0");
      assert.equal(result[0].tokenIDs[1], "1");

      assert.equal(result[1].tokenContractAddr, tokenContractsArr[1]);
      assert.equal(result[1].tokenIDs.length, 0);

      assert.equal(result[2].tokenContractAddr, tokenContractsArr[2]);
      assert.equal(result[2].tokenIDs.length, 1);
      assert.equal(result[2].tokenIDs[0], "0");
    });
  });

  describe("getTokenContractsPart", () => {
    it("should return correct token contracts arr", async () => {
      const tokenName = "some name";
      const tokenSymbol = "some symbol";
      const pricePerOneToken = wei(10, priceDecimals);
      const addressesArr = [];

      for (let i = 0; i < 5; i++) {
        await tokenFactory.deployTokenContract(tokenName + i, tokenSymbol + i, pricePerOneToken, { from: ADMIN1 });
        addressesArr.push(await tokenFactory.getTokenContractByIndex(i));
      }

      assert.equal((await tokenFactory.getTokenContractsCount()).toString(), 5);

      assert.deepEqual(await tokenFactory.getTokenContractsPart(0, 10), addressesArr);
      assert.deepEqual(await tokenFactory.getTokenContractsPart(0, 3), addressesArr.slice(0, 3));
      assert.deepEqual(await tokenFactory.getTokenContractsPart(3, 10), addressesArr.slice(3));
    });
  });
});
