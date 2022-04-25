import { FakeContract } from "@defi-wonderland/smock"
import { expect } from "chai"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    ClearingHouseConfig,
    Exchange,
    InsuranceFund,
    MarketRegistry,
    OrderBook,
    PerpPortal,
    Quoter,
    QuoteToken,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { createClearingHouseFixture } from "../clearingHouse/fixtures"
import { deposit } from "../helper/token"
import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../shared/utilities"

describe("PerpPortal test", () => {
    const [admin, alice, bob] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let clearingHouse: TestClearingHouse
    let clearingHouseConfig: ClearingHouseConfig
    let accountBalance: AccountBalance
    let insuranceFund: InsuranceFund
    let marketRegistry: MarketRegistry
    let exchange: Exchange
    let orderBook: OrderBook
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let baseToken2: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let pool2: UniswapV3Pool
    let mockedBaseAggregator: FakeContract<TestAggregatorV3>
    let collateralDecimals: number
    let quoter: Quoter
    let lowerTick: number
    let upperTick: number
    let perpPortal: PerpPortal
    const oracleDecimals = 6

    async function syncIndexToMarketPrice(aggregator: FakeContract<TestAggregatorV3>, pool: UniswapV3Pool) {
        const slot0 = await pool.slot0()
        const sqrtPrice = slot0.sqrtPriceX96
        const price = formatSqrtPriceX96ToPrice(sqrtPrice, oracleDecimals)
        aggregator.latestRoundData.returns(() => {
            return [0, parseUnits(price, oracleDecimals), 0, 0, 0]
        })
    }

    beforeEach(async () => {
        const _clearingHouseFixture = await loadFixture(createClearingHouseFixture())
        clearingHouse = _clearingHouseFixture.clearingHouse as TestClearingHouse
        clearingHouseConfig = _clearingHouseFixture.clearingHouseConfig
        accountBalance = _clearingHouseFixture.accountBalance
        insuranceFund = _clearingHouseFixture.insuranceFund
        marketRegistry = _clearingHouseFixture.marketRegistry
        orderBook = _clearingHouseFixture.orderBook
        exchange = _clearingHouseFixture.exchange
        vault = _clearingHouseFixture.vault
        collateral = _clearingHouseFixture.USDC
        baseToken = _clearingHouseFixture.baseToken
        baseToken2 = _clearingHouseFixture.baseToken2
        quoteToken = _clearingHouseFixture.quoteToken
        pool = _clearingHouseFixture.pool
        pool2 = _clearingHouseFixture.pool2
        mockedBaseAggregator = _clearingHouseFixture.mockedBaseAggregator
        collateralDecimals = await collateral.decimals()

        await pool.initialize(encodePriceSqrt(151.3733069, 1))
        await syncIndexToMarketPrice(mockedBaseAggregator, pool)
        await marketRegistry.addPool(baseToken.address, "10000")

        await pool2.initialize(encodePriceSqrt(151.3733069, 1))
        await syncIndexToMarketPrice(mockedBaseAggregator, pool2)
        await marketRegistry.addPool(baseToken2.address, "10000")

        const quoterFactory = await ethers.getContractFactory("Quoter")
        quoter = (await quoterFactory.deploy(marketRegistry.address)) as Quoter

        lowerTick = 48000
        upperTick = 52000

        // mint
        collateral.mint(alice.address, parseUnits("100000", collateralDecimals))
        await deposit(alice, vault, 100000, collateral)

        collateral.mint(bob.address, parseUnits("1000", collateralDecimals))
        await deposit(bob, vault, 1000, collateral)

        await clearingHouse.connect(alice).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("100"),
            quote: parseEther("15000"),
            lowerTick: lowerTick,
            upperTick: upperTick,
            minBase: 0,
            minQuote: 0,
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })

        await clearingHouse.connect(alice).addLiquidity({
            baseToken: baseToken2.address,
            base: parseEther("100"),
            quote: parseEther("15000"),
            lowerTick: lowerTick,
            upperTick: upperTick,
            minBase: 0,
            minQuote: 0,
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })

        const perpPortalFactory = await ethers.getContractFactory("PerpPortal")
        perpPortal = (await perpPortalFactory.deploy(
            clearingHouse.address,
            clearingHouseConfig.address,
            accountBalance.address,
            exchange.address,
            orderBook.address,
            insuranceFund.address,
            marketRegistry.address,
            vault.address,
        )) as PerpPortal
    })

    describe("# getLiquidationPrice", async () => {
        it("liquidation price is correct when long with 5x leverage", async () => {
            await clearingHouse.connect(bob).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("5000"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            await syncIndexToMarketPrice(mockedBaseAggregator, pool)

            const liquidationPrice = await perpPortal.getLiquidationPrice(bob.address, baseToken.address)

            mockedBaseAggregator.latestRoundData.returns(() => {
                return [0, liquidationPrice.div(1e12), 0, 0, 0]
            })

            const accountValue = await clearingHouse.getAccountValue(bob.address)
            const mmRequirement = await accountBalance.getMarginRequirementForLiquidation(bob.address)

            expect(accountValue.sub(mmRequirement).abs()).to.be.lt(parseEther("1"))
        })

        it("liquidation price is correct when short with 5x leverage", async () => {
            await clearingHouse.connect(bob).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("5000"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            await syncIndexToMarketPrice(mockedBaseAggregator, pool)

            const liquidationPrice = await perpPortal.getLiquidationPrice(bob.address, baseToken.address)

            mockedBaseAggregator.latestRoundData.returns(() => {
                return [0, liquidationPrice.div(1e12), 0, 0, 0]
            })

            const accountValue = await clearingHouse.getAccountValue(bob.address)
            const mmRequirement = await accountBalance.getMarginRequirementForLiquidation(bob.address)

            expect(accountValue.sub(mmRequirement).abs()).to.be.lt(parseEther("1"))
        })

        it("liquidation price is correct when long with 0.5x leverage", async () => {
            await clearingHouse.connect(bob).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("500"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            await syncIndexToMarketPrice(mockedBaseAggregator, pool)

            const liquidationPrice = await perpPortal.getLiquidationPrice(bob.address, baseToken.address)
            expect(liquidationPrice).to.be.eq(parseEther("0"))
        })

        it("liquidation price is correct when short with 0.5x leverage", async () => {
            await clearingHouse.connect(bob).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("500"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            await syncIndexToMarketPrice(mockedBaseAggregator, pool)

            const liquidationPrice = await perpPortal.getLiquidationPrice(bob.address, baseToken.address)

            mockedBaseAggregator.latestRoundData.returns(() => {
                return [0, liquidationPrice.div(1e12), 0, 0, 0]
            })

            const accountValue = await clearingHouse.getAccountValue(bob.address)
            const mmRequirement = await accountBalance.getMarginRequirementForLiquidation(bob.address)

            expect(accountValue.sub(mmRequirement).abs()).to.be.lt(parseEther("1"))
        })

        it("liquidation price is 0 when position size of specified token is 0", async () => {
            // open position on baseToken2
            await clearingHouse.connect(bob).openPosition({
                baseToken: baseToken2.address,
                isBaseToQuote: true,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("500"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            const liquidationPrice = await perpPortal.getLiquidationPrice(bob.address, baseToken.address)
            expect(liquidationPrice).to.be.eq("0")
        })

        it("trader can be liquidate at current index price", async () => {
            await clearingHouse.connect(bob).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("5000"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            // set index price to 50 so the trade can be liquidated right now
            const indexPrice = parseUnits("50", 6)
            mockedBaseAggregator.latestRoundData.returns(() => {
                return [0, indexPrice, 0, 0, 0]
            })

            const liquidationPrice = await perpPortal.getLiquidationPrice(bob.address, baseToken.address)
            expect(liquidationPrice).to.be.gt(parseEther("50"))

            const accountValue = await clearingHouse.getAccountValue(bob.address)
            const mmRequirement = await accountBalance.getMarginRequirementForLiquidation(bob.address)
            expect(accountValue).to.be.lt(mmRequirement)
        })
    })

    describe("# getAccountLeverage", async () => {
        it("account value < 0", async () => {
            await clearingHouse.connect(bob).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("3000"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
            mockedBaseAggregator.latestRoundData.returns(() => {
                return [0, parseUnits("50", oracleDecimals), 0, 0, 0]
            })
            // account value: -1038.80514917
            expect(await clearingHouse.getAccountValue(bob.address)).to.be.lt("0")
            expect(await perpPortal.getAccountLeverage(bob.address)).to.be.eq("-1")
        })

        it("account value > total position value", async () => {
            await clearingHouse.connect(bob).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("300"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
            // account value: 996.38873205
            // total position value: 296.38873205
            expect(await clearingHouse.getAccountValue(bob.address)).to.be.gt("300")
            // get account leverage: 296.38873205 / 996.38873205 = 0.29746295
            expect(await perpPortal.getAccountLeverage(bob.address)).to.be.eq(parseEther("0.297462950472651860"))
        })

        it("0 < account value < total position value", async () => {
            await clearingHouse.connect(bob).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("6000"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            // account value: 704.69430511
            const bobAccountValue = await clearingHouse.getAccountValue(bob.address)
            // total position value: 5704.69430511
            const bobPositionValue = await accountBalance.getTotalAbsPositionValue(bob.address)

            expect(bobAccountValue).to.be.gt("0")
            expect(bobAccountValue).to.be.lt(bobPositionValue)

            // account leverage: 5704.69430511 / 704.69430511 = 8.09527516
            expect(await perpPortal.getAccountLeverage(bob.address)).to.be.eq(parseEther("8.095275162167099216"))
        })

        it("no position value", async () => {
            expect(await perpPortal.getAccountLeverage(bob.address)).to.be.eq(0)
        })
    })
})
