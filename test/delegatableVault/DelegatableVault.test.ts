import { BigNumber } from "@ethersproject/bignumber"
import { expect } from "chai"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    DelegatableVault,
    MarketRegistry,
    OrderBook,
    QuoteToken,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault,
} from "../../typechain-types"
import { createClearingHouseFixture } from "../clearingHouse/fixtures"
import { deposit } from "../helper/token"
import { encodePriceSqrt } from "../shared/utilities"
import { createDelegatableVaultFixture, DelegatableVaultFixture } from "./fixtures"

describe("DelegatableVault test", () => {
    const [admin, maker, fundOwner, fundManager] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    const lowerTick: number = 0
    const upperTick: number = 100000

    let usdc: TestERC20
    let vault: Vault
    let clearingHouse: TestClearingHouse
    let accountBalance: AccountBalance
    let marketRegistry: MarketRegistry
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let orderBook: OrderBook
    let delegatableVault: DelegatableVault
    let fixture: DelegatableVaultFixture
    let depositAmount
    let usdcDecimals

    beforeEach(async () => {
        const _clearingHouseFixture = await loadFixture(createClearingHouseFixture(false))
        usdc = _clearingHouseFixture.USDC
        vault = _clearingHouseFixture.vault
        clearingHouse = _clearingHouseFixture.clearingHouse as TestClearingHouse
        accountBalance = _clearingHouseFixture.accountBalance
        marketRegistry = _clearingHouseFixture.marketRegistry
        baseToken = _clearingHouseFixture.baseToken
        quoteToken = _clearingHouseFixture.quoteToken
        pool = _clearingHouseFixture.pool
        orderBook = _clearingHouseFixture.orderBook

        fixture = await loadFixture(
            createDelegatableVaultFixture(_clearingHouseFixture, fundOwner.address, fundManager.address),
        )
        delegatableVault = fixture.delegatableVault

        await pool.initialize(encodePriceSqrt("151.373306858723226652", "1")) // tick = 50200 (1.0001^50200 = 151.373306858723226652)
        // the initial number of oracle can be recorded is 1; thus, have to expand it
        await pool.increaseObservationCardinalityNext((2 ^ 16) - 1)

        // add pool after it's initialized
        await marketRegistry.addPool(baseToken.address, 10000)
        await marketRegistry.setFeeRatio(baseToken.address, 10000)

        usdcDecimals = await usdc.decimals()

        // prepare collateral for maker
        const makerCollateralAmount = parseUnits("1000000", usdcDecimals)
        await usdc.mint(maker.address, makerCollateralAmount)

        await deposit(maker, vault, 1000000, usdc)

        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("65.943787"),
            quote: parseEther("10000"),
            lowerTick,
            upperTick,
            minBase: 0,
            minQuote: 0,
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })

        // prepare collateral for fundOwner
        // NOTE: should approve to delegatableVault
        depositAmount = parseUnits("1000", await usdc.decimals())
        await usdc.mint(fundOwner.address, depositAmount)
        await usdc.connect(fundOwner).approve(delegatableVault.address, depositAmount)
    })

    it("deposit/withdraw collateral and verify delegatableVault's balance in Vault", async () => {
        await delegatableVault.connect(fundOwner).deposit(usdc.address, depositAmount)
        expect(await vault.getBalance(delegatableVault.address)).to.be.eq(depositAmount)

        await delegatableVault.connect(fundOwner).withdraw(usdc.address, depositAmount)
        expect(await vault.getBalance(delegatableVault.address)).to.be.eq("0")
        // usdc should be returned to fundOwner
        expect(await usdc.balanceOf(fundOwner.address)).to.be.eq(depositAmount)
    })

    describe("interact with clearingHouse", () => {
        beforeEach(async () => {
            await delegatableVault.connect(fundOwner).deposit(usdc.address, depositAmount)
        })

        it("open/close position and verify delegatableVault's position size by fundManager", async () => {
            await delegatableVault.connect(fundManager).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("1"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
            expect(await accountBalance.getTakerPositionSize(delegatableVault.address, baseToken.address)).eq(
                parseEther("1"),
            )

            await delegatableVault.connect(fundManager).closePosition({
                baseToken: baseToken.address,
                sqrtPriceLimitX96: 0,
                oppositeAmountBound: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
            expect(await accountBalance.getTakerPositionSize(delegatableVault.address, baseToken.address)).eq("0")
        })

        it("add/remove liquidity and verify delegatableVault's open orders by fundManager", async () => {
            const lowerTick = 50000
            const upperTick = 50200

            // add liquidity below current price
            await delegatableVault.connect(fundManager).addLiquidity({
                baseToken: baseToken.address,
                base: 0,
                quote: parseUnits("10000", await quoteToken.decimals()),
                lowerTick: lowerTick,
                upperTick: upperTick,
                minBase: 0,
                minQuote: 0,
                useTakerBalance: false,
                deadline: ethers.constants.MaxUint256,
            })

            let openOrder = await orderBook.getOpenOrder(
                delegatableVault.address,
                baseToken.address,
                lowerTick,
                upperTick,
            )
            expect(openOrder.liquidity).eq("81689571696303801037492")

            // remove full liquidity
            await delegatableVault.connect(fundManager).removeLiquidity({
                baseToken: baseToken.address,
                lowerTick: lowerTick,
                upperTick: upperTick,
                liquidity: openOrder.liquidity,
                minBase: 0,
                minQuote: 0,
                deadline: ethers.constants.MaxUint256,
            })

            openOrder = await orderBook.getOpenOrder(delegatableVault.address, baseToken.address, lowerTick, upperTick)
            expect(openOrder.liquidity).eq(0)
        })

        it("open/close position and verify delegatableVault's position size by fundOwner", async () => {
            await delegatableVault.connect(fundOwner).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("1"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
            expect(await accountBalance.getTakerPositionSize(delegatableVault.address, baseToken.address)).eq(
                parseEther("1"),
            )

            await delegatableVault.connect(fundOwner).closePosition({
                baseToken: baseToken.address,
                sqrtPriceLimitX96: 0,
                oppositeAmountBound: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
            expect(await accountBalance.getTakerPositionSize(delegatableVault.address, baseToken.address)).eq("0")
        })

        it("add/remove liquidity and verify delegatableVault's open orders by fundOwner", async () => {
            const lowerTick = 50000
            const upperTick = 50200

            // add liquidity below current price
            await delegatableVault.connect(fundOwner).addLiquidity({
                baseToken: baseToken.address,
                base: 0,
                quote: parseUnits("10000", await quoteToken.decimals()),
                lowerTick: lowerTick,
                upperTick: upperTick,
                minBase: 0,
                minQuote: 0,
                useTakerBalance: false,
                deadline: ethers.constants.MaxUint256,
            })

            let openOrder = await orderBook.getOpenOrder(
                delegatableVault.address,
                baseToken.address,
                lowerTick,
                upperTick,
            )
            expect(openOrder.liquidity).eq("81689571696303801037492")

            // remove full liquidity
            await delegatableVault.connect(fundOwner).removeLiquidity({
                baseToken: baseToken.address,
                lowerTick: lowerTick,
                upperTick: upperTick,
                liquidity: openOrder.liquidity,
                minBase: 0,
                minQuote: 0,
                deadline: ethers.constants.MaxUint256,
            })

            openOrder = await orderBook.getOpenOrder(delegatableVault.address, baseToken.address, lowerTick, upperTick)
            expect(openOrder.liquidity).eq(0)
        })
    })

    describe("multicall", () => {
        beforeEach(async () => {
            await delegatableVault.connect(fundOwner).deposit(usdc.address, depositAmount)
        })

        it("open 1 position and reduce half of position by fundManager", async () => {
            const data1 = clearingHouse.interface.encodeFunctionData("openPosition", [
                {
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: parseEther("1"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                },
            ])

            const data2 = clearingHouse.interface.encodeFunctionData("openPosition", [
                {
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: parseEther("0.5"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                },
            ])

            await delegatableVault.connect(fundManager).aggregate([data1, data2])

            expect(await accountBalance.getTakerPositionSize(delegatableVault.address, baseToken.address)).eq(
                parseEther("0.5"),
            )
        })

        it("open 1 position and reduce half of position by fundOwner", async () => {
            const data1 = clearingHouse.interface.encodeFunctionData("openPosition", [
                {
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: parseEther("1"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                },
            ])

            const data2 = clearingHouse.interface.encodeFunctionData("openPosition", [
                {
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: parseEther("0.5"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                },
            ])

            await delegatableVault.connect(fundOwner).aggregate([data1, data2])

            expect(await accountBalance.getTakerPositionSize(delegatableVault.address, baseToken.address)).eq(
                parseEther("0.5"),
            )
        })

        it("cannot invoke openPosition after removed from white list and add back", async () => {
            await delegatableVault
                .connect(admin)
                .setWhiteFunction(clearingHouse.interface.getSighash("openPosition"), false)

            const data1 = clearingHouse.interface.encodeFunctionData("openPosition", [
                {
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: parseEther("1"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                },
            ])

            await expect(delegatableVault.connect(fundManager).aggregate([data1])).to.be.revertedWith("DV_FNIW")

            await delegatableVault
                .connect(admin)
                .setWhiteFunction(clearingHouse.interface.getSighash("openPosition"), true)

            await delegatableVault.connect(fundOwner).aggregate([data1])

            expect(await accountBalance.getTakerPositionSize(delegatableVault.address, baseToken.address)).eq(
                parseEther("1"),
            )
        })

        it("force error, multicall not allow except fundOwner and fundManager", async () => {
            const data1 = clearingHouse.interface.encodeFunctionData("openPosition", [
                {
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: parseEther("1"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                },
            ])

            const data2 = clearingHouse.interface.encodeFunctionData("openPosition", [
                {
                    baseToken: baseToken.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    oppositeAmountBound: 0,
                    amount: parseEther("0.5"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                },
            ])

            await expect(delegatableVault.connect(admin).aggregate([data1, data2])).to.be.reverted
        })

        it("force error, only functions in whitelist can be invoked through multicall", async () => {
            const data1 = clearingHouse.interface.encodeFunctionData("openPosition", [
                {
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: parseEther("1"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                },
            ])
            const data2 = clearingHouse.interface.encodeFunctionData("settleAllFunding", [delegatableVault.address])

            await expect(delegatableVault.connect(fundManager).aggregate([data1, data2])).to.be.revertedWith("DV_FNIW")
        })

        it("force error, cannot withdraw through multicall", async () => {
            const data1 = clearingHouse.interface.encodeFunctionData("openPosition", [
                {
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    oppositeAmountBound: 0,
                    amount: parseEther("1"),
                    sqrtPriceLimitX96: 0,
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                },
            ])
            const data2 = vault.interface.encodeFunctionData("withdraw", [
                usdc.address,
                parseUnits("1", await usdc.decimals()),
            ])

            await expect(delegatableVault.connect(fundOwner).aggregate([data1, data2])).to.be.revertedWith("DV_FNIW")
        })
    })

    describe("withdraw token from delegatableVault", () => {
        let token: TestERC20
        let tokenDecimals: number
        let delegatableVaultTokenAmount: BigNumber

        beforeEach(async () => {
            const tokenFactory = await ethers.getContractFactory("TestERC20")
            token = (await tokenFactory.deploy()) as TestERC20
            await token.__TestERC20_init("TestToken", "TOKEN", 18)

            tokenDecimals = await token.decimals()
            delegatableVaultTokenAmount = parseUnits("100000", tokenDecimals)

            // mint token to delegatableVault
            await token.mint(delegatableVault.address, delegatableVaultTokenAmount)
        })
        it("can withdraw amount from delegatableVault", async () => {
            await delegatableVault.connect(fundOwner).withdrawToken(token.address)

            const fundOwnerTokenBalance = await token.balanceOf(fundOwner.address)
            const delegatableVaultTokenBalance = await token.balanceOf(delegatableVault.address)

            expect(fundOwnerTokenBalance).to.be.eq(delegatableVaultTokenAmount)
            expect(delegatableVaultTokenBalance).to.be.eq("0")
        })
    })

    it("force error, deposit not allow except fundOwner", async () => {
        await expect(delegatableVault.connect(fundManager).deposit(usdc.address, depositAmount)).to.be.reverted
    })

    it("force error, fundManager can't withdraw", async () => {
        await delegatableVault.connect(fundOwner).deposit(usdc.address, depositAmount)

        await expect(delegatableVault.connect(fundManager).withdraw(usdc.address, depositAmount)).to.be.reverted
    })

    it("force error, contract owner can't withdraw", async () => {
        await delegatableVault.connect(fundOwner).deposit(usdc.address, depositAmount)

        await expect(delegatableVault.connect(admin).withdraw(usdc.address, depositAmount)).to.be.reverted
    })
})
