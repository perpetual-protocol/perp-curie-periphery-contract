import { asyncExec } from "./helper"

async function main(): Promise<void> {
    await asyncExec("rm -rf artifacts/contracts/test/")
    await asyncExec("find artifacts/contracts/ -name '*.dbg.json' -delete")
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error)
            process.exit(1)
        })
}
