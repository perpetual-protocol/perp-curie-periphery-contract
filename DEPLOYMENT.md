# Deployment

1. Add required network settings or external addresses to `hardhat.config.ts`

```ts
const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
        },
        arbitrumRinkeby: {
            chainId: ChainId.ARBITRUM_RINKEBY_CHAIN_ID,
            url: ARBITRUM_RINKEBY_WEB3_ENDPOINT,
            accounts: {
                mnemonic: ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC,
            },
        },
    },
}
```

2. Deploy contracts

```bash
export ARBITRUM_RINKEBY_WEB3_ENDPOINT="YOUR_RPC_ENDPOINT"
export ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC="YOUR_MNEMONIC"

# Deploy lens contracts
npm run deploy:optimismKovan

# Deploy delegatable vaults
npm run deployDV:optimismKovan

# Run the specific deployment script
hardhat deploy --network optimismKovan --tags Quoter
# or
hardhat deploy --network optimismKovan --tags DelegatableVault001
```

3. Update CHANGELOG.md

4. Update `version` of `package.json` and `package-lock.json`

5. Verify contracts on Etherscan
```bash
export ETHERSCAN_API_KEY="YOUR_ETHERSCAN_API_KEY"

npm run etherscan:arbitrumRinkeby
```

6. Verify contracts on Tenderly
```bash
npm run tenderly:arbitrumRinkeby
```

7. Verify what's included in the packed npm package

```bash
npm pack
```

8. Publish npm package

```bash
git tag vX.X.X
npm publish --access public

# create GitHub release
gh release create vX.X.X -t "vX.X.X" -F CHANGELOG.md
```
