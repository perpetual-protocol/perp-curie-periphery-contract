import { FakeContract } from "@defi-wonderland/smock"
import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    DelegateApproval,
    Exchange,
    LimitOrderBook,
    LimitOrderRewardVault,
    QuoteToken,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    TestKeeper,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { initAndAddPool } from "../helper/marketHelper"
import { getMaxTickRange, priceToTick } from "../helper/number"
import { mintAndDeposit, withdraw } from "../helper/token"
import { forwardTimestamp } from "../shared/time"
import { encodePriceSqrt, getMarketTwap, syncIndexToMarketPrice } from "../shared/utilities"
import { createLimitOrderFixture, LimitOrderFixture } from "./fixtures"
import { getOrderHash, getSignature, OrderStatus, OrderType } from "./orderUtils"

describe("LimitOrderBook fillLimitOrder", function () {
    const [admin, trader, keeper, maker, alice] = waffle.provider.getWallets()
    let fixture: LimitOrderFixture
    let clearingHouse: TestClearingHouse
    let accountBalance: AccountBalance
    let exchange: Exchange
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedBaseAggregator: FakeContract<TestAggregatorV3>
    let delegateApproval: DelegateApproval
    let limitOrderBook: LimitOrderBook
    let limitOrderRewardVault: LimitOrderRewardVault
    let rewardToken: TestERC20

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        accountBalance = fixture.accountBalance
        exchange = fixture.exchange
        vault = fixture.vault
        collateral = fixture.USDC
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        mockedBaseAggregator = fixture.mockedBaseAggregator
        pool = fixture.pool
        delegateApproval = fixture.delegateApproval
        limitOrderBook = fixture.limitOrderBook
        limitOrderRewardVault = fixture.limitOrderRewardVault
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

    // TODO: should limit order only support (Q2B exact output) and (B2Q exact input)?
    //       => trader specifies position size
    //       since (Q2B exact input) and (B2Q exact output) doesn't really make sense for limit orders
    //       => trader specifies quote amount
    it("fill limit order: Q2B (long) exact output", async () => {
        // a limit order to long exact 0.1 ETH for a maximum of $300 at limit price $3000
        // fill price is guaranteed to be <= limit price
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(), // upper bound of input quote
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)
        expect(await limitOrderBook.getOrderStatus(orderHash)).to.be.eq(OrderStatus.Unfilled)

        const oldRewardBalance = await rewardToken.balanceOf(keeper.address)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
        await expect(tx).to.emit(clearingHouse, "PositionChanged").withArgs(
            trader.address,
            baseToken.address,
            parseEther("0.1"), // exchangedPositionSize
            parseEther("-296.001564233989843681"), // exchangedPositionNotional
            parseEther("2.989914790242321654"), // fee
            parseEther("-298.991479024232165335"), // openNotional
            parseEther("0"), // realizedPnl
            "4310500842637813911199943339818", // sqrtPriceAfterX96
        )
        await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
            trader.address,
            baseToken.address,
            orderHash,
            limitOrder.orderType,
            keeper.address,
            parseEther("0.1"), // exchangedPositionSize
            parseEther("-296.001564233989843681"), // exchangedPositionNotional
            parseEther("2.989914790242321654"), // fee
        )
        await expect(tx)
            .to.emit(limitOrderRewardVault, "Disbursed")
            .withArgs(orderHash, keeper.address, rewardToken.address, fixture.rewardAmount)

        expect(await limitOrderBook.getOrderStatus(orderHash)).to.be.eq(OrderStatus.Filled)

        expect(await rewardToken.balanceOf(keeper.address)).to.be.eq(oldRewardBalance.add(fixture.rewardAmount))

        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(parseEther("0.1"))
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
            parseEther("-298.991479024232165335"),
        )
    })

    it("fill limit order: B2Q (short) exact input", async () => {
        // a limit order to short exact 0.1 ETH for a minimum of $290 at limit price $2900
        // fill price is guaranteed to be >= limit price
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: true,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("290").toString(), // lower bound of output quote
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)
        expect(await limitOrderBook.getOrderStatus(orderHash)).to.be.eq(OrderStatus.Unfilled)

        const oldRewardBalance = await rewardToken.balanceOf(keeper.address)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
        await expect(tx).to.emit(clearingHouse, "PositionChanged").withArgs(
            trader.address,
            baseToken.address,
            parseEther("-0.1"), // exchangedPositionSize
            parseEther("295.998435782542603038"), // exchangedPositionNotional
            parseEther("2.959984357825426031"), // fee
            parseEther("293.038451424717177007"), // openNotional
            parseEther("0"), // realizedPnl
            "4310455284795461354568664311869", // sqrtPriceAfterX96
        )
        await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
            trader.address,
            baseToken.address,
            orderHash,
            limitOrder.orderType,
            keeper.address,
            parseEther("-0.1"), // exchangedPositionSize
            parseEther("295.998435782542603038"), // exchangedPositionNotional
            parseEther("2.959984357825426031"), // fee
        )
        await expect(tx)
            .to.emit(limitOrderRewardVault, "Disbursed")
            .withArgs(orderHash, keeper.address, rewardToken.address, fixture.rewardAmount)

        expect(await limitOrderBook.getOrderStatus(orderHash)).to.be.eq(OrderStatus.Filled)

        expect(await rewardToken.balanceOf(keeper.address)).to.be.eq(oldRewardBalance.add(fixture.rewardAmount))

        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
            parseEther("-0.1"),
        )
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
            parseEther("293.038451424717177007"),
        )
    })

    it("fill limit order: Q2B (long) exact input", async () => {
        // a limit order to long a minimum of 0.1 ETH for exact $300 at limit price $3000
        // fill price is guaranteed to be <= limit price
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("300").toString(),
            oppositeAmountBound: parseEther("0.1").toString(), // lower bound of output base
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)

        const oldRewardBalance = await rewardToken.balanceOf(keeper.address)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
        await expect(tx).to.emit(clearingHouse, "PositionChanged").withArgs(
            trader.address,
            baseToken.address,
            parseEther("0.100337305809351601"), // exchangedPositionSize
            parseEther("-297"), // exchangedPositionNotional
            parseEther("3"), // fee
            parseEther("-300"), // openNotional
            parseEther("0"), // realizedPnl
            "4310500919473251792575863005301", // sqrtPriceAfterX96
        )
        await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
            trader.address,
            baseToken.address,
            orderHash,
            limitOrder.orderType,
            keeper.address,
            parseEther("0.100337305809351601"), // exchangedPositionSize
            parseEther("-297"), // exchangedPositionNotional
            parseEther("3"), // fee
        )
        await expect(tx)
            .to.emit(limitOrderRewardVault, "Disbursed")
            .withArgs(orderHash, keeper.address, rewardToken.address, fixture.rewardAmount)

        expect(await rewardToken.balanceOf(keeper.address)).to.be.eq(oldRewardBalance.add(fixture.rewardAmount))

        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
            parseEther("0.100337305809351601"),
        )
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
            parseEther("-300"),
        )
    })

    it("fill limit order: B2Q (short) exact output", async () => {
        // a limit order to short a maximum of 0.1 ETH for exact $290 at limit price $2900
        // fill price is guaranteed to be >= limit price
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: false,
            amount: parseEther("290").toString(),
            oppositeAmountBound: parseEther("0.1").toString(), // upper bound of input base
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)

        const oldRewardBalance = await rewardToken.balanceOf(keeper.address)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
        await expect(tx).to.emit(clearingHouse, "PositionChanged").withArgs(
            trader.address,
            baseToken.address,
            parseEther("-0.098963116512426526"), // exchangedPositionSize
            parseEther("292.929292929292929293"), // exchangedPositionNotional
            parseEther("2.929292929292929293"), // fee
            parseEther("290"), // openNotional
            parseEther("0"), // realizedPnl
            "4310455520983850310514131115570", // sqrtPriceAfterX96
        )
        await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
            trader.address,
            baseToken.address,
            orderHash,
            limitOrder.orderType,
            keeper.address,
            parseEther("-0.098963116512426526"), // exchangedPositionSize
            parseEther("292.929292929292929293"), // exchangedPositionNotional
            parseEther("2.929292929292929293"), // fee
        )
        await expect(tx)
            .to.emit(limitOrderRewardVault, "Disbursed")
            .withArgs(orderHash, keeper.address, rewardToken.address, fixture.rewardAmount)

        expect(await rewardToken.balanceOf(keeper.address)).to.be.eq(oldRewardBalance.add(fixture.rewardAmount))

        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.gte(
            parseEther("-0.098963116512426526"),
        )
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(parseEther("290"))
    })

    it("fill two orders with the same values but different salt", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder1 = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
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

    it("force error, fillLimitOrder by non-whitelisted EOA", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        const testKeeperContractFactory = await ethers.getContractFactory("TestKeeper")
        const testKeeperContract = (await testKeeperContractFactory.deploy(limitOrderBook.address)) as TestKeeper

        // keeper (EOA) -> TestKeeper (contract) -> LimitOrderBook
        await expect(testKeeperContract.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.revertedWith(
            "LOB_SMBE",
        )
    })

    it("force error, fillLimitOrder by whitelisted EOA", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        const testKeeperContractFactory = await ethers.getContractFactory("TestKeeper")
        const testKeeperContract = (await testKeeperContractFactory.deploy(limitOrderBook.address)) as TestKeeper
        limitOrderBook.setWhitelistContractCaller(testKeeperContract.address, true)

        // keeper (EOA) -> TestKeeper (contract) -> LimitOrderBook
        await expect(testKeeperContract.connect(keeper).fillLimitOrder(limitOrder, signature, "0"))
    })

    it("force error, order value is too small", async () => {
        // long 0.01 ETH with $30 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.01").toString(),
            oppositeAmountBound: parseEther("30").toString(),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.revertedWith(
            "LOB_OVTS",
        )
    })

    it("force error, when order is already filled", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.emit(
            limitOrderBook,
            "LimitOrderFilled",
        )

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.revertedWith(
            "LOB_OMBU",
        )
    })

    it("force error, when order is already cancelled", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(await limitOrderBook.connect(trader).cancelLimitOrder(limitOrder)).to.emit(
            limitOrderBook,
            "LimitOrderCancelled",
        )

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.revertedWith(
            "LOB_OMBU",
        )
    })

    it("force error, fillOrder when reduceOnly = true and trader has no position", async () => {
        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(parseEther("0"))

        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: true,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.be.revertedWith(
            "LOB_ROINS",
        )
    })

    describe("fillOrder when reduceOnly = true and trader has long position", () => {
        beforeEach(async () => {
            // long 0.1 ETH with $300
            await clearingHouse.connect(trader).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: parseEther("0.1"),
                oppositeAmountBound: parseEther("300"),
                deadline: ethers.constants.MaxUint256,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
            })

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("0.1"),
            )
        })

        it("fill order when partial reduce", async () => {
            // short 0.05 ETH with $150 (limit price $2800)
            const limitOrder = {
                orderType: OrderType.LimitOrder,
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
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
            await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
                trader.address,
                baseToken.address,
                orderHash,
                limitOrder.orderType,
                keeper.address,
                parseEther("-0.05"), // exchangedPositionSize
                parseEther("148.001173176525668870"), // exchangedPositionNotional
                parseEther("1.480011731765256689"), // fee
            )

            await expect(tx)
                .to.emit(limitOrderRewardVault, "Disbursed")
                .withArgs(orderHash, keeper.address, rewardToken.address, fixture.rewardAmount)

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("0.05"),
            )

            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
                parseEther("-149.495739512116082668"),
            )
        })

        it("fill order when fully close", async () => {
            const oldPositionSize = await accountBalance.getTakerPositionSize(trader.address, baseToken.address)

            // short (close) the entire ETH position with $280 (limit price $2800)
            const limitOrder = {
                orderType: OrderType.LimitOrder,
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
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
            await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
                trader.address,
                baseToken.address,
                orderHash,
                limitOrder.orderType,
                keeper.address,
                parseEther("-0.1"), // exchangedPositionSize
                parseEther("296.001564233989843680"), // exchangedPositionNotional
                parseEther("2.960015642339898437"), // fee
            )

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("0"),
            )

            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
                parseEther("0"),
            )
        })

        it("force error, reduceOnly is not satisfied when increasing long position", async () => {
            // long 0.1 ETH with $300 (limit price $3000)
            const limitOrder = {
                orderType: OrderType.LimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: parseEther("0.1").toString(),
                oppositeAmountBound: parseEther("300").toString(),
                deadline: ethers.constants.MaxUint256,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: true,
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.be.revertedWith(
                "LOB_ROINS",
            )
        })

        it("force error, reduceOnly is not satisfied when creating a reverse position", async () => {
            // short 0.2 ETH with $560 (limit price $2800)
            // more than the old long position size
            const limitOrder = {
                orderType: OrderType.LimitOrder,
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
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.be.revertedWith(
                "LOB_ROINS",
            )
        })
    })

    describe("fillOrder when reduceOnly = true and trader has short position", () => {
        beforeEach(async () => {
            // short 0.1 ETH with $290
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

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("-0.1"),
            )
        })

        it("fill order when partial reduce", async () => {
            // long 0.05 ETH with $150 (limit price $3000)
            const limitOrder = {
                orderType: OrderType.LimitOrder,
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
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
            await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
                trader.address,
                baseToken.address,
                orderHash,
                limitOrder.orderType,
                keeper.address,
                parseEther("0.05"), // exchangedPositionSize
                parseEther("-147.998826837940222009"), // exchangedPositionNotional
                parseEther("1.494937644827679011"), // fee
            )

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("-0.05"),
            )

            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
                parseEther("146.519225712358588504"),
            )
        })

        it("fill order when fully close", async () => {
            const oldPositionSize = await accountBalance.getTakerPositionSize(trader.address, baseToken.address)

            // long (close) the entire ETH position (limit price $3000)
            const limitOrder = {
                orderType: OrderType.LimitOrder,
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
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
            await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
                trader.address,
                baseToken.address,
                orderHash,
                limitOrder.orderType,
                keeper.address,
                parseEther("0.1"), // exchangedPositionSize
                parseEther("-295.998435782542603039"), // exchangedPositionNotional
                parseEther("2.989883189722652556"), // fee
            )

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("0"),
            )

            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
                parseEther("0"),
            )
        })

        it("force error, reduceOnly is not satisfied when increasing short position", async () => {
            // short 0.1 ETH with $290 (limit price $2900)
            const limitOrder = {
                orderType: OrderType.LimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: parseEther("0.1"),
                oppositeAmountBound: parseEther("290"),
                deadline: ethers.constants.MaxUint256,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: true,
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.be.revertedWith(
                "LOB_ROINS",
            )
        })

        it("force error, reduceOnly is not satisfied when creating a reverse position", async () => {
            // long 0.2 ETH with $600 (limit price $3000)
            // more than the old short position size
            const limitOrder = {
                orderType: OrderType.LimitOrder,
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
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)

            await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.be.revertedWith(
                "LOB_ROINS",
            )
        })
    })

    // TODO: we should probably define a upper bound of `deadline` in backend/frontend
    describe("expiration", () => {
        it("limit order is not expired yet", async () => {
            const now = (await waffle.provider.getBlock("latest")).timestamp

            // long 0.1 ETH with $300 (limit price $3000)
            const limitOrder = {
                orderType: OrderType.LimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: parseEther("0.1").toString(),
                oppositeAmountBound: parseEther("300").toString(),
                deadline: now + 1000,
                referralCode: ethers.constants.HashZero,
                sqrtPriceLimitX96: 0,
                reduceOnly: false,
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)
            const orderHash = await getOrderHash(fixture, limitOrder)

            const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
            await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
                trader.address,
                baseToken.address,
                orderHash,
                limitOrder.orderType,
                keeper.address,
                parseEther("0.1"), // exchangedPositionSize
                parseEther("-296.001564233989843681"), // exchangedPositionNotional
                parseEther("2.989914790242321654"), // fee
            )

            await expect(tx)
                .to.emit(limitOrderRewardVault, "Disbursed")
                .withArgs(orderHash, keeper.address, rewardToken.address, fixture.rewardAmount)

            expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(
                parseEther("0.1"),
            )
            expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
                parseEther("-298.991479024232165335"),
            )
        })

        it("force error, limit order is already expired", async () => {
            const now = (await waffle.provider.getBlock("latest")).timestamp
            await clearingHouse.setBlockTimestamp(now)

            // long 0.1 ETH with $300 (limit price $3000)
            const limitOrder = {
                orderType: OrderType.LimitOrder,
                salt: 1,
                trader: trader.address,
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: parseEther("0.1").toString(),
                oppositeAmountBound: parseEther("300").toString(),
                deadline: now,
                sqrtPriceLimitX96: 0,
                referralCode: ethers.constants.HashZero,
                reduceOnly: false,
                roundIdWhenCreated: "0",
                triggerPrice: parseEther("0").toString(),
            }

            const signature = await getSignature(fixture, limitOrder, trader)

            await forwardTimestamp(clearingHouse, 10)

            await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.be.revertedWith(
                "CH_TE",
            )
        })
    })

    it("force error, user's balance is not enough when fill limit order ", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await withdraw(trader, vault, 1000, fixture.USDC)

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.be.revertedWith(
            "CH_NEFCI",
        )
    })

    it("force error, fill order failed after user revoke his/her approval", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)

        await delegateApproval.connect(trader).revoke(limitOrderBook.address, fixture.clearingHouseOpenPositionAction)

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.be.revertedWith(
            "CH_SHNAOPT",
        )
    })

    it("keeper keep trying to fill limit orders in a row", async () => {
        // long 0.1 ETH with $300 (limit price $3000)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)

        // long 200 ETH
        const alicePosition = {
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("200"),
            oppositeAmountBound: parseEther("0"),
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
        }

        // alice opens long position to make market price higher, 2960 -> 3023
        await mintAndDeposit(fixture, alice, 1000000)
        await clearingHouse.connect(alice).openPosition(alicePosition)
        const marketPrice1 = parseFloat(await getMarketTwap(exchange, baseToken, 0))
        expect(marketPrice1).to.be.gt(3000)

        // cannot fill the limit order because market price > limit price ($3000)
        await expect(limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")).to.be.revertedWith(
            "CH_TMRL",
        )

        // alice closes her position to make market price lower, 3023 -> 2960
        await clearingHouse.connect(alice).closePosition({
            baseToken: baseToken.address,
            oppositeAmountBound: 0,
            deadline: ethers.constants.MaxUint256,
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
        })
        const marketPrice2 = parseFloat(await getMarketTwap(exchange, baseToken, 0))
        expect(marketPrice2).to.be.lt(3000)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, "0")
        await expect(tx).to.emit(limitOrderBook, "LimitOrderFilled").withArgs(
            trader.address,
            baseToken.address,
            orderHash,
            limitOrder.orderType,
            keeper.address,
            parseEther("0.1"), // exchangedPositionSize
            parseEther("-296.001564233989843681"), // exchangedPositionNotional
            parseEther("2.989914790242321654"), // fee
        )

        await expect(tx)
            .to.emit(limitOrderRewardVault, "Disbursed")
            .withArgs(orderHash, keeper.address, rewardToken.address, fixture.rewardAmount)

        expect(await accountBalance.getTakerPositionSize(trader.address, baseToken.address)).to.be.eq(parseEther("0.1"))
        expect(await accountBalance.getTakerOpenNotional(trader.address, baseToken.address)).to.be.eq(
            parseEther("-298.991479024232165335"),
        )
    })

    it("force error, invalid orderType", async () => {
        const badLimitOrder = {
            orderType: fixture.notExistedOrderType,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: parseEther("0.1").toString(),
            oppositeAmountBound: parseEther("300").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: "0",
        }

        const signature = await getSignature(fixture, badLimitOrder, trader)

        await expect(limitOrderBook.connect(keeper).fillLimitOrder(badLimitOrder, signature, "0")).to.revertedWith(
            "function was called with incorrect parameters",
        )
    })

    describe("whitelistContractCaller", () => {
        it("setWhitelistContractCaller correctly", async () => {
            const testKeeperContractFactory = await ethers.getContractFactory("TestKeeper")
            const testKeeperContract = (await testKeeperContractFactory.deploy(limitOrderBook.address)) as TestKeeper

            await limitOrderBook.setWhitelistContractCaller(testKeeperContract.address, true)
            expect(await limitOrderBook.isWhitelistContractCaller(testKeeperContract.address)).to.be.true

            await limitOrderBook.setWhitelistContractCaller(testKeeperContract.address, false)
            expect(await limitOrderBook.isWhitelistContractCaller(testKeeperContract.address)).to.be.false
        })
    })
})
