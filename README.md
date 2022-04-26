![image](https://user-images.githubusercontent.com/105896/160323317-7ce46737-ef27-450b-97bd-509ebedae312.png)


# perp-curie-periphery-contract

[![@perp/curie-periphery-contract on npm](https://img.shields.io/npm/v/@perp/curie-periphery-contract?style=flat-square)](https://www.npmjs.com/package/@perp/curie-periphery-contract)
[![@perp/curie-deployments on npm](https://img.shields.io/npm/v/@perp/curie-deployments?style=flat-square)](https://www.npmjs.com/package/@perp/curie-deployments)

This repository contains the periphery smart contracts for [Perpetual Protocol Curie (v2)](https://perp.com/). For core contracts, see [perp-curie-contract](https://github.com/perpetual-protocol/perp-curie-contract).

Contract source code and metadata are also published as npm package:

- [@perp/curie-periphery-contract](https://www.npmjs.com/package/@perp/curie-periphery-contract) (source code)
- [@perp/curie-deployments](https://www.npmjs.com/package/@perp/curie-deployments) (artifacts and deployed addresses)

## Deployments

Perpetual Protocol Curie (v2) are deployed on Optimism mainnet (an Ethereum Layer 2 network).

You could find the deployed periphery contract addresses inside the npm package [@perp/curie-deployments](https://www.npmjs.com/package/@perp/curie-deployments).

## Local Development

You need Node.js 16+ to build. Use [nvm](https://github.com/nvm-sh/nvm) to install it.

Clone this repository, install Node.js dependencies, and build the source code:

```bash
git clone git@github.com:perpetual-protocol/perp-curie-periphery-contract.git
npm i
npm run build
```

Run all the test cases:

```bash
npm run test
```

## Changelog

See [CHANGELOG](https://github.com/perpetual-protocol/perp-curie-periphery-contract/blob/main/CHANGELOG.md).
