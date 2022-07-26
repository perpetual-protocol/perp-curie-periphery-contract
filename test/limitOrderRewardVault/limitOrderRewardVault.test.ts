import { FakeContract } from "@defi-wonderland/smock"
import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther, parseUnits } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    DelegateApproval,
    LimitOrderBook,
    LimitOrderRewardVault,
    QuoteToken,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    TestLimitOrderBook,
    UniswapV3Pool,
} from "../../typechain-types"
import { initAndAddPool } from "../helper/marketHelper"
import { getMaxTickRange, priceToTick } from "../helper/number"
import { mintAndDeposit } from "../helper/token"
import { createLimitOrderFixture, LimitOrderFixture } from "../limitOrderBook/fixtures"
import { getOrderHash, getSignature, OrderType } from "../limitOrderBook/orderUtils"
import { encodePriceSqrt, syncIndexToMarketPrice } from "../shared/utilities"

describe("LimitOrderRewardVault", function () {
    const [admin, trader, keeper, maker, alice] = waffle.provider.getWallets()
    let fixture: LimitOrderFixture
    let clearingHouse: TestClearingHouse
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedBaseAggregator: FakeContract<TestAggregatorV3>
    let delegateApproval: DelegateApproval
    let limitOrderBook: LimitOrderBook
    let limitOrderRewardVault: LimitOrderRewardVault
    let rewardToken: TestERC20

    const emptyAddress = "0x0000000000000000000000000000000000000000"

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
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

    it("setRewardTokenAndAmount", async () => {
        const rewardToken2Factory = await ethers.getContractFactory("TestERC20")
        const rewardToken2 = (await rewardToken2Factory.deploy()) as TestERC20
        await rewardToken2.__TestERC20_init("TestWETH", "TestWETH", 18)
        const rewardAmount2 = parseUnits("0.0001", 18)

        await expect(limitOrderRewardVault.setRewardTokenAndAmount(rewardToken2.address, rewardAmount2))
            .to.emit(limitOrderRewardVault, "RewardTokenAndAmountChanged")
            .withArgs(rewardToken2.address, rewardAmount2)

        expect(await limitOrderRewardVault.rewardToken()).to.be.eq(rewardToken2.address)
        expect(await limitOrderRewardVault.rewardAmount()).to.be.eq(rewardAmount2)

        // mint token to limitOrderRewardVault
        const rewardToken2Decimals = await rewardToken2.decimals()
        const mintedRewardToken2Amount = parseUnits("10", rewardToken2Decimals)
        await rewardToken2.mint(limitOrderRewardVault.address, mintedRewardToken2Amount)

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

        const oldKeeperBalance = await rewardToken2.balanceOf(keeper.address)
        const rewardAmount = await limitOrderRewardVault.rewardAmount()

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
        await expect(tx).not.to.emit(limitOrderRewardVault, "Undisbursed")
        await expect(tx)
            .to.emit(limitOrderRewardVault, "Disbursed")
            .withArgs(orderHash, keeper.address, rewardToken2.address, rewardAmount2)

        const newKeeperBalance = await rewardToken2.balanceOf(keeper.address)
        expect(newKeeperBalance.sub(oldKeeperBalance)).to.be.eq(rewardAmount)
    })

    it("force error, setRewardTokenAndAmount", async () => {
        await expect(limitOrderRewardVault.setRewardTokenAndAmount(emptyAddress, "0")).to.be.revertedWith("LOFV_RTINC")

        await expect(
            limitOrderRewardVault.connect(alice).setRewardTokenAndAmount(emptyAddress, "0"),
        ).to.be.revertedWith("SO_CNO")
    })

    it("setLimitOrderBook", async () => {
        const limitOrderBook2Factory = await ethers.getContractFactory("TestLimitOrderBook")
        const limitOrderBook2 = (await limitOrderBook2Factory.deploy()) as TestLimitOrderBook
        await limitOrderBook2.initialize(
            fixture.EIP712Name,
            fixture.EIP712Version,
            clearingHouse.address,
            limitOrderRewardVault.address,
            parseUnits("100", 18),
        )

        await expect(limitOrderRewardVault.setLimitOrderBook(limitOrderBook2.address))
            .to.emit(limitOrderRewardVault, "LimitOrderBookChanged")
            .withArgs(limitOrderBook2.address)

        expect(await limitOrderRewardVault.limitOrderBook()).to.be.eq(limitOrderBook2.address)
    })

    it("force error, setLimitOrderBook", async () => {
        await expect(limitOrderRewardVault.setLimitOrderBook(emptyAddress)).to.be.revertedWith("LOFV_LOBINC")

        await expect(limitOrderRewardVault.connect(alice).setLimitOrderBook(emptyAddress)).to.be.revertedWith("SO_CNO")
    })

    it("disburse", async () => {
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

        const oldKeeperBalance = await rewardToken.balanceOf(keeper.address)
        const rewardAmount = await limitOrderRewardVault.rewardAmount()

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
        await expect(tx).not.to.emit(limitOrderRewardVault, "Undisbursed")
        await expect(tx)
            .to.emit(limitOrderRewardVault, "Disbursed")
            .withArgs(orderHash, keeper.address, rewardToken.address, fixture.rewardAmount)

        const newKeeperBalance = await rewardToken.balanceOf(keeper.address)
        expect(newKeeperBalance.sub(oldKeeperBalance)).to.be.eq(rewardAmount)
    })

    it("disburse when rewardAmount is 0 (no rewards)", async () => {
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

        await limitOrderRewardVault.setRewardTokenAndAmount(rewardToken.address, "0")
        expect(await limitOrderRewardVault.rewardAmount()).to.be.eq("0")

        const oldKeeperBalance = await rewardToken.balanceOf(keeper.address)

        const signature = await getSignature(fixture, limitOrder, trader)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
        await expect(tx).not.to.emit(limitOrderRewardVault, "Undisbursed")
        await expect(tx).not.to.emit(limitOrderRewardVault, "Disbursed")

        const newKeeperBalance = await rewardToken.balanceOf(keeper.address)
        expect(newKeeperBalance).to.be.eq(oldKeeperBalance)
    })

    it("disburse when rewardToken balance is not enough", async () => {
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

        await limitOrderRewardVault.setRewardTokenAndAmount(rewardToken.address, parseUnits("100000", 18))

        const oldKeeperBalance = await rewardToken.balanceOf(keeper.address)
        const newRewardAmount = await limitOrderRewardVault.rewardAmount()

        const signature = await getSignature(fixture, limitOrder, trader)
        const orderHash = await getOrderHash(fixture, limitOrder)

        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))
        await expect(tx)
            .to.emit(limitOrderRewardVault, "Undisbursed")
            .withArgs(orderHash, keeper.address, rewardToken.address, newRewardAmount)
        await expect(tx).not.to.emit(limitOrderRewardVault, "Disbursed")

        const newKeeperBalance = await rewardToken.balanceOf(keeper.address)
        expect(newKeeperBalance).to.be.eq(oldKeeperBalance)
    })

    it("force error, disburse by non-LimitOrderBook", async () => {
        await expect(
            limitOrderRewardVault.connect(alice).disburse(keeper.address, ethers.constants.HashZero),
        ).to.be.revertedWith("LOFV_SMBLOB")
    })

    it("withdraw", async () => {
        expect(await rewardToken.balanceOf(admin.address)).to.be.eq(0)

        const vaultBalance = await rewardToken.balanceOf(limitOrderRewardVault.address)

        const tx = await limitOrderRewardVault.connect(admin).withdraw(vaultBalance)
        await expect(tx)
            .to.emit(limitOrderRewardVault, "Withdrawn")
            .withArgs(admin.address, rewardToken.address, vaultBalance)

        expect(await rewardToken.balanceOf(admin.address)).to.be.eq(vaultBalance)
        expect(await rewardToken.balanceOf(limitOrderRewardVault.address)).to.be.eq(0)
    })

    it("force error, withdraw when rewardToken balance is not enough", async () => {
        const vaultBalance = await rewardToken.balanceOf(limitOrderRewardVault.address)

        await expect(limitOrderRewardVault.connect(admin).withdraw(vaultBalance.add(1))).to.be.revertedWith(
            "LOFV_NEBTW",
        )
    })

    it("force error, withdraw by non-owner", async () => {
        await expect(limitOrderRewardVault.connect(alice).withdraw(parseEther("1"))).to.be.revertedWith("SO_CNO")
    })
})
