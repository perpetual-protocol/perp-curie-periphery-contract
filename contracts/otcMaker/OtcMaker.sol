// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { SafeOwnable } from "../base/SafeOwnable.sol";

import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "@perp/curie-contract/contracts/interface/IClearingHouseConfig.sol";

import { IOtcMaker } from "../interface/IOtcMaker.sol";
import { OtcMakerStorageV1 } from "../storage/OtcMakerStorage.sol";

contract OtcMaker is SafeOwnable, IOtcMaker, OtcMakerStorageV1 {
    //
    // EXTERNAL NON-VIEW
    //

    function initialize(address clearingHouseArg) external initializer {
        __SafeOwnable_init();
        _clearingHouse = clearingHouseArg;
    }

    // TODO onlyCaller
    function openPositionFor(OpenPositionForParams calldata params)
        external
        override
        returns (uint256 base, uint256 quote)
    {
        // _verifySigner()

        // _checkMarginLimit()

        // addLiquidity()
        //     AddLiquidityParams{
        //         address baseToken;
        //         uint256 base;
        //         uint256 quote;
        //         int24 lowerTick;
        //         int24 upperTick;
        //         uint256 minBase;
        //         uint256 minQuote;
        //         bool useTakerBalance;
        //         uint256 deadline;
        //     }
        //     { liquidity } = return struct AddLiquidityResponse {
        //         uint256 base;
        //         uint256 quote;
        //         uint256 fee;
        //         uint256 liquidity;
        //     }

        // openPositionFor()
        //     address trader
        //     struct OpenPositionParams {
        //         address baseToken;
        //         bool isBaseToQuote;
        //         bool isExactInput;
        //         uint256 amount;
        //         uint256 oppositeAmountBound;
        //         uint256 deadline;
        //         uint160 sqrtPriceLimitX96;
        //         bytes32 referralCode;
        //     }

        // removeLiquidity()
        //     RemoveLiquidityParams {
        //         address baseToken;
        //         int24 lowerTick;
        //         int24 upperTick;
        //         uint128 liquidity;
        //         uint256 minBase;
        //         uint256 minQuote;
        //         uint256 deadline;
        //     }

        revert();
    }

    // TODO onlyCaller -> emergency margin adjustment to manage OtcMaker's margin ratio
    function openPosition(OpenPositionParams calldata params) external override returns (uint256 base, uint256 quote) {
        revert();
    }

    function deposit(address token, uint256 amount) external override {
        revert();
    }

    function withdraw(address token, uint256 amount) external override {
        revert();
    }

    function withdrawToken(address token) external override {
        revert();
    }

    function claimWeek(
        address merkleRedeem,
        address liquidityProvider,
        uint256 week,
        uint256 claimedBalance,
        bytes32[] calldata _merkleProof
    ) external override {
        revert();
    }

    function setCaller(address minterArg) external override {
        revert();
    }

    function setMarginRatioLimit(uint24 openMarginRatioLimitArg) external override {
        revert();
    }

    //
    // PUBLIC NON-VIEW
    //

    //
    // PUBLIC VIEW
    //

    //
    // INTERNAL NON-VIEW
    //

    //
    // INTERNAL VIEW
    //

    /// @return address signer address
    /// @return bytes32 hash of openPositionFor
    function _verifySigner(OpenPositionForParams calldata params, bytes memory signature)
        internal
        view
        returns (address, bytes32)
    {}

    function _checkMarginLimit() internal view returns (bool) {}

    //
    // INTERNAL PURE
    //
}
