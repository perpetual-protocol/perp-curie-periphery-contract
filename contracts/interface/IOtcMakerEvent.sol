// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

interface IOtcMakerEvent {
    event UpdateCaller(address oldCaller, address newCaller);

    event OpenPositionFor(
        address signer,
        address baseToken,
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount,
        uint256 oppositeAmountBound,
        uint256 deadline,
        uint160 sqrtPriceLimitX96,
        bytes32 referralCode
    );
}
