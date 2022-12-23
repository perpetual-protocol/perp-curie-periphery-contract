import { waffle } from "hardhat"
import { TestClearingHouse } from "../../typechain-types"

export async function forwardMockedTimestamp(clearingHouse: TestClearingHouse, step: number = 1) {
    const now = await clearingHouse.getBlockTimestamp()
    await clearingHouse.setBlockTimestamp(now.add(step))
}

export async function forwardRealTimestamp(forward: number) {
    const now = await getRealTimestamp()
    await waffle.provider.send("evm_mine", [now + forward])
}

export async function getRealTimestamp() {
    return (await waffle.provider.getBlock("latest")).timestamp
}
