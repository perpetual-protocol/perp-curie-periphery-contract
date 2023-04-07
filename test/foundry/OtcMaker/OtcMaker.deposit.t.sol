// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";

contract OtcMakerDepositTest is OtcMakerSetup {
    function test_fail_deposit_from_wrong_caller() public {
        vm.startPrank(alice);
        usdc.approve(address(otcMaker), type(uint256).max);
        vm.expectRevert(bytes("OM_NC"));
        otcMaker.deposit(address(usdc), 1);
        vm.stopPrank();
    }

    function test_success_deposit_to_perp_vault() public prepareCaller(2) {
        perp.usdc().approve(address(otcMaker), type(uint256).max);
        otcMaker.deposit(address(usdc), 2);
        // assertEq(vault.getBalance(address(otcMaker)), 123456);
    }
}
