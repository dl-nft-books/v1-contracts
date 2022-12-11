// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "./ITokenFactory.sol";

/**
 * This is a TokenContract, which is an ERC721 token.
 * This contract allows users to buy NFT tokens for any ERC20 token and native currency, provided the admin signs off on the necessary data.
 * System admins can update the parameters, as well as pause the purchase
 * All funds for which users buy tokens can be withdrawn by the main owner of the system.
 */
interface ITokenContract {
    /**
     * @notice The structure that stores information about the minted token
     * @param tokenId the ID of the minted token
     * @param pricePerOneToken the price, per token in dollars, to be paid by the user
     * @param tokenURI the token URI hash string
     */
    struct MintedTokenInfo {
        uint256 tokenId;
        uint256 pricePerOneToken;
        string tokenURI;
    }

    /**
     * @notice The structure that stores information about the offers made by users
     * @param isValid the state of the offer
     * @param maker the address of the user who made an offer
     * @param token the address of the NFT offered
     * @param tokenId the ID of the NFT offered
     */
    struct Offer {
        bool isValid;
        address maker;
        address token;
        uint256 tokenId;
    }

    /**
     * @notice This event is emitted when the user creates an offer for the NFT exchange
     * @param maker the address of the user who created an offer
     * @param offerId the ID of the created offer
     * @param token the address of the NFT offered in the created offer
     * @param tokenId the ID of the NFT offered in the created offer
     */
    event OfferCreated(address indexed maker, uint256 offerId, address token, uint256 tokenId);

    /**
     * @notice This event is emitted when the owner withdraws the NFT offered for the NFT exchange
     * @param token the address of the NFT
     * @param tokenId the ID of the NFT withdrawn
     * @param recepient the address of the withdraw NFT recepient
     */
    event NftWihdrawn(address indexed token, uint256 indexed tokenId, address recepient);

    /**
     * @notice This event is emitted when the admin accepts an offer for the NFT exchange created by user
     * @param maker the address of the user who created the accepted offer
     * @param offerId the ID of the accepted offer
     * @param token the address of the NFT offered in the accepted offer
     * @param tokenId the ID of the NFT offered in the accepted offer
     */
    event OfferAccepted(address indexed maker, uint256 offerId, address token, uint256 tokenId);

    /**
     * @notice This event is emitted when the user cancels his offer for the NFT exchange created earlier
     * @param maker the address of the user who created the cancelled offer
     * @param offerId the ID of the cancelled offer
     * @param token the address of the NFT offered in the cancelled offer
     * @param tokenId the ID of the NFT offered in the cancelled offer
     */
    event OfferCanceled(address indexed maker, uint256 offerId, address token, uint256 tokenId);

    /**
     * @notice This event is emitted when the TokenContract parameters are updated
     * @param newPrice the new price per token for this collection
     * @param tokenName the new token name
     * @param tokenSymbol the new token symbol
     */
    event TokenContractParamsUpdated(uint256 newPrice, string tokenName, string tokenSymbol);

    /**
     * @notice This event is emitted when the voucher parameters are updated
     * @param newVoucherTokenContract the new voucher token contract address
     * @param newVoucherTokensAmount the new amount of voucher tokens
     */
    event VoucherParamsUpdated(address newVoucherTokenContract, uint256 newVoucherTokensAmount);

    /**
     * @notice This event is emitted when the owner of the contract withdraws the tokens that users have paid for tokens
     * @param tokenAddr the address of the token to be withdrawn
     * @param recipient the address of the recipient
     * @param amount the number of tokens withdrawn
     */
    event PaidTokensWithdrawn(address indexed tokenAddr, address recipient, uint256 amount);

    /**
     * @notice This event is emitted when the user has successfully minted a new token
     * @param recipient the address of the user who received the token and who paid for it
     * @param mintedTokenInfo the MintedTokenInfo struct with information about minted token
     * @param paymentTokenAddress the address of the payment token contract
     * @param paidTokensAmount the amount of tokens paid
     * @param paymentTokenPrice the price in USD of the payment token
     */
    event SuccessfullyMinted(
        address indexed recipient,
        MintedTokenInfo mintedTokenInfo,
        address indexed paymentTokenAddress,
        uint256 paidTokensAmount,
        uint256 paymentTokenPrice
    );

    /**
     * @notice The function for initializing contract variables
     * @param tokenName_ the name of the collection (Uses in ERC721 and ERC712)
     * @param tokenSymbol_ the symbol of the collection (Uses in ERC721)
     * @param tokenFactoryAddr_ the address of the TokenFactory contract
     * @param pricePerOneToken_ the price per token in USD
     * @param voucherTokenContract_ the address of the voucher token contract
     * @param voucherTokensAmount_ the amount of voucher tokens
     */
    function __TokenContract_init(
        string memory tokenName_,
        string memory tokenSymbol_,
        address tokenFactoryAddr_,
        uint256 pricePerOneToken_,
        address voucherTokenContract_,
        uint256 voucherTokensAmount_
    ) external;

    /**
     * @notice The function for updating token contract parameters
     * @param newPrice_ the new price per one token
     * @param newTokenName_ the new token name
     * @param newTokenSymbol_ the new token symbol
     */
    function updateTokenContractParams(
        uint256 newPrice_,
        string memory newTokenName_,
        string memory newTokenSymbol_
    ) external;

    /**
     * @notice The function for pausing mint functionality
     */
    function pause() external;

    /**
     * @notice The function for unpausing mint functionality
     */
    function unpause() external;

    /**
     * @notice Function to accept the offer user previously created
     * @param offerId_ the ID of the offer that needs to be accepted
     */
    function accept(uint256 offerId_) external;

    /**
     * @notice Function to accept the offers in batches
     * @param offerIds_ the array of IDs of the offers that need to be accepted
     */
    function batchAccept(uint256[] calldata offerIds_) external;

    /**
     * @notice Function to withdraw the tokens that users paid to buy tokens
     * @dev Pass parameter tokenAddr_ equals to zero to withdraw the native currency
     * @param tokenAddr_ the address of the token to be withdrawn
     * @param recipient_ the address of the recipient
     */
    function withdrawPaidTokens(address tokenAddr_, address recipient_) external;

    /**
     * @param paymentTokenAddress_ the payment token address
     * @param paymentTokenPrice_ the payment token price in USD
     * @param endTimestamp_ the end time of signature
     * @param tokenURI_ the tokenURI string
     * @param r_ the r parameter of the ECDSA signature
     * @param s_ the s parameter of the ECDSA signature
     * @param v_ the v parameter of the ECDSA signature
     */
    function mintToken(
        address paymentTokenAddress_,
        uint256 paymentTokenPrice_,
        uint256 endTimestamp_,
        string memory tokenURI_,
        bytes32 r_,
        bytes32 s_,
        uint8 v_
    ) external payable;

    /**
     * @notice Function to withdraw the NFT that users offered in exchange for tokens
     * @param token_ the address of the NFT to be withdrawn
     * @param tokenId_ the ID of the NFT to be withdrawn
     * @param recipient_ the address of the recipient of the withdrawn NFT
     */
    function withdrawOfferredNFT(
        address token_,
        uint256 tokenId_,
        address recipient_
    ) external;

    /**
     * @notice Function to withdraw the NFTs that users offered in exchange for tokens in batches
     * @dev tokens_ and tokenIds_ length must be equal
     * @param tokens_ the array of addresses of the NFTs to be withdrawn
     * @param tokenIds_ the array of the IDs of the NFTs to be withdrawn
     * @param recipient_ the address of the recipient of the withdrawn NFTs
     */
    function batchWithdrawOfferredNFT(
        address[] calldata tokens_,
        uint256[] calldata tokenIds_,
        address recipient_
    ) external;

    /**
     * @notice Function to create an offer for the NFT exchange which locks the NFT offered
     * @param token_ the address of the NFT to offer
     * @param tokenId_ the ID of the NFT to offer
     */
    function lock(address token_, uint256 tokenId_) external;

    /**
     * @notice Function to cancel an offer for the NFT exchange which returns the NFT offered
     * @param offerId_ the ID of the offer a user wants to cancel
     */
    function unlock(uint256 offerId_) external;

    /**
     * @notice The function that returns the address of the token factory
     * @return token factory address
     */
    function tokenFactory() external view returns (ITokenFactory);

    /**
     * @notice The function that returns the price per one token
     * @return price per one token in USD
     */
    function pricePerOneToken() external view returns (uint256);

    /**
     * @notice The function that returns the counter of the offers created, starts with zero
     * @return ID of the next offer to be created
     */
    function offerCounter() external view returns (uint256);

    /**
     * @notice The function to check if there is a token with the passed token URI
     * @param tokenURI_ the token URI string to check
     * @return true if passed token URI exists, false otherwise
     */
    function existingTokenURIs(string memory tokenURI_) external view returns (bool);

    /**
     * @notice The function that returns the offer by its id
     * @param offerId_ the offer ID you want to get Offer for
     * @return Offer of the assosiated offer ID
     */
    function getOfferById(uint256 offerId_) external view returns (Offer memory);

    /**
     * @notice The function that returns the array of offer IDs created by a user
     * @param user_ the user you want to get the offer IDs for
     * @return array of the offer IDs of the assosiated user
     */
    function getUserOfferIds(address user_) external view returns (uint256[] memory);

    /**
     * @notice The function that returns the address of the voucher token contract
     * @return address of the voucher token contract
     */
    function voucherTokenContract() external view returns (address);

    /**
     * @notice The function that returns the amount of voucher tokens needed to mint one token
     * @return amount of voucher tokens
     */
    function voucherTokensAmount() external view returns (uint256);

    /**
     * @notice The function to get an array of tokenIDs owned by a particular user
     * @param userAddr_ the address of the user for whom you want to get information
     * @return tokenIDs_ the array of token IDs owned by the user
     */
    function getUserTokenIDs(address userAddr_) external view returns (uint256[] memory tokenIDs_);
}
