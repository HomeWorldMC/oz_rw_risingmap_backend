'use strict';
import 'module-alias/register';
import { RisingMap } from "./app/RisingMap";
import { nexe } from "./worker";
import { Logger, Loglevel } from "./util";

nexe ? null : null; // workaround to get worker into nexe compiled executable

Logger(Loglevel.INFO,'app',`starting ${process.env.APP_TITLE}`);
// Set process title
process.title = process.env.APP_TITLE;

const FAC: RisingMap = RisingMap.getInstance();