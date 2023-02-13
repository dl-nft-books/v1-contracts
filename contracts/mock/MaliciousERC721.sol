// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "../interfaces/ITokenContract.sol";

contract MaliciousERC721 {
    struct MintNFTParams {
        uint256 nftFloorPrice;
        uint256 tokenId;
        uint256 endTimestamp;
        string tokenURI;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    ITokenContract public tokenContract;
    MintNFTParams public params;
    uint256 public counter;

    constructor(address tokenContract_) {
        tokenContract = ITokenContract(tokenContract_);

        counter = 2;
    }

    function setParams(MintNFTParams memory params_) external {
        params = params_;
    }

    function safeTransferFrom(
        address,
        address,
        uint256
    ) external {
        for (uint256 i = 0; i < counter; i++) {
            tokenContract.mintTokenByNFT(
                address(this),
                params.nftFloorPrice,
                params.tokenId,
                params.endTimestamp,
                params.tokenURI,
                params.r,
                params.s,
                params.v
            );
        }
    }

    function mintToken() external {
        tokenContract.mintTokenByNFT(
            address(this),
            params.nftFloorPrice,
            params.tokenId,
            params.endTimestamp,
            params.tokenURI,
            params.r,
            params.s,
            params.v
        );
    }

    function ownerOf(uint256) external view returns (address) {
        return address(this);
    }
}
