import { LogDescription } from "@ethersproject/abi"
import { TransactionReceipt } from "@ethersproject/abstract-provider"
import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import { DelegatableVault, TestPerpLiquidityMining } from "../../typechain"
import { ERC20PresetMinterPauser } from "../../typechain/openzeppelin"
import { createClearingHouseFixture } from "../clearingHouse/fixtures"
import { createDelegatableVaultFixture, DelegatableVaultFixture } from "./fixtures"

describe("liquidity mining", () => {
    const RANDOM_BYTES32_1 = "0x7c1b1e7c2eaddafdf52250cba9679e5b30014a9d86a0e2af17ec4cee24a5fc80"
    const RANDOM_BYTES32_2 = "0xb6801f31f93d990dfe65d67d3479c3853d5fafd7a7f2b8fad9e68084d8d409e0"
    const RANDOM_BYTES32_3 = "0x43bd90E4CC93D6E40580507102Cc7B1Bc8A25284a7f2b8fad9e68084d8d409e0"

    const [admin, fundOwner, fundManager] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])

    let token: ERC20PresetMinterPauser
    let perpLiquidityMining: TestPerpLiquidityMining
    let perpLiquidityMining2: TestPerpLiquidityMining
    let delegatableVault: DelegatableVault
    let fixture: DelegatableVaultFixture

    beforeEach(async () => {
        const tokenFactory = await ethers.getContractFactory("ERC20PresetMinterPauser")
        token = (await tokenFactory.deploy("name", "symbol")) as ERC20PresetMinterPauser
        token.mint(admin.address, parseEther("1000000"))

        const perpLiquidityMiningFactory = await ethers.getContractFactory("TestPerpLiquidityMining")
        perpLiquidityMining = (await perpLiquidityMiningFactory.deploy()) as TestPerpLiquidityMining
        await perpLiquidityMining.initialize(token.address)
        perpLiquidityMining2 = (await perpLiquidityMiningFactory.deploy()) as TestPerpLiquidityMining
        await perpLiquidityMining2.initialize(token.address)

        await token.connect(admin).approve(perpLiquidityMining.address, parseEther("1000000"))
        await token.connect(admin).approve(perpLiquidityMining2.address, parseEther("1000000"))

        const _clearingHouseFixture = await loadFixture(createClearingHouseFixture(false))
        fixture = await loadFixture(
            createDelegatableVaultFixture(_clearingHouseFixture, fundOwner.address, fundManager.address),
        )

        // only set perpLiquidityMining address as rewardContract
        delegatableVault = fixture.delegatableVault
        await delegatableVault.setRewardContractAddress(perpLiquidityMining.address, true)
    })

    async function findTransferEvent(receipt: TransactionReceipt): Promise<LogDescription[]> {
        const tokenFactory = await ethers.getContractFactory("ERC20PresetMinterPauser")
        const topic = tokenFactory.interface.getEventTopic("Transfer")
        return receipt.logs.filter(log => log.topics[0] === topic).map(log => tokenFactory.interface.parseLog(log))
    }

    async function findClaimedEvent(receipt: TransactionReceipt): Promise<LogDescription[]> {
        const merkleRedeemUpgradeSafeF = await ethers.getContractFactory("MerkleRedeemUpgradeSafe")
        const topic = merkleRedeemUpgradeSafeF.interface.getEventTopic("Claimed")
        return receipt.logs
            .filter(log => log.topics[0] === topic)
            .map(log => merkleRedeemUpgradeSafeF.interface.parseLog(log))
    }

    describe("claimWeek()", () => {
        beforeEach(async () => {
            await perpLiquidityMining.seedAllocations(1, RANDOM_BYTES32_1, parseEther("500000"))
        })

        it("fundOwner claims her own share", async () => {
            const receipt = await (
                await delegatableVault
                    .connect(fundOwner)
                    .claimWeek(perpLiquidityMining.address, 1, parseEther("200000"), [RANDOM_BYTES32_1])
            ).wait()

            const transferEvents = await findTransferEvent(receipt as TransactionReceipt)
            const claimedEvents = await findClaimedEvent(receipt as TransactionReceipt)

            expect(transferEvents.length).to.be.eq(2)
            expect(transferEvents[0].args.from).to.be.eq(perpLiquidityMining.address)
            expect(transferEvents[0].args.to).to.be.eq(delegatableVault.address)
            expect(transferEvents[0].args.value).to.be.eq(parseEther("200000"))
            expect(transferEvents[1].args.from).to.be.eq(delegatableVault.address)
            expect(transferEvents[1].args.to).to.be.eq(fundOwner.address)
            expect(transferEvents[1].args.value).to.be.eq(parseEther("200000"))

            expect(claimedEvents.length).to.be.eq(1)
            expect(claimedEvents[0].args._claimant).to.be.eq(delegatableVault.address)
            expect(claimedEvents[0].args._balance).to.be.eq(parseEther("200000"))

            expect(await token.balanceOf(fundOwner.address)).to.eq(parseEther("200000"))
            expect(await token.balanceOf(delegatableVault.address)).to.eq(parseEther("0"))
            expect(await token.balanceOf(perpLiquidityMining.address)).to.eq(parseEther("300000"))
            expect(await perpLiquidityMining.claimed(1, delegatableVault.address)).to.eq(true)
        })

        it("fundOwner claims her own share from all liquidity mining contract", async () => {
            await delegatableVault.setRewardContractAddress(perpLiquidityMining2.address, true)
            await perpLiquidityMining2.seedAllocations(1, RANDOM_BYTES32_1, parseEther("200000"))

            // can claim reward from contract 1
            let receipt = await (
                await delegatableVault
                    .connect(fundOwner)
                    .claimWeek(perpLiquidityMining.address, 1, parseEther("200000"), [RANDOM_BYTES32_1])
            ).wait()

            let transferEvents = await findTransferEvent(receipt as TransactionReceipt)
            let claimedEvents = await findClaimedEvent(receipt as TransactionReceipt)

            expect(transferEvents.length).to.be.eq(2)
            expect(transferEvents[0].args.from).to.be.eq(perpLiquidityMining.address)
            expect(transferEvents[0].args.to).to.be.eq(delegatableVault.address)
            expect(transferEvents[0].args.value).to.be.eq(parseEther("200000"))
            expect(transferEvents[1].args.from).to.be.eq(delegatableVault.address)
            expect(transferEvents[1].args.to).to.be.eq(fundOwner.address)
            expect(transferEvents[1].args.value).to.be.eq(parseEther("200000"))

            expect(claimedEvents.length).to.be.eq(1)
            expect(claimedEvents[0].args._claimant).to.be.eq(delegatableVault.address)
            expect(claimedEvents[0].args._balance).to.be.eq(parseEther("200000"))

            expect(await token.balanceOf(fundOwner.address)).to.eq(parseEther("200000"))
            expect(await token.balanceOf(delegatableVault.address)).to.eq(parseEther("0"))
            expect(await token.balanceOf(perpLiquidityMining.address)).to.eq(parseEther("300000"))
            expect(await perpLiquidityMining.claimed(1, delegatableVault.address)).to.eq(true)

            // can claim reward from contract 2
            receipt = await (
                await delegatableVault
                    .connect(fundOwner)
                    .claimWeek(perpLiquidityMining2.address, 1, parseEther("100000"), [RANDOM_BYTES32_1])
            ).wait()

            transferEvents = await findTransferEvent(receipt as TransactionReceipt)
            claimedEvents = await findClaimedEvent(receipt as TransactionReceipt)

            expect(transferEvents.length).to.be.eq(2)
            expect(transferEvents[0].args.from).to.be.eq(perpLiquidityMining2.address)
            expect(transferEvents[0].args.to).to.be.eq(delegatableVault.address)
            expect(transferEvents[0].args.value).to.be.eq(parseEther("100000"))
            expect(transferEvents[1].args.from).to.be.eq(delegatableVault.address)
            expect(transferEvents[1].args.to).to.be.eq(fundOwner.address)
            expect(transferEvents[1].args.value).to.be.eq(parseEther("100000"))

            expect(claimedEvents.length).to.be.eq(1)
            expect(claimedEvents[0].args._claimant).to.be.eq(delegatableVault.address)
            expect(claimedEvents[0].args._balance).to.be.eq(parseEther("100000"))

            expect(await token.balanceOf(fundOwner.address)).to.eq(parseEther("300000"))
            expect(await token.balanceOf(delegatableVault.address)).to.eq(parseEther("0"))
            expect(await token.balanceOf(perpLiquidityMining2.address)).to.eq(parseEther("100000"))
            expect(await perpLiquidityMining2.claimed(1, delegatableVault.address)).to.eq(true)
        })

        it("Only transfer claimed amount to fundOwner", async () => {
            // Transfer tokens to delegatableVault, and it should be stuck in vault and can not be transferred.
            token.mint(delegatableVault.address, parseEther("100000"))

            const receipt = await (
                await delegatableVault
                    .connect(fundOwner)
                    .claimWeek(perpLiquidityMining.address, 1, parseEther("200000"), [RANDOM_BYTES32_1])
            ).wait()

            const transferEvents = await findTransferEvent(receipt as TransactionReceipt)
            const claimedEvents = await findClaimedEvent(receipt as TransactionReceipt)

            expect(transferEvents.length).to.be.eq(2)
            expect(transferEvents[0].args.from).to.be.eq(perpLiquidityMining.address)
            expect(transferEvents[0].args.to).to.be.eq(delegatableVault.address)
            expect(transferEvents[0].args.value).to.be.eq(parseEther("200000"))
            expect(transferEvents[1].args.from).to.be.eq(delegatableVault.address)
            expect(transferEvents[1].args.to).to.be.eq(fundOwner.address)
            expect(transferEvents[1].args.value).to.be.eq(parseEther("200000"))

            expect(claimedEvents.length).to.be.eq(1)
            expect(claimedEvents[0].args._claimant).to.be.eq(delegatableVault.address)
            expect(claimedEvents[0].args._balance).to.be.eq(parseEther("200000"))

            expect(await token.balanceOf(fundOwner.address)).to.eq(parseEther("200000"))
            // there are 100000 tokens can not be transferred due to wrong deposit.
            expect(await token.balanceOf(delegatableVault.address)).to.eq(parseEther("100000"))
            expect(await token.balanceOf(perpLiquidityMining.address)).to.eq(parseEther("300000"))
            expect(await perpLiquidityMining.claimed(1, delegatableVault.address)).to.eq(true)
        })

        it("force error, claimWeek not allow except fundOwner", async () => {
            await expect(
                delegatableVault
                    .connect(fundManager)
                    .claimWeek(perpLiquidityMining.address, 1, parseEther("200000"), [RANDOM_BYTES32_1]),
            ).to.be.reverted
        })

        it("force error when claim reward from unset rewardContract", async () => {
            await perpLiquidityMining2.seedAllocations(1, RANDOM_BYTES32_1, parseEther("200000"))

            await expect(
                delegatableVault
                    .connect(fundOwner)
                    .claimWeek(perpLiquidityMining2.address, 1, parseEther("200000"), [RANDOM_BYTES32_1]),
            ).to.be.revertedWith("DV_CNIW")
        })
    })

    describe("claimWeeks()", () => {
        const claimsArr = [
            {
                week: "2",
                balance: parseEther("200000"),
                merkleProof: [RANDOM_BYTES32_1],
            },
            {
                week: "7",
                balance: parseEther("300000"),
                merkleProof: [RANDOM_BYTES32_2],
            },
        ]

        beforeEach(async () => {
            await perpLiquidityMining.seedAllocations(2, RANDOM_BYTES32_1, parseEther("200000"))
            await perpLiquidityMining.seedAllocations(7, RANDOM_BYTES32_2, parseEther("300000"))
        })
        // when testing claimWeeks(), input all inputs as strings s.t. Claims[] will not cause error
        it("fundOwner claims her two shares", async () => {
            const receipt = await (
                await delegatableVault.connect(fundOwner).claimWeeks(perpLiquidityMining.address, claimsArr)
            ).wait()

            const transferEvents = await findTransferEvent(receipt as TransactionReceipt)
            const claimedEvents = await findClaimedEvent(receipt as TransactionReceipt)

            expect(transferEvents.length).to.be.eq(2)
            expect(transferEvents[0].args.from).to.be.eq(perpLiquidityMining.address)
            expect(transferEvents[0].args.to).to.be.eq(delegatableVault.address)
            expect(transferEvents[0].args.value).to.be.eq(parseEther("500000"))
            expect(transferEvents[1].args.from).to.be.eq(delegatableVault.address)
            expect(transferEvents[1].args.to).to.be.eq(fundOwner.address)
            expect(transferEvents[1].args.value).to.be.eq(parseEther("500000"))

            expect(claimedEvents.length).to.be.eq(1)
            expect(claimedEvents[0].args._claimant).to.be.eq(delegatableVault.address)
            expect(claimedEvents[0].args._balance).to.be.eq(parseEther("500000"))

            expect(await token.balanceOf(fundOwner.address)).to.eq(parseEther("500000"))
            expect(await token.balanceOf(delegatableVault.address)).to.eq(parseEther("0"))
            expect(await token.balanceOf(perpLiquidityMining.address)).to.eq(parseEther("0"))
            expect(await perpLiquidityMining.claimed("2", delegatableVault.address)).to.eq(true)
            expect(await perpLiquidityMining.claimed("7", delegatableVault.address)).to.eq(true)
        })

        it("fundOwner claims her own share from all liquidity mining contract", async () => {
            // set reward contract 2
            await delegatableVault.setRewardContractAddress(perpLiquidityMining2.address, true)
            await perpLiquidityMining2.seedAllocations(3, RANDOM_BYTES32_1, parseEther("200000"))
            await perpLiquidityMining2.seedAllocations(8, RANDOM_BYTES32_2, parseEther("300000"))

            // can claimWeeks from contract 1
            let receipt = await (
                await delegatableVault.connect(fundOwner).claimWeeks(perpLiquidityMining.address, claimsArr)
            ).wait()

            let transferEvents = await findTransferEvent(receipt as TransactionReceipt)
            let claimedEvents = await findClaimedEvent(receipt as TransactionReceipt)

            expect(transferEvents.length).to.be.eq(2)
            expect(transferEvents[0].args.from).to.be.eq(perpLiquidityMining.address)
            expect(transferEvents[0].args.to).to.be.eq(delegatableVault.address)
            expect(transferEvents[0].args.value).to.be.eq(parseEther("500000"))
            expect(transferEvents[1].args.from).to.be.eq(delegatableVault.address)
            expect(transferEvents[1].args.to).to.be.eq(fundOwner.address)
            expect(transferEvents[1].args.value).to.be.eq(parseEther("500000"))

            expect(claimedEvents.length).to.be.eq(1)
            expect(claimedEvents[0].args._claimant).to.be.eq(delegatableVault.address)
            expect(claimedEvents[0].args._balance).to.be.eq(parseEther("500000"))

            expect(await token.balanceOf(fundOwner.address)).to.eq(parseEther("500000"))
            expect(await token.balanceOf(delegatableVault.address)).to.eq(parseEther("0"))
            expect(await token.balanceOf(perpLiquidityMining.address)).to.eq(parseEther("0"))
            expect(await perpLiquidityMining.claimed("2", delegatableVault.address)).to.eq(true)
            expect(await perpLiquidityMining.claimed("7", delegatableVault.address)).to.eq(true)

            // can claimWeeks from contract 2
            const claimsArr2 = [
                {
                    week: "3",
                    balance: parseEther("200000"),
                    merkleProof: [RANDOM_BYTES32_1],
                },
                {
                    week: "8",
                    balance: parseEther("300000"),
                    merkleProof: [RANDOM_BYTES32_2],
                },
            ]
            receipt = await (
                await delegatableVault.connect(fundOwner).claimWeeks(perpLiquidityMining2.address, claimsArr2)
            ).wait()

            transferEvents = await findTransferEvent(receipt as TransactionReceipt)
            claimedEvents = await findClaimedEvent(receipt as TransactionReceipt)

            expect(transferEvents.length).to.be.eq(2)
            expect(transferEvents[0].args.from).to.be.eq(perpLiquidityMining2.address)
            expect(transferEvents[0].args.to).to.be.eq(delegatableVault.address)
            expect(transferEvents[0].args.value).to.be.eq(parseEther("500000"))
            expect(transferEvents[1].args.from).to.be.eq(delegatableVault.address)
            expect(transferEvents[1].args.to).to.be.eq(fundOwner.address)
            expect(transferEvents[1].args.value).to.be.eq(parseEther("500000"))

            expect(claimedEvents.length).to.be.eq(1)
            expect(claimedEvents[0].args._claimant).to.be.eq(delegatableVault.address)
            expect(claimedEvents[0].args._balance).to.be.eq(parseEther("500000"))

            expect(await token.balanceOf(fundOwner.address)).to.eq(parseEther("1000000"))
            expect(await token.balanceOf(delegatableVault.address)).to.eq(parseEther("0"))
            expect(await token.balanceOf(perpLiquidityMining2.address)).to.eq(parseEther("0"))
            expect(await perpLiquidityMining2.claimed("3", delegatableVault.address)).to.eq(true)
            expect(await perpLiquidityMining2.claimed("8", delegatableVault.address)).to.eq(true)
        })

        it("Only transfer claimed amount to fundOwner", async () => {
            // Transfer tokens to delegatableVault, and it should be stuck in vault and can not be transferred.
            token.mint(delegatableVault.address, parseEther("100000"))

            const receipt = await (
                await delegatableVault.connect(fundOwner).claimWeeks(perpLiquidityMining.address, claimsArr)
            ).wait()

            const transferEvents = await findTransferEvent(receipt as TransactionReceipt)
            const claimedEvents = await findClaimedEvent(receipt as TransactionReceipt)

            expect(transferEvents.length).to.be.eq(2)
            expect(transferEvents[0].args.from).to.be.eq(perpLiquidityMining.address)
            expect(transferEvents[0].args.to).to.be.eq(delegatableVault.address)
            expect(transferEvents[0].args.value).to.be.eq(parseEther("500000"))
            expect(transferEvents[1].args.from).to.be.eq(delegatableVault.address)
            expect(transferEvents[1].args.to).to.be.eq(fundOwner.address)
            expect(transferEvents[1].args.value).to.be.eq(parseEther("500000"))

            expect(claimedEvents.length).to.be.eq(1)
            expect(claimedEvents[0].args._claimant).to.be.eq(delegatableVault.address)
            expect(claimedEvents[0].args._balance).to.be.eq(parseEther("500000"))

            expect(await token.balanceOf(fundOwner.address)).to.eq(parseEther("500000"))
            // there are 100000 tokens can not be transferred due to wrong deposit.
            expect(await token.balanceOf(delegatableVault.address)).to.eq(parseEther("100000"))
            expect(await token.balanceOf(perpLiquidityMining.address)).to.eq(parseEther("0"))
            expect(await perpLiquidityMining.claimed("2", delegatableVault.address)).to.eq(true)
            expect(await perpLiquidityMining.claimed("7", delegatableVault.address)).to.eq(true)
        })

        it("force error, claimWeek not allow except fundOwner", async () => {
            await expect(delegatableVault.connect(fundManager).claimWeeks(perpLiquidityMining.address, claimsArr)).to.be
                .reverted
        })

        it("force error when claim reward from unset rewardContract", async () => {
            await perpLiquidityMining2.seedAllocations(2, RANDOM_BYTES32_1, parseEther("200000"))
            await perpLiquidityMining2.seedAllocations(7, RANDOM_BYTES32_2, parseEther("300000"))

            await expect(
                delegatableVault.connect(fundOwner).claimWeeks(perpLiquidityMining2.address, claimsArr),
            ).to.be.revertedWith("DV_CNIW")
        })
    })
})
