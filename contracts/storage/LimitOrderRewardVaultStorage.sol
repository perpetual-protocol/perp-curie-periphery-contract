// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change LimitOrderRewardVaultStorageV1. Create a new
/// contract which implements LimitOrderRewardVaultStorageV1 and following the naming convention
/// LimitOrderRewardVaultStorageVX.

abstract contract LimitOrderRewardVaultStorageV1 {
    address public rewardToken;
    address public limitOrderBook;
    uint256 public rewardAmount;
}
