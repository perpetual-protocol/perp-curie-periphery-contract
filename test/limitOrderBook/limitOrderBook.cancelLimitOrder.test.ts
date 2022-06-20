import { FakeContract } from "@defi-wonderland/smock"
import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    DelegateApproval,
    LimitOrderBook,
    LimitOrderRewardVault,
    QuoteToken,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { initAndAddPool } from "../helper/marketHelper"
import { getMaxTickRange, priceToTick } from "../helper/number"
import { mintAndDeposit } from "../helper/token"
import { encodePriceSqrt, syncIndexToMarketPrice } from "../shared/utilities"
import { createLimitOrderFixture, LimitOrderFixture } from "./fixtures"
import { getOrderHash, getSignature, OrderStatus, OrderType } from "./orderUtils"

describe("LimitOrderBook cancelLimitOrder", function () {
    const [admin, trader, keeper, maker, alice] = waffle.provider.getWallets()
    let fixture: LimitOrderFixture
    let clearingHouse: TestClearingHouse
    let accountBalance: AccountBalance
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedBaseAggregator: FakeContract<TestAggregatorV3>
    let delegateApproval: DelegateApproval
    let limitOrderBook: LimitOrderBook
    let limitOrderRewardVault: LimitOrderRewardVault
    let rewardToken: TestERC20

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        accountBalance = fixture.accountBalance
        vault = fixture.vault
        collateral = fixture.USDC
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        mockedBaseAggregator = fixture.mockedBaseAggregator
        pool = fixture.pool
        delegateApproval = fixture.delegateApproval
        limitOrderBook = fixture.limitOrderBook
        limitOrderRewardVault = fixture.limitOrderRewardVault
        rewardToken = fixture.rewardToken

        const pool1LowerTick: number = priceToTick(2000, await pool.tickSpacing())
        const pool1UpperTick: number = priceToTick(4000, await pool.tickSpacing())

        // ETH
        await initAndAddPool(
            fixture,
            pool,
            baseToken.address,
            encodePriceSqrt("2960", "1"),
            10000, // 1%
            // set maxTickCrossed as maximum tick range of pool by default, that means there is no over price when swap
            getMaxTickRange(),
        )
        await syncIndexToMarketPrice(mockedBaseAggregator, pool)

        // prepare collateral for maker
        await mintAndDeposit(fixture, maker, 1_000_000_000_000)

        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("3000"),
            quote: parseEther("10000000"),
            lowerTick: pool1LowerTick,
            upperTick: pool1UpperTick,
            minBase: 0,
            minQuote: 0,
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })

        // prepare collateral for trader
        await mintAndDeposit(fixture, trader, 1000)

        // trader allows limitOrderBook to open position
        await delegateApproval.connect(trader).approve(limitOrderBook.address, fixture.clearingHouseOpenPositionAction)
    })

    it("cancel order: Q2B exact output", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const orderHash = await getOrderHash(fixture, limitOrder)
        expect(await limitOrderBook.getOrderStatus(orderHash)).to.be.eq(OrderStatus.Unfilled)

        await expect(await limitOrderBook.connect(trader).cancelLimitOrder(limitOrder))
            .to.emit(limitOrderBook, "LimitOrderCancelled")
            .withArgs(
                trader.address,
                baseToken.address,
                orderHash,
                limitOrder.orderType,
                limitOrder.triggerPrice,
                parseEther("0.1"), // positionSize
                parseEther("-300"), // positionNotional
            )

        expect(await limitOrderBook.getOrderStatus(orderHash)).to.be.eq(OrderStatus.Cancelled)
    })

    it("cancel order: B2Q exact input", async () => {
        // short 0.1 ETH with $290 (limit price $2000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: true,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("290").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const orderHash = await getOrderHash(fixture, limitOrder)
        expect(await limitOrderBook.getOrderStatus(orderHash)).to.be.eq(OrderStatus.Unfilled)

        await expect(await limitOrderBook.connect(trader).cancelLimitOrder(limitOrder))
            .to.emit(limitOrderBook, "LimitOrderCancelled")
            .withArgs(
                trader.address,
                baseToken.address,
                orderHash,
                limitOrder.orderType,
                limitOrder.triggerPrice,
                parseEther("-0.1"), // positionSize
                parseEther("290"), // positionNotional
            )

        expect(await limitOrderBook.getOrderStatus(orderHash)).to.be.eq(OrderStatus.Cancelled)
    })

    it("force error, cancel order by the wrong person", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        await expect(limitOrderBook.connect(alice).cancelLimitOrder(limitOrder)).to.be.revertedWith("LOB_OSMBS")
    })

    it("force error, cancel a cancelled order", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        await expect(await limitOrderBook.connect(trader).cancelLimitOrder(limitOrder)).to.emit(
            limitOrderBook,
            "LimitOrderCancelled",
        )

        // order is cancelled, cannot cancel
        await expect(limitOrderBook.connect(trader).cancelLimitOrder(limitOrder)).to.be.revertedWith("LOB_OMBU")
    })

    it("force error, cancel a filled order", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
        await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled")

        // order is filled, cannot cancel
        await expect(limitOrderBook.connect(trader).cancelLimitOrder(limitOrder)).to.be.revertedWith("LOB_OMBU")
    })
})
