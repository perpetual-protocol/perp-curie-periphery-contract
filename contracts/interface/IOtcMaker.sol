// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { IOtcMakerEvent } from "./IOtcMakerEvent.sol";
import { IOtcMakerStruct } from "./IOtcMakerStruct.sol";

interface IOtcMaker is IOtcMakerStruct, IOtcMakerEvent {}
