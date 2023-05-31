// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { ILimitOrderBook } from "../../../contracts/interface/ILimitOrderBook.sol";
import { LimitOrderBookSetup } from "./helper/LimitOrderBookSetup.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";

contract LimitOrderBookFillLimitOrderTest is LimitOrderBookSetup {
    using PerpSafeCast for int256;
    event LimitOrderFilled(
        address indexed trader,
        address indexed baseToken,
        bytes32 orderHash,
        uint8 orderType,
        address keeper,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional,
        uint256 fee
    );

    function test_success_fill_limit_order() public {
        _prepareMarket();

        uint256 toppedUpAmount = 100000 * 10**perp.usdcDecimals();
        _depositToPerp(alice, toppedUpAmount);

        ILimitOrderBook.LimitOrder memory limitOrderParams = _generateLimitOrderParams(
            ILimitOrderBook.OrderType.OtcMakerOrder,
            alice,
            address(perp.baseToken()),
            false,
            false,
            1e18
        );
        bytes memory signature = _signLimitOrderParams(alicePrivateKey, limitOrderParams);

        bytes32 orderHash = perp.limitOrderBook().getOrderHash(limitOrderParams);
        vm.expectEmit(true, true, false, true);
        emit LimitOrderFilled(
            alice,
            address(perp.baseToken()),
            orderHash,
            3,
            alice,
            1e18,
            -1000194805226376838506,
            10102977830569463016
        );

        vm.startPrank(alice);
        perp.limitOrderBook().fillLimitOrder(limitOrderParams, signature, 0);
        vm.stopPrank();

        assertApproxEqAbs(
            perp.accountBalance().getTakerPositionSize(alice, address(perp.baseToken())).toUint256(),
            1e18,
            0
        );
    }

    function _generateLimitOrderParams(
        ILimitOrderBook.OrderType orderType,
        address trader,
        address baseToken,
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount
    ) internal pure returns (ILimitOrderBook.LimitOrder memory) {
        // amount => The input amount if isExactInput is true, otherwise the output amount
        return
            ILimitOrderBook.LimitOrder(
                orderType,
                1,
                trader,
                baseToken,
                isBaseToQuote,
                isExactInput,
                amount,
                0,
                uint256(-1),
                0,
                "",
                false,
                0,
                0
            );
    }

    function _signLimitOrderParams(uint256 pk, ILimitOrderBook.LimitOrder memory limitOrderParams)
        internal
        returns (bytes memory)
    {
        // prepare signed data
        bytes32 digest = perp.limitOrderBook().getOrderHash(limitOrderParams);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
