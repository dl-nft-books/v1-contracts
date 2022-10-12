// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../TokenFactory.sol";

contract TokenFactoryMock is TokenFactory {
    using EnumerableSet for EnumerableSet.AddressSet;

    function getTokenContractByIndex(uint256 index_) external view returns (address) {
        return _tokenContracts.at(index_);
    }
}
