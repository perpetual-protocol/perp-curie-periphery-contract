// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { OtcMaker } from "../otcMaker/OtcMaker.sol";

contract TestOtcMaker is OtcMaker {
    //
    // EXTERNAL NON-VIEW
    //

    //
    // EXTERNAL VIEW
    //

    function obtainSigner(OpenPositionForParams calldata openPositionForParams, bytes calldata signature)
        external
        view
        returns (address)
    {
        return _obtainSigner(openPositionForParams, signature);
    }
}
