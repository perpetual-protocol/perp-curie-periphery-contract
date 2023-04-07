// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { IOtcMakerEvent } from "./IOtcMakerEvent.sol";
import { IOtcMakerStruct } from "./IOtcMakerStruct.sol";

interface IOtcMaker is IOtcMakerStruct, IOtcMakerEvent {
    function openPositionFor(OpenPositionForParams calldata params) external returns (uint256 base, uint256 quote);

    function openPosition(OpenPositionParams calldata params) external returns (uint256 base, uint256 quote);

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

    function getCaller() external view returns (address);
}
