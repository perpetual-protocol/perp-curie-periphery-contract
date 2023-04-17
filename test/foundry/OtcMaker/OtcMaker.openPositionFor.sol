// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/drafts/EIP712Upgradeable.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import { LiquidityAmounts } from "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import { TickMath } from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";
import { ILimitOrderBook } from "../../../contracts/interface/ILimitOrderBook.sol";
import { IOtcMakerStruct } from "../../../contracts/interface/IOtcMakerStruct.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";

// This test can fail due to foundry's version,
// since "getOrderHash()" is dependent on contract deployment address,
// if so, try re-install foundry locally by run "foundryup" to solve the issue.
contract OtcMakerOpenPositionForTest is OtcMakerSetup, EIP712Upgradeable {
    using PerpSafeCast for int256;

    function test_openPositionFor() public {
        // initialSqrtPriceX96 ~= $1000
        uint160 initialSqrtPriceX96 = 2505414483750479311864222358486;

        // current tick: 69081
        perp.prepareMarket(
            initialSqrtPriceX96,
            1000 * 1e8 // priceFeed decimals is 8
        );

        ILimitOrderBook.LimitOrder memory limitOrderParams = _generateLimitOrderParams(
            ILimitOrderBook.OrderType.LimitOrder,
            alice,
            address(perp.baseToken()),
            false,
            true,
            1e18
        );

        uint256 toppedUpAmount = 100000 * 10 ** perp.usdcDecimals();
        _depositToPerpFromOtcMaker(toppedUpAmount);
        _depositToPerpFromAlice(toppedUpAmount);

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            initialSqrtPriceX96,
            TickMath.getSqrtRatioAtTick(69060),
            TickMath.getSqrtRatioAtTick(69120),
            10 * 1e18,
            10000 * 1e18
        );

        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            initialSqrtPriceX96,
            TickMath.getSqrtRatioAtTick(69060),
            TickMath.getSqrtRatioAtTick(69120),
            liquidity
        );

        bytes memory signature = _signLimitOrderParams(alicePrivateKey, limitOrderParams);

        vm.prank(otcMakerCaller);
        otcMaker.openPositionFor(
            limitOrderParams,
            IOtcMakerStruct.JitLiquidityParams(amount0, amount1, 69060, 69120),
            signature
        );

        // expect alice to long position, our otcMaker should hold short position
        assertApproxEqAbs(
            (perp.accountBalance().getTakerPositionSize(address(otcMaker), address(perp.baseToken())) * -1).toUint256(),
            perp.accountBalance().getTakerPositionSize(address(alice), address(perp.baseToken())).toUint256(),
            1
        );
    }

    function test_openPositionFor_margin_is_not_enough() public {
        // initialSqrtPriceX96 ~= $1000
        uint160 initialSqrtPriceX96 = 2505414483750479311864222358486;

        // current tick: 69081
        perp.prepareMarket(
            initialSqrtPriceX96,
            1000 * 1e8 // priceFeed decimals is 8
        );

        ILimitOrderBook.LimitOrder memory limitOrderParams = _generateLimitOrderParams(
            ILimitOrderBook.OrderType.LimitOrder,
            alice,
            address(perp.baseToken()),
            false,
            true,
            1e18
        );

        uint256 toppedUpAmount = 100000 * 10 ** perp.usdcDecimals();
        _depositToPerpFromOtcMaker(toppedUpAmount);
        _depositToPerpFromAlice(toppedUpAmount);

        vm.mockCall(
            address(perp.clearingHouse()),
            abi.encodeWithSelector(IClearingHouse.getAccountValue.selector, address(otcMaker)),
            abi.encode(1)
        );

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            initialSqrtPriceX96,
            TickMath.getSqrtRatioAtTick(69060),
            TickMath.getSqrtRatioAtTick(69120),
            10 * 1e18,
            10000 * 1e18
        );

        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            initialSqrtPriceX96,
            TickMath.getSqrtRatioAtTick(69060),
            TickMath.getSqrtRatioAtTick(69120),
            liquidity
        );

        bytes memory signature = _signLimitOrderParams(alicePrivateKey, limitOrderParams);

        vm.expectRevert(bytes("OM_IM"));
        vm.prank(otcMakerCaller);
        otcMaker.openPositionFor(
            limitOrderParams,
            IOtcMakerStruct.JitLiquidityParams(amount0, amount1, 69060, 69120),
            signature
        );
    }

    function test_openPositionFor_order_type_is_not_limit_order() public {
        // initialSqrtPriceX96 ~= $1000
        uint160 initialSqrtPriceX96 = 2505414483750479311864222358486;

        // current tick: 69081
        perp.prepareMarket(
            initialSqrtPriceX96,
            1000 * 1e8 // priceFeed decimals is 8
        );

        ILimitOrderBook.LimitOrder memory limitOrderParams = _generateLimitOrderParams(
            ILimitOrderBook.OrderType.StopLossLimitOrder,
            alice,
            address(perp.baseToken()),
            false,
            true,
            1e18
        );

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            initialSqrtPriceX96,
            TickMath.getSqrtRatioAtTick(69060),
            TickMath.getSqrtRatioAtTick(69120),
            10 * 1e18,
            10000 * 1e18
        );

        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            initialSqrtPriceX96,
            TickMath.getSqrtRatioAtTick(69060),
            TickMath.getSqrtRatioAtTick(69120),
            liquidity
        );

        bytes memory signature = _signLimitOrderParams(alicePrivateKey, limitOrderParams);

        vm.expectRevert(bytes("OM_NLO"));
        vm.prank(otcMakerCaller);
        otcMaker.openPositionFor(
            limitOrderParams,
            IOtcMakerStruct.JitLiquidityParams(amount0, amount1, 69060, 69120),
            signature
        );
    }

    function _depositToPerpFromOtcMaker(uint256 amount) internal {
        _topUpUsdc(otcMakerOwner, amount);

        vm.startPrank(otcMakerOwner);
        usdc.approve(address(otcMaker), type(uint256).max);
        otcMaker.deposit(address(usdc), amount);
        vm.stopPrank();
    }

    function _depositToPerpFromAlice(uint256 amount) internal {
        _topUpUsdc(alice, amount);

        vm.startPrank(alice);
        usdc.approve(address(perp.vault()), type(uint256).max);
        perp.vault().deposit(address(usdc), amount);
        vm.stopPrank();
    }

    function _generateLimitOrderParams(
        ILimitOrderBook.OrderType orderType,
        address trader,
        address baseToken,
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount
    ) internal returns (ILimitOrderBook.LimitOrder memory) {
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

    function _signLimitOrderParams(
        uint256 pk,
        ILimitOrderBook.LimitOrder memory limitOrderParams
    ) internal returns (bytes memory) {
        // prepare signed data
        bytes32 digest = perp.limitOrderBook().getOrderHash(limitOrderParams);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, bytes1(0x1c)); // copied from `ether.js`'s `joinSignature`
    }
}
