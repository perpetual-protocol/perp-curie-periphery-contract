// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;

interface IOtcMakerStruct {
    struct JitLiquidityParams {
        uint256 liquidityBase;
        uint256 liquidityQuote;
        int24 lowerTick;
        int24 upperTick;
        uint256 minLiquidityBase;
        uint256 minLiquidityQuote;
    }
}
