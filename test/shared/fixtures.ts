import { FakeContract, MockContract, smock } from "@defi-wonderland/smock"
import assert from "assert"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    ChainlinkPriceFeedV3,
    ChainlinkPriceFeedV3__factory,
    PriceFeedDispatcher,
    PriceFeedDispatcher__factory,
    QuoteToken,
    TestAggregatorV3,
    TestAggregatorV3__factory,
    UniswapV3Factory,
    UniswapV3Pool,
    VirtualToken
} from "../../typechain-types"
import { BandPriceFeed } from "../../typechain-types/@perp/perp-oracle-contract/contracts/BandPriceFeed"
import { TestStdReference } from "../../typechain-types/contracts/test/TestStdReference"
import { TestStdReference__factory } from "../../typechain-types/factories/contracts/test/TestStdReference__factory"
import { isAscendingTokenOrder } from "./utilities"

interface TokensFixture {
    token0: BaseToken
    token1: QuoteToken
    mockedPriceFeedDispatcher: FakeContract<PriceFeedDispatcher>
    mockedAggregator: MockContract<TestAggregatorV3>
}

interface PoolFixture {
    factory: UniswapV3Factory
    pool: UniswapV3Pool
    baseToken: BaseToken
    quoteToken: QuoteToken
}

interface BaseTokenFixture {
    baseToken: BaseToken
    mockedPriceFeedDispatcher: FakeContract<PriceFeedDispatcher>
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

        const chainlinkPriceFeedV3Factory = await smock.mock<ChainlinkPriceFeedV3__factory>("ChainlinkPriceFeedV3")
        const chainlinkPriceFeedV3 = await chainlinkPriceFeedV3Factory.deploy(
            mockedAggregator.address,
            40 * 60,
            1e5,
            10,
            30 * 60,
        )
        chainlinkPriceFeedV3.decimals.returns(6)

        const feedDispatcherFactory = await smock.mock<PriceFeedDispatcher__factory>("PriceFeedDispatcher")
        // const mockedPriceFeedDispatcher = (await feedDispatcherFactory.deploy(
        //     ethers.constants.AddressZero,
        //     chainlinkPriceFeedV3.address,
        // )) as any
        const mockedPriceFeedDispatcher = await smock.fake<PriceFeedDispatcher>("PriceFeedDispatcher")

        mockedPriceFeedDispatcher.decimals.returns(18)
        mockedPriceFeedDispatcher.getChainlinkPriceFeedV3.returns(chainlinkPriceFeedV3.address)
        mockedPriceFeedDispatcher.getDispatchedPrice.returns(100)
        console.log(`res: ${await mockedPriceFeedDispatcher.getDispatchedPrice(1)}`)

        const baseTokenFactory = await ethers.getContractFactory("BaseToken")
        const baseToken = (await baseTokenFactory.deploy()) as BaseToken
        await baseToken.initialize(name, symbol, mockedPriceFeedDispatcher.address)

        return { baseToken, mockedPriceFeedDispatcher, mockedAggregator }
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

        const mockedFeedDispatcherFactory = await smock.mock<PriceFeedDispatcher__factory>("PriceFeedDispatcher")
        const mockedPriceFeedDispatcher = await mockedFeedDispatcherFactory.deploy(
            ethers.constants.AddressZero,
            chainlinkPriceFeedV3.address,
        )

        mockedPriceFeedDispatcher.decimals.returns(18)

        const baseToken = await deployBaseToken(name, symbol, mockedPriceFeedDispatcher.address, quoteTokenAddr)

        return { baseToken, mockedPriceFeedDispatcher, mockedAggregator }
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
        mockedPriceFeedDispatcher: randommockedPriceFeedDispatcher,
        mockedAggregator: randomMockedAggregator,
    } = await createBaseTokenFixture("RandomToken0", "RT0")()
    const {
        baseToken: randomToken1,
        mockedPriceFeedDispatcher: randomMockedPriceFeedDispatcher1,
        mockedAggregator: randomMockedAggregator1,
    } = await createBaseTokenFixture("RandomToken1", "RT1")()

    let token0: BaseToken
    let token1: QuoteToken
    let mockedPriceFeedDispatcher: FakeContract<PriceFeedDispatcher>
    let mockedAggregator: MockContract<TestAggregatorV3>
    if (isAscendingTokenOrder(randomToken0.address, randomToken1.address)) {
        token0 = randomToken0
        mockedPriceFeedDispatcher = randommockedPriceFeedDispatcher
        mockedAggregator = randomMockedAggregator
        token1 = randomToken1 as VirtualToken as QuoteToken
    } else {
        token0 = randomToken1
        mockedPriceFeedDispatcher = randomMockedPriceFeedDispatcher1
        mockedAggregator = randomMockedAggregator1
        token1 = randomToken0 as VirtualToken as QuoteToken
    }
    return {
        token0,
        mockedPriceFeedDispatcher,
        mockedAggregator,
        token1,
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
