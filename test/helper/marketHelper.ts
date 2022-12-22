import { FakeContract } from "@defi-wonderland/smock"
import { BigNumberish } from "ethers"
import { parseEther } from "ethers/lib/utils"
import { ethers } from "hardhat"
import { PriceFeedDispatcher, UniswapV3Pool } from "../../typechain-types"
import { ClearingHouseFixture } from "../clearingHouse/fixtures"
import { encodePriceSqrt } from "../shared/utilities"
import { getMaxTick, getMinTick } from "./number"

export async function initMarket(
    fixture: ClearingHouseFixture,
    initPrice: BigNumberish,
    exFeeRatio: BigNumberish = 1000, // 0.1%
    ifFeeRatio: BigNumberish = 100000, // 10%
    maxTickCrossedWithinBlock: number = 0,
    baseToken: string = fixture.baseToken.address,
    mockedBaseAggregator: FakeContract<PriceFeedDispatcher> = fixture.mockedBaseAggregator,
): Promise<{ minTick: number; maxTick: number }> {
    mockedBaseAggregator.getDispatchedPrice.returns(() => {
        return parseEther(initPrice.toString())
    })

    const poolAddr = await fixture.uniV3Factory.getPool(baseToken, fixture.quoteToken.address, fixture.uniFeeTier)

    const uniPoolFactory = await ethers.getContractFactory("UniswapV3Pool")
    const uniPool = uniPoolFactory.attach(poolAddr)
    await uniPool.initialize(encodePriceSqrt(initPrice.toString(), "1"))
    const uniFeeRatio = await uniPool.fee()
    const tickSpacing = await uniPool.tickSpacing()

    // the initial number of oracle can be recorded is 1; thus, have to expand it
    await uniPool.increaseObservationCardinalityNext(500)

    // update config
    const marketRegistry = fixture.marketRegistry
    await marketRegistry.addPool(baseToken, uniFeeRatio)
    await marketRegistry.setFeeRatio(baseToken, exFeeRatio)
    await marketRegistry.setInsuranceFundFeeRatio(baseToken, ifFeeRatio)

    if (maxTickCrossedWithinBlock != 0) {
        await fixture.exchange.setMaxTickCrossedWithinBlock(baseToken, maxTickCrossedWithinBlock)
    }

    return { minTick: getMinTick(tickSpacing), maxTick: getMaxTick(tickSpacing) }
}

// todo replace caller getMaxTickRange to default value
export async function initAndAddPool(
    fixture: ClearingHouseFixture,
    pool: UniswapV3Pool,
    baseToken: string,
    sqrtPriceX96: BigNumberish,
    feeRatio: BigNumberish,
    maxTickCrossedWithinBlock: number = 1000,
) {
    await pool.initialize(sqrtPriceX96)
    // the initial number of oracle can be recorded is 1; thus, have to expand it
    await pool.increaseObservationCardinalityNext(500)
    // add pool after it's initialized
    await fixture.marketRegistry.addPool(baseToken, feeRatio)
    if (maxTickCrossedWithinBlock != 0) {
        await fixture.exchange.setMaxTickCrossedWithinBlock(baseToken, maxTickCrossedWithinBlock)
    }
}
