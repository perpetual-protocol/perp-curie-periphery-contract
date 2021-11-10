// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;

import { BaseRelayRecipient } from "@perp/lushan/contracts/gsn/BaseRelayRecipient.sol";

contract TestMetaTxRecipient is BaseRelayRecipient {
    address public pokedBy;

    constructor(address trustedForwarderArg) {
        _trustedForwarder = trustedForwarderArg;
    }

    function poke() external {
        pokedBy = _msgSender();
    }

    // solhint-disable
    function error() external {
        revert("MetaTxRecipientMock: Error");
    }
}
