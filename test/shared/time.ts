import { waffle } from "hardhat"
import { TestClearingHouse } from "../../typechain-types"

export async function initiateBothTimestamps(clearingHouse: TestClearingHouse) {
    // cannot set a timestamp <= than the current one, thus adding a random increment amount
    const initialTimestamp = (await getRealTimestamp()) + 100
    await setBothTimestamps(clearingHouse, initialTimestamp)
}

export async function setBothTimestamps(clearingHouse: TestClearingHouse, timestamp: number) {
    await clearingHouse.setBlockTimestamp(timestamp)
    await setRealTimestamp(timestamp)
}

export async function forwardMockedTimestamp(clearingHouse: TestClearingHouse, step: number = 1) {
    const now = await clearingHouse.getBlockTimestamp()
    await clearingHouse.setBlockTimestamp(now.add(step))
}

export async function forwardRealTimestamp(forward: number) {
    const now = await getRealTimestamp()
    await waffle.provider.send("evm_mine", [now + forward])
}

export async function setRealTimestamp(timestamp: number) {
    await waffle.provider.send("evm_mine", [timestamp])
}

export async function getRealTimestamp() {
    return (await waffle.provider.getBlock("latest")).timestamp
}
