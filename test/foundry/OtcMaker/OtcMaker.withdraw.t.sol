// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";
import { TestERC20 } from "../../../contracts/test/TestERC20.sol";

contract OtcMakerWithdrawTest is OtcMakerSetup {
    function test_failed_withdraw_from_wrong_owner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("OM_NFO"));
        otcMaker.withdraw(address(usdc), 1);

        vm.prank(otcMakerCaller);
        vm.expectRevert(bytes("OM_NFO"));
        otcMaker.deposit(address(usdc), 1);
    }

    function test_successful_withdraw_from_vault() public prepareFundOwner(2) {
        otcMaker.deposit(address(usdc), 2);
        uint256 beforeAmount = usdc.balanceOf(otcMakerFundOwner);
        int256 beforePerpBalance = perp.vault().getBalance(address(otcMaker));
        otcMaker.withdraw(address(usdc), 2);
        uint256 afterAmount = usdc.balanceOf(otcMakerFundOwner);
        int256 afterPerpBalance = perp.vault().getBalance(address(otcMaker));

        assertEq(afterAmount - beforeAmount, 2);
        assertEq(afterAmount, 2);
        assertEq(beforePerpBalance - afterPerpBalance, 2);
        assertEq(afterPerpBalance, 0);
        assertEq(usdc.balanceOf(address(otcMaker)), 0);
    }

    function test_failed_withdrawToken_from_wrong_owner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("OM_NFO"));
        otcMaker.withdrawToken(address(usdc));

        vm.prank(otcMakerCaller);
        vm.expectRevert(bytes("OM_NFO"));
        otcMaker.withdrawToken(address(usdc));
    }

    function test_successful_withdrawToken_from_vault() public {
        _topUpUsdc(address(otcMaker), 2);
        uint256 beforeAmount = usdc.balanceOf(address(otcMakerFundOwner));
        vm.prank(otcMakerFundOwner);
        otcMaker.withdrawToken(address(usdc));
        uint256 afterAmount = usdc.balanceOf(address(otcMakerFundOwner));

        assertEq(afterAmount - beforeAmount, 2);
        assertEq(afterAmount, 2);
        assertEq(usdc.balanceOf(address(otcMaker)), 0);
    }
}
