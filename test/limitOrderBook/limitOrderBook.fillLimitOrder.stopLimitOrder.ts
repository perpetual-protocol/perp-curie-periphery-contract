import { FakeContract } from "@defi-wonderland/smock"
import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    DelegateApproval,
    Exchange,
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
import { getSignature } from "./orderUtils"

describe("LimitOrderBook fillLimitOrder", function () {
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
    let limitOrderBook: LimitOrderBook
    let limitOrderRewardVault: LimitOrderRewardVault
    let rewardToken: TestERC20

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

    describe("stop limit order", async () => {
        beforeEach(async () => {
            const priceFeedDecimals = await mockedBaseAggregator.decimals()
            const timestamp = (await waffle.provider.getBlock("latest")).timestamp

            const roundData = {
                // "roundId": [roundId, answer, startedAt, updatedAt, answeredInRound]
                "18446744000000000000": [
                    "18446744000000000000",
                    parseUnits("1800", priceFeedDecimals),
                    timestamp,
                    timestamp,
                    "18446744000000000000",
                ],
                "18446744000000000001": [
                    "18446744000000000001",
                    parseUnits("1900", priceFeedDecimals),
                    timestamp + 15,
                    timestamp + 15,
                    "18446744000000000001",
                ],
                "18446744000000000002": [
                    "18446744000000000002",
                    parseUnits("1700", priceFeedDecimals),
                    timestamp + 30,
                    timestamp + 30,
                    "18446744000000000002",
                ],
            }

            mockedBaseAggregator.getRoundData.returns((roundId: any) => {
                return roundData[roundId]
            })
        })

        it("fill stop limit order: Q2B (long) exact output", async () => {
            const stopLimitOrder = {
                orderType: fixture.orderTypeStopLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: parseEther("0.1"),
                oppositeAmountBound: parseEther("300"),
                deadline: ethers.constants.MaxUint256,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: false,
                roundIdWhenCreated: "18446744000000000000",
                triggerPrice: parseEther("1900").toString(),
            }

            const signature = await getSignature(fixture, stopLimitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(stopLimitOrder, signature, "18446744000000000001"),
            ).to.emit(limitOrderBook, "LimitOrderFilled")
        })
    })
})
