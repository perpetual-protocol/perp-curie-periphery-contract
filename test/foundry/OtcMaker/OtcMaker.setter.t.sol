// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";

contract OtcMakerSetterTest is OtcMakerSetup {
    using PerpSafeCast for uint24;

    event CallerUpdated(address oldCaller, address newCaller);

    function test_set_caller() public {
        assertFalse(otcMaker.getCaller() == alice);
        vm.startPrank(otcMakerOwner);
        vm.expectEmit(false, false, false, false);
        emit CallerUpdated(otcMaker.getCaller(), alice);
        otcMaker.setCaller(alice);
        vm.stopPrank();
        assertEq(otcMaker.getCaller(), alice);
    }

    function test_fail_set_caller_by_non_owner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("SO_CNO"));
        otcMaker.setCaller(alice);
    }

    function test_set_marginRatioLimit() public {
        assertFalse(otcMaker.getMarginRatioLimit() == 250000);
        vm.prank(otcMakerOwner);
        otcMaker.setMarginRatioLimit(250000);
        assertEq(otcMaker.getMarginRatioLimit().toUint256(), 250000);
    }

    function test_fail_set_marginRatioLimit_by_non_owner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("SO_CNO"));
        otcMaker.setMarginRatioLimit(250000);
    }

    function test_fail_set_marginRatioLimit_out_of_range() public {
        vm.startPrank(otcMakerOwner);
        vm.expectRevert(bytes("OM_IMR"));
        otcMaker.setMarginRatioLimit(62500);
        vm.expectRevert(bytes("OM_IMR"));
        otcMaker.setMarginRatioLimit(1000000);
        vm.stopPrank();
    }
}
