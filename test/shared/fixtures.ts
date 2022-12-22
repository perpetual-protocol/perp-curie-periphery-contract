import { MockContract, smock } from "@defi-wonderland/smock"
import assert from "assert"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    ChainlinkPriceFeedV3,
    PriceFeedDispatcher,
    PriceFeedDispatcher__factory,
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
    mockedPriceFeedDispatcher0: MockContract<PriceFeedDispatcher>
    mockedPriceFeedDispatcher1: MockContract<PriceFeedDispatcher>
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
    mockedPriceFeedDispatcher: MockContract<PriceFeedDispatcher>
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

        const chainlinkPriceFeedV3Factory = await ethers.getContractFactory("ChainlinkPriceFeedV3")
        const chainlinkPriceFeedV3 = (await chainlinkPriceFeedV3Factory.deploy(
            mockedAggregator.address,
            40 * 60,
            1e5,
            10,
            30 * 60,
        )) as ChainlinkPriceFeedV3

        const priceFeedDispatcherFactory = await smock.mock<PriceFeedDispatcher__factory>("PriceFeedDispatcher")
        const mockedPriceFeedDispatcher = await priceFeedDispatcherFactory.deploy(
            "0x0000000000000000000000000000000000000000",
            chainlinkPriceFeedV3.address,
        )
        mockedPriceFeedDispatcher.decimals.returns(18)
        // mockedPriceFeedDispatcher.getDispatchedPrice.returns(100)

        const baseTokenFactory = await ethers.getContractFactory("BaseToken")
        const baseToken = (await baseTokenFactory.deploy()) as BaseToken
        await baseToken.initialize(name, symbol, mockedPriceFeedDispatcher.address)

        return { baseToken, mockedAggregator, mockedPriceFeedDispatcher }
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

export function fastCreateBaseTokenFixture(
    name: string,
    symbol: string,
    quoteTokenAddr: string,
): () => Promise<BaseTokenFixture> {
    return async (): Promise<BaseTokenFixture> => {
        const aggregatorFactory = await smock.mock<TestAggregatorV3__factory>("TestAggregatorV3")
        const mockedAggregator = await aggregatorFactory.deploy()
        mockedAggregator.decimals.returns(() => {
            return 6
        })

        const chainlinkPriceFeedV3Factory = await ethers.getContractFactory("ChainlinkPriceFeedV3")
        const chainlinkPriceFeedV3 = (await chainlinkPriceFeedV3Factory.deploy(
            mockedAggregator.address,
            40 * 60,
            1e5,
            10,
            30 * 60,
        )) as ChainlinkPriceFeedV3

        const priceFeedDispatcherFactory = await smock.mock<PriceFeedDispatcher__factory>("PriceFeedDispatcher")
        const mockedPriceFeedDispatcher = await priceFeedDispatcherFactory.deploy(
            "0x0000000000000000000000000000000000000000",
            chainlinkPriceFeedV3.address,
        )

        mockedPriceFeedDispatcher.decimals.returns(18)

        const baseToken = await deployBaseToken(name, symbol, mockedPriceFeedDispatcher.address, quoteTokenAddr)

        return { baseToken, mockedAggregator, mockedPriceFeedDispatcher }
    }
}

export function fastCreateBaseTokenWithBandPriceFeedFixture(
    name: string,
    symbol: string,
    quoteTokenAddr: string,
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

        const baseToken = await deployBaseToken(name, symbol, bandPriceFeed.address, quoteTokenAddr)

        return { baseToken, mockedStdReference }
    }
}

export async function deployBaseToken(
    name: string,
    symbol: string,
    priceFeedAddr: string,
    quoteTokenAddr: string,
): Promise<BaseToken> {
    const deployer = (await ethers.getSigners())[0]

    // we use deployer's address and nonce to compute a contract's address which deployed with that nonce,
    // to find the nonce that matches the condition
    let nonce = await deployer.getTransactionCount()
    let computedAddress = "0x0"
    while (true) {
        computedAddress = ethers.utils.getContractAddress({
            from: deployer.address,
            nonce: nonce,
        })

        if (computedAddress.toLowerCase() < quoteTokenAddr.toLowerCase()) {
            break
        } else {
            // increase the nonce until we find a contract address that matches the condition
            nonce += 1
        }
    }

    await waffle.provider.send("hardhat_setNonce", [deployer.address, `0x${nonce.toString(16)}`])

    const baseTokenFactory = await ethers.getContractFactory("BaseToken")
    const baseToken = (await baseTokenFactory.deploy()) as BaseToken
    await baseToken.initialize(name, symbol, priceFeedAddr)

    assert.strictEqual(baseToken.address.toLowerCase() < quoteTokenAddr.toLowerCase(), true)

    return baseToken
}

export async function uniswapV3FactoryFixture(): Promise<UniswapV3Factory> {
    const factoryFactory = await ethers.getContractFactory("UniswapV3Factory")
    return (await factoryFactory.deploy()) as UniswapV3Factory
}

// assume isAscendingTokensOrder() == true/ token0 < token1
export async function tokensFixture(): Promise<TokensFixture> {
    const {
        baseToken: randomToken0,
        mockedAggregator: randomMockedAggregator0,
        mockedPriceFeedDispatcher: randomMockedPriceFeedDispatcher0,
    } = await createBaseTokenFixture("RandomTestToken0", "randomToken0")()
    const {
        baseToken: randomToken1,
        mockedAggregator: randomMockedAggregator1,
        mockedPriceFeedDispatcher: randomMockedPriceFeedDispatcher1,
    } = await createBaseTokenFixture("RandomTestToken1", "randomToken1")()

    let token0: BaseToken
    let token1: QuoteToken
    let mockedAggregator0: MockContract<TestAggregatorV3>
    let mockedAggregator1: MockContract<TestAggregatorV3>
    let mockedPriceFeedDispatcher0: MockContract<PriceFeedDispatcher>
    let mockedPriceFeedDispatcher1: MockContract<PriceFeedDispatcher>
    if (isAscendingTokenOrder(randomToken0.address, randomToken1.address)) {
        token0 = randomToken0
        mockedAggregator0 = randomMockedAggregator0
        token1 = randomToken1 as VirtualToken as QuoteToken
        mockedAggregator1 = randomMockedAggregator1
        mockedPriceFeedDispatcher0 = randomMockedPriceFeedDispatcher0
        mockedPriceFeedDispatcher1 = randomMockedPriceFeedDispatcher1
    } else {
        token0 = randomToken1
        mockedAggregator0 = randomMockedAggregator1
        token1 = randomToken0 as VirtualToken as QuoteToken
        mockedAggregator1 = randomMockedAggregator0
        mockedPriceFeedDispatcher0 = randomMockedPriceFeedDispatcher1
        mockedPriceFeedDispatcher1 = randomMockedPriceFeedDispatcher0
    }
    return {
        token0,
        mockedAggregator0,
        token1,
        mockedAggregator1,
        mockedPriceFeedDispatcher0,
        mockedPriceFeedDispatcher1,
    }
}

export async function fastToken0Fixture(token1Addr: string): Promise<BaseTokenFixture> {
    return await fastCreateBaseTokenFixture("RandomTestToken0", "randomToken0", token1Addr)()
}

export async function fastToken0WithBandPriceFeedFixture(
    token1Addr: string,
): Promise<BaseTokenWithBandPriceFeedFixture> {
    return await fastCreateBaseTokenWithBandPriceFeedFixture("RandomTestToken0", "randomToken0", token1Addr)()
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
