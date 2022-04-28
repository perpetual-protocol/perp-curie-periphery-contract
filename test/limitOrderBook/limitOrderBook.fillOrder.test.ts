import { FakeContract } from "@defi-wonderland/smock"
import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    ClearingHouseConfig,
    DelegateApproval,
    Exchange,
    LimitOrderBook,
    MarketRegistry,
    OrderBook,
    QuoteToken,
    TestAccountBalance,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { initAndAddPool } from "../helper/marketHelper"
import { getMaxTickRange, priceToTick } from "../helper/number"
import { mintAndDeposit, withdraw } from "../helper/token"
import { forwardTimestamp } from "../shared/time"
import { encodePriceSqrt, syncIndexToMarketPrice } from "../shared/utilities"
import { createLimitOrderFixture, LimitOrderFixture } from "./fixtures"
import { getOrderHash, getSignature } from "./orderUtils"

describe.only("LimitOrderBook fillOrder", function () {
    const [admin, trader, keeper, maker, alice] = waffle.provider.getWallets()
    let fixture: LimitOrderFixture
    let limitOrderBook: LimitOrderBook
    let clearingHouse: TestClearingHouse
    let delegateApproval: DelegateApproval
    let marketRegistry: MarketRegistry
    let clearingHouseConfig: ClearingHouseConfig
    let exchange: Exchange
    let orderBook: OrderBook
    let accountBalance: TestAccountBalance
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let baseToken2: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let pool2: UniswapV3Pool
    let mockedBaseAggregator: FakeContract<TestAggregatorV3>
    let mockedBaseAggregator2: FakeContract<TestAggregatorV3>
    let collateralDecimals: number

    const fakeSignature = "0x0000000000000000000000000000000000000000000000000000000000000000"

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        limitOrderBook = fixture.limitOrderBook
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        delegateApproval = fixture.delegateApproval

        orderBook = fixture.orderBook
        accountBalance = fixture.accountBalance as TestAccountBalance
        clearingHouseConfig = fixture.clearingHouseConfig
        vault = fixture.vault
        exchange = fixture.exchange
        marketRegistry = fixture.marketRegistry
        collateral = fixture.USDC
        baseToken = fixture.baseToken
        baseToken2 = fixture.baseToken2
        quoteToken = fixture.quoteToken
        mockedBaseAggregator = fixture.mockedBaseAggregator
        mockedBaseAggregator2 = fixture.mockedBaseAggregator2
        pool = fixture.pool
        pool2 = fixture.pool2
        collateralDecimals = await collateral.decimals()

        const pool1LowerTick: number = priceToTick(2000, await pool.tickSpacing())
        const pool1UpperTick: number = priceToTick(4000, await pool.tickSpacing())
        delegateApproval = fixture.delegateApproval
        limitOrderBook = fixture.limitOrderBook

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

        // prepare collateral for taker
        await mintAndDeposit(fixture, trader, 1000)

        await delegateApproval.connect(trader).approve([
            {
                delegate: limitOrderBook.address,
                action: fixture.clearingHouseOpenPositionAction,
            },
        ])
    })

    it("fill order successfully", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            reduceOnly: false,
        }

        // sign limit order
        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)
        await expect(await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature))
            .to.emit(limitOrderBook, "LimitOrderFilled")
            .withArgs(trader.address, baseToken.address, orderHash, keeper.address, 0)

        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(parseEther("0.1"))
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
            parseEther("-300"),
        )
    })

    it("force error, when order is already filled", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300"),
            oppositeAmountBound: parseEther("0.1"),
            deadline: ethers.constants.MaxUint256,
            reduceOnly: false,
        }

        // sign limit order
        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature)).to.emit(
            clearingHouse,
            "PositionChanged",
        )
        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(parseEther("0.1"))
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
            parseEther("-300"),
        )

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature)).to.revertedWith("LOB_OIFA")
    })

    it("force error, when order is already cancelled", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300"),
            oppositeAmountBound: parseEther("0.1"),
            deadline: ethers.constants.MaxUint256,
            reduceOnly: false,
        }

        // sign limit order
        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(await limitOrderBook.connect(trader).cancelLimitOrder(limitOrder)).to.emit(
            limitOrderBook,
            "LimitOrderCancelled",
        )

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature)).to.revertedWith("LOB_OIC")
    })

    describe("fillOrder with reduceOnly = true", () => {
        beforeEach(async () => {
            // long 0.1 ETH at $3000 with $300
            await clearingHouse.connect(trader).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: parseEther("300"),
                sqrtPriceLimitX96: 0,
                oppositeAmountBound: parseEther("0.1"),
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        })

        it("fill order successfully", async () => {
            // short 0.05 ETH at $2800 with $150
            const limitOrder = {
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: parseEther("0.05").toString(),
                oppositeAmountBound: parseEther("140").toString(),
                deadline: ethers.constants.MaxUint256.toString(),
                reduceOnly: true,
            }

            // sign limit order
            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            await expect(await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature))
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(trader.address, baseToken.address, orderHash, keeper.address, 0)

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(
                parseEther("0.05"),
            )

            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.gte(
                parseEther("-160"),
            )
        })

        it("force error, when order does not satisfy reduceOnly, create another long position", async () => {
            // long 0.1 ETH at $3000 with $300
            const limitOrder = {
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: parseEther("300"),
                oppositeAmountBound: parseEther("0.1"),
                deadline: ethers.constants.MaxUint256,
                reduceOnly: true,
            }

            // sign limit order
            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature)).to.be.revertedWith(
                "LOB_TINR",
            )
        })

        it("force error, when order does not satisfy reduceOnly, create a reverse position", async () => {
            // short 0.2 ETH at $2800 with $560
            const limitOrder = {
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: parseEther("0.2").toString(),
                oppositeAmountBound: parseEther("560").toString(),
                deadline: ethers.constants.MaxUint256.toString(),
                reduceOnly: true,
            }

            // sign limit order
            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature)).to.be.revertedWith(
                "LOB_TINR",
            )
        })
    })

    it("cancel order successfully", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300"),
            oppositeAmountBound: parseEther("0.1"),
            deadline: ethers.constants.MaxUint256,
            reduceOnly: false,
        }

        await expect(await limitOrderBook.connect(trader).cancelLimitOrder(limitOrder)).to.emit(
            limitOrderBook,
            "LimitOrderCancelled",
        )
    })

    it("force error, cancel order with different trader", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            salt: 1,
            trader: keeper.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300"),
            oppositeAmountBound: parseEther("0.1"),
            deadline: ethers.constants.MaxUint256,
            reduceOnly: false,
        }

        await expect(limitOrderBook.connect(trader).cancelLimitOrder(limitOrder)).to.be.revertedWith("LOB_OSMBS")
    })

    // TODO: test deadline, check ClearingHouse.addLiquidity L104
    // need to define the upperbound of deadline with BE and FE
    describe("expiration", () => {
        it("limit order is not expired yet", async () => {
            const now = (await waffle.provider.getBlock("latest")).timestamp
            // long 0.1 ETH at $3000 with $300
            const limitOrder = {
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: parseEther("300").toString(),
                oppositeAmountBound: parseEther("0.1").toString(),
                deadline: now + 1000,
                reduceOnly: false,
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            await expect(await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature))
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(trader.address, baseToken.address, orderHash, keeper.address, 0)

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(
                parseEther("0.1"),
            )
            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.gte(
                parseEther("-300"),
            )
        })

        it("force error, limit order is already expired", async () => {
            const now = (await waffle.provider.getBlock("latest")).timestamp
            await clearingHouse.setBlockTimestamp(now)
            // long 0.1 ETH at $3000 with $300
            const limitOrder = {
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: parseEther("300"),
                oppositeAmountBound: parseEther("0.1"),
                deadline: now + 1,
                reduceOnly: false,
            }
            await forwardTimestamp(clearingHouse, 10)
            const signature = await getSignature(fixture, limitOrder, trader)
            await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature)).to.be.revertedWith(
                "CH_TE",
            )
        })
    })

    it("force error, user's balance is not enough when fill limit order ", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(),
            deadline: ethers.constants.MaxUint256,
            reduceOnly: false,
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await withdraw(trader, vault, 1000, fixture.USDC)

        await expect(await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature)).to.be.revertedWith(
            "CH_NEFCI",
        )
    })

    it("force error, fill order failed after user revoke his/her approval", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(),
            deadline: ethers.constants.MaxUint256,
            reduceOnly: false,
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await delegateApproval.connect(trader).revoke([
            {
                delegate: limitOrderBook.address,
                action: fixture.clearingHouseOpenPositionAction,
            },
        ])

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature)).to.be.revertedWith(
            "CH_OHNAOPT",
        )
    })

    // TODO: integration test, at first fillOrder cannot be successful because of the price is not good enough
    // after a few trades, fillOrder could succeed.
    it("keeper keep trying to fill limit orders in a row", async () => {
   
    })

    // TODO: test isBaseToQuote, isExactInput params
    it("", async () => {})
})
