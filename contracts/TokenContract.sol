// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";
import "@dlsl/dev-modules/utils/Globals.sol";

import "./interfaces/ITokenFactory.sol";
import "./interfaces/ITokenContract.sol";
import "./interfaces/IOwnable.sol";

contract TokenContract is
    ITokenContract,
    IOwnable,
    ERC721EnumerableUpgradeable,
    EIP712Upgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using DecimalsConverter for uint256;
    using SafeERC20 for IERC20Metadata;

    bytes32 internal constant _MINT_TYPEHASH =
        keccak256(
            "Mint(address paymentTokenAddress,uint256 paymentTokenPrice,uint256 endTimestamp,bytes32 tokenURI)"
        );

    ITokenFactory public override tokenFactory;
    uint256 public override pricePerOneToken;

    uint256 internal _tokenId;

    mapping(string => bool) public existingTokenURIs;
    mapping(uint256 => string) internal _tokenURIs;

    modifier onlyOwner() {
        require(msg.sender == owner(), "TokenContract: Only owner can call this function.");
        _;
    }

    function __TokenContract_init(
        string memory tokenName_,
        string memory tokenSymbol_,
        address tokenFactoryAddr_,
        uint256 pricePerOneToken_
    ) external override initializer {
        __ERC721_init(tokenName_, tokenSymbol_);
        __EIP712_init(tokenName_, "1");
        __Pausable_init();
        __ReentrancyGuard_init();

        tokenFactory = ITokenFactory(tokenFactoryAddr_);
        pricePerOneToken = pricePerOneToken_;
    }

    function updatePricePerOneToken(uint256 newPrice_) external override onlyOwner {
        pricePerOneToken = newPrice_;
    }

    function pause() external override onlyOwner {
        _pause();
    }

    function unpause() external override onlyOwner {
        _unpause();
    }

    function mintToken(
        address paymentTokenAddress_,
        uint256 paymentTokenPrice_,
        uint256 endTimestamp_,
        string memory tokenURI_,
        bytes32 r_,
        bytes32 s_,
        uint8 v_
    ) external payable override whenNotPaused nonReentrant {
        require(!existingTokenURIs[tokenURI_], "TokenContract: Token URI already exists.");

        bytes32 structHash_ = keccak256(
            abi.encode(
                _MINT_TYPEHASH,
                paymentTokenAddress_,
                paymentTokenPrice_,
                endTimestamp_,
                keccak256(abi.encodePacked(tokenURI_))
            )
        );

        address signer_ = ECDSA.recover(_hashTypedDataV4(structHash_), v_, r_, s_);
        require(signer_ == owner(), "TokenContract: Invalid signature.");

        require(block.timestamp <= endTimestamp_, "TokenContract: Signature expired.");

        if (paymentTokenPrice_ != 0) {
            if (paymentTokenAddress_ != address(0)) {
                require(msg.value == 0, "TokenContract: Currency amount must be a zero.");

                _payWithERC20(IERC20Metadata(paymentTokenAddress_), paymentTokenPrice_);
            } else {
                _payWithETH(paymentTokenPrice_);
            }
        }

        uint256 currentTokenId_ = _tokenId++;

        _mint(msg.sender, currentTokenId_);
        _tokenURIs[currentTokenId_] = tokenURI_;
        existingTokenURIs[tokenURI_] = true;

        emit TokenMinted(msg.sender, currentTokenId_, tokenURI_);
    }

    function owner() public view override returns (address) {
        return IOwnable(address(tokenFactory)).owner();
    }

    function tokenURI(uint256 tokenId_) public view override returns (string memory) {
        require(_exists(tokenId_), "TokenContract: URI query for nonexistent token.");

        return _tokenURIs[tokenId_];
    }

    function _payWithERC20(IERC20Metadata tokenAddr_, uint256 tokenPrice_) internal {
        uint256 amountToPay_ = (pricePerOneToken * DECIMAL) / tokenPrice_;

        tokenAddr_.safeTransferFrom(
            msg.sender,
            address(this),
            amountToPay_.from18(tokenAddr_.decimals())
        );

        emit ERC20PaymentSuccessful(address(tokenAddr_), amountToPay_, tokenPrice_);
    }

    function _payWithETH(uint256 ethPrice_) internal {
        uint256 amountToPay_ = (pricePerOneToken * DECIMAL) / ethPrice_;

        require(msg.value >= amountToPay_, "TokenContract: Invalid currency amount.");

        uint256 extraCurrencyAmount_ = msg.value - amountToPay_;

        if (extraCurrencyAmount_ > 0) {
            (bool success_, ) = msg.sender.call{value: extraCurrencyAmount_}("");
            require(success_, "TokenContract: Failed to return currency.");
        }

        emit ETHPaymentSuccessful(amountToPay_, ethPrice_);
    }
}
