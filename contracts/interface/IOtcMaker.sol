// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";

import { IOtcMakerEvent } from "./IOtcMakerEvent.sol";
import { IOtcMakerStruct } from "./IOtcMakerStruct.sol";
import { ILimitOrderBook } from "./ILimitOrderBook.sol";

interface IOtcMaker is IOtcMakerStruct, IOtcMakerEvent {
    //
    // EXTERNAL NON-VIEW
    //

    function openPositionFor(
        ILimitOrderBook.LimitOrder calldata limitOrderParams,
        JitLiquidityParams calldata jitLiquidityParams,
        bytes calldata signature
    ) external;

    function openPosition(IClearingHouse.OpenPositionParams calldata params)
        external
        returns (uint256 base, uint256 quote);

    function deposit(address token, uint256 amount) external;

    function withdraw(address token, uint256 amount) external;

    function withdrawToken(address token) external;

    function claimWeek(
        address merkleRedeem,
        address liquidityProvider,
        uint256 week,
        uint256 claimedBalance,
        bytes32[] calldata _merkleProof
    ) external;

    function setCaller(address newCaller) external;

    function setMarginRatioLimit(uint24 openMarginRatioLimitArg) external;

    //
    // EXTERNAL VIEW
    //

    function getCaller() external view returns (address);

    //
    // PUBLIC VIEW
    //

    function isMarginSufficient() external view returns (bool);
}
