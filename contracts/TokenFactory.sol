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
    EnumerableSet.AddressSet internal _admins;

    modifier onlyAdmin() {
        require(isAdmin(msg.sender), "TokenFactory: Only admin can call this function.");
        _;
    }

    function __TokenFactory_init(
        string memory baseTokensURI_,
        address[] memory adminsArr_,
        uint8 priceDecimals_
    ) external override initializer {
        __Ownable_init();

        poolsBeacon = new ProxyBeacon();
        baseTokensURI = baseTokensURI_;
        priceDecimals = priceDecimals_;

        _updateAddressSet(_admins, adminsArr_, true);
    }

    function setNewImplementation(address newImplementation_) external override onlyOwner {
        if (poolsBeacon.implementation() != newImplementation_) {
            poolsBeacon.upgrade(newImplementation_);
        }
    }

    function updateAdmins(address[] calldata adminsToUpdate_, bool isAdding_)
        external
        override
        onlyOwner
    {
        _updateAddressSet(_admins, adminsToUpdate_, isAdding_);
    }

    function updateBaseTokensURI(string memory baseTokensURI_) external override onlyAdmin {
        baseTokensURI = baseTokensURI_;
    }

    function deployTokenContract(
        string memory tokenName_,
        string memory tokenSymbol_,
        uint256 pricePerOneToken_
    ) external override onlyAdmin {
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

    function getAdmins() external view override returns (address[] memory) {
        return _admins.values();
    }

    function isAdmin(address userAddr_) public view override returns (bool) {
        return _admins.contains(userAddr_);
    }

    function _updateAddressSet(
        EnumerableSet.AddressSet storage addressSet,
        address[] memory addressesToUpdate_,
        bool isAdding_
    ) internal {
        for (uint256 i; i < addressesToUpdate_.length; i++) {
            if (isAdding_) {
                require(addressesToUpdate_[i] != address(0), "PoolFactory: Bad address.");

                addressSet.add(addressesToUpdate_[i]);
            } else {
                addressSet.remove(addressesToUpdate_[i]);
            }
        }
    }

    function _authorizeUpgrade(address newImplementation_) internal override onlyOwner {}

    function _nonEmptyString(string memory str_, string memory fieldName_) internal pure {
        require(
            bytes(str_).length > 0,
            string(abi.encodePacked("TokenFactory: Invalid ", fieldName_, "."))
        );
    }
}
