// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";
import { TestERC20 } from "../../../contracts/test/TestERC20.sol";

contract OtcMakerWithdrawTest is OtcMakerSetup {
    function test_failed_withdraw_from_wrong_owner() public {
        _topUpUsdc(otcMakerOwner, 2);
        vm.startPrank(otcMakerOwner);
        usdc.approve(address(otcMaker), type(uint256).max);
        otcMaker.deposit(address(usdc), 2);
        vm.stopPrank();
        assertEq(perp.vault().getBalance(address(otcMaker)), 2);

        vm.prank(alice);
        vm.expectRevert(bytes("SO_CNO"));
        otcMaker.withdraw(address(usdc), 1);

        vm.prank(otcMakerCaller);
        vm.expectRevert(bytes("SO_CNO"));
        otcMaker.deposit(address(usdc), 1);
    }

    function test_successful_withdraw_from_vault() public prepareOwner(2) {
        otcMaker.deposit(address(usdc), 2);
        uint256 beforeAmount = usdc.balanceOf(otcMakerOwner);
        otcMaker.withdraw(address(usdc), 2);
        uint256 afterAmount = usdc.balanceOf(otcMakerOwner);

        assertEq(afterAmount - beforeAmount, 2);
        assertEq(afterAmount, 2);
        assertEq(usdc.balanceOf(address(otcMaker)), 0);
        assertEq(perp.vault().getBalance(address(otcMaker)), 0);
    }

    function test_failed_withdrawToken_from_wrong_owner() public {
        _topUpUsdc(address(otcMaker), 2);
        assertEq(usdc.balanceOf(address(otcMaker)), 2);

        vm.prank(alice);
        vm.expectRevert(bytes("SO_CNO"));
        otcMaker.withdrawToken(address(usdc));

        vm.prank(otcMakerCaller);
        vm.expectRevert(bytes("SO_CNO"));
        otcMaker.withdrawToken(address(usdc));
    }

    function test_successful_withdrawToken_from_vault() public {
        _topUpUsdc(address(otcMaker), 2);
        uint256 beforeAmount = usdc.balanceOf(address(otcMakerOwner));
        vm.prank(otcMakerOwner);
        otcMaker.withdrawToken(address(usdc));
        uint256 afterAmount = usdc.balanceOf(address(otcMakerOwner));

        assertEq(afterAmount - beforeAmount, 2);
        assertEq(afterAmount, 2);
        assertEq(usdc.balanceOf(address(otcMaker)), 0);
    }
}
