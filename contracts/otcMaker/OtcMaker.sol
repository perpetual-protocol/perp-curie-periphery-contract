// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { IOtcMaker } from "../interface/IOtcMaker.sol";
import { OtcMakerStorageV1 } from "../storage/OtcMakerStorage.sol";

contract OtcMaker is IOtcMaker, OtcMakerStorageV1 {}
