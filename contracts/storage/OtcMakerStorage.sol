// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change OtcMakerStorageV1. Create a new
/// contract which implements OtcMakerStorageV1 and following the naming convention
/// OtcMakerStorageVX.
abstract contract OtcMakerStorageV1 {
    address internal _caller;
    address internal _clearingHouse;
    address internal _limitOrderBook;
    address internal _vault;
    address internal _accountBalance;
    uint24 internal _marginRatioLimit;
}

abstract contract OtcMakerStorageV2 is OtcMakerStorageV1 {
    address internal _fundOwner;
    address internal _positionManager;
}
