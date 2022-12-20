const { wei, accounts, toBN } = require("../scripts/utils/utils");
const { ZERO_ADDR } = require("../scripts/utils/constants");
const { getCurrentBlockTime } = require("./helpers/hardhatTimeTraveller");
const { signMint, signCreate } = require("./helpers/signatures");

const truffleAssert = require("truffle-assertions");
const Reverter = require("./helpers/reverter");
const { assert } = require("chai");

const TokenFactory = artifacts.require("TokenFactory");
const TokenContract = artifacts.require("TokenContract");
const ERC20Mock = artifacts.require("ERC20Mock");
const PublicERC1967Proxy = artifacts.require("PublicERC1967Proxy");

TokenFactory.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe("TokenFactory", () => {
  const reverter = new Reverter();

  const OWNER_PK = "3473fa67faf1b0433c89babc1d7216f43c3019ae3f32fc848004d76d11e887b2";
  const USER1_PK = "0e48c6349e2619d39b0f2c19b63e650718903a3146c7fb71f4c7761147b2a10b";

  const priceDecimals = toBN(18);
  const signDuration = 10000;
  const defaultTokenURI = "some uri";
  const baseTokenContractsURI = "base uri/";
  let defaultEndTime;

  const defaultDiscountValue = 0;
  const defaultTokenContractId = "0";
  const defaultTokenName = "tokenName";
  const defaultTokenSymbol = "tokenSymbol";
  const defaultPricePerOneToken = wei(10, priceDecimals);
  const defaultVoucherTokensAmount = wei(1);
  let defaultVoucherContract;

  let OWNER;
  let USER1;
  let ADMIN1;
  let ADMIN2;

  let tokenFactory;
  let tokenFactoryImpl;

  function signMintTest({
    tokenContract,
    privateKey = OWNER_PK,
    paymentTokenAddress = ZERO_ADDR,
    paymentTokenPrice = "0",
    discount = defaultDiscountValue.toFixed(),
    endTimestamp = defaultEndTime.toFixed(),
    tokenURI = defaultTokenURI,
  }) {
    const buffer = Buffer.from(privateKey, "hex");

    const domain = {
      name: defaultTokenName,
      verifyingContract: tokenContract,
    };

    const mint = {
      paymentTokenAddress,
      paymentTokenPrice,
      discount,
      endTimestamp,
      tokenURI: web3.utils.soliditySha3(tokenURI),
    };

    return signMint(domain, mint, buffer);
  }

  function signCreateTest({
    privateKey = OWNER_PK,
    tokenContractId = defaultTokenContractId,
    tokenName = defaultTokenName,
    tokenSymbol = defaultTokenSymbol,
    pricePerOneToken = defaultPricePerOneToken.toFixed(),
    voucherTokenContract = defaultVoucherContract.address,
    voucherTokensAmount = defaultVoucherTokensAmount.toFixed(),
  }) {
    const buffer = Buffer.from(privateKey, "hex");

    const domain = {
      name: "TokenFactory",
      verifyingContract: tokenFactory.address,
    };

    const create = {
      tokenContractId,
      tokenName: web3.utils.soliditySha3(tokenName),
      tokenSymbol: web3.utils.soliditySha3(tokenSymbol),
      pricePerOneToken,
      voucherTokenContract,
      voucherTokensAmount,
    };

    return signCreate(domain, create, buffer);
  }

  async function deployNewTokenContract({
    tokenContractId_ = defaultTokenContractId,
    tokenName_ = defaultTokenName,
    tokenSymbol_ = defaultTokenSymbol,
    pricePerOneToken_ = defaultPricePerOneToken.toFixed(),
    voucherTokenContract_ = defaultVoucherContract.address,
    voucherTokensAmount_ = defaultVoucherTokensAmount.toFixed(),
  }) {
    const sig = signCreateTest({
      tokenContractId: tokenContractId_,
      tokenName: tokenName_,
      tokenSymbol: tokenSymbol_,
      pricePerOneToken: pricePerOneToken_,
      voucherTokenContract: voucherTokenContract_,
      voucherTokensAmount: voucherTokensAmount_,
    });

    return await tokenFactory.deployTokenContract(
      [tokenContractId_, tokenName_, tokenSymbol_, pricePerOneToken_, voucherTokenContract_, voucherTokensAmount_],
      sig.r,
      sig.s,
      sig.v,
      { from: USER1 }
    );
  }

  before("setup", async () => {
    OWNER = await accounts(0);
    USER1 = await accounts(1);
    ADMIN1 = await accounts(2);
    ADMIN2 = await accounts(3);

    defaultVoucherContract = await ERC20Mock.new("Test Voucher Token", "TVT", 18);

    tokenFactoryImpl = await TokenFactory.new();
    const _tokenFactoryProxy = await PublicERC1967Proxy.new(tokenFactoryImpl.address, "0x");

    tokenFactory = await TokenFactory.at(_tokenFactoryProxy.address);

    await tokenFactory.__TokenFactory_init([OWNER, ADMIN1, ADMIN2], baseTokenContractsURI, 18);

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
      let expectedArr = [OWNER, ADMIN1, ADMIN2].concat(adminsToAdd);

      const tx = await tokenFactory.updateAdmins(adminsToAdd, true);

      assert.deepEqual(await tokenFactory.getAdmins(), expectedArr);

      assert.equal(tx.receipt.logs[0].event, "AdminsUpdated");
      assert.deepEqual(tx.receipt.logs[0].args.adminsToUpdate, adminsToAdd);
      assert.equal(tx.receipt.logs[0].args.isAdding, true);
    });

    it("should correctly remove tokens", async () => {
      await tokenFactory.updateAdmins(adminsToAdd, true);

      let expectedArr = [OWNER, ADMIN1, ADMIN2].concat(adminsToAdd[2]);

      const tx = await tokenFactory.updateAdmins(adminsToAdd.slice(0, 2), false);

      assert.deepEqual(await tokenFactory.getAdmins(), expectedArr);

      assert.equal(tx.receipt.logs[0].event, "AdminsUpdated");
      assert.deepEqual(tx.receipt.logs[0].args.adminsToUpdate, adminsToAdd.slice(0, 2));
      assert.equal(tx.receipt.logs[0].args.isAdding, false);
    });

    it("should get exception if pass zero address", async () => {
      const reason = "PoolFactory: Bad address.";

      await truffleAssert.reverts(tokenFactory.updateAdmins(adminsToAdd.concat(ZERO_ADDR), true), reason);
    });

    it("should get exception if non admin try to call this function", async () => {
      const reason = "Ownable: caller is not the owner";

      await truffleAssert.reverts(tokenFactory.updateAdmins(adminsToAdd, true, { from: USER1 }), reason);
    });
  });

  describe("deployTokenContract", () => {
    it("should correctly deploy new TokenContract", async () => {
      const tx = await deployNewTokenContract({});

      assert.equal(tx.receipt.logs[1].event, "TokenContractDeployed");
      assert.equal(
        tx.receipt.logs[1].args.newTokenContractAddr,
        await tokenFactory.tokenContractByIndex(defaultTokenContractId)
      );
      assert.equal(
        toBN(tx.receipt.logs[1].args.tokenContractParams.tokenContractId).toString(),
        defaultTokenContractId
      );
      assert.equal(
        toBN(tx.receipt.logs[1].args.tokenContractParams.pricePerOneToken).toString(),
        defaultPricePerOneToken.toString()
      );
      assert.equal(tx.receipt.logs[1].args.tokenContractParams.tokenName, defaultTokenName);
      assert.equal(tx.receipt.logs[1].args.tokenContractParams.tokenSymbol, defaultTokenSymbol);
      assert.equal(tx.receipt.logs[1].args.tokenContractParams.voucherTokenContract, defaultVoucherContract.address);
      assert.equal(
        toBN(tx.receipt.logs[1].args.tokenContractParams.voucherTokensAmount).toString(),
        defaultVoucherTokensAmount.toString()
      );
    });

    it("should get exception if try to deploy tokenContaract with already existing tokenContractId", async () => {
      const reason = "TokenFactory: TokenContract with such id already exists.";

      const sig = signCreateTest({});

      await tokenFactory.deployTokenContract(
        [
          defaultTokenContractId,
          defaultTokenName,
          defaultTokenSymbol,
          defaultPricePerOneToken,
          defaultVoucherContract.address,
          defaultVoucherTokensAmount,
        ],
        sig.r,
        sig.s,
        sig.v,
        { from: USER1 }
      );

      await truffleAssert.reverts(
        tokenFactory.deployTokenContract(
          [
            defaultTokenContractId,
            defaultTokenName,
            defaultTokenSymbol,
            defaultPricePerOneToken,
            defaultVoucherContract.address,
            defaultVoucherTokensAmount,
          ],
          sig.r,
          sig.s,
          sig.v,
          { from: USER1 }
        ),
        reason
      );
    });

    it("should get exception if signature is invalid", async () => {
      const reason = "TokenFactory: Invalid signature.";

      const sig = signCreateTest({ privateKey: USER1_PK });

      await truffleAssert.reverts(
        tokenFactory.deployTokenContract(
          [
            defaultTokenContractId,
            defaultTokenName,
            defaultTokenSymbol,
            defaultPricePerOneToken,
            defaultVoucherContract.address,
            defaultVoucherTokensAmount,
          ],
          sig.r,
          sig.s,
          sig.v,
          { from: USER1 }
        ),
        reason
      );
    });
  });

  describe("getBaseTokenContractsInfo", () => {
    it("should return correct base token contracts info", async () => {
      await deployNewTokenContract({});

      let tokenContractId = "1";
      let pricePerOneToken = wei(20, priceDecimals).toFixed();

      await deployNewTokenContract({ tokenContractId_: tokenContractId, pricePerOneToken_: pricePerOneToken });

      tokenContractId = "2";
      pricePerOneToken = wei(30, priceDecimals).toFixed();

      await deployNewTokenContract({ tokenContractId_: tokenContractId, pricePerOneToken_: pricePerOneToken });

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
      await deployNewTokenContract({});

      let tokenContractId = "1";

      await deployNewTokenContract({ tokenContractId_: tokenContractId });

      tokenContractId = "2";

      await deployNewTokenContract({ tokenContractId_: tokenContractId });

      const tokenContractsArr = await tokenFactory.getTokenContractsPart(0, 10);

      let sig = signMintTest({ tokenContract: tokenContractsArr[0] });

      await (
        await TokenContract.at(tokenContractsArr[0])
      ).mintToken(ZERO_ADDR, 0, defaultDiscountValue, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      sig = signMintTest({ tokenContract: tokenContractsArr[0], tokenURI: defaultTokenURI + 1 });

      await (
        await TokenContract.at(tokenContractsArr[0])
      ).mintToken(ZERO_ADDR, 0, defaultDiscountValue, defaultEndTime, defaultTokenURI + 1, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      sig = signMintTest({ tokenContract: tokenContractsArr[2], tokenURI: defaultTokenURI + 2 });

      await (
        await TokenContract.at(tokenContractsArr[2])
      ).mintToken(ZERO_ADDR, 0, defaultDiscountValue, defaultEndTime, defaultTokenURI + 2, sig.r, sig.s, sig.v, {
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
      const addressesArr = [];

      for (let i = 0; i < 5; i++) {
        await deployNewTokenContract({ tokenContractId_: i });

        addressesArr.push(await tokenFactory.tokenContractByIndex(i));
      }

      assert.equal((await tokenFactory.getTokenContractsCount()).toString(), 5);

      assert.deepEqual(await tokenFactory.getTokenContractsPart(0, 10), addressesArr);
      assert.deepEqual(await tokenFactory.getTokenContractsPart(0, 3), addressesArr.slice(0, 3));
      assert.deepEqual(await tokenFactory.getTokenContractsPart(3, 10), addressesArr.slice(3));
    });
  });
});
