import * as child_process from "child_process"
import * as fs from "fs"
import { join } from "path"
import { FLATTEN_BASE_DIR, flattenAll } from "./flatten"

const SLITHER_BASE_DIR = "./slither"

enum IncludeOptions {
    LOW = "Low",
    MEDIUM = "Medium",
    HIGH = "High",
}

export async function slither(
    fromDir: string,
    toDir: string,
    filename: string,
    includeOption: IncludeOptions,
    toFilename: string = filename,
): Promise<void> {
    const from = join(fromDir, filename)

    let excludeOptions: string
    const excludeLow: string = "--exclude-low"
    const excludeMedium: string = "--exclude-medium"
    const excludeHigh: string = "--exclude-high"
    if (includeOption === IncludeOptions.LOW) {
        excludeOptions = excludeMedium.concat(" ").concat(excludeHigh)
    } else if (includeOption === IncludeOptions.MEDIUM) {
        excludeOptions = excludeLow.concat(" ").concat(excludeHigh)
    } else {
        excludeOptions = excludeLow.concat(" ").concat(excludeMedium)
    }

    const arr = toFilename.split(".")
    arr[0] = arr[0].concat(`-${includeOption}`)
    arr[1] = "txt"
    const outputFileName = arr.join(".")
    const to = join(toDir, outputFileName)

    const cmd = `slither ${from} --exclude-optimization --exclude-informational ${excludeOptions} &> ${to}`
    await new Promise((res, rej) => {
        child_process.exec(cmd, (err, out) => res(out))
    })
    console.log(`${includeOption} impact concerns of ${filename} scanned!`)
}

async function runAll(): Promise<void> {
    // can skip this step if there are already flattened files
    await flattenAll()
    const filesArr = fs.readdirSync(FLATTEN_BASE_DIR)

    fs.rmSync(SLITHER_BASE_DIR, { recursive: true, force: true })
    fs.mkdirSync(SLITHER_BASE_DIR, { recursive: true })

    for (let i = 0; i < filesArr.length; i++) {
        const file = filesArr[i]
        await slither(FLATTEN_BASE_DIR, SLITHER_BASE_DIR, file, IncludeOptions.MEDIUM)
        await slither(FLATTEN_BASE_DIR, SLITHER_BASE_DIR, file, IncludeOptions.HIGH)
    }
}

// The following steps are required to use this script:
// 1. pip3 install slither-analyzer
// 2. pip3 install solc-select
// 3. solc-select install 0.7.6 (check hardhat.config.ts)
// 4. solc-select use 0.7.6
if (require.main === module) {
    runAll()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error)
            process.exit(1)
        })
}
