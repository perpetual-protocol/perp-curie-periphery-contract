// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";
import { IMerkleRedeem } from "../../../contracts/interface/IMerkleRedeem.sol";
import { MockMerkleRedeem } from "./mocks/MockMerkleRedeem.sol";

contract OtcMakerClaimWeekTest is OtcMakerSetup {
    function test_claimWeek() public {
        vm.startPrank(otcMakerFundOwner);
        address merkleRedeem = address(new MockMerkleRedeem());

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = (0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff);
        bytes memory callData = abi.encodeWithSelector(
            IMerkleRedeem.claimWeek.selector,
            address(perp.vault()),
            100,
            200,
            proof
        );
        vm.mockCall(merkleRedeem, callData, "");

        vm.expectCall(merkleRedeem, callData);
        otcMaker.claimWeek(merkleRedeem, address(perp.vault()), 100, 200, proof);
        vm.stopPrank();
    }
}
