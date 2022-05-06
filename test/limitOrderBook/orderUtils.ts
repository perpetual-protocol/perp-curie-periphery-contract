import { BigNumberish } from "@ethersproject/bignumber"
import { Wallet } from "ethers"
import { waffle } from "hardhat"
import { generateTypedHash } from "./eip712Utils"
import { LimitOrderFixture } from "./fixtures"

export interface LimitOrder {
    orderType: number
    salt: number
    trader: string
    baseToken: string
    isBaseToQuote: boolean
    isExactInput: boolean
    amount: BigNumberish
    oppositeAmountBound: BigNumberish
    deadline: BigNumberish
    reduceOnly: boolean
    roundIdWhenCreated: BigNumberish
    triggerPrice: BigNumberish
}

export function getOrderTypes() {
    return {
        EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
        ],
        LimitOrder: [
            // field ordering must be the same as LIMIT_ORDER_TYPEHASH
            { name: "orderType", type: "uint256" },
            { name: "salt", type: "uint256" },
            { name: "trader", type: "address" },
            { name: "baseToken", type: "address" },
            { name: "isBaseToQuote", type: "bool" },
            { name: "isExactInput", type: "bool" },
            { name: "amount", type: "uint256" },
            { name: "oppositeAmountBound", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "reduceOnly", type: "bool" },
            { name: "roundIdWhenCreated", type: "uint80" },
            { name: "triggerPrice", type: "uint256" },
        ],
    }
}

export async function getSignature(fixture: LimitOrderFixture, limitOrder: LimitOrder, signer: Wallet) {
    const domain = {
        name: fixture.EIP712Name,
        version: fixture.EIP712Version,
        chainId: (await waffle.provider.getNetwork()).chainId,
        verifyingContract: fixture.limitOrderBook.address,
    }

    const types = getOrderTypes()
    const typesWithoutDomain = {
        LimitOrder: types.LimitOrder,
    }

    // sign limit order
    const signature = await signer._signTypedData(domain, typesWithoutDomain, limitOrder)
    return signature
}

export async function getOrderHash(fixture: LimitOrderFixture, limitOrder: LimitOrder) {
    const domain = {
        name: fixture.EIP712Name,
        version: fixture.EIP712Version,
        chainId: (await waffle.provider.getNetwork()).chainId,
        verifyingContract: fixture.limitOrderBook.address,
    }

    const types = getOrderTypes()

    const orderHashOffChain = generateTypedHash({
        domain,
        types,
        message: limitOrder as any,
        primaryType: fixture.EIP712PrimaryType,
    })

    return orderHashOffChain
}
