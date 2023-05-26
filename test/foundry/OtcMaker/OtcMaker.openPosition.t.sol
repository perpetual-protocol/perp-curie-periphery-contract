// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";

import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";

contract OtcMakerOpenPositionTest is OtcMakerSetup {
    function test_fail_open_position_by_non_position_manager() public {
        vm.startPrank(otcMakerOwner);
        IClearingHouse.OpenPositionParams memory params = _getOpenPositionParams();
        vm.expectRevert(bytes("OM_NPM"));
        otcMaker.openPosition(params);
        vm.stopPrank();
    }

    function test_success_open_position() public {
        vm.startPrank(otcMakerPositionManager);

        IClearingHouse.OpenPositionParams memory params = _getOpenPositionParams();
        bytes memory callData = abi.encodeWithSelector(IClearingHouse.openPosition.selector, params);

        vm.mockCall(address(perp.clearingHouse()), callData, abi.encode(1, 2));
        vm.expectCall(address(perp.clearingHouse()), callData);
        (uint256 baseResponse, uint256 quoteResponse) = otcMaker.openPosition(params);

        assertEq(1, baseResponse);
        assertEq(2, quoteResponse);

        vm.stopPrank();
    }

    function _getOpenPositionParams() internal returns (IClearingHouse.OpenPositionParams memory) {
        return
            IClearingHouse.OpenPositionParams(
                address(perp.baseToken()),
                true,
                true,
                1,
                0,
                block.timestamp,
                0,
                bytes32("")
            );
    }
}
