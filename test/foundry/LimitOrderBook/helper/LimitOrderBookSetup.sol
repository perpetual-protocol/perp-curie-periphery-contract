// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";

import { LiquidityAmounts } from "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import { IDelegateApproval } from "@perp/curie-contract/contracts/interface/IDelegateApproval.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { PerpSetup } from "../../helper/perp/PerpSetup.sol";
import { TestERC20 } from "../../../../contracts/test/TestERC20.sol";
import { TestLimitOrderBook } from "../../../../contracts/test/TestLimitOrderBook.sol";
import { TickMath } from "@uniswap/v3-core/contracts/libraries/TickMath.sol";

contract LimitOrderBookSetup is Test {
    address public alice;
    uint256 public alicePrivateKey;
    PerpSetup public perp;
    TestERC20 public usdc;

    function setUp() public virtual {
        (alice, alicePrivateKey) = makeAddrAndKey("alice");
        perp = new PerpSetup();
        perp.setUp();
        usdc = perp.usdc();

        vm.mockCall(
            address(0),
            abi.encodeWithSelector(
                IDelegateApproval.canOpenPositionFor.selector,
                alice,
                address(perp.limitOrderBook())
            ),
            abi.encode(true)
        );
    }

    function _topUpUsdc(address to, uint256 amount) internal {
        deal(address(usdc), to, amount);
    }

    function _depositToPerp(address fromAddress, uint256 amount) internal {
        _topUpUsdc(fromAddress, amount);

        vm.startPrank(fromAddress);
        usdc.approve(address(perp.vault()), type(uint256).max);
        perp.vault().deposit(address(usdc), amount);
        vm.stopPrank();
    }

    function _prepareMarket() internal {
        // initialSqrtPriceX96 ~= $1000
        uint160 initialSqrtPriceX96 = 2505414483750479311864222358486;

        // current tick: 69081
        perp.prepareMarket(
            initialSqrtPriceX96,
            1000 * 1e8 // priceFeed decimals is 8
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

        uint256 toppedUpAmount = 100000 * 10**perp.usdcDecimals();
        _depositToPerp(perp.maker(), toppedUpAmount);

        vm.startPrank(perp.maker());
        perp.clearingHouse().addLiquidity(
            IClearingHouse.AddLiquidityParams({
                baseToken: address(perp.baseToken()),
                base: amount0,
                quote: amount1,
                lowerTick: 69060,
                upperTick: 69120,
                minBase: 0,
                minQuote: 0,
                useTakerBalance: false,
                deadline: block.timestamp
            })
        );
        vm.stopPrank();
    }
}
