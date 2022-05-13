import { FakeContract } from "@defi-wonderland/smock"
import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    DelegateApproval,
    LimitOrderBook,
    LimitOrderFeeVault,
    QuoteToken,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { initAndAddPool } from "../helper/marketHelper"
import { getMaxTickRange, priceToTick } from "../helper/number"
import { mintAndDeposit, withdraw } from "../helper/token"
import { forwardTimestamp } from "../shared/time"
import { encodePriceSqrt, syncIndexToMarketPrice } from "../shared/utilities"
import { createLimitOrderFixture, LimitOrderFixture } from "./fixtures"
import { getOrderHash, getSignature } from "./orderUtils"

describe("LimitOrderBook fillLimitOrder", function () {
    const [admin, trader, keeper, maker, alice] = waffle.provider.getWallets()
    let fixture: LimitOrderFixture
    let clearingHouse: TestClearingHouse
    let accountBalance: AccountBalance
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedBaseAggregator: FakeContract<TestAggregatorV3>
    let delegateApproval: DelegateApproval
    let limitOrderBook: LimitOrderBook
    let limitOrderFeeVault: LimitOrderFeeVault
    let rewardToken: TestERC20

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        accountBalance = fixture.accountBalance
        vault = fixture.vault
        collateral = fixture.USDC
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        mockedBaseAggregator = fixture.mockedBaseAggregator
        pool = fixture.pool
        delegateApproval = fixture.delegateApproval
        limitOrderBook = fixture.limitOrderBook
        limitOrderFeeVault = fixture.limitOrderFeeVault
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

    it("fill limit order", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            orderType: fixture.orderTypeLimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)

        const oldRewardBalance = await rewardToken.balanceOf(keeper.address)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
        await expect(tx)
            .to.emit(limitOrderBook, "LimitOrderFilled")
            .withArgs(trader.address, baseToken.address, orderHash, keeper.address, fixture.rewardAmount)

        await expect(tx).to.emit(limitOrderFeeVault, "Disbursed").withArgs(keeper.address, fixture.rewardAmount)
        expect(await rewardToken.balanceOf(keeper.address)).to.be.eq(oldRewardBalance.add(fixture.rewardAmount))

        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(parseEther("0.1"))
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
            parseEther("-300"),
        )
    })

    it("fill two orders with the same values but different salt", async () => {
        // long 1 ETH (base) at $3000 with $3000 (quote)
        const limitOrder1 = {
            orderType: fixture.orderTypeLimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false, // long: Q2B
            isExactInput: true, // exact input: quote
            amount: parseEther("3000").toString(), // quote amount: $3000
            oppositeAmountBound: parseEther("1").toString(), // base amount: 1 ETH
            deadline: ethers.constants.MaxUint256.toString(), // no expiration date
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero, // no referral code
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        const limitOrder2 = {
            ...limitOrder1,
            salt: 2,
        }

        const signature1 = await getSignature(fixture, limitOrder1, trader)
        const signature2 = await getSignature(fixture, limitOrder2, trader)
        expect(signature1).to.be.not.eq(signature2)

        const tx1 = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder1, signature1, parseEther("0"))
        await expect(tx1).to.emit(limitOrderBook, "LimitOrderFilled")

        const tx2 = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder2, signature2, parseEther("0"))
        await expect(tx2).to.emit(limitOrderBook, "LimitOrderFilled")
    })

    it("force error, when order is already filled", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            orderType: fixture.orderTypeLimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300"),
            oppositeAmountBound: parseEther("0.1"),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(
            await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
        ).to.emit(clearingHouse, "PositionChanged")
        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(parseEther("0.1"))
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
            parseEther("-300"),
        )

        await expect(
            limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
        ).to.revertedWith("LOB_OMBU")
    })

    it("force error, when order is already cancelled", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            orderType: fixture.orderTypeLimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300"),
            oppositeAmountBound: parseEther("0.1"),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(await limitOrderBook.connect(trader).cancelLimitOrder(limitOrder)).to.emit(
            limitOrderBook,
            "LimitOrderCancelled",
        )

        await expect(
            limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
        ).to.revertedWith("LOB_OMBU")
    })

    it("force error, fillOrder when reduceOnly = true and trader has no position", async () => {
        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(parseEther("0"))

        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            orderType: fixture.orderTypeLimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: true,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(
            limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
        ).to.be.revertedWith("LOB_ROINS")
    })

    describe("fillOrder when reduceOnly = true and trader has long position", () => {
        beforeEach(async () => {
            // long 0.1 ETH at $3000 with $300
            await clearingHouse.connect(trader).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: parseEther("300"),
                oppositeAmountBound: parseEther("0.1"),
                deadline: ethers.constants.MaxUint256,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
            })

            // actually get: 0.100337305809351601 ETH
            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gt(parseEther("0"))
        })

        it("fill order when partial reduce", async () => {
            // short 0.05 ETH at $2800 with $150
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: parseEther("0.05").toString(),
                oppositeAmountBound: parseEther("140").toString(),
                deadline: ethers.constants.MaxUint256.toString(),
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: true,
                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
            await expect(tx)
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(trader.address, baseToken.address, orderHash, keeper.address, fixture.rewardAmount)

            await expect(tx).to.emit(limitOrderFeeVault, "Disbursed").withArgs(keeper.address, fixture.rewardAmount)

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(
                parseEther("0.05"),
            )

            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.gte(
                parseEther("-160"),
            )
        })

        it("fill order when fully close", async () => {
            const oldPositionSize = await accountBalance.getTakerPositionSize(trader.address, baseToken.address)

            // short (close) the whole ETH position at $2800 with around $280
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: oldPositionSize.toString(),
                oppositeAmountBound: parseEther("280").toString(),
                deadline: ethers.constants.MaxUint256.toString(),
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: true,
                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
            await expect(tx)
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(trader.address, baseToken.address, orderHash, keeper.address, fixture.rewardAmount)

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("0"),
            )

            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
                parseEther("0"),
            )
        })

        it("force error, reduceOnly is not satisfied when increasing long position", async () => {
            // long 0.1 ETH at $3000 with $300
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: parseEther("300"),
                oppositeAmountBound: parseEther("0.1"),
                deadline: ethers.constants.MaxUint256,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: true,
                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
            ).to.be.revertedWith("LOB_ROINS")
        })

        it("force error, reduceOnly is not satisfied when creating a reverse position", async () => {
            // short 0.2 ETH at $2800 with $560 (more than the old long position)
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: parseEther("0.2").toString(),
                oppositeAmountBound: parseEther("560").toString(),
                deadline: ethers.constants.MaxUint256.toString(),
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: true,
                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
            ).to.be.revertedWith("LOB_RSCBGTOS")
        })
    })

    describe("fillOrder when reduceOnly = true and trader has short position", () => {
        beforeEach(async () => {
            // short 0.1 ETH at $2900 with $290
            await clearingHouse.connect(trader).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: parseEther("0.1"),
                oppositeAmountBound: parseEther("290"),
                deadline: ethers.constants.MaxUint256,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
            })

            // actually get: -0.1 ETH
            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("-0.1"),
            )
        })

        it("fill order when partial reduce", async () => {
            // long 0.05 ETH at $3000 with $150
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: parseEther("0.05").toString(),
                oppositeAmountBound: parseEther("150").toString(),
                deadline: ethers.constants.MaxUint256.toString(),
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: true,
                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
            await expect(tx)
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(trader.address, baseToken.address, orderHash, keeper.address, fixture.rewardAmount)

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("-0.05"),
            )

            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
                parseEther("146.519225712358588504"),
            )
        })

        it("fill order when fully close", async () => {
            const oldPositionSize = await accountBalance.getTakerPositionSize(trader.address, baseToken.address)

            // long (close) the whole ETH position at $3000 with around $300
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: oldPositionSize.abs().toString(),
                oppositeAmountBound: parseEther("300").toString(),
                deadline: ethers.constants.MaxUint256.toString(),
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: true,
                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
            await expect(tx)
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(trader.address, baseToken.address, orderHash, keeper.address, fixture.rewardAmount)

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("0"),
            )

            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
                parseEther("0"),
            )
        })

        it("force error, reduceOnly is not satisfied when increasing short position", async () => {
            // short 0.1 ETH at $3000 with $300
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: parseEther("0.1"),
                oppositeAmountBound: parseEther("300"),
                deadline: ethers.constants.MaxUint256,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: true,
                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
            ).to.be.revertedWith("LOB_ROINS")
        })

        it("force error, reduceOnly is not satisfied when creating a reverse position", async () => {
            // long 0.2 ETH at $3000 with $600 (more than the old short position)
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: parseEther("0.2").toString(),
                oppositeAmountBound: parseEther("600").toString(),
                deadline: ethers.constants.MaxUint256.toString(),
                referralCode: ethers.constants.HashZero,
                sqrtPriceLimitX96: 0,
                reduceOnly: true,

                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
            ).to.be.revertedWith("LOB_RSCBGTOS")
        })
    })

    // TODO: test deadline, check ClearingHouse.addLiquidity L104
    // need to define the upperbound of deadline with BE and FE
    describe("expiration", () => {
        it("limit order is not expired yet", async () => {
            const now = (await waffle.provider.getBlock("latest")).timestamp
            // long 0.1 ETH at $3000 with $300
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: parseEther("300").toString(),
                oppositeAmountBound: parseEther("0.1").toString(),
                deadline: now + 1000,
                referralCode: ethers.constants.HashZero,
                sqrtPriceLimitX96: 0,
                reduceOnly: false,

                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
            await expect(tx)
                .to.emit(limitOrderBook, "LimitOrderFilled")
                .withArgs(trader.address, baseToken.address, orderHash, keeper.address, fixture.rewardAmount)

            await expect(tx).to.emit(limitOrderFeeVault, "Disbursed").withArgs(keeper.address, fixture.rewardAmount)

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(
                parseEther("0.1"),
            )
            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.gte(
                parseEther("-300"),
            )
        })

        it("force error, limit order is already expired", async () => {
            const now = (await waffle.provider.getBlock("latest")).timestamp
            await clearingHouse.setBlockTimestamp(now)
            // long 0.1 ETH at $3000 with $300
            const limitOrder = {
                orderType: fixture.orderTypeLimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: parseEther("300"),
                oppositeAmountBound: parseEther("0.1"),
                deadline: now + 1,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: false,
                roundIdWhenCreated: parseEther("0").toString(),
                triggerPrice: parseEther("0").toString(),
            }
            await forwardTimestamp(clearingHouse, 10)
            const signature = await getSignature(fixture, limitOrder, trader)
            await expect(
                limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
            ).to.be.revertedWith("CH_TE")
        })
    })

    it("force error, user's balance is not enough when fill limit order ", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            orderType: fixture.orderTypeLimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await withdraw(trader, vault, 1000, fixture.USDC)

        await expect(
            limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
        ).to.be.revertedWith("CH_NEFCI")
    })

    it("force error, fill order failed after user revoke his/her approval", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            orderType: fixture.orderTypeLimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await delegateApproval.connect(trader).revoke(limitOrderBook.address, fixture.clearingHouseOpenPositionAction)

        await expect(
            limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
        ).to.be.revertedWith("CH_SHNAOPT")
    })

    it("keeper keep trying to fill limit orders in a row", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            orderType: fixture.orderTypeLimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)

        const alicePosition = {
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("600000"),
            oppositeAmountBound: parseEther("195"),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
        }
        // alice open long position to make market price higher, 2960 -> 3023.113298
        await mintAndDeposit(fixture, alice, 1000000)
        await clearingHouse.connect(alice).openPosition(alicePosition)

        // cannot fill this limit order because price is not right
        await expect(
            limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
        ).to.be.revertedWith("CH_TLRL")

        // alice close her position to make market price lower
        await clearingHouse.connect(alice).closePosition({
            baseToken: baseToken.address,
            oppositeAmountBound: 0,
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
        })

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
        await expect(tx)
            .to.emit(limitOrderBook, "LimitOrderFilled")
            .withArgs(trader.address, baseToken.address, orderHash, keeper.address, fixture.rewardAmount)

        await expect(tx).to.emit(limitOrderFeeVault, "Disbursed").withArgs(keeper.address, fixture.rewardAmount)

        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(parseEther("0.1"))
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.gte(
            parseEther("-300"),
        )
    })

    it("force error, only support limit order type now", async () => {
        // long 0.1 ETH at $3000 with $300
        const limitOrder = {
            orderType: fixture.orderTypeStopLimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300"),
            oppositeAmountBound: parseEther("0.1"),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(
            limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
        ).to.revertedWith("LOB_OSLO")
    })
})
