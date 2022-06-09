import { loadFixture } from "ethereum-waffle"
import { BigNumber } from "ethers"
import { parseUnits } from "ethers/lib/utils"
import { ethers } from "hardhat"
import { DelegateApproval, LimitOrderRewardVault, TestERC20, TestLimitOrderBook } from "../../typechain-types"
import { ClearingHouseFixture, createClearingHouseFixture } from "../clearingHouse/fixtures"

export interface LimitOrderFixture extends ClearingHouseFixture {
    EIP712Name: string
    EIP712Version: string
    EIP712PrimaryType: string
    limitOrderBook: TestLimitOrderBook
    delegateApproval: DelegateApproval
    rewardToken: TestERC20
    rewardAmount: BigNumber
    limitOrderRewardVault: LimitOrderRewardVault
    clearingHouseOpenPositionAction: number
    clearingHouseAddLiquidityAction: number
    clearingHouseRemoveLiquidityAction: number
    notExistedOrderType: number
}

export function createLimitOrderFixture(): () => Promise<LimitOrderFixture> {
    return async (): Promise<LimitOrderFixture> => {
        const { clearingHouse, ...rest } = await loadFixture(createClearingHouseFixture())

        const delegateApprovalFactory = await ethers.getContractFactory("DelegateApproval")
        const delegateApproval = (await delegateApprovalFactory.deploy()) as DelegateApproval

        await clearingHouse.setDelegateApproval(delegateApproval.address)

        const rewardTokenFactory = await ethers.getContractFactory("TestERC20")
        const rewardToken = (await rewardTokenFactory.deploy()) as TestERC20
        await rewardToken.__TestERC20_init("TestPERP", "PERP", 18)

        const rewardAmount = parseUnits("1", 18)
        const limitOrderRewardVaultFactory = await ethers.getContractFactory("LimitOrderRewardVault")
        const limitOrderRewardVault = (await limitOrderRewardVaultFactory.deploy()) as LimitOrderRewardVault
        await limitOrderRewardVault.initialize(rewardToken.address, rewardAmount)

        const EIP712Name = "PerpCurieLimitOrder"
        const EIP712Version = "1"
        const EIP712PrimaryType = "LimitOrder"

        const limitOrderBookFactory = await ethers.getContractFactory("TestLimitOrderBook")
        const limitOrderBook = (await limitOrderBookFactory.deploy()) as TestLimitOrderBook
        await limitOrderBook.initialize(EIP712Name, EIP712Version, clearingHouse.address, limitOrderRewardVault.address)

        const tokenDecimals = await rewardToken.decimals()
        const mintedTokenAmount = parseUnits("1000", tokenDecimals)

        // mint token to limitOrderRewardVault
        await rewardToken.mint(limitOrderRewardVault.address, mintedTokenAmount)
        await limitOrderRewardVault.setLimitOrderBook(limitOrderBook.address)

        return {
            ...rest,
            EIP712Name,
            EIP712Version,
            EIP712PrimaryType,
            limitOrderBook,
            delegateApproval,
            clearingHouse,
            rewardToken,
            rewardAmount,
            limitOrderRewardVault,
            clearingHouseOpenPositionAction: await delegateApproval.getClearingHouseOpenPositionAction(),
            clearingHouseAddLiquidityAction: await delegateApproval.getClearingHouseAddLiquidityAction(),
            clearingHouseRemoveLiquidityAction: await delegateApproval.getClearingHouseRemoveLiquidityAction(),
            notExistedOrderType: 100,
        }
    }
}
