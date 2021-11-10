# perp-curie-periphery

## Local Development and Testing

### Requirements

You should have Node 12 installed. Use [nvm](https://github.com/nvm-sh/nvm) to install it.

### Development

Currently we use `"file:../perp-lushan"` in `package.json`, so you need to clone both repositories.

```bash
git clone git@github.com:perpetual-protocol/perp-lushan.git
git clone git@github.com:perpetual-protocol/perp-curie-periphery.git
cd perp-curie-periphery
npm i
npm run build
```

### Testing

To run all the test cases:

```bash
npm run test
```
