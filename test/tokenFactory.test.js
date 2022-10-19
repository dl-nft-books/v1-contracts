const { wei, accounts, toBN } = require("../scripts/helpers/utils");

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

  const priceDecimals = toBN(18);

  let OWNER;
  let USER1;

  let tokenFactory;
  let tokenFactoryImpl;

  before("setup", async () => {
    OWNER = await accounts(0);
    USER1 = await accounts(1);

    tokenFactoryImpl = await TokenFactory.new();
    const _tokenFactoryProxy = await PublicERC1967Proxy.new(tokenFactoryImpl.address, "0x");

    tokenFactory = await TokenFactory.at(_tokenFactoryProxy.address);

    await tokenFactory.__TokenFactory_init(18);

    assert.equal((await tokenFactory.priceDecimals()).toString(), priceDecimals.toString());

    const _tokenContractImpl = await TokenContract.new();

    await tokenFactory.setNewImplementation(_tokenContractImpl.address);

    assert.equal(await tokenFactory.getTokenContractsImpl(), _tokenContractImpl.address);

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("creation", () => {
    it("should get exception if try to call init function several times", async () => {
      const reason = "Initializable: contract is already initialized";

      await truffleAssert.reverts(tokenFactory.__TokenFactory_init(8), reason);
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

  describe("deployTokenContract", async () => {
    it("should correctly deploy new TokenContract", async () => {
      const tokenName = "some name";
      const tokenSymbol = "some symbol";
      const pricePerOneToken = wei(10, priceDecimals);

      const tx = await tokenFactory.deployTokenContract(tokenName, tokenSymbol, pricePerOneToken);

      assert.equal(tx.receipt.logs[1].event, "TokenContractDeployed");
      assert.equal(tx.receipt.logs[1].args.newTokenContractAddr, await tokenFactory.getTokenContractByIndex(0));
      assert.equal(toBN(tx.receipt.logs[1].args.pricePerOneToken).toString(), pricePerOneToken.toString());
      assert.equal(tx.receipt.logs[1].args.tokenName, tokenName);
      assert.equal(tx.receipt.logs[1].args.tokenSymbol, tokenSymbol);
    });

    it("should get exception if pass invalid token name", async () => {
      const reason = "TokenFactory: Invalid token name.";

      await truffleAssert.reverts(tokenFactory.deployTokenContract("", "some symbol", 0), reason);
    });

    it("should get exception if pass invalid token symbol", async () => {
      const reason = "TokenFactory: Invalid token symbol.";

      await truffleAssert.reverts(tokenFactory.deployTokenContract("some name", "", 0), reason);
    });

    it("should get exception if nonowner try to call this function", async () => {
      const reason = "Ownable: caller is not the owner";

      await truffleAssert.reverts(
        tokenFactory.deployTokenContract("some name", "some symbol", 0, { from: USER1 }),
        reason
      );
    });
  });

  describe("getTokenContractsPart", () => {
    it("should return correct token contracts arr", async () => {
      const tokenName = "some name";
      const tokenSymbol = "some symbol";
      const pricePerOneToken = wei(10, priceDecimals);
      const addressesArr = [];

      for (let i = 0; i < 5; i++) {
        await tokenFactory.deployTokenContract(tokenName + i, tokenSymbol + i, pricePerOneToken);
        addressesArr.push(await tokenFactory.getTokenContractByIndex(i));
      }

      assert.equal((await tokenFactory.getTokenContractsCount()).toString(), 5);

      assert.deepEqual(await tokenFactory.getTokenContractsPart(0, 10), addressesArr);
      assert.deepEqual(await tokenFactory.getTokenContractsPart(0, 3), addressesArr.slice(0, 3));
      assert.deepEqual(await tokenFactory.getTokenContractsPart(3, 10), addressesArr.slice(3));
    });
  });
});
