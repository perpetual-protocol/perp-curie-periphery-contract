// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import { IStdReference } from "../interface/bandProtocol/IStdReference.sol";

contract TestStdReference is IStdReference {
    ReferenceData public refData;

    constructor() {}

    function setReferenceData(ReferenceData memory _refData) public {
        refData = _refData;
    }

    function getReferenceData(string memory _base, string memory _quote)
        external
        view
        override
        returns (ReferenceData memory)
    {
        return refData;
    }

    function getReferenceDataBulk(string[] memory _bases, string[] memory _quotes)
        external
        view
        override
        returns (ReferenceData[] memory)
    {
        revert();
    }
}
