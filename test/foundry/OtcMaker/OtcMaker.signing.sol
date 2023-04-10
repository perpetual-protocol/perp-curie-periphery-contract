// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";
import { IOtcMaker } from "../../../contracts/interface/IOtcMaker.sol";

contract OtcMakerSigningTest is OtcMakerSetup {
    function test_success_obtain_signer() public {
        uint256 privateKey = 1;
        address trader = vm.addr(privateKey);
        address baseToken = address(0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6);

        IOtcMaker.OpenPositionParams memory openPositionParams = IOtcMaker.OpenPositionParams({
            baseToken: baseToken,
            isBaseToQuote: false, // long
            isExactInput: true, //
            amount: 3e18, // long 3 eth
            oppositeAmountBound: 1e18,
            deadline: type(uint256).max,
            sqrtPriceLimitX96: 0,
            referralCode: bytes32(0x00)
        });

        bytes32 openPositionHash = otcMaker.getOpenPositionHash(openPositionParams);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, openPositionHash);
        address signer = limitOrderBook.verifySigner(limitOrder, abi.encodePacked(r, s, v));
        assertEq(signer, trader);
    }
}
