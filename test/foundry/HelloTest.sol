pragma solidity 0.8.2;

import "forge-std/Test.sol";

contract HelloTest is Test {
    uint256 testNumber;

    function setUp() public {
        testNumber = 42;
    }

    function testNumberIs42() public {
        assertEq(testNumber, 42);
    }
}
