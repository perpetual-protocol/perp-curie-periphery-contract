// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";

contract OtcMakerSetterTest is OtcMakerSetup {
    function test_set_caller() public {
        assertFalse(otcMaker.getCaller() == alice);
        otcMaker.setCaller(alice);
        assertEq(otcMaker.getCaller(), alice);
    }

    function test_fail_set_caller_by_non_caller() public {
        vm.prank(alice);
        vm.expectRevert(bytes("OM_NC"));
        otcMaker.setCaller(alice);
    }
}
