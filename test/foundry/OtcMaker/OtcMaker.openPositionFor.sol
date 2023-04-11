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

contract OtcMakerOpenPositionForTest is OtcMakerSetup, EIP712Upgradeable {
    using PerpSafeCast for int256;

    // NOTE: this test can fail due to foundry's version as getOrderHash() is dependent on contract deployment address
    //       thus, if this test passes locally while fails in CI, reinstall foundry locally (run "foundryup" again) can solve the issue
    function test_openPositionFor() public {
        uint160 initialSqrtPriceX96 = 2505414483750479311864222358486; // ~= $1000
        perp.prepareMarket(
            initialSqrtPriceX96,
            1000 * 1e8 // $1000, and priceFeed decimals is 8
        ); // current tick: 69081
        skip(15);

        // alice spend 1 quoteToken to long baseToken
        // amount => The input amount if isExactInput is true, otherwise the output amount
        ILimitOrderBook.LimitOrder memory limitOrderParams = ILimitOrderBook.LimitOrder(
            ILimitOrderBook.OrderType.LimitOrder,
            1,
            address(alice),
            address(perp.baseToken()),
            false,
            true,
            1 * 1e18,
            0,
            uint256(-1),
            0,
            "",
            false,
            0,
            0
        );

        uint256 toppedUpAmount = 100000 * 10**perp.usdcDecimals();
        _topUpUsdc(otcMakerOwner, toppedUpAmount);
        _topUpUsdc(alice, toppedUpAmount);

        // otcMaker deposit to PERP vault
        vm.startPrank(otcMakerOwner);
        usdc.approve(address(otcMaker), type(uint256).max);
        otcMaker.deposit(address(usdc), toppedUpAmount);
        vm.stopPrank();

        // alice deposit to PERP vault
        vm.startPrank(alice);
        usdc.approve(address(perp.vault()), type(uint256).max);
        perp.vault().deposit(address(usdc), toppedUpAmount);
        vm.stopPrank();

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

        // prepare signed data
        bytes32 digest = perp.limitOrderBook().getOrderHash(limitOrderParams);
        (, bytes32 r, bytes32 s) = vm.sign(alicePrivateKey, digest);

        vm.prank(otcMakerCaller);
        otcMaker.openPositionFor(
            limitOrderParams,
            IOtcMakerStruct.JitLiquidityParams(amount0, amount1, 69060, 69120),
            abi.encodePacked(r, s, bytes1(0x1c)) // copied from `ether.js`'s `joinSignature`
        );

        // expect alice to long position, our otcMaker should hold short position
        assertApproxEqAbs(
            (perp.accountBalance().getTakerPositionSize(address(otcMaker), address(perp.baseToken())) * -1).toUint256(),
            perp.accountBalance().getTakerPositionSize(address(alice), address(perp.baseToken())).toUint256(),
            1
        );
    }

    function test_openPositionFor_margin_is_not_enough() public {
        uint160 initialSqrtPriceX96 = 2505414483750479311864222358486; // ~= $1000
        perp.prepareMarket(
            initialSqrtPriceX96,
            1000 * 1e8 // $1000, and priceFeed decimals is 8
        ); // current tick: 69081
        skip(15);

        // alice spend 1 quoteToken to long baseToken
        // amount => The input amount if isExactInput is true, otherwise the output amount
        ILimitOrderBook.LimitOrder memory limitOrderParams = ILimitOrderBook.LimitOrder(
            ILimitOrderBook.OrderType.LimitOrder,
            1,
            address(alice),
            address(perp.baseToken()),
            false,
            true,
            1 * 1e18,
            0,
            uint256(-1),
            0,
            "",
            false,
            0,
            0
        );

        uint256 toppedUpAmount = 100000 * 10**perp.usdcDecimals();
        _topUpUsdc(otcMakerOwner, toppedUpAmount);
        _topUpUsdc(alice, toppedUpAmount);

        // otcMaker deposit to PERP vault
        vm.startPrank(otcMakerOwner);
        usdc.approve(address(otcMaker), type(uint256).max);
        otcMaker.deposit(address(usdc), toppedUpAmount);
        vm.stopPrank();

        // alice deposit to PERP vault
        vm.startPrank(alice);
        usdc.approve(address(perp.vault()), type(uint256).max);
        perp.vault().deposit(address(usdc), toppedUpAmount);
        vm.stopPrank();

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

        // prepare signed data
        bytes32 digest = perp.limitOrderBook().getOrderHash(limitOrderParams);
        (, bytes32 r, bytes32 s) = vm.sign(alicePrivateKey, digest);

        vm.mockCall(
            address(perp.clearingHouse()),
            abi.encodeWithSelector(IClearingHouse.getAccountValue.selector, address(otcMaker)),
            abi.encode(1)
        );

        vm.expectRevert(bytes("OM_IM"));
        vm.prank(otcMakerCaller);
        otcMaker.openPositionFor(
            limitOrderParams,
            IOtcMakerStruct.JitLiquidityParams(amount0, amount1, 69060, 69120),
            abi.encodePacked(r, s, bytes1(0x1c)) // copied from `ether.js`'s `joinSignature`
        );
    }

    function test_openPositionFor_order_type_is_not_limit_order() public {
        uint160 initialSqrtPriceX96 = 2505414483750479311864222358486; // ~= $1000
        perp.prepareMarket(
            initialSqrtPriceX96,
            1000 * 1e8 // $1000, and priceFeed decimals is 8
        ); // current tick: 69081
        skip(15);

        // alice spend 1 quoteToken to long baseToken
        // amount => The input amount if isExactInput is true, otherwise the output amount
        ILimitOrderBook.LimitOrder memory limitOrderParams = ILimitOrderBook.LimitOrder(
            ILimitOrderBook.OrderType.StopLossLimitOrder,
            1,
            address(alice),
            address(perp.baseToken()),
            false,
            true,
            1 * 1e18,
            0,
            uint256(-1),
            0,
            "",
            false,
            0,
            0
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

        // prepare signed data
        bytes32 digest = perp.limitOrderBook().getOrderHash(limitOrderParams);
        (, bytes32 r, bytes32 s) = vm.sign(alicePrivateKey, digest);

        vm.expectRevert(bytes("OM_NLO"));
        vm.prank(otcMakerCaller);
        otcMaker.openPositionFor(
            limitOrderParams,
            IOtcMakerStruct.JitLiquidityParams(amount0, amount1, 69060, 69120),
            abi.encodePacked(r, s, bytes1(0x1c)) // copied from `ether.js`'s `joinSignature`
        );
    }
}
