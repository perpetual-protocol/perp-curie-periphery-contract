// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";

contract OtcMakerDepositTest is OtcMakerSetup {
    function test_success_obtain_signer() public {
        // uint256 privateKey = 1;
        // address trader = vm.addr(privateKey);
        // address baseToken = address(0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6);
        // ILimitOrderBook.LimitOrder memory limitOrder = ILimitOrderBook.LimitOrder({
        //     orderType: ILimitOrderBook.OrderType.LimitOrder,
        //     salt: uint256(1),
        //     trader: trader,
        //     baseToken: baseToken,
        //     isBaseToQuote: false,
        //     isExactInput: true,
        //     amount: 3000e18,
        //     oppositeAmountBound: 1e18,
        //     deadline: type(uint256).max,
        //     sqrtPriceLimitX96: 0,
        //     referralCode: bytes32(0x00),
        //     reduceOnly: false,
        //     roundIdWhenCreated: uint80(0),
        //     triggerPrice: uint256(0)
        // });
        // bytes32 hash1 = limitOrderBook.getOrderHash(limitOrder);
        // (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, hash1);
        // address signer = limitOrderBook.verifySigner(limitOrder, abi.encodePacked(r, s, v));
        // assertEq(signer, trader);
    }
}
