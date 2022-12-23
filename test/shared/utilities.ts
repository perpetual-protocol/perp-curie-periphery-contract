import { FakeContract } from "@defi-wonderland/smock"
import { LogDescription } from "@ethersproject/abi"
import { TransactionReceipt } from "@ethersproject/abstract-provider"
import bn from "bignumber.js"
import { BaseContract, BigNumber, BigNumberish } from "ethers"
import { parseEther } from "ethers/lib/utils"
import { BaseToken, Exchange, PriceFeedDispatcher, UniswapV3Pool, VirtualToken } from "../../typechain-types"

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

export function encodePriceSqrt(reserve1: BigNumberish, reserve0: BigNumberish): BigNumber {
    return BigNumber.from(
        new bn(reserve1.toString())
            .div(reserve0.toString())
            .sqrt()
            .multipliedBy(new bn(2).pow(96))
            .integerValue(3)
            .toString(),
    )
}

function bigNumberToBig(val: BigNumber, decimals: number = 18): bn {
    return new bn(val.toString()).div(new bn(10).pow(decimals))
}

export function formatSqrtPriceX96ToPrice(value: BigNumber, decimals: number = 18): string {
    return bigNumberToBig(value, 0).div(new bn(2).pow(96)).pow(2).dp(decimals).toString()
}

export function sortedTokens(
    tokenA: VirtualToken,
    tokenB: VirtualToken,
): { token0: VirtualToken; token1: VirtualToken } {
    const [token0, token1] = [tokenA, tokenB].sort((tokenA, tokenB) =>
        tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? -1 : 1,
    )
    return { token0, token1 }
}

export interface BaseQuoteAmountPair {
    base: BigNumberish
    quote: BigNumberish
}

export function isAscendingTokenOrder(addr0: string, addr1: string): boolean {
    return addr0.toLowerCase() < addr1.toLowerCase()
}

export function filterLogs(receipt: TransactionReceipt, topic: string, baseContract: BaseContract): LogDescription[] {
    return receipt.logs.filter(log => log.topics[0] === topic).map(log => baseContract.interface.parseLog(log))
}

export async function syncIndexToMarketPrice(aggregator: FakeContract<PriceFeedDispatcher>, pool: UniswapV3Pool) {
    const slot0 = await pool.slot0()
    const sqrtPrice = slot0.sqrtPriceX96
    const price = formatSqrtPriceX96ToPrice(sqrtPrice)
    aggregator.getDispatchedPrice.returns(parseEther(price))
}

export async function getMarketTwap(exchange: Exchange, baseToken: BaseToken, interval: number) {
    const sqrtPrice = await exchange.getSqrtMarkTwapX96(baseToken.address, interval)
    return formatSqrtPriceX96ToPrice(sqrtPrice, 18)
}
