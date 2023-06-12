// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { OtcMakerSetup } from "./helper/OtcMakerSetup.sol";
import { IAccountBalance } from "@perp/curie-contract/contracts/interface/IAccountBalance.sol";

contract OtcMakerGetterTest is OtcMakerSetup {
    function test_isMarginSufficient() public prepareFundOwner(5) {
        assertTrue(otcMaker.isMarginSufficient() == true);

        usdc.approve(address(otcMaker), type(uint256).max);
        otcMaker.deposit(address(usdc), 5);

        assertTrue(otcMaker.isMarginSufficient() == true);

        vm.mockCall(
            address(perp.accountBalance()),
            abi.encodeWithSelector(IAccountBalance.getTotalAbsPositionValue.selector),
            abi.encode(10 * 10**(18 - usdc.decimals()))
        ); // margin ratio = 5 / 10 = 50%, leverage = 2x

        assertTrue(otcMaker.isMarginSufficient() == true);

        vm.mockCall(
            address(perp.accountBalance()),
            abi.encodeWithSelector(IAccountBalance.getTotalAbsPositionValue.selector),
            abi.encode(11 * 10**(18 - usdc.decimals()))
        ); // margin ratio = 5 / 11 = 45.4545%, leverage = 2.2x

        assertTrue(otcMaker.isMarginSufficient() == false);
    }
}
