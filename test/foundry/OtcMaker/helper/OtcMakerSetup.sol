// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";

import { PerpSetup } from "../../helper/perp/PerpSetup.sol";
import { OtcMaker } from "../../../../contracts/otcMaker/OtcMaker.sol";
import { TestERC20 } from "../../../../contracts/test/TestERC20.sol";

contract OtcMakerSetup is Test {
    address public otcMakerOwner = makeAddr("otcMakerOwner");
    address public alice = makeAddr("alice");
    address public otcMakerCaller = makeAddr("otcMakerCaller");
    TestERC20 public usdc;

    PerpSetup public perp;
    OtcMaker public otcMaker;

    function setUp() public virtual {
        perp = new PerpSetup();
        perp.setUp();
        otcMaker = new OtcMaker();
        otcMaker.initialize(address(perp.clearingHouse()));
        otcMaker.setCaller(otcMakerCaller);
        otcMaker.setOwner(otcMakerOwner);

        vm.prank(otcMakerOwner);
        otcMaker.updateOwner();

        usdc = perp.usdc();
    }

    function _topUpUsdc(address to, uint256 amount) internal {
        deal(address(usdc), to, amount);
    }

    modifier prepareCaller(uint256 balance) {
        _topUpUsdc(otcMakerCaller, balance);
        vm.startPrank(otcMakerCaller);
        usdc.approve(address(otcMaker), type(uint256).max);
        _;
        vm.stopPrank();
    }

    modifier prepareOwner(uint256 balance) {
        _topUpUsdc(otcMakerOwner, balance);
        vm.startPrank(otcMakerOwner);
        usdc.approve(address(otcMaker), type(uint256).max);
        _;
        vm.stopPrank();
    }
}
