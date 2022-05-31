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
    QuoteToken,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    TestLimitOrderBook,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { initAndAddPool } from "../helper/marketHelper"
import { getMaxTickRange, priceToTick } from "../helper/number"
import { mintAndDeposit } from "../helper/token"
import { encodePriceSqrt, syncIndexToMarketPrice } from "../shared/utilities"
import { createLimitOrderFixture, LimitOrderFixture } from "./fixtures"
import { getOrderHash, getSignature } from "./orderUtils"

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
    let mockedBaseAggregator: FakeContract<TestAggregatorV3>
    let delegateApproval: DelegateApproval
    let limitOrderBook: TestLimitOrderBook
    let limitOrderRewardVault: LimitOrderRewardVault
    let rewardToken: TestERC20
    let priceFeedDecimals: number

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        accountBalance = fixture.accountBalance
        exchange = fixture.exchange
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
        priceFeedDecimals = await mockedBaseAggregator.decimals()

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

    describe("verify trigger price", async () => {
        it("force error, missing roundIdWhenCreated", async () => {
            const stopLimitOrder = {
                orderType: fixture.orderTypeStopLimitOrder,
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

            const signature = await getSignature(fixture, stopLimitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLimitOrder, signature, computeRoundId(1, 1)),
            ).to.revertedWith("LOB_IRI")
        })

        it("force error, roundIdWhenTriggered is earlier than roundIdWhenCreated", async () => {
            const stopLimitOrder = {
                orderType: fixture.orderTypeStopLimitOrder,
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

            const signature = await getSignature(fixture, stopLimitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLimitOrder, signature, computeRoundId(1, 1)),
            ).to.revertedWith("LOB_IRI")
        })

        it("force error, triggerPrice is 0", async () => {
            const stopLimitOrder = {
                orderType: fixture.orderTypeStopLimitOrder,
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

            const signature = await getSignature(fixture, stopLimitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLimitOrder, signature, computeRoundId(1, 2)),
            ).to.revertedWith("LOB_ITP")
        })

        // TODO
        it("force error, roundId isn't existed", async () => {})
        it("force error, baseToken isn't using ChainlinkPriceFeed", async () => {})
    })

    describe("stop limit order", async () => {
        let currentTime: number

        beforeEach(async () => {
            currentTime = (await waffle.provider.getBlock("latest")).timestamp

            await setRoundData(mockedBaseAggregator, computeRoundId(1, 1), "2700", currentTime)
            await setRoundData(mockedBaseAggregator, computeRoundId(1, 2), "2800", currentTime + 15 * 1)
            await setRoundData(mockedBaseAggregator, computeRoundId(1, 3), "2900", currentTime + 15 * 2)
            await setRoundData(mockedBaseAggregator, computeRoundId(1, 4), "3000", currentTime + 15 * 3)
            await setRoundData(mockedBaseAggregator, computeRoundId(2, 1), "3100", currentTime + 15 * 4)
            await setRoundData(mockedBaseAggregator, computeRoundId(2, 2), "3200", currentTime + 15 * 5)
            await setRoundData(mockedBaseAggregator, computeRoundId(2, 3), "3300", currentTime + 15 * 6)
        })

        it("fill stop limit order: Q2B (long) exact output", async () => {
            // a limit order to long exact 0.1 ETH for a maximum of $300 at limit price $3000
            // fill price is guaranteed to be <= limit price
            const stopLimitOrder = {
                orderType: fixture.orderTypeStopLimitOrder,
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
                triggerPrice: parseEther("2900").toString(),
            }

            const signature = await getSignature(fixture, stopLimitOrder, trader)
            const orderHash = await getOrderHash(fixture, stopLimitOrder)

            expect(await limitOrderBook.getPriceByRoundId(baseToken.address, computeRoundId(1, 4))).to.be.gte(
                parseEther("2900"),
            )
            await expect(limitOrderBook.connect(keeper).fillLimitOrder(stopLimitOrder, signature, computeRoundId(1, 4)))
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(
                    trader.address,
                    baseToken.address,
                    orderHash,
                    keeper.address,
                    fixture.rewardAmount,
                    parseEther("0.1"), // exchangedPositionSize
                    parseEther("-296.001564233989843681"), // exchangedPositionNotional
                    parseEther("2.989914790242321654"), // fee
                )

            // trigger price is not matched
            const stopLimitOrder2 = {
                ...stopLimitOrder,
                salt: 2,
            }
            const signature2 = await getSignature(fixture, stopLimitOrder2, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLimitOrder2, signature2, computeRoundId(1, 2)),
            ).to.revertedWith("LOB_BSLOTPNM")
        })

        it("fill stop limit order: B2Q (short) exact input", async () => {
            // a limit order to short exact 0.1 ETH for a minimum of $290 at limit price $2900
            // fill price is guaranteed to be >= limit price
            const stopLimitOrder = {
                orderType: fixture.orderTypeStopLimitOrder,
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
                triggerPrice: parseEther("3000").toString(),
            }

            const signature = await getSignature(fixture, stopLimitOrder, trader)
            const orderHash = await getOrderHash(fixture, stopLimitOrder)

            expect(await limitOrderBook.getPriceByRoundId(baseToken.address, computeRoundId(1, 3))).to.be.lte(
                parseEther("3000"),
            )
            await expect(limitOrderBook.connect(keeper).fillLimitOrder(stopLimitOrder, signature, computeRoundId(1, 3)))
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(
                    trader.address,
                    baseToken.address,
                    orderHash,
                    keeper.address,
                    fixture.rewardAmount,
                    parseEther("-0.1"), // exchangedPositionSize
                    parseEther("295.998435782542603038"), // exchangedPositionNotional
                    parseEther("2.959984357825426031"), // fee
                )

            // trigger price is not matched
            const stopLimitOrder2 = {
                ...stopLimitOrder,
                salt: 2,
            }
            const signature2 = await getSignature(fixture, stopLimitOrder2, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLimitOrder2, signature2, computeRoundId(2, 1)),
            ).to.revertedWith("LOB_SSLOTPNM")
        })
    })

    describe("take profit limit order", async () => {
        let currentTime: number

        beforeEach(async () => {
            currentTime = (await waffle.provider.getBlock("latest")).timestamp

            await setRoundData(mockedBaseAggregator, computeRoundId(1, 1), "2700", currentTime)
            await setRoundData(mockedBaseAggregator, computeRoundId(1, 2), "2800", currentTime + 15 * 1)
            await setRoundData(mockedBaseAggregator, computeRoundId(1, 3), "2900", currentTime + 15 * 2)
            await setRoundData(mockedBaseAggregator, computeRoundId(1, 4), "3000", currentTime + 15 * 3)
            await setRoundData(mockedBaseAggregator, computeRoundId(2, 1), "3100", currentTime + 15 * 4)
            await setRoundData(mockedBaseAggregator, computeRoundId(2, 2), "3200", currentTime + 15 * 5)
            await setRoundData(mockedBaseAggregator, computeRoundId(2, 3), "3300", currentTime + 15 * 6)
        })

        it("fill take profit limit order: Q2B (long) exact output", async () => {})

        it("fill take profit limit order: B2Q (short) exact input", async () => {})
    })
})
