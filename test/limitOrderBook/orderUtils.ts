import { BigNumberish } from "@ethersproject/bignumber"

export interface LimitOrder {
    trader: string
    baseToken: string
    isBaseToQuote: boolean
    isExactInput: boolean
    amount: BigNumberish
    oppositeAmountBound: BigNumberish
    deadline: BigNumberish
    reduceOnly: boolean
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
            { name: "salt", type: "uint256" },
            { name: "trader", type: "address" },
            { name: "baseToken", type: "address" },
            { name: "isBaseToQuote", type: "bool" },
            { name: "isExactInput", type: "bool" },
            { name: "amount", type: "uint256" },
            { name: "oppositeAmountBound", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "reduceOnly", type: "bool" },
        ],
    }
}
