import { cfg } from './config';
import { LOGTAG } from './lib/models/Config';
import { MapRenderer } from './MapRenderer';
import { WorkerProcess } from './WorkerProcess';
import { worker } from 'cluster';

const processType = process.argv[2];
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
        !cfg.log.warn ? null : console.log(LOGTAG.WARN, 'Invalid module');
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
                    console.log(LOGTAG.ERROR, `Invalid message ${msg}`);
                    break;
            }
        } else {
            switch (msg.type) {
                case "job":
                    (Application as MapRenderer).addJob(msg.x, msg.y, msg.hash);
                    break;
            }
        }
    });
}