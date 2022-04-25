import { ethers } from "hardhat"
import { TestLimitOrderBook } from "../../typechain-types"

export interface LimitOrderFixture {
    EIP712Name: string
    EIP712Version: string
    EIP712PrimaryType: string
    limitOrderBook: TestLimitOrderBook
}

export async function createLimitOrderFixture(): Promise<LimitOrderFixture> {
    const EIP712Name = "Perpetual Protocol v2 Limit Order"
    const EIP712Version = "1"
    const EIP712PrimaryType = "LimitOrder"

    const limitOrderBookFactory = await ethers.getContractFactory("TestLimitOrderBook")
    const limitOrderBook = (await limitOrderBookFactory.deploy()) as TestLimitOrderBook
    await limitOrderBook.initialize(EIP712Name, EIP712Version)

    return { EIP712Name, EIP712Version, EIP712PrimaryType, limitOrderBook }
}