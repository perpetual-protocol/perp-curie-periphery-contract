// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change LimitOrderFeeVaultStorageV1. Create a new
/// contract which implements LimitOrderFeeVaultStorageV1 and following the naming convention
/// LimitOrderFeeVaultStorageVX.

abstract contract LimitOrderFeeVaultStorageV1 {
    address public rewardToken;
    address public limitOrderBook;
    uint256 public rewardAmount;
}
