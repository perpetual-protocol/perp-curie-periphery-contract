// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";

import { IDelegateApproval } from "@perp/curie-contract/contracts/interface/IDelegateApproval.sol";
import { PerpSetup } from "../../helper/perp/PerpSetup.sol";
import { OtcMaker } from "../../../../contracts/otcMaker/OtcMaker.sol";
import { TestERC20 } from "../../../../contracts/test/TestERC20.sol";

contract OtcMakerSetup is Test {
    address public otcMakerOwner = makeAddr("otcMakerOwner");
    address public alice;
    uint256 public alicePrivateKey;
    address public otcMakerCaller = makeAddr("otcMakerCaller");
    address public otcMakerFundOwner = makeAddr("otcMakerFundOwner");
    address public otcMakerPositionManager = makeAddr("otcMakerPositionManager");
    TestERC20 public usdc;

    PerpSetup public perp;
    OtcMaker public otcMaker;

    function setUp() public virtual {
        (alice, alicePrivateKey) = makeAddrAndKey("alice");

        perp = new PerpSetup();
        perp.setUp();
        otcMaker = new OtcMaker();
        otcMaker.initialize(address(perp.clearingHouse()), address(perp.limitOrderBook()));
        otcMaker.setCaller(otcMakerCaller);
        otcMaker.setFundOwner(otcMakerFundOwner);
        otcMaker.setPositionManager(otcMakerPositionManager);
        otcMaker.setOwner(otcMakerOwner);
        otcMaker.setMarginRatioLimit(500_000); // ratio: 50%, max leverage: 2x
        vm.startPrank(perp.limitOrderBookOwner());
        perp.limitOrderBook().setWhitelistContractCaller(address(otcMaker), true);
        vm.stopPrank();

        vm.mockCall(
            address(0),
            abi.encodeWithSelector(
                IDelegateApproval.canOpenPositionFor.selector,
                address(alice),
                address(perp.limitOrderBook())
            ),
            abi.encode(true)
        );

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

    modifier prepareFundOwner(uint256 balance) {
        _topUpUsdc(otcMakerFundOwner, balance);
        vm.startPrank(otcMakerFundOwner);
        usdc.approve(address(otcMaker), type(uint256).max);
        _;
        vm.stopPrank();
    }
}
