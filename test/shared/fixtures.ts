import { MockContract, smock } from "@defi-wonderland/smock"
import { ethers } from "hardhat"
import {
    BaseToken,
    ChainlinkPriceFeed,
    QuoteToken,
    TestAggregatorV3,
    TestAggregatorV3__factory,
    UniswapV3Factory,
    UniswapV3Pool,
    VirtualToken,
} from "../../typechain-types"
import { BandPriceFeed } from "../../typechain-types/@perp/perp-oracle-contract/contracts/BandPriceFeed"
import { TestStdReference } from "../../typechain-types/contracts/test/TestStdReference"
import { TestStdReference__factory } from "../../typechain-types/factories/contracts/test/TestStdReference__factory"
import { isAscendingTokenOrder } from "./utilities"

interface TokensFixture {
    token0: BaseToken
    token1: QuoteToken
    mockedAggregator0: MockContract<TestAggregatorV3>
    mockedAggregator1: MockContract<TestAggregatorV3>
}

interface PoolFixture {
    factory: UniswapV3Factory
    pool: UniswapV3Pool
    baseToken: BaseToken
    quoteToken: QuoteToken
}

interface BaseTokenFixture {
    baseToken: BaseToken
    mockedAggregator: MockContract<TestAggregatorV3>
}

interface BaseTokenWithBandPriceFeedFixture {
    baseToken: BaseToken
    mockedStdReference: MockContract<TestStdReference>
}

export function createQuoteTokenFixture(name: string, symbol: string): () => Promise<QuoteToken> {
    return async (): Promise<QuoteToken> => {
        const quoteTokenFactory = await ethers.getContractFactory("QuoteToken")
        const quoteToken = (await quoteTokenFactory.deploy()) as QuoteToken
        await quoteToken.initialize(name, symbol)
        return quoteToken
    }
}

export function createBaseTokenFixture(name: string, symbol: string): () => Promise<BaseTokenFixture> {
    return async (): Promise<BaseTokenFixture> => {
        const aggregatorFactory = await smock.mock<TestAggregatorV3__factory>("TestAggregatorV3")
        const mockedAggregator = await aggregatorFactory.deploy()
        mockedAggregator.decimals.returns(() => {
            return 6
        })

        const chainlinkPriceFeedFactory = await ethers.getContractFactory("ChainlinkPriceFeed")
        const chainlinkPriceFeed = (await chainlinkPriceFeedFactory.deploy(
            mockedAggregator.address,
        )) as ChainlinkPriceFeed

        const baseTokenFactory = await ethers.getContractFactory("BaseToken")
        const baseToken = (await baseTokenFactory.deploy()) as BaseToken
        await baseToken.initialize(name, symbol, chainlinkPriceFeed.address)

        return { baseToken, mockedAggregator }
    }
}

export function createBaseTokenWithBandPriceFeedFixture(
    name: string,
    symbol: string,
): () => Promise<BaseTokenWithBandPriceFeedFixture> {
    return async (): Promise<BaseTokenWithBandPriceFeedFixture> => {
        const mockedStdReferenceFactory = await smock.mock<TestStdReference__factory>("TestStdReference")
        const mockedStdReference = await mockedStdReferenceFactory.deploy()

        const baseAsset = symbol
        const bandPriceFeedFactory = await ethers.getContractFactory("BandPriceFeed")
        const bandPriceFeed = (await bandPriceFeedFactory.deploy(
            mockedStdReference.address,
            baseAsset,
            900,
        )) as BandPriceFeed

        const baseTokenFactory = await ethers.getContractFactory("BaseToken")
        const baseToken = (await baseTokenFactory.deploy()) as BaseToken
        await baseToken.initialize(name, symbol, bandPriceFeed.address)

        return { baseToken, mockedStdReference }
    }
}

export async function uniswapV3FactoryFixture(): Promise<UniswapV3Factory> {
    const factoryFactory = await ethers.getContractFactory("UniswapV3Factory")
    return (await factoryFactory.deploy()) as UniswapV3Factory
}

// assume isAscendingTokensOrder() == true/ token0 < token1
export async function tokensFixture(): Promise<TokensFixture> {
    const { baseToken: randomToken0, mockedAggregator: randomMockedAggregator0 } = await createBaseTokenFixture(
        "RandomTestToken0",
        "randomToken0",
    )()
    const { baseToken: randomToken1, mockedAggregator: randomMockedAggregator1 } = await createBaseTokenFixture(
        "RandomTestToken1",
        "randomToken1",
    )()

    let token0: BaseToken
    let token1: QuoteToken
    let mockedAggregator0: MockContract<TestAggregatorV3>
    let mockedAggregator1: MockContract<TestAggregatorV3>
    if (isAscendingTokenOrder(randomToken0.address, randomToken1.address)) {
        token0 = randomToken0
        mockedAggregator0 = randomMockedAggregator0
        token1 = randomToken1 as VirtualToken as QuoteToken
        mockedAggregator1 = randomMockedAggregator1
    } else {
        token0 = randomToken1
        mockedAggregator0 = randomMockedAggregator1
        token1 = randomToken0 as VirtualToken as QuoteToken
        mockedAggregator1 = randomMockedAggregator0
    }
    return {
        token0,
        mockedAggregator0,
        token1,
        mockedAggregator1,
    }
}

export async function token0Fixture(token1Addr: string): Promise<BaseTokenFixture> {
    let token0Fixture: BaseTokenFixture
    while (!token0Fixture || !isAscendingTokenOrder(token0Fixture.baseToken.address, token1Addr)) {
        token0Fixture = await createBaseTokenFixture("RandomTestToken0", "randomToken0")()
    }
    return token0Fixture
}

export async function token0WithBandPriceFeedFixture(token1Addr: string): Promise<BaseTokenWithBandPriceFeedFixture> {
    let token0Fixture: BaseTokenWithBandPriceFeedFixture
    while (!token0Fixture || !isAscendingTokenOrder(token0Fixture.baseToken.address, token1Addr)) {
        token0Fixture = await createBaseTokenWithBandPriceFeedFixture("RandomTestToken0", "randomToken0")()
    }
    return token0Fixture
}

export async function base0Quote1PoolFixture(): Promise<PoolFixture> {
    const { token0, token1 } = await tokensFixture()
    const factory = await uniswapV3FactoryFixture()

    const tx = await factory.createPool(token0.address, token1.address, "10000")
    const receipt = await tx.wait()
    const poolAddress = receipt.events?.[0].args?.pool as string

    const poolFactory = await ethers.getContractFactory("UniswapV3Pool")
    const pool = poolFactory.attach(poolAddress) as UniswapV3Pool

    return { factory, pool, baseToken: token0, quoteToken: token1 }
}
