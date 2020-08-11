'use strict';
require('dotenv').config();
import { MapRenderer } from './app/MapRenderer';
import { WorkerProcess } from './app/WorkerProcess';
import { worker } from 'cluster';
import { Logger, Loglevel } from './util';



// Workaround for pgk/nexe, without worker.js is not included into the executable
export const nexe = true;
if (worker) {

	const [, , processType] = process.argv;
	let Application: WorkerProcess = null;

	process.title = `${worker.id}-${processType}`;
	const timer: NodeJS.Timer = setTimeout(() => { st(); }, 250);
	const st = function () {
		const numJobs = (Application as MapRenderer).jobs;
		process.title = `${processType}-${worker.id}: ` + (numJobs ? 'rendering ' + numJobs + ' jobs' : 'IDLE');
		timer.refresh();
	};

	switch (processType) {
		case 'maprenderer':
			Application = MapRenderer.getInstance();
			break;
		default:
			Logger(Loglevel.WARNING, 'worker', 'Invalid module');
			break;
	}

	if (Application) {
		process.on('message', (msg: any) => {
			if (typeof msg == "string") {

				switch (msg) {
					case 'shutdown':
					case 'reboot':
						Application.destroy().then(() => {
							process.exit();
						});
						break;

					default:
						Logger(Loglevel.ERROR, 'worker', `Invalid message ${msg}`);
						break;
				}
			} else {
				switch (msg.type) {
					case "job":
						(Application as MapRenderer).addJob(msg.x, msg.y, msg.hash, msg.client);
						// console.log(LOGTAG.DEBUG,`Job for ${msg.x}x ${msg.y} received`);
						break;
				}
			}
		});
	}
}