// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";

import { PerpSetup } from "../../helper/perp/PerpSetup.sol";
import { OtcMaker } from "../../../../contracts/otcMaker/OtcMaker.sol";

contract OtcMakerSetup is Test {
    address public alice = makeAddr("alice");
    address public otcCaller = makeAddr("otcCaller");

    PerpSetup public perp;
    OtcMaker public otcMaker;

    function setUp() public virtual {
        perp = new PerpSetup();
        perp.setUp();
        otcMaker = new OtcMaker();
        otcMaker.initialize(address(perp.clearingHouse()));
    }

    modifier prepareCaller(uint256 balance) {
        otcMaker.setCaller(otcCaller);
        deal(address(perp.usdc()), otcCaller, balance);
        vm.startPrank(otcCaller);
        _;
        vm.stopPrank();
    }
}
