// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "./ITokenFactory.sol";

interface ITokenContract {
    event ERC20PaymentSuccessful(
        address indexed tokenAddress,
        uint256 tokenAmount,
        uint256 tokenPrice
    );
    event ETHPaymentSuccessful(uint256 ethAmount, uint256 ethPrice);
    event TokenMinted(address indexed recipient, uint256 tokenId, string tokenURI);

    function __TokenContract_init(
        string memory tokenName_,
        string memory tokenSymbol_,
        address tokenFactoryAddr_,
        uint256 pricePerOneToken_
    ) external;

    function tokenFactory() external view returns (ITokenFactory);

    function pricePerOneToken() external view returns (uint256);

    function updatePricePerOneToken(uint256 newPrice_) external;

    function pause() external;

    function unpause() external;

    function mintToken(
        address paymentTokenAddress_,
        uint256 paymentTokenPrice_,
        uint256 endTimestamp_,
        string memory tokenURI_,
        bytes32 r_,
        bytes32 s_,
        uint8 v_
    ) external payable;
}
