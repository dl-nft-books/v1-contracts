// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@dlsl/dev-modules/pool-contracts-registry/ProxyBeacon.sol";

interface ITokenFactory {
    event TokenContractDeployed(
        address newTokenContractAddr,
        uint256 pricePerOneToken,
        string tokenName,
        string tokenSymbol
    );

    function __TokenFactory_init(
        string memory baseTokensURI_,
        address[] memory adminsArr_,
        uint8 priceDecimals_
    ) external;

    function baseTokensURI() external view returns (string memory);

    function updateBaseTokensURI(string memory baseTokensURI_) external;

    function setNewImplementation(address newImplementation_) external;

    function updateAdmins(address[] calldata adminsToUpdate_, bool isAdding_) external;

    function deployTokenContract(
        string memory tokenName_,
        string memory tokenSymbol_,
        uint256 pricePerOneToken_
    ) external;

    function poolsBeacon() external view returns (ProxyBeacon);

    function priceDecimals() external view returns (uint8);

    function getAdmins() external view returns (address[] memory);

    function isAdmin(address userAddr_) external view returns (bool);

    function getTokenContractsImpl() external view returns (address);

    function getTokenContractsCount() external view returns (uint256);

    function getTokenContractsPart(uint256 offset_, uint256 limit_)
        external
        view
        returns (address[] memory);
}
