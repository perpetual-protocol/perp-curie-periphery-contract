import { FakeContract, MockContract } from "@defi-wonderland/smock"
import { ethers } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    ClearingHouse,
    ClearingHouseConfig,
    Exchange,
    InsuranceFund,
    MarketRegistry,
    OrderBook,
    PriceFeedDispatcher,
    QuoteToken,
    TestAccountBalance,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    TestExchange,
    UniswapV3Factory,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { TestStdReference } from "../../typechain-types/contracts/test/TestStdReference"
import { fastToken0Fixture, fastToken0WithBandPriceFeedFixture, tokensFixture } from "../shared/fixtures"

export interface ClearingHouseFixture {
    clearingHouse: TestClearingHouse | ClearingHouse
    orderBook: OrderBook
    accountBalance: TestAccountBalance
    marketRegistry: MarketRegistry
    clearingHouseConfig: ClearingHouseConfig
    exchange: TestExchange | Exchange
    vault: Vault
    insuranceFund: InsuranceFund
    uniV3Factory: UniswapV3Factory
    pool: UniswapV3Pool
    uniFeeTier: number
    USDC: TestERC20
    quoteToken: QuoteToken
    baseToken: BaseToken
    mockedBaseAggregator: FakeContract<PriceFeedDispatcher>
    mockedAggregator: MockContract<TestAggregatorV3>
    baseToken2: BaseToken
    mockedBaseAggregator2: FakeContract<PriceFeedDispatcher>
    pool2: UniswapV3Pool
    baseToken3: BaseToken
    mockedStdReference3: MockContract<TestStdReference>
    pool3: UniswapV3Pool
}

export enum BaseQuoteOrdering {
    BASE_0_QUOTE_1,
    BASE_1_QUOTE_0,
}

// caller of this function should ensure that (base, quote) = (token0, token1) is always true
export function createClearingHouseFixture(
    canMockTime: boolean = true,
    uniFeeTier = 10000, // 1%
): () => Promise<ClearingHouseFixture> {
    return async (): Promise<ClearingHouseFixture> => {
        // deploy test tokens
        const tokenFactory = await ethers.getContractFactory("TestERC20")
        const USDC = (await tokenFactory.deploy()) as TestERC20
        await USDC.__TestERC20_init("TestUSDC", "USDC", 6)

        let baseToken: BaseToken, quoteToken: QuoteToken, mockedBaseAggregator: FakeContract<PriceFeedDispatcher>
        const { token0, mockedPriceFeedDispatcher, token1, mockedAggregator } = await tokensFixture()

        // we assume (base, quote) == (token0, token1)
        baseToken = token0
        quoteToken = token1
        mockedBaseAggregator = mockedPriceFeedDispatcher

        // deploy UniV3 factory
        const factoryFactory = await ethers.getContractFactory("UniswapV3Factory")
        const uniV3Factory = (await factoryFactory.deploy()) as UniswapV3Factory

        const clearingHouseConfigFactory = await ethers.getContractFactory("ClearingHouseConfig")
        const clearingHouseConfig = (await clearingHouseConfigFactory.deploy()) as ClearingHouseConfig
        await clearingHouseConfig.initialize()

        // prepare uniswap factory
        await uniV3Factory.createPool(baseToken.address, quoteToken.address, uniFeeTier)
        const poolFactory = await ethers.getContractFactory("UniswapV3Pool")

        const marketRegistryFactory = await ethers.getContractFactory("MarketRegistry")
        const marketRegistry = (await marketRegistryFactory.deploy()) as MarketRegistry
        await marketRegistry.initialize(uniV3Factory.address, quoteToken.address)

        const orderBookFactory = await ethers.getContractFactory("OrderBook")
        const orderBook = (await orderBookFactory.deploy()) as OrderBook
        await orderBook.initialize(marketRegistry.address)

        let accountBalance
        let exchange
        if (canMockTime) {
            const accountBalanceFactory = await ethers.getContractFactory("TestAccountBalance")
            accountBalance = (await accountBalanceFactory.deploy()) as TestAccountBalance

            const exchangeFactory = await ethers.getContractFactory("TestExchange")
            exchange = (await exchangeFactory.deploy()) as TestExchange
        } else {
            const accountBalanceFactory = await ethers.getContractFactory("AccountBalance")
            accountBalance = (await accountBalanceFactory.deploy()) as AccountBalance

            const exchangeFactory = await ethers.getContractFactory("Exchange")
            exchange = (await exchangeFactory.deploy()) as Exchange
        }

        const insuranceFundFactory = await ethers.getContractFactory("InsuranceFund")
        const insuranceFund = (await insuranceFundFactory.deploy()) as InsuranceFund
        await insuranceFund.initialize(USDC.address)

        // deploy exchange
        await exchange.initialize(marketRegistry.address, orderBook.address, clearingHouseConfig.address)
        await exchange.setAccountBalance(accountBalance.address)

        await orderBook.setExchange(exchange.address)

        await accountBalance.initialize(clearingHouseConfig.address, orderBook.address)

        const vaultFactory = await ethers.getContractFactory("Vault")
        const vault = (await vaultFactory.deploy()) as Vault
        await vault.initialize(
            insuranceFund.address,
            clearingHouseConfig.address,
            accountBalance.address,
            exchange.address,
        )
        await insuranceFund.setVault(vault.address)
        await accountBalance.setVault(vault.address)

        // deploy a pool
        const poolAddr = await uniV3Factory.getPool(baseToken.address, quoteToken.address, uniFeeTier)
        const pool = poolFactory.attach(poolAddr) as UniswapV3Pool
        await baseToken.addWhitelist(pool.address)
        await quoteToken.addWhitelist(pool.address)

        // deploy 2nd pool
        const _token0Fixture2 = await fastToken0Fixture(quoteToken.address)
        const baseToken2 = _token0Fixture2.baseToken
        const mockedBaseAggregator2 = _token0Fixture2.mockedPriceFeedDispatcher
        await uniV3Factory.createPool(baseToken2.address, quoteToken.address, uniFeeTier)
        const pool2Addr = await uniV3Factory.getPool(baseToken2.address, quoteToken.address, uniFeeTier)
        const pool2 = poolFactory.attach(pool2Addr) as UniswapV3Pool
        await baseToken2.addWhitelist(pool2.address)
        await quoteToken.addWhitelist(pool2.address)

        // deploy 3rd pool
        const _token0Fixture3 = await fastToken0WithBandPriceFeedFixture(quoteToken.address)
        const baseToken3 = _token0Fixture3.baseToken
        const mockedStdReference3 = _token0Fixture3.mockedStdReference
        await uniV3Factory.createPool(baseToken3.address, quoteToken.address, uniFeeTier)
        const pool3Addr = await uniV3Factory.getPool(baseToken3.address, quoteToken.address, uniFeeTier)
        const pool3 = poolFactory.attach(pool3Addr) as UniswapV3Pool
        await baseToken3.addWhitelist(pool3.address)
        await quoteToken.addWhitelist(pool3.address)

        // deploy clearingHouse
        let clearingHouse: ClearingHouse | TestClearingHouse
        if (canMockTime) {
            const clearingHouseFactory = await ethers.getContractFactory("TestClearingHouse")
            clearingHouse = (await clearingHouseFactory.deploy()) as TestClearingHouse
            await clearingHouse.initialize(
                clearingHouseConfig.address,
                vault.address,
                quoteToken.address,
                uniV3Factory.address,
                exchange.address,
                accountBalance.address,
                insuranceFund.address,
            )
        } else {
            const clearingHouseFactory = await ethers.getContractFactory("ClearingHouse")
            clearingHouse = (await clearingHouseFactory.deploy()) as ClearingHouse
            await clearingHouse.initialize(
                clearingHouseConfig.address,
                vault.address,
                quoteToken.address,
                uniV3Factory.address,
                exchange.address,
                accountBalance.address,
                insuranceFund.address,
            )
        }

        await clearingHouseConfig.setSettlementTokenBalanceCap(ethers.constants.MaxUint256)

        await quoteToken.mintMaximumTo(clearingHouse.address)
        await baseToken.mintMaximumTo(clearingHouse.address)
        await baseToken2.mintMaximumTo(clearingHouse.address)
        await baseToken3.mintMaximumTo(clearingHouse.address)

        await quoteToken.addWhitelist(clearingHouse.address)
        await baseToken.addWhitelist(clearingHouse.address)
        await baseToken2.addWhitelist(clearingHouse.address)
        await baseToken3.addWhitelist(clearingHouse.address)

        await marketRegistry.setClearingHouse(clearingHouse.address)
        await orderBook.setClearingHouse(clearingHouse.address)
        await exchange.setClearingHouse(clearingHouse.address)
        await accountBalance.setClearingHouse(clearingHouse.address)
        await vault.setClearingHouse(clearingHouse.address)

        return {
            clearingHouse,
            orderBook,
            accountBalance,
            marketRegistry,
            clearingHouseConfig,
            exchange,
            vault,
            insuranceFund,
            uniV3Factory,
            pool,
            uniFeeTier,
            USDC,
            quoteToken,
            baseToken,
            mockedBaseAggregator,
            mockedAggregator,
            baseToken2,
            mockedBaseAggregator2,
            pool2,
            baseToken3,
            mockedStdReference3,
            pool3,
        }
    }
}
