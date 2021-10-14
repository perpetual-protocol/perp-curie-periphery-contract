// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import { BaseRelayRecipient } from "@perp/lushan/contracts/gsn/BaseRelayRecipient.sol";

contract TestMetaTxRecipient is BaseRelayRecipient, Initializable {
    address public pokedBy;

    function __TestMetaTxRecipient_init(address trustedForwarderArg) external initializer {
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
