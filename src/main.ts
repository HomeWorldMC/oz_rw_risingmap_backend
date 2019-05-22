'use strict';

import { cfg } from "./config";
import { LOGTAG } from "./lib/models/Config";
import { RisingMap } from "./RisingMap";
import { nexe } from "./worker";

nexe ? null : null; // workaround to get worker into nexe compiled executable

process.title = cfg.app.title;

!cfg.log.info ? null : console.log(LOGTAG.INFO, "[main]", "Starting");

const FAC: RisingMap = RisingMap.getInstance();