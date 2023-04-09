import { FakeContract } from "@defi-wonderland/smock"
import { expect } from "chai"
import { defaultAbiCoder, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    MarketRegistry,
    OrderBook,
    PriceFeedDispatcher,
    QuoteToken,
    Quoter,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { createClearingHouseFixture } from "../clearingHouse/fixtures"
import { initMarket } from "../helper/marketHelper"
import { deposit } from "../helper/token"
import { encodePriceSqrt, syncIndexToMarketPrice } from "../shared/utilities"

describe("Quoter.swap", () => {
    const [admin, alice, bob] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let clearingHouse: TestClearingHouse
    let marketRegistry: MarketRegistry
    let orderBook: OrderBook
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedPriceFeedDispatcher: FakeContract<PriceFeedDispatcher>
    let collateralDecimals: number
    let quoter: Quoter
    let lowerTick
    let upperTick

    beforeEach(async () => {
        const _clearingHouseFixture = await loadFixture(createClearingHouseFixture())
        clearingHouse = _clearingHouseFixture.clearingHouse as TestClearingHouse
        marketRegistry = _clearingHouseFixture.marketRegistry
        orderBook = _clearingHouseFixture.orderBook
        vault = _clearingHouseFixture.vault
        collateral = _clearingHouseFixture.USDC
        baseToken = _clearingHouseFixture.baseToken
        quoteToken = _clearingHouseFixture.quoteToken
        pool = _clearingHouseFixture.pool
        mockedPriceFeedDispatcher = _clearingHouseFixture.mockedPriceFeedDispatcher
        collateralDecimals = await collateral.decimals()

        const initPrice = "151.3733069"
        await initMarket(_clearingHouseFixture, initPrice)

        await syncIndexToMarketPrice(mockedPriceFeedDispatcher, pool)

        const quoterFactory = await ethers.getContractFactory("Quoter")
        quoter = (await quoterFactory.deploy(marketRegistry.address)) as Quoter

        lowerTick = 49000
        upperTick = 51400

        // prepare maker alice
        await collateral.mint(alice.address, parseUnits("10000", collateralDecimals))
        await deposit(alice, vault, 10000, collateral)
        await clearingHouse.connect(alice).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("10"),
            quote: parseEther("1500"),
            lowerTick,
            upperTick,
            minBase: 0,
            minQuote: 0,
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })

        // deposit bob's collateral and mint tokens for bob
        // make sure bob always has enough tokens for swap
        await collateral.mint(bob.address, parseUnits("100000", collateralDecimals))
        await deposit(bob, vault, 100000, collateral)
    })

    describe("initialize", () => {
        it("force error, invalid exchange address", async () => {
            const quoterFactory = await ethers.getContractFactory("Quoter")
            await expect(quoterFactory.deploy(alice.address)).to.be.revertedWith("Q_ANC")
        })
    })

    describe("quote Q2B with exact input", () => {
        it("returns same result with the CH.swap when liquidity is enough", async () => {
            const quoteAmount = parseEther("250")
            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: true,
                amount: quoteAmount,
                sqrtPriceLimitX96: 0,
            })

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: true,
                amount: quoteAmount,
                sqrtPriceLimitX96: 0,
            })

            // real tx to trigger price update
            await clearingHouse.connect(bob).swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: true,
                amount: quoteAmount,
                sqrtPriceLimitX96: 0,
            })

            const sqrtPriceX96 = (await pool.slot0())[0]
            const partialSwapResponse = [
                swapResponse.base,
                swapResponse.quote,
                swapResponse.exchangedPositionSize,
                swapResponse.exchangedPositionNotional,
                sqrtPriceX96,
            ]
            expect(quoteResponse).to.be.deep.eq(partialSwapResponse)
        })

        it("stop swapping and returns same result with CH.swap when price limit reached", async () => {
            // buy base using 500 with price limit of 152
            // the end price would be 157.2470192400286 without the price limit
            const quoteAmount = parseEther("500")
            const priceLimit = encodePriceSqrt(152, 1)

            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: true,
                amount: quoteAmount,
                sqrtPriceLimitX96: priceLimit,
            })
            expect(quoteResponse.deltaAvailableQuote).to.be.lt(quoteAmount)

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: true,
                amount: quoteAmount,
                sqrtPriceLimitX96: priceLimit,
            })

            // real tx to trigger price update
            await clearingHouse.connect(bob).swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: true,
                amount: quoteAmount,
                sqrtPriceLimitX96: priceLimit,
            })

            expect(quoteResponse.deltaAvailableBase).to.be.eq(swapResponse.base)
            expect(quoteResponse.deltaAvailableQuote).to.be.closeTo(swapResponse.quote, 1)
            expect(quoteResponse.exchangedPositionSize).to.be.eq(swapResponse.exchangedPositionSize)
            expect(quoteResponse.exchangedPositionNotional).to.be.eq(swapResponse.exchangedPositionNotional)
            expect(quoteResponse.sqrtPriceX96).to.be.eq((await pool.slot0())[0])
        })

        it("returns same result with CH.swap when liquidity is not enough", async () => {
            // maker's upper tick is 51400
            // target tick is 51460
            // 51460 > 51400, open huge long position => swap all liquidity
            const targetPrice = Math.pow(1.0001, 51400)

            // set sqrtPriceLimitX96 to target price limit, avoid swap to max tick
            const targetPriceLimit = encodePriceSqrt(targetPrice, 1)

            // mock index price target price to open long position
            mockedPriceFeedDispatcher.getDispatchedPrice.returns(() => parseEther(targetPrice.toString()))

            const quoteAmount = parseEther("30000")
            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: true,
                amount: quoteAmount,
                sqrtPriceLimitX96: targetPriceLimit,
            })
            expect(quoteResponse.deltaAvailableQuote).to.be.lt(quoteAmount)

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: true,
                amount: quoteAmount,
                sqrtPriceLimitX96: targetPriceLimit,
            })

            // real tx to trigger price update
            await clearingHouse.connect(bob).swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: true,
                amount: quoteAmount,
                sqrtPriceLimitX96: targetPriceLimit,
            })

            expect(quoteResponse.deltaAvailableBase).to.be.eq(swapResponse.base)
            expect(quoteResponse.deltaAvailableQuote).to.be.closeTo(swapResponse.quote, 1)
            expect(quoteResponse.exchangedPositionSize).to.be.eq(swapResponse.exchangedPositionSize)
            expect(quoteResponse.exchangedPositionNotional).to.be.eq(swapResponse.exchangedPositionNotional)
            expect(quoteResponse.sqrtPriceX96).to.be.eq((await pool.slot0())[0])
        })
    })

    describe("quote Q2B with exact output", () => {
        it("returns same result with CH.swap when liquidity is enough", async () => {
            const baseAmount = parseEther("5")
            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: false,
                amount: baseAmount,
                sqrtPriceLimitX96: 0,
            })

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: false,
                amount: baseAmount,
                sqrtPriceLimitX96: 0,
            })
            expect(quoteResponse.deltaAvailableBase).to.be.eq(swapResponse.base)
            expect(quoteResponse.deltaAvailableQuote).to.be.closeTo(swapResponse.quote, 1)
            expect(quoteResponse.exchangedPositionSize).to.be.eq(swapResponse.exchangedPositionSize)
            expect(quoteResponse.exchangedPositionNotional).to.be.eq(swapResponse.exchangedPositionNotional)
        })

        it("stops swapping and returns same result with CH.swap when price limit reached", async () => {
            // try to buy 5 base token with price limit of 152
            // the end price would be 160.6768890664438 without the price limit
            const baseAmount = parseEther("5")
            const priceLimit = encodePriceSqrt(152, 1)

            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: false,
                amount: baseAmount,
                sqrtPriceLimitX96: priceLimit,
            })
            expect(quoteResponse.deltaAvailableBase).to.be.lt(baseAmount)

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                baseToken: baseToken.address,
                // buy base
                isBaseToQuote: false,
                isExactInput: false,
                amount: baseAmount,
                sqrtPriceLimitX96: priceLimit,
            })
            expect(quoteResponse.deltaAvailableBase).to.be.eq(swapResponse.base)
            expect(quoteResponse.deltaAvailableQuote).to.be.closeTo(swapResponse.quote, 1)
            expect(quoteResponse.exchangedPositionSize).to.be.eq(swapResponse.exchangedPositionSize)
            expect(quoteResponse.exchangedPositionNotional).to.be.eq(swapResponse.exchangedPositionNotional)
        })

        it("force error, unmatched output amount when liquidity is not enough", async () => {
            const baseAmount = parseEther("20")
            await expect(
                quoter.callStatic.swap({
                    baseToken: baseToken.address,
                    // buy base
                    isBaseToQuote: false,
                    isExactInput: false,
                    amount: baseAmount,
                    sqrtPriceLimitX96: 0,
                }),
            ).revertedWith("Q_UOA")

            await expect(
                clearingHouse.connect(bob).callStatic.swap({
                    baseToken: baseToken.address,
                    // buy base
                    isBaseToQuote: false,
                    isExactInput: false,
                    amount: baseAmount,
                    sqrtPriceLimitX96: 0,
                }),
            ).revertedWith("UB_UOA")
        })
    })

    describe("quote B2Q with exact input", () => {
        it("returns same result with CH.swap when liquidity is enough", async () => {
            const baseAmount = parseEther("5")
            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: true,
                amount: baseAmount,
                sqrtPriceLimitX96: 0,
            })

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: true,
                amount: baseAmount,
                sqrtPriceLimitX96: 0,
            })

            // real tx to trigger price update
            await clearingHouse.connect(bob).swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: true,
                amount: baseAmount,
                sqrtPriceLimitX96: 0,
            })

            const partialSwapResponse = [
                swapResponse.base,
                swapResponse.quote,
                swapResponse.exchangedPositionSize,
                swapResponse.exchangedPositionNotional,
                (await pool.slot0())[0],
            ]
            expect(quoteResponse).to.be.deep.eq(partialSwapResponse)
        })

        it("stops swapping and returns same result with CH.swap when price limit reached", async () => {
            // sell 5 base token with price limit of 151
            // the end price would be 142.85498719998498 without the price limit
            const baseAmount = parseEther("5")
            const priceLimit = encodePriceSqrt(151, 1)

            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: true,
                amount: baseAmount,
                sqrtPriceLimitX96: priceLimit,
            })
            expect(quoteResponse.deltaAvailableBase).to.be.lt(baseAmount)

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: true,
                amount: baseAmount,
                sqrtPriceLimitX96: priceLimit,
            })

            // real tx to trigger price update
            await clearingHouse.connect(bob).swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: true,
                amount: baseAmount,
                sqrtPriceLimitX96: priceLimit,
            })

            const partialSwapResponse = [
                swapResponse.base,
                swapResponse.quote,
                swapResponse.exchangedPositionSize,
                swapResponse.exchangedPositionNotional,
                (await pool.slot0())[0],
            ]
            expect(quoteResponse).to.be.deep.eq(partialSwapResponse)
        })

        it("returns same result with CH.swap when liquidity is not enough", async () => {
            // maker's lower tick is 49000
            // target tick is 48940
            // 48940 < 49000, open huge short position => swap all liquidity
            const targetPrice = Math.pow(1.0001, 48940)

            // set sqrtPriceLimitX96 to target price limit, avoid swap to max tick
            const targetPriceLimit = encodePriceSqrt(targetPrice, 1)

            // mock index price target price to open long position
            mockedPriceFeedDispatcher.getDispatchedPrice.returns(() => parseEther(targetPrice.toString()))

            const baseAmount = parseEther("30")
            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: true,
                amount: baseAmount,
                sqrtPriceLimitX96: targetPriceLimit,
            })
            expect(quoteResponse.deltaAvailableBase).to.be.lt(baseAmount)

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                // buy base
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: baseAmount,
                sqrtPriceLimitX96: targetPriceLimit,
            })

            // real tx to trigger price update
            await clearingHouse.connect(bob).swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: true,
                amount: baseAmount,
                sqrtPriceLimitX96: targetPriceLimit,
            })

            const partialSwapResponse = [
                swapResponse.base,
                swapResponse.quote,
                swapResponse.exchangedPositionSize,
                swapResponse.exchangedPositionNotional,
                (await pool.slot0())[0],
            ]
            expect(quoteResponse).to.be.deep.eq(partialSwapResponse)
        })
    })

    describe("quote B2Q with exact output", () => {
        it("returns same result with CH.swap when liquidity is enough", async () => {
            const quoteAmount = parseEther("100")
            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: false,
                amount: quoteAmount,
                sqrtPriceLimitX96: 0,
            })

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: false,
                amount: quoteAmount,
                sqrtPriceLimitX96: 0,
            })

            // real tx to trigger price update
            await clearingHouse.connect(bob).swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: false,
                amount: quoteAmount,
                sqrtPriceLimitX96: 0,
            })

            const partialSwapResponse = [
                swapResponse.base,
                swapResponse.quote,
                swapResponse.exchangedPositionSize,
                swapResponse.exchangedPositionNotional,
                (await pool.slot0())[0],
            ]
            expect(quoteResponse).to.be.deep.eq(partialSwapResponse)
        })

        it("stops swapping and returns same result with CH.swap when price limit reached", async () => {
            // try to buy 100 quote with price limit of 151
            // the end price would be 149.00824266559061 without the price limit
            const baseAmount = parseEther("200")
            const priceLimit = encodePriceSqrt(151, 1)

            const quoteResponse = await quoter.callStatic.swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: false,
                amount: baseAmount,
                sqrtPriceLimitX96: priceLimit,
            })
            expect(quoteResponse.deltaAvailableBase).to.be.lt(baseAmount)

            const swapResponse = await clearingHouse.connect(bob).callStatic.swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: false,
                amount: baseAmount,
                sqrtPriceLimitX96: priceLimit,
            })

            // real tx to trigger price update
            await clearingHouse.connect(bob).swap({
                baseToken: baseToken.address,
                // sell base
                isBaseToQuote: true,
                isExactInput: false,
                amount: baseAmount,
                sqrtPriceLimitX96: priceLimit,
            })

            const partialSwapResponse = [
                swapResponse.base,
                swapResponse.quote,
                swapResponse.exchangedPositionSize,
                swapResponse.exchangedPositionNotional,
                (await pool.slot0())[0],
            ]
            expect(quoteResponse).to.be.deep.eq(partialSwapResponse)
        })

        it("force error, unmatched output amount when liquidity is not enough", async () => {
            const quoteAmount = parseEther("3000")
            await expect(
                quoter.callStatic.swap({
                    baseToken: baseToken.address,
                    // sell base
                    isBaseToQuote: true,
                    isExactInput: false,
                    amount: quoteAmount,
                    sqrtPriceLimitX96: 0,
                }),
            ).revertedWith("Q_UOA")

            await expect(
                clearingHouse.connect(bob).callStatic.swap({
                    baseToken: baseToken.address,
                    // sell base
                    isBaseToQuote: true,
                    isExactInput: false,
                    amount: quoteAmount,
                    sqrtPriceLimitX96: 0,
                }),
            ).revertedWith("UB_UOA")
        })
    })

    describe("Quote.swap in edge cases", async () => {
        it("force error, zero input", async () => {
            await expect(
                quoter.callStatic.swap({
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: false,
                    // zero input
                    amount: "0",
                    sqrtPriceLimitX96: "0",
                }),
            ).revertedWith("Q_ZI")
        })

        it("force error, 0 liquidity swap", async () => {
            // remove alice's all liquidity
            const aliceOrder = await orderBook
                .connect(alice)
                .getOpenOrder(alice.address, baseToken.address, lowerTick, upperTick)
            await clearingHouse.connect(alice).removeLiquidity({
                baseToken: baseToken.address,
                lowerTick: lowerTick,
                upperTick: upperTick,
                liquidity: aliceOrder.liquidity,
                minBase: "0",
                minQuote: "0",
                deadline: ethers.constants.MaxUint256,
            })

            await expect(
                quoter.callStatic.swap({
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: false,
                    amount: "100",
                    sqrtPriceLimitX96: "0",
                }),
            ).revertedWith("Q_F0S")
        })

        it("force error, base token not exists", async () => {
            await expect(
                quoter.callStatic.swap({
                    // incorrectly use quote token address
                    baseToken: quoteToken.address,
                    isBaseToQuote: true,
                    isExactInput: false,
                    amount: "100",
                    sqrtPriceLimitX96: "0",
                }),
            ).revertedWith("MR_PNE")
        })

        it("force error, unexpected call to callback function", async () => {
            await expect(
                quoter.uniswapV3SwapCallback("10", "20", defaultAbiCoder.encode(["address"], [baseToken.address])),
            ).revertedWith("Q_FSV")
        })
    })
})
