// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "./ITokenFactory.sol";

interface ITokenContract {
    event TokenContractParamsUpdated(uint256 newPrice, string tokenName, string tokenSymbol);
    event PaidTokensWithdrawn(address indexed tokenAddr, address recipient, uint256 amount);
    event TokenMinted(address indexed recipient, uint256 tokenId, string tokenURI);
    event PaymentSuccessful(address indexed tokenAddress, uint256 tokenAmount, uint256 tokenPrice);

    function __TokenContract_init(
        string memory tokenName_,
        string memory tokenSymbol_,
        address tokenFactoryAddr_,
        uint256 pricePerOneToken_
    ) external;

    function tokenFactory() external view returns (ITokenFactory);

    function pricePerOneToken() external view returns (uint256);

    function existingTokenURIs(string memory tokenURI_) external view returns (bool);

    function updateTokenContractParams(
        uint256 newPrice_,
        string memory newTokenName_,
        string memory newTokenSymbol_
    ) external;

    function pause() external;

    function unpause() external;

    function withdrawPaidTokens(address tokenAddr_, address recipient_) external;

    function mintToken(
        address paymentTokenAddress_,
        uint256 paymentTokenPrice_,
        uint256 endTimestamp_,
        string memory tokenURI_,
        bytes32 r_,
        bytes32 s_,
        uint8 v_
    ) external payable;

    function getUserTokenIDs(address userAddr_) external view returns (uint256[] memory tokenIDs_);
}
