import { FakeContract } from "@defi-wonderland/smock"
import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import {
    ClearingHouseConfig,
    DelegateApproval,
    Exchange,
    MarketRegistry,
    OrderBook,
    TestAccountBalance,
    TestClearingHouse,
    TestERC20,
    TestLimitOrderBook,
    BaseToken,
    QuoteToken,
    UniswapV3Pool,
    Vault,
    TestAggregatorV3,
    LimitOrderBook,
} from "../../typechain-types"
import { initAndAddPool } from "../helper/marketHelper"
import { getMaxTickRange, priceToTick } from "../helper/number"
import { mintAndDeposit } from "../helper/token"
import { encodePriceSqrt, syncIndexToMarketPrice } from "../shared/utilities"
import { createLimitOrderFixture, LimitOrderFixture } from "./fixtures"
import { getOrderTypes } from "./orderUtils"

describe.only("LimitOrderBook fillOrder", function () {
    const [admin, trader, keeper, maker] = waffle.provider.getWallets()
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
        fixture = await loadFixture(createLimitOrderFixture)
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
                operator: limitOrderBook.address,
                action: fixture.clearingHouseOpenPositionAction,
            }
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
            amount: parseEther("300"),
            oppositeAmountBound: parseEther("0.1"),
            deadline: ethers.constants.MaxUint256,
            reduceOnly: false,
        }

        const domain = {
            name: fixture.EIP712Name,
            version: fixture.EIP712Version,
            chainId: (await waffle.provider.getNetwork()).chainId,
            verifyingContract: limitOrderBook.address,
        }

        const types = getOrderTypes()
        const typesWithoutDomain = {
            LimitOrder: types.LimitOrder,
        }

        // sign limit order
        const signature = await trader._signTypedData(domain, typesWithoutDomain, limitOrder)

        await expect(await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature)).to.emit(
            clearingHouse,
            "PositionChanged",
        )
        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(parseEther("0.1"))
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
            parseEther("-300"),
        )
    })
})
