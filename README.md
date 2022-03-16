# perp-curie-periphery

[![@perp/curie-periphery on npm](https://img.shields.io/npm/v/@perp/curie-periphery?style=flat-square)](https://www.npmjs.com/package/@perp/curie-periphery)
[![@perp/curie-deployments on npm](https://img.shields.io/npm/v/@perp/curie-deployments?style=flat-square)](https://www.npmjs.com/package/@perp/curie-deployments)

This repository contains the periphery smart contracts for [Perpetual Protocol Curie (v2)](https://perp.com/). For core contracts, see [perp-curie](https://github.com/perpetual-protocol/perp-curie).

Contract source code and metadata are also published as npm package:

- [@perp/curie-periphery](https://www.npmjs.com/package/@perp/curie-periphery) (source code)
- [@perp/curie-deployments](https://www.npmjs.com/package/@perp/curie-deployments) (artifacts and deployed addresses)

## Deployments

Perpetual Protocol Curie (v2) are deployed on Optimism mainnet (an Ethereum Layer 2 network).

You could find the deployed periphery contract addresses inside the npm package [@perp/curie-deployments](https://www.npmjs.com/package/@perp/curie-deployments).

## Local Development

You need Node.js 16+ to build. Use [nvm](https://github.com/nvm-sh/nvm) to install it.

Clone this repository, install Node.js dependencies, and build the source code:

```bash
git clone git@github.com:perpetual-protocol/perp-curie-periphery.git
npm i
npm run build
```

If the installation failed on your machine, please try a vanilla install instead:

```bash
npm run clean
rm -rf node_modules/
rm package-lock.json
npm install
npm run build
```

Run all the test cases:

```bash
npm run test
```
