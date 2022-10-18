// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@dlsl/dev-modules/pool-contracts-registry/pool-factory/PublicBeaconProxy.sol";
import "@dlsl/dev-modules/pool-contracts-registry/ProxyBeacon.sol";
import "@dlsl/dev-modules/libs/arrays/Paginator.sol";

import "./interfaces/ITokenFactory.sol";
import "./interfaces/ITokenContract.sol";

contract TokenFactory is ITokenFactory, OwnableUpgradeable, UUPSUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Paginator for EnumerableSet.AddressSet;

    ProxyBeacon public override poolsBeacon;
    uint8 public override priceDecimals;
    string public override baseTokensURI;

    EnumerableSet.AddressSet internal _tokenContracts;

    function __TokenFactory_init(uint8 priceDecimals_, string memory baseTokensURI_)
        external
        override
        initializer
    {
        __Ownable_init();

        poolsBeacon = new ProxyBeacon();
        priceDecimals = priceDecimals_;
        baseTokensURI = baseTokensURI_;
    }

    function updateBaseTokensURI(string memory baseTokensURI_) external override onlyOwner {
        baseTokensURI = baseTokensURI_;
    }

    function setNewImplementation(address newImplementation_) external override onlyOwner {
        if (poolsBeacon.implementation() != newImplementation_) {
            poolsBeacon.upgrade(newImplementation_);
        }
    }

    function deployTokenContract(
        string memory tokenName_,
        string memory tokenSymbol_,
        uint256 pricePerOneToken_
    ) external override onlyOwner {
        _nonEmptyString(tokenName_, "token name");
        _nonEmptyString(tokenSymbol_, "token symbol");

        address newTokenContract_ = address(new PublicBeaconProxy(address(poolsBeacon), ""));

        ITokenContract(newTokenContract_).__TokenContract_init(
            tokenName_,
            tokenSymbol_,
            address(this),
            pricePerOneToken_
        );

        _tokenContracts.add(newTokenContract_);

        emit TokenContractDeployed(newTokenContract_, pricePerOneToken_, tokenName_, tokenSymbol_);
    }

    function getTokenContractsImpl() external view override returns (address) {
        return poolsBeacon.implementation();
    }

    function getTokenContractsCount() external view override returns (uint256) {
        return _tokenContracts.length();
    }

    function getTokenContractsPart(uint256 offset_, uint256 limit_)
        external
        view
        override
        returns (address[] memory)
    {
        return _tokenContracts.part(offset_, limit_);
    }

    function _authorizeUpgrade(address newImplementation_) internal override onlyOwner {}

    function _nonEmptyString(string memory str_, string memory fieldName_) internal pure {
        require(
            bytes(str_).length > 0,
            string(abi.encodePacked("TokenFactory: Invalid ", fieldName_, "."))
        );
    }
}
