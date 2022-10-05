pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";
import "../../../contracts/lens/Quoter.sol";
import "@perp/curie-contract/contracts/MarketRegistry.sol";


contract QuoterTest is Test {
    function setUp() public {
    }

    function testSwap_zero_input_should_revert_with_ZI() public {
        MarketRegistry m = new MarketRegistry();

        Quoter quoter = new Quoter(address(m));

        address baseToken = address(0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6);

        Quoter.SwapParams memory swapParams = Quoter.SwapParams({
            baseToken: baseToken,
            isBaseToQuote: true,
            isExactInput: false,
            amount: 0,
            sqrtPriceLimitX96: 0
        });

        vm.expectRevert(bytes("Q_ZI"));
        quoter.swap(swapParams);
    }
}
