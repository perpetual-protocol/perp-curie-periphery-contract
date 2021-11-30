# perp-curie-periphery

## Local Development and Testing

### Requirements

You should have Node 12 installed. Use [nvm](https://github.com/nvm-sh/nvm) to install it.

### Development

```bash
git clone git@github.com:perpetual-protocol/perp-curie-periphery.git
cd perp-curie-periphery
npm i
npm run build
```
All deployed contract addresses can be find in `metadata` folder.
- `./metadata/{network}-dv.json` is for delegatable vault contracts.
- `./metadata/{network}.json` is for other contracts.

### Testing

To run all the test cases:

```bash
npm run test
```
