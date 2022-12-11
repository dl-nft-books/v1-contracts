// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ERC721Mock is ERC721 {
    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    function mintBatch(address to_, uint256[] memory tokenIds_) public {
        for (uint256 i = 0; i < tokenIds_.length; i++) {
            _mint(to_, tokenIds_[i]);
        }
    }
}
