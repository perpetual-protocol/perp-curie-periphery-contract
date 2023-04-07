// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";

import { PerpSetup } from "../../helper/perp/PerpSetup.sol";
import { OtcMaker } from "../../../../contracts/otcMaker/OtcMaker.sol";
import { TestERC20 } from "../../../../contracts/test/TestERC20.sol";

contract OtcMakerSetup is Test {
    address public alice = makeAddr("alice");
    address public otcCaller = makeAddr("otcCaller");
    TestERC20 public usdc;

    PerpSetup public perp;
    OtcMaker public otcMaker;

    function setUp() public virtual {
        perp = new PerpSetup();
        perp.setUp();
        otcMaker = new OtcMaker();
        otcMaker.initialize(address(perp.clearingHouse()));
        otcMaker.setCaller(otcCaller);
        usdc = perp.usdc();
    }

    modifier prepareCaller(uint256 balance) {
        deal(address(usdc), otcCaller, balance);
        vm.startPrank(otcCaller);
        usdc.approve(address(otcMaker), type(uint256).max);
        _;
        vm.stopPrank();
    }
}
