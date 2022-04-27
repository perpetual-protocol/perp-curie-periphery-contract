import { loadFixture } from "@ethereum-waffle/provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import { TestLimitOrderBook } from "../../typechain-types"
import { generateTypedHash } from "./eip712Utils"
import { createLimitOrderFixture, LimitOrderFixture } from "./fixtures"
import { getOrderTypes } from "./orderUtils"

describe("LimitOrderBook signing", function () {
    const [admin, alice, bob] = waffle.provider.getWallets()
    let fixture: LimitOrderFixture
    let limitOrderBook: TestLimitOrderBook

    beforeEach(async () => {
        fixture = await loadFixture(createLimitOrderFixture())
        limitOrderBook = fixture.limitOrderBook
    })

    it("get order hash", async () => {
        const domain = {
            name: fixture.EIP712Name,
            version: fixture.EIP712Version,
            chainId: (await waffle.provider.getNetwork()).chainId,
            verifyingContract: limitOrderBook.address,
        }

        // long 1 ETH (base) at $3000 with $3000 (quote)
        const limitOrder = {
            salt: 123,
            trader: alice.address,
            baseToken: "0x8C835DFaA34e2AE61775e80EE29E2c724c6AE2BB",
            isBaseToQuote: false, // long: Q2B
            isExactInput: true, // exact input: quote
            amount: parseEther("3000").toString(), // quote amount: $3000
            oppositeAmountBound: parseEther("1").toString(), // base amount: 1 ETH
            deadline: ethers.constants.MaxUint256.toString(), // no expiration date
            reduceOnly: false,
        }

        // generate order hash off-chain
        const types = getOrderTypes()
        const orderHashOffChain = generateTypedHash({
            domain,
            types,
            message: limitOrder as any,
            primaryType: fixture.EIP712PrimaryType,
        })

        // generate order hash on-chain
        const orderHashOnChain = await limitOrderBook.getOrderHash(limitOrder)

        expect(orderHashOffChain).to.be.eq(orderHashOnChain)
    })

    it("get order hashes with the same parameters but different salt", async () => {
        // long 1 ETH (base) at $3000 with $3000 (quote)
        const limitOrder1 = {
            salt: 1,
            trader: alice.address,
            baseToken: "0x8C835DFaA34e2AE61775e80EE29E2c724c6AE2BB",
            isBaseToQuote: false, // long: Q2B
            isExactInput: true, // exact input: quote
            amount: parseEther("3000").toString(), // quote amount: $3000
            oppositeAmountBound: parseEther("1").toString(), // base amount: 1 ETH
            deadline: ethers.constants.MaxUint256.toString(), // no expiration date
            reduceOnly: false,
        }

        const limitOrder2 = {
            ...limitOrder1,
            salt: 2,
        }

        const orderHash1 = await limitOrderBook.getOrderHash(limitOrder1)
        const orderHash2 = await limitOrderBook.getOrderHash(limitOrder2)

        expect(orderHash1).to.not.eq(orderHash2)
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
            salt: 123,
            trader: alice.address,
            baseToken: "0x8C835DFaA34e2AE61775e80EE29E2c724c6AE2BB",
            isBaseToQuote: false, // long: Q2B
            isExactInput: true, // exact input: quote
            amount: parseEther("6000").toString(), // quote amount: $6000
            oppositeAmountBound: parseEther("2").toString(), // base amount: 2 ETH
            deadline: ethers.constants.MaxUint256.toString(), // no expiration date
            reduceOnly: false,
        }

        const types = getOrderTypes()
        const typesWithoutDomain = {
            LimitOrder: types.LimitOrder,
        }

        // sign limit order
        const signature = await alice._signTypedData(domain, typesWithoutDomain, limitOrder)
        const signer = await limitOrderBook.verifySigner(limitOrder, signature)
        expect(alice.address).to.be.eq(signer)

        // force error, sign limit order by another trader
        const badSignature = await bob._signTypedData(domain, typesWithoutDomain, limitOrder)
        await expect(limitOrderBook.verifySigner(limitOrder, badSignature)).to.be.revertedWith("LOB_SINT")
    })
})
