// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";

import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";

contract OtcMakerOpenPositionTest is OtcMakerSetup {
    function test_success_openPosition() public prepareOwner(0) {
        IClearingHouse.OpenPositionParams memory params = IClearingHouse.OpenPositionParams(
            address(perp.baseToken()),
            true,
            true,
            1,
            0,
            block.timestamp,
            0,
            bytes32("")
        );
        bytes memory callData = abi.encodeWithSelector(IClearingHouse.openPosition.selector, params);
        vm.mockCall(address(perp.clearingHouse()), callData, abi.encode(1, 2));

        vm.expectCall(address(perp.clearingHouse()), callData);
        (uint256 baseResponse, uint256 quoteResponse) = otcMaker.openPosition(params);
        assertEq(1, baseResponse);
        assertEq(2, quoteResponse);
    }
}
