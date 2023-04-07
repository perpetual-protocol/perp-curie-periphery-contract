// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "./helper/OtcMakerSetup.sol";

contract OtcMakerDepositTest is OtcMakerSetup {
    function test_fail_deposit_from_wrong_caller() public {
        vm.prank(alice);
        vm.expectRevert(bytes("OM_NC"));
        otcMaker.deposit(address(perp.usdc()), 1);
    }

    function test_fail_deposit_not_enough_allowance() public prepareCaller(1) {
        vm.expectRevert(bytes("ERC20: transfer amount exceeds allowance"));
        otcMaker.deposit(address(perp.usdc()), 1);
    }

    function test_fail_deposit_not_enough_balance() public prepareCaller(1) {
        perp.usdc().approve(address(otcMaker), type(uint256).max);
        vm.expectRevert(bytes("ERC20: transfer amount exceeds balance"));
        otcMaker.deposit(address(perp.usdc()), 2);
    }

    function test_success_deposit_to_perp_vault() public prepareCaller(2) {
        perp.usdc().approve(address(otcMaker), type(uint256).max);
        otcMaker.deposit(address(perp.usdc()), 2);
        // assertEq(vault.getBalance(address(otcMaker)), 123456);
    }
}
