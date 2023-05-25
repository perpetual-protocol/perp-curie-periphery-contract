// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";

contract OtcMakerDepositTest is OtcMakerSetup {
    function test_failed_deposit_from_wrong_owner() public {
        vm.startPrank(alice);
        usdc.approve(address(otcMaker), type(uint256).max);
        vm.expectRevert(bytes("OM_NFO"));
        otcMaker.deposit(address(usdc), 1);
        vm.stopPrank();

        vm.startPrank(otcMakerCaller);
        usdc.approve(address(otcMakerCaller), type(uint256).max);
        vm.expectRevert(bytes("OM_NFO"));
        otcMaker.deposit(address(usdc), 1);
        vm.stopPrank();
    }

    function test_successful_deposit_to_perp_vault() public prepareFundOwner(2) {
        otcMaker.deposit(address(usdc), 2);
        assertEq(usdc.balanceOf(otcMakerFundOwner), 0);
        assertEq(usdc.balanceOf(address(otcMaker)), 0);
        assertEq(perp.vault().getBalance(address(otcMaker)), 2);
    }
}
