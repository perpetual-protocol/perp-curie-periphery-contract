import fs from "fs"
import hre from "hardhat"
import { join, resolve } from "path"

const DV_DEPLOYMENT_KEY_PREFIX = "DelegatableVault"

interface ContractInfo {
    name: string
    address: string
    args: any[]
}

export function getContractsInfo(network: String): Array<ContractInfo> {
    const contractsInfo = []
    const dfJsonFiles = fs
        .readdirSync(`./metadata/`, "utf8")
        .filter(f => f.startsWith(`${network}-dv`))
        .map(x => join("./metadata/", x))
    const metadataFiles = [`./metadata/${network}.json`].concat(dfJsonFiles)

    for (const metadata of metadataFiles) {
        const jsonStr = fs.readFileSync(resolve(metadata), "utf8")
        const { contracts } = JSON.parse(jsonStr)

        for (const [name] of Object.entries(contracts)) {
            let path

            if (name.startsWith(DV_DEPLOYMENT_KEY_PREFIX)) {
                path = `./deployments/${network}/${name}_Implementation.json`
            } else {
                path = `./deployments/${network}/${name}.json`
            }

            const jsonStr = fs.readFileSync(resolve(path), "utf8")
            const { address, args } = JSON.parse(jsonStr)
            contractsInfo.push({
                name,
                address,
                args,
            })
        }
    }

    return contractsInfo
}

async function main(): Promise<void> {
    const network = hre.network.name
    const contractsInfo = getContractsInfo(network)

    for (const { name, address } of contractsInfo) {
        console.log(`verifying contract ${name} on ${address}`)
        await hre.tenderly
            .verify({
                name,
                address,
            })
            .catch(e => {
                console.log(e)
            })
        console.log(`pushing contract ${name}`)
        await hre.tenderly
            .push({
                name,
                address,
            })
            .catch(e => {
                console.log(e)
            })
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error)
            process.exit(1)
        })
}
