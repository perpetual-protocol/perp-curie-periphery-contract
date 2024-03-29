import { FakeContract } from "@defi-wonderland/smock"
import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { BigNumber } from "ethers"
import { parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    DelegateApproval,
    Exchange,
    LimitOrderRewardVault,
    PriceFeedDispatcher,
    QuoteToken,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    TestLimitOrderBook,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { initMarket } from "../helper/marketHelper"
import { priceToTick } from "../helper/number"
import { mintAndDeposit } from "../helper/token"
import { getRealTimestamp } from "../shared/time"
import { syncIndexToMarketPrice } from "../shared/utilities"
import { createLimitOrderFixture, LimitOrderFixture } from "./fixtures"
import { getOrderHash, getSignature, OrderType } from "./orderUtils"

function computeRoundId(phaseId: number, aggregatorRoundId: number): string {
    const roundId = (BigInt(phaseId) << BigInt("64")) | BigInt(aggregatorRoundId)
    return roundId.toString()
}

async function setRoundData(
    mockedAggregator: FakeContract<TestAggregatorV3>,
    roundId: string,
    price: string,
    timestamp: number,
): Promise<void> {
    const priceFeedDecimals = await mockedAggregator.decimals()
    await (
        await mockedAggregator.setRoundData(
            roundId,
            parseUnits(price, priceFeedDecimals),
            BigNumber.from(timestamp),
            BigNumber.from(timestamp),
            roundId,
        )
    ).wait()
}

describe("LimitOrderBook fillLimitOrder advanced order types", function () {
    const [admin, trader, keeper, maker, alice] = waffle.provider.getWallets()
    let fixture: LimitOrderFixture
    let clearingHouse: TestClearingHouse
    let accountBalance: AccountBalance
    let exchange: Exchange
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedPriceFeedDispatcher: FakeContract<PriceFeedDispatcher>
    let mockedAggregator: FakeContract<TestAggregatorV3>
    let delegateApproval: DelegateApproval
    let limitOrderBook: TestLimitOrderBook
    let limitOrderRewardVault: LimitOrderRewardVault
    let rewardToken: TestERC20
    let priceFeedDecimals: number
    let currentTime: number

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        accountBalance = fixture.accountBalance
        exchange = fixture.exchange
        vault = fixture.vault
        collateral = fixture.USDC
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        mockedPriceFeedDispatcher = fixture.mockedPriceFeedDispatcher
        mockedAggregator = fixture.mockedAggregator
        pool = fixture.pool
        delegateApproval = fixture.delegateApproval
        limitOrderBook = fixture.limitOrderBook
        limitOrderRewardVault = fixture.limitOrderRewardVault
        rewardToken = fixture.rewardToken
        priceFeedDecimals = await mockedPriceFeedDispatcher.decimals()

        const pool1LowerTick: number = priceToTick(2000, await pool.tickSpacing())
        const pool1UpperTick: number = priceToTick(4000, await pool.tickSpacing())

        const initPrice = "2960"
        await initMarket(fixture, initPrice)

        await syncIndexToMarketPrice(mockedPriceFeedDispatcher, pool)

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

        currentTime = await getRealTimestamp()
        await setRoundData(mockedAggregator, computeRoundId(1, 1), "2700", currentTime)
        await setRoundData(mockedAggregator, computeRoundId(1, 2), "2800", currentTime + 15 * 1)
        await setRoundData(mockedAggregator, computeRoundId(1, 3), "2900", currentTime + 15 * 2)
        await setRoundData(mockedAggregator, computeRoundId(1, 4), "3000", currentTime + 15 * 3)
        await setRoundData(mockedAggregator, computeRoundId(2, 1), "3100", currentTime + 15 * 4)
        await setRoundData(mockedAggregator, computeRoundId(2, 2), "3200", currentTime + 15 * 5)
        await setRoundData(mockedAggregator, computeRoundId(2, 3), "3300", currentTime + 15 * 6)
    })

    describe("verify trigger price", async () => {
        it("force error, missing roundIdWhenCreated", async () => {
            const stopLossLimitOrder = {
                orderType: OrderType.StopLossLimitOrder,
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
                triggerPrice: "0",
            }

            const signature = await getSignature(fixture, stopLossLimitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLossLimitOrder, signature, computeRoundId(1, 1)),
            ).to.revertedWith("LOB_IRI")
        })

        it("force error, roundIdWhenTriggered is earlier than roundIdWhenCreated", async () => {
            const stopLossLimitOrder = {
                orderType: OrderType.StopLossLimitOrder,
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
                roundIdWhenCreated: computeRoundId(1, 2),
                triggerPrice: "0",
            }

            const signature = await getSignature(fixture, stopLossLimitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLossLimitOrder, signature, computeRoundId(1, 1)),
            ).to.revertedWith("LOB_IRI")
        })

        it("force error, triggerPrice is 0", async () => {
            const stopLossLimitOrder = {
                orderType: OrderType.StopLossLimitOrder,
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
                roundIdWhenCreated: computeRoundId(1, 1),
                triggerPrice: "0",
            }

            const signature = await getSignature(fixture, stopLossLimitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLossLimitOrder, signature, computeRoundId(1, 2)),
            ).to.revertedWith("LOB_ITP")
        })

        it("force error, baseToken isn't using ChainlinkPriceFeed", async () => {
            // baseToken3 is using BandPriceFeed which doesn't have getRoundData()
            const stopLossLimitOrder = {
                orderType: OrderType.StopLossLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: fixture.baseToken3.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: parseEther("0.1").toString(),
                oppositeAmountBound: parseEther("300").toString(),
                deadline: ethers.constants.MaxUint256.toString(),
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: false,
                roundIdWhenCreated: computeRoundId(1, 1),
                triggerPrice: parseEther("2900").toString(),
            }

            const signature = await getSignature(fixture, stopLossLimitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLossLimitOrder, signature, computeRoundId(1, 2)),
            ).to.revertedWith("function selector was not recognized and there's no fallback function")
        })

        it("roundIdWhenCreated = roundIdWhenTriggered", async () => {
            const roundIdWhenCreated = computeRoundId(1, 4) // 3000
            const roundIdWhenTriggered = roundIdWhenCreated

            // a limit order to long exact 0.1 ETH for a maximum of $300 at limit price $3000
            // fill price is guaranteed to be <= limit price
            const triggerPrice = parseEther("2900")
            const stopLossLimitOrder = {
                orderType: OrderType.StopLossLimitOrder,
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
                roundIdWhenCreated: roundIdWhenCreated,
                triggerPrice: triggerPrice.toString(),
            }

            const signature = await getSignature(fixture, stopLossLimitOrder, trader)
            const orderHash = await getOrderHash(fixture, stopLossLimitOrder)

            const triggeredPrice = await limitOrderBook.getPriceByRoundId(baseToken.address, roundIdWhenTriggered)
            expect(triggeredPrice).to.be.gte(triggerPrice)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLossLimitOrder, signature, roundIdWhenTriggered),
            )
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(
                    trader.address,
                    baseToken.address,
                    orderHash,
                    stopLossLimitOrder.orderType,
                    keeper.address,
                    parseEther("0.1"), // exchangedPositionSize
                    parseEther("-296.001564233989843681"), // exchangedPositionNotional
                    parseEther("2.989914790242321654"), // fee
                )
        })
    })

    describe("stop limit order", async () => {
        it("fill stop limit order: Q2B (long) exact output", async () => {
            // a limit order to long exact 0.1 ETH for a maximum of $300 at limit price $3000
            // fill price is guaranteed to be <= limit price
            const triggerPrice = parseEther("2900")
            const stopLossLimitOrder = {
                orderType: OrderType.StopLossLimitOrder,
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
                roundIdWhenCreated: computeRoundId(1, 1),
                triggerPrice: triggerPrice.toString(),
            }

            const signature = await getSignature(fixture, stopLossLimitOrder, trader)
            const orderHash = await getOrderHash(fixture, stopLossLimitOrder)

            const roundIdWhenTriggered = computeRoundId(1, 4) // 3000
            const triggeredPrice = await limitOrderBook.getPriceByRoundId(baseToken.address, roundIdWhenTriggered)
            expect(triggeredPrice).to.be.gte(triggerPrice)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLossLimitOrder, signature, roundIdWhenTriggered),
            )
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(
                    trader.address,
                    baseToken.address,
                    orderHash,
                    stopLossLimitOrder.orderType,
                    keeper.address,
                    parseEther("0.1"), // exchangedPositionSize
                    parseEther("-296.001564233989843681"), // exchangedPositionNotional
                    parseEther("2.989914790242321654"), // fee
                )

            // trigger price is not matched
            const stopLossLimitOrder2 = {
                ...stopLossLimitOrder,
                salt: 2,
            }
            const signature2 = await getSignature(fixture, stopLossLimitOrder2, trader)

            const roundIdWhenTriggered2 = computeRoundId(1, 2) // 2800
            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLossLimitOrder2, signature2, roundIdWhenTriggered2),
            ).to.revertedWith("LOB_BSLOTPNM")
        })

        it("fill stop limit order: B2Q (short) exact input", async () => {
            // a limit order to short exact 0.1 ETH for a minimum of $290 at limit price $2900
            // fill price is guaranteed to be >= limit price
            const triggerPrice = parseEther("3000")
            const stopLossLimitOrder = {
                orderType: OrderType.StopLossLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: parseEther("0.1").toString(),
                oppositeAmountBound: parseEther("290").toString(), // lower bound of output quote
                deadline: ethers.constants.MaxUint256.toString(),
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: false,
                roundIdWhenCreated: computeRoundId(1, 1),
                triggerPrice: triggerPrice.toString(),
            }

            const signature = await getSignature(fixture, stopLossLimitOrder, trader)
            const orderHash = await getOrderHash(fixture, stopLossLimitOrder)

            const roundIdWhenTriggered = computeRoundId(1, 3) // 2900
            const triggeredPrice = await limitOrderBook.getPriceByRoundId(baseToken.address, roundIdWhenTriggered)
            expect(triggeredPrice).to.be.lte(triggerPrice)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLossLimitOrder, signature, roundIdWhenTriggered),
            )
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(
                    trader.address,
                    baseToken.address,
                    orderHash,
                    stopLossLimitOrder.orderType,
                    keeper.address,
                    parseEther("-0.1"), // exchangedPositionSize
                    parseEther("295.998435782542603038"), // exchangedPositionNotional
                    parseEther("2.959984357825426031"), // fee
                )

            // trigger price is not matched
            const stopLossLimitOrder2 = {
                ...stopLossLimitOrder,
                salt: 2,
            }
            const signature2 = await getSignature(fixture, stopLossLimitOrder2, trader)

            const roundIdWhenTriggered2 = computeRoundId(2, 1) // 3100
            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLossLimitOrder2, signature2, roundIdWhenTriggered2),
            ).to.revertedWith("LOB_SSLOTPNM")
        })
    })

    describe("take profit limit order", async () => {
        it("fill take profit limit order: Q2B (long) exact output", async () => {
            // a limit order to long exact 0.1 ETH for a maximum of $300 at limit price $3000
            // fill price is guaranteed to be <= limit price
            const triggerPrice = parseEther("2900")
            const takeProfitLimitOrder = {
                orderType: OrderType.TakeProfitLimitOrder,
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
                roundIdWhenCreated: computeRoundId(1, 1),
                triggerPrice: triggerPrice.toString(),
            }

            const signature = await getSignature(fixture, takeProfitLimitOrder, trader)
            const orderHash = await getOrderHash(fixture, takeProfitLimitOrder)

            const roundIdWhenTriggered = computeRoundId(1, 2) // 2800
            const triggeredPrice = await limitOrderBook.getPriceByRoundId(baseToken.address, roundIdWhenTriggered)
            expect(triggeredPrice).to.be.lte(triggerPrice)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(takeProfitLimitOrder, signature, roundIdWhenTriggered),
            )
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(
                    trader.address,
                    baseToken.address,
                    orderHash,
                    takeProfitLimitOrder.orderType,
                    keeper.address,
                    parseEther("0.1"), // exchangedPositionSize
                    parseEther("-296.001564233989843681"), // exchangedPositionNotional
                    parseEther("2.989914790242321654"), // fee
                )

            // trigger price is not matched
            const takeProfitLimitOrder2 = {
                ...takeProfitLimitOrder,
                salt: 2,
            }
            const signature2 = await getSignature(fixture, takeProfitLimitOrder2, trader)

            const roundIdWhenTriggered2 = computeRoundId(1, 4) // 3000
            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(takeProfitLimitOrder2, signature2, roundIdWhenTriggered2),
            ).to.revertedWith("LOB_BTLOTPNM")
        })

        it("fill take profit limit order: B2Q (short) exact input", async () => {
            // a limit order to short exact 0.1 ETH for a minimum of $290 at limit price $2900
            // fill price is guaranteed to be >= limit price
            const triggerPrice = parseEther("3000")
            const takeProfitLimitOrder = {
                orderType: OrderType.TakeProfitLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: parseEther("0.1").toString(),
                oppositeAmountBound: parseEther("290").toString(), // lower bound of output quote
                deadline: ethers.constants.MaxUint256.toString(),
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: false,
                roundIdWhenCreated: computeRoundId(1, 1),
                triggerPrice: triggerPrice.toString(),
            }

            const signature = await getSignature(fixture, takeProfitLimitOrder, trader)
            const orderHash = await getOrderHash(fixture, takeProfitLimitOrder)

            const roundIdWhenTriggered = computeRoundId(2, 1) // 3100
            const triggeredPrice = await limitOrderBook.getPriceByRoundId(baseToken.address, roundIdWhenTriggered)
            expect(triggeredPrice).to.be.gte(triggerPrice)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(takeProfitLimitOrder, signature, roundIdWhenTriggered),
            )
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(
                    trader.address,
                    baseToken.address,
                    orderHash,
                    takeProfitLimitOrder.orderType,
                    keeper.address,
                    parseEther("-0.1"), // exchangedPositionSize
                    parseEther("295.998435782542603038"), // exchangedPositionNotional
                    parseEther("2.959984357825426031"), // fee
                )

            // trigger price is not matched
            const takeProfitLimitOrder2 = {
                ...takeProfitLimitOrder,
                salt: 2,
            }
            const signature2 = await getSignature(fixture, takeProfitLimitOrder2, trader)

            const roundIdWhenTriggered2 = computeRoundId(1, 3) // 2900
            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(takeProfitLimitOrder2, signature2, roundIdWhenTriggered2),
            ).to.revertedWith("LOB_STLOTPNM")
        })
    })
})
