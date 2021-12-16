// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change DelegatableVaultStorageV1. Create a new
/// contract which implements DelegatableVaultStorageV1 and following the naming convention
/// DelegatableVaultStorageVX.
abstract contract DelegatableVaultStorageV1 {
    address internal _clearingHouse;

    address internal _fundOwner;
    address internal _fundManager;

    mapping(bytes4 => bool) public whiteFunctionMap;
}

abstract contract DelegatableVaultStorageV2 is DelegatableVaultStorageV1 {
    mapping(address => bool) public rewardContractAddressMap;
}
