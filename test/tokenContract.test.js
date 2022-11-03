const { wei, accounts, toBN } = require("../scripts/utils//utils");
const { ZERO_ADDR } = require("../scripts/utils//constants");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");
const { sign2612 } = require("./helpers/signatures");

const truffleAssert = require("truffle-assertions");
const Reverter = require("./helpers/reverter");
const { assert } = require("chai");
const { web3 } = require("hardhat");

const TokenFactory = artifacts.require("TokenFactoryMock");
const TokenContract = artifacts.require("TokenContract");
const Attacker = artifacts.require("Attacker");
const ERC20Mock = artifacts.require("ERC20Mock");
const PublicERC1967Proxy = artifacts.require("PublicERC1967Proxy");

TokenFactory.numberFormat = "BigNumber";
TokenContract.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe("TokenContract", () => {
  const reverter = new Reverter();

  const OWNER_PK = "3473fa67faf1b0433c89babc1d7216f43c3019ae3f32fc848004d76d11e887b2";
  const USER1_PK = "0e48c6349e2619d39b0f2c19b63e650718903a3146c7fb71f4c7761147b2a10b";

  const mintTokensAmount = wei(10000);
  const priceDecimals = toBN(18);
  const pricePerOneToken = wei(100);
  const tokenPrice = wei(500);
  const signDuration = 10000;
  const defaultTokenURI = "some uri";
  const baseTokenContractsURI = "base uri/";
  let defaultEndTime;

  let OWNER;
  let USER1;
  let USER2;
  let USER3;

  let tokenFactory;
  let tokenContractImpl;
  let tokenContract;
  let paymentToken;

  function signMint({
    privateKey = OWNER_PK,
    paymentTokenAddress = paymentToken.address,
    paymentTokenPrice = tokenPrice.toFixed(),
    endTimestamp = defaultEndTime.toFixed(),
    tokenURI = defaultTokenURI,
    name = "Test token contract",
  }) {
    const buffer = Buffer.from(privateKey, "hex");

    const domain = {
      name,
      verifyingContract: tokenContract.address,
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
    USER2 = await accounts(2);
    USER3 = await accounts(3);

    paymentToken = await ERC20Mock.new("TestERC20", "TERC20", 18);

    const _tokenFactoryImpl = await TokenFactory.new();
    const _tokenFactoryProxy = await PublicERC1967Proxy.new(_tokenFactoryImpl.address, "0x");

    tokenFactory = await TokenFactory.at(_tokenFactoryProxy.address);

    await tokenFactory.__TokenFactory_init([OWNER], baseTokenContractsURI, priceDecimals);

    assert.equal((await tokenFactory.priceDecimals()).toString(), priceDecimals.toString());

    tokenContractImpl = await TokenContract.new();

    await tokenFactory.setNewImplementation(tokenContractImpl.address);

    assert.equal(await tokenFactory.getTokenContractsImpl(), tokenContractImpl.address);

    await tokenFactory.deployTokenContract("Test token contract", "TTC", pricePerOneToken);

    tokenContract = await TokenContract.at(await tokenFactory.getTokenContractByIndex(0));

    defaultEndTime = toBN(await getCurrentBlockTime()).plus(signDuration);

    await paymentToken.mintBatch([OWNER, USER1, USER2], mintTokensAmount);
    await paymentToken.approveBatch([OWNER, USER1, USER2], tokenContract.address, mintTokensAmount);

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("creation", () => {
    it("should set coorect data after deployment", async () => {
      assert.equal(await tokenContract.name(), "Test token contract");
      assert.equal(await tokenContract.symbol(), "TTC");
      assert.equal(await tokenContract.tokenFactory(), tokenFactory.address);
      assert.equal((await tokenContract.pricePerOneToken()).toFixed(), pricePerOneToken.toFixed());
    });

    it("should get exception if contract already initialized", async () => {
      const reason = "Initializable: contract is already initialized";

      await truffleAssert.reverts(tokenContract.__TokenContract_init("", "", tokenContract.address, 10), reason);
    });
  });

  describe("updateTokenContractParams", () => {
    const newPrice = wei(75);
    const newName = "new name";
    const newSymbol = "NS";

    it("should correctly update price per one token", async () => {
      const tx = await tokenContract.updateTokenContractParams(newPrice, newName, newSymbol);

      assert.equal((await tokenContract.pricePerOneToken()).toFixed(), newPrice.toFixed());
      assert.equal(await tokenContract.name(), newName);
      assert.equal(await tokenContract.symbol(), newSymbol);

      await tokenContract.updateTokenContractParams(newPrice, newName, newSymbol);

      assert.equal((await tokenContract.pricePerOneToken()).toFixed(), newPrice.toFixed());
      assert.equal(await tokenContract.name(), newName);
      assert.equal(await tokenContract.symbol(), newSymbol);

      assert.equal(tx.receipt.logs[0].event, "TokenContractParamsUpdated");
      assert.equal(toBN(tx.receipt.logs[0].args.newPrice).toFixed(), newPrice.toFixed());
      assert.equal(tx.receipt.logs[0].args.tokenName, newName);
      assert.equal(tx.receipt.logs[0].args.tokenSymbol, newSymbol);
    });

    it("should correctly sign data with new contract name", async () => {
      await tokenContract.updateTokenContractParams(newPrice, newName, newSymbol);

      const paymentTokenPrice = wei(10000);
      const sig = signMint({ paymentTokenPrice: paymentTokenPrice.toFixed(), name: newName });

      const expectedPaymentAmount = newPrice.times(wei(1)).idiv(paymentTokenPrice);

      await tokenContract.mintToken(
        paymentToken.address,
        paymentTokenPrice,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      assert.equal((await paymentToken.balanceOf(tokenContract.address)).toFixed(), expectedPaymentAmount.toFixed());
    });

    it("should get exception if sign with old name", async () => {
      await tokenContract.updateTokenContractParams(newPrice, newName, newSymbol);

      const paymentTokenPrice = wei(10000);
      const sig = signMint({ paymentTokenPrice: paymentTokenPrice.toFixed() });

      const reason = "TokenContract: Invalid signature.";

      await truffleAssert.reverts(
        tokenContract.mintToken(
          paymentToken.address,
          paymentTokenPrice,
          defaultEndTime,
          defaultTokenURI,
          sig.r,
          sig.s,
          sig.v,
          {
            from: USER1,
          }
        ),
        reason
      );
    });

    it("should get exception if non admin try to call this function", async () => {
      const reason = "TokenContract: Only admin can call this function.";

      await truffleAssert.reverts(tokenContract.updateTokenContractParams(newPrice, "", "", { from: USER1 }), reason);
    });
  });

  describe("pause/unpause", () => {
    it("should pause and unpause token minting", async () => {
      const reason = "Pausable: paused";

      await tokenContract.pause();

      const sig = signMint({ paymentTokenPrice: "0" });

      await truffleAssert.reverts(
        tokenContract.mintToken(paymentToken.address, 0, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
          from: USER1,
        }),
        reason
      );

      await tokenContract.unpause();

      await tokenContract.mintToken(paymentToken.address, 0, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      assert.equal(await tokenContract.tokenURI(0), baseTokenContractsURI + defaultTokenURI);
      assert.equal(await tokenContract.ownerOf(0), USER1);
    });

    it("should get exception if non admin try to call this function", async () => {
      const reason = "TokenContract: Only admin can call this function.";

      await truffleAssert.reverts(tokenContract.pause({ from: USER1 }), reason);
      await truffleAssert.reverts(tokenContract.unpause({ from: USER1 }), reason);
    });
  });

  describe("withdrawPaidTokens", () => {
    it("should correctly withdraw native currency", async () => {
      const currencyPrice = wei(10000);
      const sig = signMint({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: currencyPrice.toFixed() });

      const expectedCurrencyAmount = pricePerOneToken.times(wei(1)).idiv(currencyPrice);

      await tokenContract.mintToken(ZERO_ADDR, currencyPrice, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
        value: expectedCurrencyAmount,
      });

      assert.equal(toBN(await web3.eth.getBalance(tokenContract.address)).toFixed(), expectedCurrencyAmount.toFixed());

      const currencyBalanceBefore = toBN(await web3.eth.getBalance(USER1));

      const tx = await tokenContract.withdrawPaidTokens(ZERO_ADDR, USER1);

      const currencyBalanceAfter = toBN(await web3.eth.getBalance(USER1));

      assert.equal(currencyBalanceAfter.minus(currencyBalanceBefore).toFixed(), expectedCurrencyAmount.toFixed());

      assert.equal(tx.receipt.logs[0].event, "PaidTokensWithdrawn");
      assert.equal(tx.receipt.logs[0].args.tokenAddr, ZERO_ADDR);
      assert.equal(tx.receipt.logs[0].args.recipient, USER1);
      assert.equal(toBN(tx.receipt.logs[0].args.amount).toFixed(), expectedCurrencyAmount.toFixed());
    });

    it("should correctly withdraw ERC20 token", async () => {
      const newDecimals = 8;

      await paymentToken.setDecimals(newDecimals);

      const paymentTokenPrice = wei(10000);
      const sig = signMint({ paymentTokenPrice: paymentTokenPrice.toFixed() });

      const expectedPaymentAmount = pricePerOneToken.times(wei(1)).idiv(paymentTokenPrice);
      const expectedTokensAmount = expectedPaymentAmount.idiv(wei(1, 10));

      await tokenContract.mintToken(
        paymentToken.address,
        paymentTokenPrice,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      assert.equal((await paymentToken.balanceOf(tokenContract.address)).toFixed(), expectedTokensAmount.toFixed());

      const tx = await tokenContract.withdrawPaidTokens(paymentToken.address, OWNER);

      assert.equal(
        toBN(await paymentToken.balanceOf(OWNER)).toFixed(),
        mintTokensAmount.plus(expectedTokensAmount).toFixed()
      );

      assert.equal(tx.receipt.logs[0].event, "PaidTokensWithdrawn");
      assert.equal(tx.receipt.logs[0].args.tokenAddr, paymentToken.address);
      assert.equal(tx.receipt.logs[0].args.recipient, OWNER);
      assert.equal(toBN(tx.receipt.logs[0].args.amount).toFixed(), expectedPaymentAmount.toFixed());
    });

    it("should get exception if nothing to withdraw", async () => {
      const reason = "TokenContract: Nothing to withdraw.";

      await truffleAssert.reverts(tokenContract.withdrawPaidTokens(ZERO_ADDR, USER1), reason);

      await truffleAssert.reverts(tokenContract.withdrawPaidTokens(paymentToken.address, USER1), reason);
    });

    it("should get exception if failed to transfer native currency to the recipient", async () => {
      const reason = "TokenContract: Failed to transfer native currecy.";

      const currencyPrice = wei(10000);
      const sig = signMint({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: currencyPrice.toFixed() });

      const expectedCurrencyAmount = pricePerOneToken.times(wei(1)).idiv(currencyPrice);

      await tokenContract.mintToken(ZERO_ADDR, currencyPrice, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
        value: expectedCurrencyAmount,
      });

      await truffleAssert.reverts(tokenContract.withdrawPaidTokens(ZERO_ADDR, tokenContract.address), reason);
    });

    it("should get exception if nonowner try to call this function", async () => {
      const reason = "TokenContract: Only owner can call this function.";

      await truffleAssert.reverts(tokenContract.withdrawPaidTokens(ZERO_ADDR, USER1, { from: USER1 }), reason);
    });
  });

  describe("mintToken", () => {
    it("should correctly mint new tokens", async () => {
      let sig = signMint({ paymentTokenPrice: "0" });

      const tx = await tokenContract.mintToken(
        paymentToken.address,
        0,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      assert.equal(tx.receipt.logs[1].event, "TokenMinted");
      assert.equal(tx.receipt.logs[1].args.recipient, USER1);
      assert.equal(toBN(tx.receipt.logs[1].args.tokenId).toFixed(), 0);

      assert.equal(await tokenContract.tokenURI(0), baseTokenContractsURI + defaultTokenURI);
      assert.equal(await tokenContract.ownerOf(0), USER1);

      const newTokenURI = "new token URI";
      sig = signMint({ paymentTokenPrice: "0", tokenURI: newTokenURI });

      await tokenContract.mintToken(paymentToken.address, 0, defaultEndTime, newTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      assert.equal(await tokenContract.tokenURI(1), baseTokenContractsURI + newTokenURI);
      assert.equal(await tokenContract.ownerOf(1), USER1);
      assert.equal(await tokenContract.balanceOf(USER1), 2);
    });

    it("should correctly pay with ETH for new token with extra currency", async () => {
      const balanceBefore = toBN(await web3.eth.getBalance(USER1));

      const sig = signMint({ paymentTokenAddress: ZERO_ADDR });
      const expectedCurrencyCount = pricePerOneToken.times(wei(1)).idiv(tokenPrice);

      const tx = await tokenContract.mintToken(
        ZERO_ADDR,
        tokenPrice,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
          value: expectedCurrencyCount.times(1.5),
        }
      );

      const balanceAfter = toBN(await web3.eth.getBalance(USER1));

      assert.closeTo(
        balanceBefore.minus(balanceAfter).toNumber(),
        expectedCurrencyCount.toNumber(),
        wei(0.001).toNumber()
      );

      assert.equal(tx.receipt.logs[0].event, "PaymentSuccessful");
      assert.equal(tx.receipt.logs[0].args.tokenAddress, ZERO_ADDR);
      assert.equal(toBN(tx.receipt.logs[0].args.tokenAmount).toFixed(), expectedCurrencyCount.toFixed());
      assert.equal(toBN(tx.receipt.logs[0].args.tokenPrice).toFixed(), tokenPrice.toFixed());
    });

    it("should correctly pay with ETH without extra currency", async () => {
      const balanceBefore = toBN(await web3.eth.getBalance(USER1));

      const sig = signMint({ paymentTokenAddress: ZERO_ADDR });
      const expectedCurrencyCount = pricePerOneToken.times(wei(1)).idiv(tokenPrice);

      await tokenContract.mintToken(ZERO_ADDR, tokenPrice, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
        value: expectedCurrencyCount,
      });

      const balanceAfter = toBN(await web3.eth.getBalance(USER1));

      assert.closeTo(
        balanceBefore.minus(balanceAfter).toNumber(),
        expectedCurrencyCount.toNumber(),
        wei(0.001).toNumber()
      );

      assert.equal(await tokenContract.tokenURI(0), baseTokenContractsURI + defaultTokenURI);
      assert.equal(await tokenContract.ownerOf(0), USER1);
    });

    it("should correctly pay with ERC20 for new token", async () => {
      const sig = signMint({});
      const expectedTokensCount = pricePerOneToken.times(wei(1)).idiv(tokenPrice);

      const tx = await tokenContract.mintToken(
        paymentToken.address,
        tokenPrice,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      assert.equal(
        (await paymentToken.balanceOf(USER1)).toFixed(),
        mintTokensAmount.minus(expectedTokensCount).toFixed()
      );
      assert.equal(await tokenContract.ownerOf(0), USER1);

      assert.equal(tx.receipt.logs[0].event, "PaymentSuccessful");
      assert.equal(tx.receipt.logs[0].args.tokenAddress, paymentToken.address);
      assert.equal(toBN(tx.receipt.logs[0].args.tokenAmount).toFixed(), expectedTokensCount.toFixed());
      assert.equal(toBN(tx.receipt.logs[0].args.tokenPrice).toFixed(), tokenPrice.toFixed());
    });

    it("should get exception if transfer currency failed", async () => {
      const reason = "TokenContract: Failed to return currency.";

      const sig = signMint({ paymentTokenAddress: ZERO_ADDR });
      const expectedCurrencyCount = pricePerOneToken.times(wei(1)).idiv(tokenPrice);

      const attacker = await Attacker.new(tokenContract.address, [
        expectedCurrencyCount,
        ZERO_ADDR,
        tokenPrice,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
      ]);

      await truffleAssert.reverts(attacker.mintToken({ from: USER1, value: expectedCurrencyCount.times(2) }), reason);
    });

    it("should get exception if try to send currency when user needs to pay with ERC20", async () => {
      const sig = signMint({});
      const expectedTokensCount = pricePerOneToken.times(wei(1)).idiv(tokenPrice);

      const reason = "TokenContract: Currency amount must be a zero.";

      await truffleAssert.reverts(
        tokenContract.mintToken(
          paymentToken.address,
          tokenPrice,
          defaultEndTime,
          defaultTokenURI,
          sig.r,
          sig.s,
          sig.v,
          {
            from: USER1,
            value: expectedTokensCount,
          }
        ),
        reason
      );
    });

    it("should get exception if send currency less than needed", async () => {
      const reason = "TokenContract: Invalid currency amount.";

      const sig = signMint({ paymentTokenAddress: ZERO_ADDR });
      const expectedCurrencyCount = pricePerOneToken.times(wei(1)).idiv(tokenPrice);

      await truffleAssert.reverts(
        tokenContract.mintToken(ZERO_ADDR, tokenPrice, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
          from: USER1,
          value: expectedCurrencyCount.idiv(2),
        }),
        reason
      );
    });

    it("should get exception if try to mint new token with the same token URI", async () => {
      const reason = "TokenContract: Token URI already exists.";

      const sig = signMint({});

      await tokenContract.mintToken(
        paymentToken.address,
        tokenPrice,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        { from: USER1 }
      );

      await truffleAssert.reverts(
        tokenContract.mintToken(
          paymentToken.address,
          tokenPrice,
          defaultEndTime,
          defaultTokenURI,
          sig.r,
          sig.s,
          sig.v,
          { from: USER1 }
        ),
        reason
      );
    });

    it("should get exception if signature is invalid", async () => {
      const reason = "TokenContract: Invalid signature.";

      const sig = signMint({ privateKey: USER1_PK });

      await truffleAssert.reverts(
        tokenContract.mintToken(
          paymentToken.address,
          tokenPrice,
          defaultEndTime,
          defaultTokenURI,
          sig.r,
          sig.s,
          sig.v,
          { from: USER1 }
        ),
        reason
      );
    });

    it("should get exception if signature expired", async () => {
      const reason = "TokenContract: Signature expired.";

      const sig = signMint({});

      await setTime(defaultEndTime.plus(100).toNumber());

      await truffleAssert.reverts(
        tokenContract.mintToken(
          paymentToken.address,
          tokenPrice,
          defaultEndTime,
          defaultTokenURI,
          sig.r,
          sig.s,
          sig.v,
          { from: USER1 }
        ),
        reason
      );
    });
  });

  describe("getUserTokenIDs", () => {
    it("should return correct user token IDs arr", async () => {
      let sig = signMint({ paymentTokenPrice: "0" });

      await tokenContract.mintToken(paymentToken.address, 0, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      sig = signMint({ paymentTokenPrice: "0", tokenURI: defaultTokenURI + 1 });

      await tokenContract.mintToken(paymentToken.address, 0, defaultEndTime, defaultTokenURI + 1, sig.r, sig.s, sig.v, {
        from: USER2,
      });

      sig = signMint({ paymentTokenPrice: "0", tokenURI: defaultTokenURI + 2 });

      await tokenContract.mintToken(paymentToken.address, 0, defaultEndTime, defaultTokenURI + 2, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      let tokenIDs = await tokenContract.getUserTokenIDs(USER1);
      assert.deepEqual([tokenIDs[0].toString(), tokenIDs[1].toString()], ["0", "2"]);

      tokenIDs = await tokenContract.getUserTokenIDs(USER2);
      assert.deepEqual([tokenIDs[0].toString()], ["1"]);
    });
  });

  describe("owner", () => {
    it("should return correct owner address", async () => {
      assert.equal(await tokenContract.owner(), OWNER);
    });
  });

  describe("tokenURI", () => {
    it("should return correct token URI string", async () => {
      const sig = signMint({ paymentTokenPrice: "0" });

      await tokenContract.mintToken(paymentToken.address, 0, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      assert.equal(await tokenContract.tokenURI(0), baseTokenContractsURI + defaultTokenURI);
    });

    it("should return zero string if base token contracts URI is zero string", async () => {
      const sig = signMint({ paymentTokenPrice: "0" });

      await tokenContract.mintToken(paymentToken.address, 0, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v, {
        from: USER1,
      });

      await tokenFactory.setBaseTokenContractsURI("");

      assert.equal(await tokenContract.tokenURI(0), "");
    });

    it("should get exception if token does not exist", async () => {
      const reason = "TokenContract: URI query for nonexistent token.";

      await truffleAssert.reverts(tokenContract.tokenURI(1), reason);
    });
  });
});
