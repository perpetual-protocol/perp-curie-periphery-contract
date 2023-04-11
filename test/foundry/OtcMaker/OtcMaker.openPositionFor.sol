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

        bytes32 digest = perp.limitOrderBook().getOrderHash(limitOrderParams);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePrivateKey, digest);

        uint256 toppedUpAmount = 100000 * 10**perp.usdcDecimals();
        _topUpUsdc(otcMakerOwner, toppedUpAmount);
        _topUpUsdc(alice, toppedUpAmount);

        vm.startPrank(otcMakerOwner);
        usdc.approve(address(otcMaker), type(uint256).max);
        otcMaker.deposit(address(usdc), toppedUpAmount);
        vm.stopPrank();

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

        (uint160 sqrtPriceX96, int24 tick, , , , , ) = perp.pool().slot0();
        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            initialSqrtPriceX96,
            TickMath.getSqrtRatioAtTick(69060),
            TickMath.getSqrtRatioAtTick(69120),
            liquidity
        );

        vm.prank(otcMakerCaller);
        otcMaker.openPositionFor(
            limitOrderParams,
            IOtcMakerStruct.JitLiquidityParams(amount0, amount1, 69060, 69120),
            abi.encodePacked(r, s, bytes1(0x1c)) // copied from `ether.js`'s `joinSignature`
        );

        assertApproxEqAbs(
            (perp.accountBalance().getTakerPositionSize(address(otcMaker), address(perp.baseToken())) * -1).toUint256(),
            perp.accountBalance().getTakerPositionSize(address(alice), address(perp.baseToken())).toUint256(),
            1
        );
    }

    function test_openPositionFor_margin_is_not_enough() public {}
}
