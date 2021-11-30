import { ethers } from "hardhat"
import { DelegatableVault } from "../../typechain"
import { ClearingHouseFixture } from "../clearingHouse/fixtures"

export interface DelegatableVaultFixture {
    delegatableVault: DelegatableVault
}

export function createDelegatableVaultFixture(
    clearingHouseFixture: ClearingHouseFixture,
    fundOwnerAddr: string,
    fundManagerAddr: string,
): () => Promise<DelegatableVaultFixture> {
    return async (): Promise<DelegatableVaultFixture> => {
        const delegatableVaultFactory = await ethers.getContractFactory("DelegatableVault")
        const delegatableVault = (await delegatableVaultFactory.deploy()) as DelegatableVault
        await delegatableVault.initialize(clearingHouseFixture.clearingHouse.address, fundOwnerAddr, fundManagerAddr)
        return { delegatableVault }
    }
}
