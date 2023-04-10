// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";
import { IOtcMaker } from "../../../contracts/interface/IOtcMaker.sol";
import { IOtcMakerStruct } from "../../../contracts/interface/IOtcMakerStruct.sol";

contract OtcMakerSigningTest is OtcMakerSetup {
    function test_success_obtain_signer() public {
        uint256 privateKey = 1;
        address trader = vm.addr(privateKey);
        address baseToken = address(perp.baseToken());

        IOtcMaker.OpenPositionForParams memory openPositionForParams = IOtcMakerStruct.OpenPositionForParams({
            trader: trader,
            baseToken: baseToken,
            isBaseToQuote: false, // long
            isExactInput: true, //
            amount: 3e18, // long 3 eth
            oppositeAmountBound: 1e18,
            deadline: type(uint256).max,
            sqrtPriceLimitX96: 0,
            referralCode: bytes32(0x00)
        });

        bytes32 openPositionForHash = otcMaker.getOpenPositionForHash(openPositionForParams);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, openPositionForHash);
        address signer = otcMaker.obtainSigner(openPositionForParams, abi.encodePacked(r, s, v));

        assertEq(signer, trader);
    }

    function test_failed_signer_is_not_equal_to_param_trader() public {
        uint256 privateKey1 = 1;
        address trader1 = vm.addr(privateKey1);
        address baseToken = address(perp.baseToken());

        IOtcMaker.OpenPositionForParams memory openPositionForParams = IOtcMakerStruct.OpenPositionForParams({
            trader: trader1,
            baseToken: baseToken,
            isBaseToQuote: false, // long
            isExactInput: true, //
            amount: 3e18, // long 3 eth
            oppositeAmountBound: 1e18,
            deadline: type(uint256).max,
            sqrtPriceLimitX96: 0,
            referralCode: bytes32(0x00)
        });

        bytes32 openPositionForHash = otcMaker.getOpenPositionForHash(openPositionForParams);

        uint256 privateKey2 = 2;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey2, openPositionForHash);

        vm.expectRevert(bytes("OM_SINT"));
        address signer = otcMaker.obtainSigner(openPositionForParams, abi.encodePacked(r, s, v));
    }
}
