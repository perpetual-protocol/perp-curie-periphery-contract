import { FakeContract } from "@defi-wonderland/smock"
import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther, parseUnits } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    ClearingHouseConfig,
    DelegateApproval,
    Exchange,
    LimitOrderBook,
    LimitOrderFeeVault,
    MarketRegistry,
    OrderBook,
    QuoteToken,
    TestAccountBalance,
    TestAggregatorV3,
    TestClearingHouse,
    TestERC20,
    TestLimitOrderBook,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { initAndAddPool } from "../helper/marketHelper"
import { getMaxTickRange, priceToTick } from "../helper/number"
import { mintAndDeposit } from "../helper/token"
import { createLimitOrderFixture, LimitOrderFixture } from "../limitOrderBook/fixtures"
import { getSignature } from "../limitOrderBook/orderUtils"
import { encodePriceSqrt, syncIndexToMarketPrice } from "../shared/utilities"

describe("LimitOrderFeeVault", function () {
    const [admin, trader, keeper, maker, alice] = waffle.provider.getWallets()
    let fixture: LimitOrderFixture
    let limitOrderBook: LimitOrderBook
    let clearingHouse: TestClearingHouse
    let delegateApproval: DelegateApproval
    let marketRegistry: MarketRegistry
    let clearingHouseConfig: ClearingHouseConfig
    let exchange: Exchange
    let orderBook: OrderBook
    let accountBalance: TestAccountBalance
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let baseToken2: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let pool2: UniswapV3Pool
    let mockedBaseAggregator: FakeContract<TestAggregatorV3>
    let mockedBaseAggregator2: FakeContract<TestAggregatorV3>
    let collateralDecimals: number
    let rewardToken: TestERC20
    let limitOrderFeeVault: LimitOrderFeeVault

    const fakeSignature = "0x0000000000000000000000000000000000000000000000000000000000000000"
    const emptyAddress = "0x0000000000000000000000000000000000000000"

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        limitOrderBook = fixture.limitOrderBook
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        delegateApproval = fixture.delegateApproval

        orderBook = fixture.orderBook
        accountBalance = fixture.accountBalance as TestAccountBalance
        clearingHouseConfig = fixture.clearingHouseConfig
        vault = fixture.vault
        exchange = fixture.exchange
        marketRegistry = fixture.marketRegistry
        collateral = fixture.USDC
        baseToken = fixture.baseToken
        baseToken2 = fixture.baseToken2
        quoteToken = fixture.quoteToken
        mockedBaseAggregator = fixture.mockedBaseAggregator
        mockedBaseAggregator2 = fixture.mockedBaseAggregator2
        pool = fixture.pool
        pool2 = fixture.pool2
        collateralDecimals = await collateral.decimals()
        limitOrderFeeVault = fixture.limitOrderFeeVault
        rewardToken = fixture.rewardToken

        const pool1LowerTick: number = priceToTick(2000, await pool.tickSpacing())
        const pool1UpperTick: number = priceToTick(4000, await pool.tickSpacing())
        delegateApproval = fixture.delegateApproval
        limitOrderBook = fixture.limitOrderBook

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

        // prepare collateral for taker
        await mintAndDeposit(fixture, trader, 1000)

        await delegateApproval.connect(trader).approve([
            {
                delegate: limitOrderBook.address,
                action: fixture.clearingHouseOpenPositionAction,
            },
        ])
    })

    it("setRewardToken", async () => {
        const rewardToken2Factory = await ethers.getContractFactory("TestERC20")
        const rewardToken2 = (await rewardToken2Factory.deploy()) as TestERC20
        await rewardToken2.__TestERC20_init("TestPERP-2", "PERP-2", 18)

        await expect(limitOrderFeeVault.setRewardToken(rewardToken2.address))
            .to.emit(limitOrderFeeVault, "RewardTokenChanged")
            .withArgs(rewardToken2.address)

        expect(await limitOrderFeeVault.rewardToken()).to.be.eq(rewardToken2.address)

        await expect(limitOrderFeeVault.setRewardToken(emptyAddress)).to.be.revertedWith("LOFV_RTINC")

        await expect(limitOrderFeeVault.connect(alice).setRewardToken(emptyAddress)).to.be.revertedWith("SO_CNO")
    })

    it("setLimitOrderBook", async () => {
        const limitOrderBook2Factory = await ethers.getContractFactory("TestLimitOrderBook")
        const limitOrderBook2 = (await limitOrderBook2Factory.deploy()) as TestLimitOrderBook
        await limitOrderBook2.initialize(
            fixture.EIP712Name,
            fixture.EIP712Version,
            clearingHouse.address,
            limitOrderFeeVault.address,
        )

        await expect(limitOrderFeeVault.setLimitOrderBook(limitOrderBook2.address))
            .to.emit(limitOrderFeeVault, "LimitOrderBookChanged")
            .withArgs(limitOrderBook2.address)

        expect(await limitOrderFeeVault.limitOrderBook()).to.be.eq(limitOrderBook2.address)

        await expect(limitOrderFeeVault.setLimitOrderBook(emptyAddress)).to.be.revertedWith("LOFV_LOBINC")

        await expect(limitOrderFeeVault.connect(alice).setLimitOrderBook(emptyAddress)).to.be.revertedWith("SO_CNO")
    })

    it("setFeeAmount", async () => {
        const newFeeAmount = parseUnits("2", 18)

        await expect(limitOrderFeeVault.setFeeAmount(newFeeAmount))
            .to.emit(limitOrderFeeVault, "FeeAmountChanged")
            .withArgs(newFeeAmount)

        expect(await limitOrderFeeVault.feeAmount()).to.be.eq(newFeeAmount)

        await expect(limitOrderFeeVault.setFeeAmount(0)).to.be.revertedWith("LOFV_FAMBGT0")

        await expect(limitOrderFeeVault.connect(alice).setFeeAmount(newFeeAmount)).to.be.revertedWith("SO_CNO")
    })

    it("disburse successfully", async () => {
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
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        // sign limit order
        const signature = await getSignature(fixture, limitOrder, trader)
        const oldKeeperBalance = await rewardToken.balanceOf(keeper.address)
        const feeAmount = await limitOrderFeeVault.feeAmount()
        const tx = await limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0"))

        await expect(tx).to.emit(limitOrderFeeVault, "Disbursed").withArgs(keeper.address, fixture.rewardAmount)
        const newKeeperBalance = await rewardToken.balanceOf(keeper.address)

        expect(newKeeperBalance.sub(oldKeeperBalance)).to.be.eq(feeAmount)
    })

    it("force error, disburse without the enough balance", async () => {
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
            reduceOnly: false,
            roundIdWhenCreated: parseEther("0").toString(),
            triggerPrice: parseEther("0").toString(),
        }

        // sign limit order
        const signature = await getSignature(fixture, limitOrder, trader)
        await limitOrderFeeVault.setFeeAmount(parseUnits("100000", 18))
        await expect(
            limitOrderBook.connect(keeper).fillLimitOrder(limitOrder, signature, parseEther("0")),
        ).to.be.revertedWith("LOFV_NEBTD")
    })

    it("force error, disburse is limitOrderBook only", async () => {
        await expect(limitOrderFeeVault.connect(alice).disburse(keeper.address)).to.be.revertedWith("LOFV_SMBLOB")
    })

    it("withdraw successfully", async () => {
        const vaultBalance = await rewardToken.balanceOf(limitOrderFeeVault.address)
        const tx = await limitOrderFeeVault.connect(admin).withdraw(vaultBalance)

        await expect(tx)
            .to.emit(limitOrderFeeVault, "Withdrawn")
            .withArgs(admin.address, rewardToken.address, vaultBalance)
        const newVaultBalance = await rewardToken.balanceOf(limitOrderFeeVault.address)

        expect(newVaultBalance).to.be.eq(0)
    })

    it("force error, withdraw without the enough balance", async () => {
        const vaultBalance = await rewardToken.balanceOf(limitOrderFeeVault.address)

        await expect(limitOrderFeeVault.connect(admin).withdraw(vaultBalance.add(1))).to.be.revertedWith("LOFV_NEBTW")
    })

    it("force error, withdraw is owner only", async () => {
        await expect(limitOrderFeeVault.connect(alice).withdraw(parseEther("1"))).to.be.revertedWith("SO_CNO")
    })
})
