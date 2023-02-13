const { wei, accounts, toBN } = require("../scripts/utils//utils");
const { ZERO_ADDR, PRECISION, PERCENTAGE_100 } = require("../scripts/utils//constants");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");
const { signMint, signCreate } = require("./helpers/signatures");

const truffleAssert = require("truffle-assertions");
const Reverter = require("./helpers/reverter");
const { assert } = require("chai");
const { web3 } = require("hardhat");

const TokenFactory = artifacts.require("TokenFactory");
const TokenContract = artifacts.require("TokenContract");
const Attacker = artifacts.require("Attacker");
const MaliciousERC721 = artifacts.require("MaliciousERC721");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC721Mock = artifacts.require("ERC721Mock");
const PublicERC1967Proxy = artifacts.require("PublicERC1967Proxy");

TokenFactory.numberFormat = "BigNumber";
TokenContract.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC721Mock.numberFormat = "BigNumber";

describe("TokenContract", () => {
  const reverter = new Reverter();

  const OWNER_PK = "3473fa67faf1b0433c89babc1d7216f43c3019ae3f32fc848004d76d11e887b2";
  const USER1_PK = "0e48c6349e2619d39b0f2c19b63e650718903a3146c7fb71f4c7761147b2a10b";

  const mintTokensAmount = wei(10000);
  const priceDecimals = toBN(18);
  const tokenPrice = wei(500);
  const signDuration = 10000;
  const defaultTokenURI = "some uri";
  const baseTokenContractsURI = "base uri/";
  let defaultEndTime;

  const defaultDiscountValue = 0;
  const defaultTokenContractId = "0";
  const defaultTokenName = "tokenName";
  const defaultTokenSymbol = "tokenSymbol";
  const defaultPricePerOneToken = wei(100, priceDecimals);
  const defaultMinNFTFloorPrice = wei(80, priceDecimals);
  const defaultVoucherTokensAmount = wei(1);
  let defaultVoucherContract;

  let OWNER;
  let USER1;
  let USER2;
  let USER3;

  let tokenFactory;
  let tokenContractImpl;
  let tokenContract;
  let paymentToken;
  let nft;

  function signMintTest({
    privateKey = OWNER_PK,
    paymentTokenAddress = paymentToken.address,
    paymentTokenPrice = tokenPrice.toFixed(),
    discount = defaultDiscountValue.toFixed(),
    endTimestamp = defaultEndTime.toFixed(),
    tokenURI = defaultTokenURI,
    name = defaultTokenName,
  }) {
    const buffer = Buffer.from(privateKey, "hex");

    const domain = {
      name,
      verifyingContract: tokenContract.address,
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
    minNFTFloorPrice = defaultMinNFTFloorPrice.toFixed(),
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
      minNFTFloorPrice,
    };

    return signCreate(domain, create, buffer);
  }

  before("setup", async () => {
    OWNER = await accounts(0);
    USER1 = await accounts(1);
    USER2 = await accounts(2);
    USER3 = await accounts(3);

    paymentToken = await ERC20Mock.new("TestERC20", "TERC20", 18);
    defaultVoucherContract = await ERC20Mock.new("Test Voucher Token", "TVT", 18);
    nft = await ERC721Mock.new("Test NFT", "TNFT");

    const _tokenFactoryImpl = await TokenFactory.new();
    const _tokenFactoryProxy = await PublicERC1967Proxy.new(_tokenFactoryImpl.address, "0x");

    tokenFactory = await TokenFactory.at(_tokenFactoryProxy.address);

    await tokenFactory.__TokenFactory_init([OWNER], baseTokenContractsURI, priceDecimals);

    assert.equal((await tokenFactory.priceDecimals()).toString(), priceDecimals.toString());

    tokenContractImpl = await TokenContract.new();

    await tokenFactory.setNewImplementation(tokenContractImpl.address);

    assert.equal(await tokenFactory.getTokenContractsImpl(), tokenContractImpl.address);

    const sig = signCreateTest({});

    await tokenFactory.deployTokenContract(
      [
        defaultTokenContractId,
        defaultTokenName,
        defaultTokenSymbol,
        defaultPricePerOneToken,
        defaultVoucherContract.address,
        defaultVoucherTokensAmount,
        defaultMinNFTFloorPrice,
      ],
      sig.r,
      sig.s,
      sig.v,
      { from: USER1 }
    );

    tokenContract = await TokenContract.at(await tokenFactory.tokenContractByIndex(defaultTokenContractId));

    defaultEndTime = toBN(await getCurrentBlockTime()).plus(signDuration);

    await paymentToken.mintBatch([OWNER, USER1, USER2], mintTokensAmount);
    await paymentToken.approveBatch([OWNER, USER1, USER2], tokenContract.address, mintTokensAmount);

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("creation", () => {
    it("should set coorect data after deployment", async () => {
      assert.equal(await tokenContract.name(), defaultTokenName);
      assert.equal(await tokenContract.symbol(), defaultTokenSymbol);
      assert.equal(await tokenContract.tokenFactory(), tokenFactory.address);
      assert.equal((await tokenContract.pricePerOneToken()).toFixed(), defaultPricePerOneToken.toFixed());
    });

    it("should get exception if contract already initialized", async () => {
      const reason = "Initializable: contract is already initialized";

      await truffleAssert.reverts(
        tokenContract.__TokenContract_init(["", "", tokenContract.address, 10, ZERO_ADDR, 0, 0]),
        reason
      );
    });
  });

  describe("updateTokenContractParams", () => {
    const newPrice = wei(75);
    const newMinNFTFloorPrice = wei(60, priceDecimals);
    const newName = "new name";
    const newSymbol = "NS";

    it("should correctly update price per one token", async () => {
      const tx = await tokenContract.updateTokenContractParams(newPrice, newMinNFTFloorPrice, newName, newSymbol);

      assert.equal((await tokenContract.pricePerOneToken()).toFixed(), newPrice.toFixed());
      assert.equal((await tokenContract.minNFTFloorPrice()).toFixed(), newMinNFTFloorPrice.toFixed());
      assert.equal(await tokenContract.name(), newName);
      assert.equal(await tokenContract.symbol(), newSymbol);

      await tokenContract.updateTokenContractParams(newPrice, newMinNFTFloorPrice, newName, newSymbol);

      assert.equal((await tokenContract.pricePerOneToken()).toFixed(), newPrice.toFixed());
      assert.equal((await tokenContract.minNFTFloorPrice()).toFixed(), newMinNFTFloorPrice.toFixed());
      assert.equal(await tokenContract.name(), newName);
      assert.equal(await tokenContract.symbol(), newSymbol);

      assert.equal(tx.receipt.logs[0].event, "TokenContractParamsUpdated");
      assert.equal(toBN(tx.receipt.logs[0].args.newPrice).toFixed(), newPrice.toFixed());
      assert.equal(toBN(tx.receipt.logs[0].args.newMinNFTFloorPrice).toFixed(), newMinNFTFloorPrice.toFixed());
      assert.equal(tx.receipt.logs[0].args.tokenName, newName);
      assert.equal(tx.receipt.logs[0].args.tokenSymbol, newSymbol);
    });

    it("should correctly sign data with new contract name", async () => {
      await tokenContract.updateTokenContractParams(newPrice, newMinNFTFloorPrice, newName, newSymbol);

      const paymentTokenPrice = wei(10000);
      const sig = signMintTest({ paymentTokenPrice: paymentTokenPrice.toFixed(), name: newName });

      const expectedPaymentAmount = newPrice.times(wei(1)).idiv(paymentTokenPrice);

      await tokenContract.mintToken(
        paymentToken.address,
        paymentTokenPrice,
        defaultDiscountValue,
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
      await tokenContract.updateTokenContractParams(newPrice, newMinNFTFloorPrice, newName, newSymbol);

      const paymentTokenPrice = wei(10000);
      const sig = signMintTest({ paymentTokenPrice: paymentTokenPrice.toFixed() });

      const reason = "TokenContract: Invalid signature.";

      await truffleAssert.reverts(
        tokenContract.mintToken(
          paymentToken.address,
          paymentTokenPrice,
          defaultDiscountValue,
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

      await truffleAssert.reverts(
        tokenContract.updateTokenContractParams(newPrice, newMinNFTFloorPrice, "", "", { from: USER1 }),
        reason
      );
    });
  });

  describe("updateVoucherParams", () => {
    const newVoucherTokensAmount = wei(5);
    let newVoucherContract;

    beforeEach("setup", async () => {
      newVoucherContract = await ERC20Mock.new("New Voucher Token", "NVT", 18);
    });

    it("should correctly update voucher params", async () => {
      const tx = await tokenContract.updateVoucherParams(newVoucherContract.address, newVoucherTokensAmount);

      assert.equal(await tokenContract.voucherTokenContract(), newVoucherContract.address);
      assert.equal((await tokenContract.voucherTokensAmount()).toFixed(), newVoucherTokensAmount.toFixed());

      assert.equal(tx.receipt.logs[0].event, "VoucherParamsUpdated");
      assert.equal(tx.receipt.logs[0].args.newVoucherTokenContract, newVoucherContract.address);
      assert.equal(toBN(tx.receipt.logs[0].args.newVoucherTokensAmount).toFixed(), newVoucherTokensAmount.toFixed());
    });

    it("should get exception if non admin try to call this function", async () => {
      const reason = "TokenContract: Only admin can call this function.";

      await truffleAssert.reverts(
        tokenContract.updateVoucherParams(newVoucherContract.address, newVoucherTokensAmount, { from: USER1 }),
        reason
      );
    });
  });

  describe("updateAllParams", () => {
    const newPrice = wei(75);
    const newMinNFTFloorPrice = wei(60, priceDecimals);
    const newName = "new name";
    const newSymbol = "NS";
    const newVoucherTokensAmount = wei(5);
    let newVoucherContract;

    beforeEach("setup", async () => {
      newVoucherContract = await ERC20Mock.new("New Voucher Token", "NVT", 18);
    });

    it("should correctly update all params", async () => {
      const tx = await tokenContract.updateAllParams(
        newPrice,
        newMinNFTFloorPrice,
        newVoucherContract.address,
        newVoucherTokensAmount,
        newName,
        newSymbol
      );

      assert.equal((await tokenContract.pricePerOneToken()).toFixed(), newPrice.toFixed());
      assert.equal((await tokenContract.minNFTFloorPrice()).toFixed(), newMinNFTFloorPrice.toFixed());
      assert.equal(await tokenContract.name(), newName);
      assert.equal(await tokenContract.symbol(), newSymbol);
      assert.equal(await tokenContract.voucherTokenContract(), newVoucherContract.address);
      assert.equal((await tokenContract.voucherTokensAmount()).toFixed(), newVoucherTokensAmount.toFixed());

      assert.equal(tx.receipt.logs[0].event, "TokenContractParamsUpdated");
      assert.equal(toBN(tx.receipt.logs[0].args.newPrice).toFixed(), newPrice.toFixed());
      assert.equal(toBN(tx.receipt.logs[0].args.newMinNFTFloorPrice).toFixed(), newMinNFTFloorPrice.toFixed());
      assert.equal(tx.receipt.logs[0].args.tokenName, newName);
      assert.equal(tx.receipt.logs[0].args.tokenSymbol, newSymbol);

      assert.equal(tx.receipt.logs[1].event, "VoucherParamsUpdated");
      assert.equal(tx.receipt.logs[1].args.newVoucherTokenContract, newVoucherContract.address);
      assert.equal(toBN(tx.receipt.logs[1].args.newVoucherTokensAmount).toFixed(), newVoucherTokensAmount.toFixed());
    });

    it("should get exception if non admin try to call this function", async () => {
      const reason = "TokenContract: Only admin can call this function.";

      await truffleAssert.reverts(
        tokenContract.updateAllParams(
          newPrice,
          newMinNFTFloorPrice,
          newVoucherContract.address,
          newVoucherTokensAmount,
          newName,
          newSymbol,
          { from: USER1 }
        ),
        reason
      );
    });
  });

  describe("pause/unpause", () => {
    const tokenId = 13;
    const nftFloorPrice = wei(90, priceDecimals);

    it("should pause and unpause token minting", async () => {
      const reason = "Pausable: paused";

      await tokenContract.pause();

      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: "0" });

      await truffleAssert.reverts(
        tokenContract.mintToken(
          ZERO_ADDR,
          0,
          defaultDiscountValue,
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

      await nft.mint(USER1, tokenId);
      await nft.approve(tokenContract.address, tokenId, { from: USER1 });

      const newTokenURI = "new token URI";
      const sigNft = signMintTest({
        paymentTokenAddress: nft.address,
        paymentTokenPrice: nftFloorPrice.toFixed(),
        tokenURI: newTokenURI,
      });

      await truffleAssert.reverts(
        tokenContract.mintTokenByNFT(
          nft.address,
          nftFloorPrice,
          tokenId,
          defaultEndTime,
          newTokenURI,
          sigNft.r,
          sigNft.s,
          sigNft.v,
          { from: USER1 }
        ),
        reason
      );

      await tokenContract.unpause();

      await tokenContract.mintToken(
        ZERO_ADDR,
        0,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      await tokenContract.mintTokenByNFT(
        nft.address,
        nftFloorPrice,
        tokenId,
        defaultEndTime,
        newTokenURI,
        sigNft.r,
        sigNft.s,
        sigNft.v,
        { from: USER1 }
      );

      assert.equal(await tokenContract.tokenURI(0), baseTokenContractsURI + defaultTokenURI);
      assert.equal(await tokenContract.tokenURI(1), baseTokenContractsURI + newTokenURI);

      assert.equal(await tokenContract.ownerOf(0), USER1);
      assert.equal(await tokenContract.ownerOf(1), USER1);
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
      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: currencyPrice.toFixed() });

      const expectedCurrencyAmount = defaultPricePerOneToken.times(wei(1)).idiv(currencyPrice);

      await tokenContract.mintToken(
        ZERO_ADDR,
        currencyPrice,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
          value: expectedCurrencyAmount,
        }
      );

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
      const sig = signMintTest({ paymentTokenPrice: paymentTokenPrice.toFixed() });

      const expectedPaymentAmount = defaultPricePerOneToken.times(wei(1)).idiv(paymentTokenPrice);
      const expectedTokensAmount = expectedPaymentAmount.idiv(wei(1, 10));

      await tokenContract.mintToken(
        paymentToken.address,
        paymentTokenPrice,
        defaultDiscountValue,
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
      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: currencyPrice.toFixed() });

      const expectedCurrencyAmount = defaultPricePerOneToken.times(wei(1)).idiv(currencyPrice);

      await tokenContract.mintToken(
        ZERO_ADDR,
        currencyPrice,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
          value: expectedCurrencyAmount,
        }
      );

      await truffleAssert.reverts(tokenContract.withdrawPaidTokens(ZERO_ADDR, tokenContract.address), reason);
    });

    it("should get exception if nonowner try to call this function", async () => {
      const reason = "TokenContract: Only owner can call this function.";

      await truffleAssert.reverts(tokenContract.withdrawPaidTokens(ZERO_ADDR, USER1, { from: USER1 }), reason);
    });
  });

  describe("mintToken", () => {
    it("should correctly mint new tokens", async () => {
      let sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: "0" });

      const tx = await tokenContract.mintToken(
        ZERO_ADDR,
        0,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      assert.equal(tx.receipt.logs[1].event, "SuccessfullyMinted");
      assert.equal(tx.receipt.logs[1].args.recipient, USER1);
      assert.equal(toBN(tx.receipt.logs[1].args.mintedTokenInfo.tokenId).toFixed(), 0);
      assert.equal(
        toBN(tx.receipt.logs[1].args.mintedTokenInfo.mintedTokenPrice).toFixed(),
        defaultPricePerOneToken.toFixed()
      );
      assert.equal(tx.receipt.logs[1].args.mintedTokenInfo.tokenURI, defaultTokenURI);
      assert.equal(tx.receipt.logs[1].args.paymentTokenAddress, ZERO_ADDR);
      assert.equal(toBN(tx.receipt.logs[1].args.paidTokensAmount).toFixed(), 0);
      assert.equal(toBN(tx.receipt.logs[1].args.paymentTokenPrice).toFixed(), 0);
      assert.equal(toBN(tx.receipt.logs[1].args.discount).toFixed(), 0);

      assert.equal(await tokenContract.tokenURI(0), baseTokenContractsURI + defaultTokenURI);
      assert.equal(await tokenContract.ownerOf(0), USER1);

      const newTokenURI = "new token URI";
      sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: "0", tokenURI: newTokenURI });

      await tokenContract.mintToken(
        ZERO_ADDR,
        0,
        defaultDiscountValue,
        defaultEndTime,
        newTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      assert.equal(await tokenContract.tokenURI(1), baseTokenContractsURI + newTokenURI);
      assert.equal(await tokenContract.ownerOf(1), USER1);
      assert.equal(await tokenContract.balanceOf(USER1), 2);
    });

    it("should correctly pay with ETH for new token with extra currency without discount", async () => {
      const balanceBefore = toBN(await web3.eth.getBalance(USER1));
      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR });
      const expectedCurrencyCount = defaultPricePerOneToken.times(wei(1)).idiv(tokenPrice);

      const tx = await tokenContract.mintToken(
        ZERO_ADDR,
        tokenPrice,
        defaultDiscountValue,
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

      assert.equal(tx.receipt.logs[1].event, "SuccessfullyMinted");
      assert.equal(tx.receipt.logs[1].args.recipient, USER1);
      assert.equal(tx.receipt.logs[1].args.paymentTokenAddress, ZERO_ADDR);
      assert.equal(toBN(tx.receipt.logs[1].args.paidTokensAmount).toFixed(), expectedCurrencyCount.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.paymentTokenPrice).toFixed(), tokenPrice.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.discount).toFixed(), 0);
    });

    it("should correctly pay with ETH for new token with extra currency with discount", async () => {
      const balanceBefore = toBN(await web3.eth.getBalance(USER1));

      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, discount: wei(30, 25).toFixed() });
      const expectedCurrencyCount = defaultPricePerOneToken
        .times(wei(1))
        .idiv(tokenPrice)
        .times(100 - 30)
        .times(PRECISION)
        .idiv(PERCENTAGE_100);

      const tx = await tokenContract.mintToken(
        ZERO_ADDR,
        tokenPrice,
        wei(30, 25), //30% discount
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

      assert.equal(tx.receipt.logs[1].event, "SuccessfullyMinted");
      assert.equal(tx.receipt.logs[1].args.recipient, USER1);
      assert.equal(tx.receipt.logs[1].args.paymentTokenAddress, ZERO_ADDR);
      assert.equal(toBN(tx.receipt.logs[1].args.paidTokensAmount).toFixed(), expectedCurrencyCount.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.paymentTokenPrice).toFixed(), tokenPrice.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.discount).toFixed(), wei(30, 25).toFixed());
    });

    it("should correctly pay with ETH without extra currency without discount", async () => {
      const balanceBefore = toBN(await web3.eth.getBalance(USER1));

      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR });
      const expectedCurrencyCount = defaultPricePerOneToken.times(wei(1)).idiv(tokenPrice);

      const tx = await tokenContract.mintToken(
        ZERO_ADDR,
        tokenPrice,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
          value: expectedCurrencyCount,
        }
      );

      const balanceAfter = toBN(await web3.eth.getBalance(USER1));

      assert.closeTo(
        balanceBefore.minus(balanceAfter).toNumber(),
        expectedCurrencyCount.toNumber(),
        wei(0.001).toNumber()
      );

      assert.equal(await tokenContract.tokenURI(0), baseTokenContractsURI + defaultTokenURI);
      assert.equal(await tokenContract.ownerOf(0), USER1);

      assert.equal(tx.receipt.logs[1].event, "SuccessfullyMinted");
      assert.equal(tx.receipt.logs[1].args.recipient, USER1);
      assert.equal(tx.receipt.logs[1].args.paymentTokenAddress, ZERO_ADDR);
      assert.equal(toBN(tx.receipt.logs[1].args.paidTokensAmount).toFixed(), expectedCurrencyCount.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.paymentTokenPrice).toFixed(), tokenPrice.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.discount).toFixed(), 0);
    });

    it("should correctly pay with ETH without extra currency with discount", async () => {
      const balanceBefore = toBN(await web3.eth.getBalance(USER1));

      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, discount: wei(20, 25).toFixed() });
      const expectedCurrencyCount = defaultPricePerOneToken
        .times(wei(1))
        .idiv(tokenPrice)
        .times(100 - 20)
        .times(PRECISION)
        .idiv(PERCENTAGE_100);

      const tx = await tokenContract.mintToken(
        ZERO_ADDR,
        tokenPrice,
        wei(20, 25), //20% discount
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
          value: expectedCurrencyCount,
        }
      );

      const balanceAfter = toBN(await web3.eth.getBalance(USER1));

      assert.closeTo(
        balanceBefore.minus(balanceAfter).toNumber(),
        expectedCurrencyCount.toNumber(),
        wei(0.001).toNumber()
      );

      assert.equal(await tokenContract.tokenURI(0), baseTokenContractsURI + defaultTokenURI);
      assert.equal(await tokenContract.ownerOf(0), USER1);

      assert.equal(tx.receipt.logs[1].event, "SuccessfullyMinted");
      assert.equal(tx.receipt.logs[1].args.recipient, USER1);
      assert.equal(tx.receipt.logs[1].args.paymentTokenAddress, ZERO_ADDR);
      assert.equal(toBN(tx.receipt.logs[1].args.paidTokensAmount).toFixed(), expectedCurrencyCount.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.paymentTokenPrice).toFixed(), tokenPrice.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.discount).toFixed(), wei(20, 25).toFixed());
    });

    it("should correctly pay with ERC20 for new token without discount", async () => {
      const sig = signMintTest({});
      const expectedTokensCount = defaultPricePerOneToken.times(wei(1)).idiv(tokenPrice);

      const tx = await tokenContract.mintToken(
        paymentToken.address,
        tokenPrice,
        defaultDiscountValue,
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

      assert.equal(tx.receipt.logs[1].event, "SuccessfullyMinted");
      assert.equal(tx.receipt.logs[1].args.recipient, USER1);
      assert.equal(tx.receipt.logs[1].args.paymentTokenAddress, paymentToken.address);
      assert.equal(toBN(tx.receipt.logs[1].args.paidTokensAmount).toFixed(), expectedTokensCount.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.paymentTokenPrice).toFixed(), tokenPrice.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.discount).toFixed(), 0);
    });

    it("should correctly pay with ERC20 for new token with discount", async () => {
      const sig = signMintTest({ discount: wei(50, 25).toFixed() });
      const expectedTokensCount = defaultPricePerOneToken
        .times(wei(1))
        .idiv(tokenPrice)
        .times(100 - 50)
        .times(PRECISION)
        .idiv(PERCENTAGE_100);

      const tx = await tokenContract.mintToken(
        paymentToken.address,
        tokenPrice,
        wei(50, 25),
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

      assert.equal(tx.receipt.logs[1].event, "SuccessfullyMinted");
      assert.equal(tx.receipt.logs[1].args.recipient, USER1);
      assert.equal(tx.receipt.logs[1].args.paymentTokenAddress, paymentToken.address);
      assert.equal(toBN(tx.receipt.logs[1].args.paidTokensAmount).toFixed(), expectedTokensCount.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.paymentTokenPrice).toFixed(), tokenPrice.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.discount).toFixed(), wei(50, 25).toFixed());
    });

    it("should correctly pay with voucher token for new token", async () => {
      await defaultVoucherContract.mint(USER1, mintTokensAmount);
      await defaultVoucherContract.approveBatch([USER1], tokenContract.address, mintTokensAmount);

      const sig = signMintTest({ paymentTokenAddress: defaultVoucherContract.address, paymentTokenPrice: 0 });

      const tx = await tokenContract.mintToken(
        defaultVoucherContract.address,
        0,
        defaultDiscountValue,
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
        (await defaultVoucherContract.balanceOf(USER1)).toFixed(),
        mintTokensAmount.minus(defaultVoucherTokensAmount).toFixed()
      );
      assert.equal(await tokenContract.ownerOf(0), USER1);

      assert.equal(tx.receipt.logs[1].event, "SuccessfullyMinted");
      assert.equal(tx.receipt.logs[1].args.recipient, USER1);
      assert.equal(tx.receipt.logs[1].args.paymentTokenAddress, defaultVoucherContract.address);
      assert.equal(toBN(tx.receipt.logs[1].args.paidTokensAmount).toFixed(), defaultVoucherTokensAmount.toFixed());
      assert.equal(toBN(tx.receipt.logs[1].args.paymentTokenPrice).toFixed(), "0");
      assert.equal(toBN(tx.receipt.logs[1].args.discount).toFixed(), 0);
    });

    it("should get exception if transfer currency failed", async () => {
      const reason = "TokenContract: Failed to return currency.";

      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR });
      const expectedCurrencyCount = defaultPricePerOneToken.times(wei(1)).idiv(tokenPrice);

      const attacker = await Attacker.new(tokenContract.address, [
        expectedCurrencyCount,
        ZERO_ADDR,
        tokenPrice,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
      ]);

      await truffleAssert.reverts(attacker.mintToken({ from: USER1, value: expectedCurrencyCount.times(2) }), reason);
    });

    it("should get exception if try to send currency when user needs to pay with ERC20 or voucher", async () => {
      let sig = signMintTest({});
      const expectedTokensCount = defaultPricePerOneToken.times(wei(1)).idiv(tokenPrice);

      const reason = "TokenContract: Currency amount must be a zero.";

      await truffleAssert.reverts(
        tokenContract.mintToken(
          paymentToken.address,
          tokenPrice,
          defaultDiscountValue,
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

      sig = signMintTest({ paymentTokenAddress: defaultVoucherContract.address, paymentTokenPrice: 0 });

      await truffleAssert.reverts(
        tokenContract.mintToken(
          defaultVoucherContract.address,
          0,
          defaultDiscountValue,
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

      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR });
      const expectedCurrencyCount = defaultPricePerOneToken.times(wei(1)).idiv(tokenPrice);

      await truffleAssert.reverts(
        tokenContract.mintToken(
          ZERO_ADDR,
          tokenPrice,
          defaultDiscountValue,
          defaultEndTime,
          defaultTokenURI,
          sig.r,
          sig.s,
          sig.v,
          {
            from: USER1,
            value: expectedCurrencyCount.idiv(2),
          }
        ),
        reason
      );
    });

    it("should get exception if try to mint new token with the same token URI", async () => {
      const reason = "TokenContract: Token URI already exists.";

      const sig = signMintTest({});

      await tokenContract.mintToken(
        paymentToken.address,
        tokenPrice,
        defaultDiscountValue,
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
          defaultDiscountValue,
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

      const sig = signMintTest({ privateKey: USER1_PK });

      await truffleAssert.reverts(
        tokenContract.mintToken(
          paymentToken.address,
          tokenPrice,
          defaultDiscountValue,
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

      const sig = signMintTest({});

      await setTime(defaultEndTime.plus(100).toNumber());

      await truffleAssert.reverts(
        tokenContract.mintToken(
          paymentToken.address,
          tokenPrice,
          defaultDiscountValue,
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

  describe("mintTokenByNFT", () => {
    const tokenId = 13;
    const nftFloorPrice = wei(90, priceDecimals);

    beforeEach("setup", async () => {
      await nft.mint(USER1, tokenId);
      await nft.approve(tokenContract.address, tokenId, { from: USER1 });
    });

    it("should correctly mint token by NFT", async () => {
      const sig = signMintTest({
        paymentTokenAddress: nft.address,
        paymentTokenPrice: nftFloorPrice.toFixed(),
      });

      const tx = await tokenContract.mintTokenByNFT(
        nft.address,
        nftFloorPrice,
        tokenId,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        { from: USER1 }
      );

      assert.equal(await nft.ownerOf(tokenId), tokenContract.address);
      assert.equal(await tokenContract.ownerOf(0), USER1);

      assert.equal(tx.receipt.logs[3].event, "SuccessfullyMintedByNFT");
      assert.equal(tx.receipt.logs[3].args.recipient, USER1);
      assert.equal(toBN(tx.receipt.logs[3].args.mintedTokenInfo.tokenId).toFixed(), 0);
      assert.equal(
        toBN(tx.receipt.logs[3].args.mintedTokenInfo.mintedTokenPrice).toFixed(),
        defaultMinNFTFloorPrice.toFixed()
      );
      assert.equal(tx.receipt.logs[3].args.mintedTokenInfo.tokenURI, defaultTokenURI);
      assert.equal(tx.receipt.logs[3].args.nftAddress, nft.address);
      assert.equal(toBN(tx.receipt.logs[3].args.tokenId).toFixed(), tokenId.toFixed());
      assert.equal(toBN(tx.receipt.logs[3].args.nftFloorPrice).toFixed(), nftFloorPrice.toFixed());
    });

    it("should get exception if the nft floor price is less than the minimum", async () => {
      const reason = "TokenContract: NFT floor price is less than the minimal.";

      const newNFTFloorPrice = wei(50, priceDecimals);

      const sig = signMintTest({
        paymentTokenAddress: nft.address,
        paymentTokenPrice: newNFTFloorPrice.toFixed(),
      });

      await truffleAssert.reverts(
        tokenContract.mintTokenByNFT(
          nft.address,
          newNFTFloorPrice,
          tokenId,
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

    it("should get exception if sender is not the owner of the nft", async () => {
      const reason = "TokenContract: Sender is not the owner.";

      const sig = signMintTest({
        paymentTokenAddress: nft.address,
        paymentTokenPrice: nftFloorPrice.toFixed(),
      });

      await truffleAssert.reverts(
        tokenContract.mintTokenByNFT(
          nft.address,
          nftFloorPrice,
          tokenId,
          defaultEndTime,
          defaultTokenURI,
          sig.r,
          sig.s,
          sig.v,
          { from: USER2 }
        ),
        reason
      );
    });

    it("should get exception if try to reenter in mint function", async () => {
      const reason = "ReentrancyGuard: reentrant call";

      const maliciousERC721 = await MaliciousERC721.new(tokenContract.address);

      const sig = signMintTest({
        paymentTokenAddress: maliciousERC721.address,
        paymentTokenPrice: nftFloorPrice.toFixed(),
      });

      await maliciousERC721.setParams([nftFloorPrice, tokenId, defaultEndTime, defaultTokenURI, sig.r, sig.s, sig.v]);

      await truffleAssert.reverts(maliciousERC721.mintToken({ from: USER1 }), reason);
    });
  });

  describe("getUserTokenIDs", () => {
    it("should return correct user token IDs arr", async () => {
      let sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: "0" });

      await tokenContract.mintToken(
        ZERO_ADDR,
        0,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: "0", tokenURI: defaultTokenURI + 1 });

      await tokenContract.mintToken(
        ZERO_ADDR,
        0,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI + 1,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER2,
        }
      );

      sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: "0", tokenURI: defaultTokenURI + 2 });

      await tokenContract.mintToken(
        ZERO_ADDR,
        0,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI + 2,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

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
      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: "0" });

      await tokenContract.mintToken(
        ZERO_ADDR,
        0,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      assert.equal(await tokenContract.tokenURI(0), baseTokenContractsURI + defaultTokenURI);
    });

    it("should return zero string if base token contracts URI is zero string", async () => {
      const sig = signMintTest({ paymentTokenAddress: ZERO_ADDR, paymentTokenPrice: "0" });

      await tokenContract.mintToken(
        ZERO_ADDR,
        0,
        defaultDiscountValue,
        defaultEndTime,
        defaultTokenURI,
        sig.r,
        sig.s,
        sig.v,
        {
          from: USER1,
        }
      );

      await tokenFactory.setBaseTokenContractsURI("");

      assert.equal(await tokenContract.tokenURI(0), "");
    });

    it("should get exception if token does not exist", async () => {
      const reason = "TokenContract: URI query for nonexistent token.";

      await truffleAssert.reverts(tokenContract.tokenURI(1), reason);
    });
  });
});
