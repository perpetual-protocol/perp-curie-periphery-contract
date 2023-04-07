// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";

import { ClearingHouse } from "@perp/curie-contract/contracts/ClearingHouse.sol";
import { ClearingHouseConfig } from "@perp/curie-contract/contracts/ClearingHouseConfig.sol";
import { Vault } from "@perp/curie-contract/contracts/Vault.sol";

import "../../../../contracts/otcMaker/OtcMaker.sol";

contract OtcMakerSetup is Test {
    address public alice = makeAddr("alice");
    address public otcCaller = makeAddr("otcCaller");

    OtcMaker otcMaker;
    ClearingHouse public mockClearingHouse = new ClearingHouse();
    ClearingHouseConfig public mockClearingHouseConfig = new ClearingHouseConfig();
    Vault public mockVault = new Vault();

    function setUp() public virtual {
        otcMaker = new OtcMaker();
        vm.mockCall(
            address(mockClearingHouse),
            abi.encodeWithSelector(ClearingHouse.getVault.selector),
            abi.encode(address(mockVault))
        );
        otcMaker.initialize(address(mockClearingHouse));
    }
}
