import * as fs from "fs"
import * as path from "path"

const ROOT_PATH = "./"
const CONTRACT_DIT = "./contracts"
const CONTRACT_IGNORES = ["./contracts/base", "./contracts/interface", "./contracts/storage", "./contracts/test"]

export interface ContractNameAndDir {
    name: string
    dir: string
}

export function getAllDeployedContractsNamesAndDirs(): ContractNameAndDir[] {
    const contracts: ContractNameAndDir[] = []
    return getAllFiles(CONTRACT_DIT, contracts)
}

function getAllFiles(dirPath, contracts: ContractNameAndDir[]) {
    contracts = contracts || []

    fs.readdirSync(dirPath).forEach(function (file) {
        const filePath = ROOT_PATH + path.join(dirPath, file)
        if (CONTRACT_IGNORES.includes(filePath)) {
            return
        }
        if (fs.statSync(filePath).isDirectory()) {
            contracts = getAllFiles(filePath, contracts)
        } else if (!file.includes(".sol")) {
            return
        } else {
            contracts.push({ name: file, dir: ROOT_PATH + dirPath })
        }
    })

    return contracts
}
