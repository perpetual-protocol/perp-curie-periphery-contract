import { loadFixture } from "ethereum-waffle"
import { ethers } from "hardhat"
import { DelegateApproval, TestLimitOrderBook } from "../../typechain-types"
import { ClearingHouseFixture, createClearingHouseFixture } from "../clearingHouse/fixtures"

export interface LimitOrderFixture extends ClearingHouseFixture {
    EIP712Name: string
    EIP712Version: string
    EIP712PrimaryType: string
    limitOrderBook: TestLimitOrderBook
    delegateApproval: DelegateApproval
    clearingHouseOpenPositionAction: number
}

export async function createLimitOrderFixture(): Promise<LimitOrderFixture> {
    const { clearingHouse, ...rest } = await loadFixture(createClearingHouseFixture())

    const delegateApprovalFactory = await ethers.getContractFactory("DelegateApproval")
    const delegateApproval = (await delegateApprovalFactory.deploy()) as DelegateApproval

    await clearingHouse.setDelegateApproval(delegateApproval.address)

    const EIP712Name = "Perpetual Protocol v2 Limit Order"
    const EIP712Version = "1"
    const EIP712PrimaryType = "LimitOrder"

    const limitOrderBookFactory = await ethers.getContractFactory("TestLimitOrderBook")
    const limitOrderBook = (await limitOrderBookFactory.deploy()) as TestLimitOrderBook
    await limitOrderBook.initialize(EIP712Name, EIP712Version, clearingHouse.address)

    return {
        ...rest,
        EIP712Name,
        EIP712Version,
        EIP712PrimaryType,
        limitOrderBook,
        delegateApproval,
        clearingHouse,
        clearingHouseOpenPositionAction: 0,
    }
}
