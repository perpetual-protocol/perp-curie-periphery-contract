// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;

interface IOtcMakerStruct {
    struct OpenPositionForParams {
        address trader;
        address baseToken;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint256 deadline;
        uint160 sqrtPriceLimitX96;
        bytes32 referralCode;
    }

    struct JitLiquidityParams {
        uint256 liquidityBase;
        uint256 liquidityQuote;
        int24 lowerTick;
        int24 upperTick;
    }

    struct OpenPositionParams {
        address baseToken;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint256 deadline;
        uint160 sqrtPriceLimitX96;
        bytes32 referralCode;
    }
}
