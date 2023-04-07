// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";

contract OtcMakerSetterTest is OtcMakerSetup {
    function test_set_caller() public {
        assertFalse(otcMaker.getCaller() == alice);
        vm.prank(otcMakerOwner);
        otcMaker.setCaller(alice);
        assertEq(otcMaker.getCaller(), alice);
    }

    function test_fail_set_caller_by_non_owner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("SO_CNO"));
        otcMaker.setCaller(alice);

        vm.prank(otcMakerCaller);
        vm.expectRevert(bytes("SO_CNO"));
        otcMaker.setCaller(otcMakerCaller);
    }
}
