import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import { BaseToken, TestLimitOrderBook } from "../../typechain-types"
import { createLimitOrderFixture, LimitOrderFixture } from "./fixtures"
import { getOrderHash, getOrderTypes, OrderStatus, OrderType } from "./orderUtils"

describe("LimitOrderBook signing", function () {
    const [admin, trader, alice] = waffle.provider.getWallets()
    let fixture: LimitOrderFixture
    let limitOrderBook: TestLimitOrderBook
    let baseToken: BaseToken

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        limitOrderBook = fixture.limitOrderBook
        baseToken = fixture.baseToken
    })

    it("get order hash", async () => {
        // long 1 ETH (base) at $3000 with $3000 (quote)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 1,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("3000").toString(),
            oppositeAmountBound: parseEther("1").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        // generate order hash off-chain
        const orderHashOffChain = await getOrderHash(fixture, limitOrder)

        // generate order hash on-chain
        const orderHashOnChain = await limitOrderBook.getOrderHash(limitOrder)

        expect(orderHashOffChain).to.be.eq(orderHashOnChain)
    })

    it("sign limit order", async () => {
        const domain = {
            name: fixture.EIP712Name,
            version: fixture.EIP712Version,
            chainId: (await waffle.provider.getNetwork()).chainId,
            verifyingContract: limitOrderBook.address,
        }

        // long 2 ETH (base) at $3000 with $6000 (quote)
        const limitOrder = {
            orderType: OrderType.LimitOrder,
            salt: 123,
            trader: trader.address,
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("6000").toString(),
            oppositeAmountBound: parseEther("2").toString(),
            deadline: ethers.constants.MaxUint256.toString(),
            sqrtPriceLimitX96: 0,
            referralCode: ethers.constants.HashZero,
            reduceOnly: false,
            roundIdWhenCreated: "0",
            triggerPrice: parseEther("0").toString(),
        }

        const types = getOrderTypes()
        const typesWithoutDomain = {
            LimitOrder: types.LimitOrder,
        }

        // sign limit order
        const signature = await trader._signTypedData(domain, typesWithoutDomain, limitOrder)
        const signer = await limitOrderBook.verifySigner(limitOrder, signature)
        expect(trader.address).to.be.eq(signer)

        // force error, sign limit order by another trader
        const badSignature = await alice._signTypedData(domain, typesWithoutDomain, limitOrder)
        await expect(limitOrderBook.verifySigner(limitOrder, badSignature)).to.be.revertedWith("LOB_SINT")
    })
})
