import { Wallet } from "ethers"
import { parseUnits } from "ethers/lib/utils"
import { TestERC20, Vault } from "../../typechain-types"

export async function deposit(sender: Wallet, vault: Vault, amount: number, token: TestERC20): Promise<void> {
    const decimals = await token.decimals()
    const parsedAmount = parseUnits(amount.toString(), decimals)
    await token.connect(sender).approve(vault.address, parsedAmount)
    await vault.connect(sender).deposit(token.address, parsedAmount)
}
