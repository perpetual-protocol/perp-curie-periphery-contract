import fs from "fs"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { resolve } from "path"

interface ContractInfo {
    name: string
    address: string
    args: any[]
}

function getContractsInfo(network: String): Array<ContractInfo> {
    const contractsInfo = []
    const metadata = `./metadata/${network}.json`
    const jsonStr = fs.readFileSync(resolve(metadata), "utf8")
    const { contracts } = JSON.parse(jsonStr)

    for (const [name] of Object.entries(contracts)) {
        const path = `./deployments/${network}/${name}.json`
        const jsonStr = fs.readFileSync(resolve(path), "utf8")
        const { address, args } = JSON.parse(jsonStr)
        contractsInfo.push({
            name,
            address,
            args,
        })
    }
    return contractsInfo
}

export async function verifyAndPushContract(hre: HardhatRuntimeEnvironment): Promise<void> {
    const network = hre.network.name
    const contractsInfo = getContractsInfo(network)

    for (const { name, address, args } of contractsInfo) {
        console.log(`verifying contract ${name} on ${address}`)
        await hre
            .run("verify:verify", {
                address: address,
                constructorArguments: args,
            })
            .catch(e => {
                console.log(e)
            })
    }
}
