import { fork as forkChild, setupMaster, Worker as clusterWorker, workers } from "cluster";
import { createHash } from "crypto";
import * as WebSocket from "ws";
import { BaseConfig, cfg as config, cfg } from "./config";
import { LOGTAG } from "./lib/models/Config";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { WorkerProcess } from "./WorkerProcess";

/**
 * this code was written down very fast, i know some parts could be more elegant and i may change them with time!
 *
 * @export
 * @class RisingMap
 */
export class RisingMap {
	protected static highlander: RisingMap = null;
	public static getInstance(): RisingMap {
		if (!RisingMap.highlander) {
			RisingMap.highlander = new RisingMap();
		}
		return RisingMap.highlander;
	}

	private get cfg(): BaseConfig {
		return config;
	}

	private wsServer: WebSocket.Server = null;

	private mapQueue: [number, number, Buffer][] = [];
	private timer: NodeJS.Timer = null;

	private rendererList: clusterWorker[] = [];
	private rotationIndex = 0;

	private constructor() {
		this.initWSServer();
		this.timer = setTimeout(() => {
			this.run();
		}, 25);
	}

	protected run() {
		if (this.mapQueue.length > 0) {
			this.sendRenderingJobToWorker(...this.mapQueue.shift());
			this.rotationIndex++;
		}
		this.initWorker();
		this.timer.refresh();
	}

	protected initWSServer(): void {
		!this.cfg.log.info ? null : console.log(LOGTAG.INFO, "[initWSServer]", `Starting WebSocket Server @${this.cfg.websocket.host}:${this.cfg.websocket.port}`);
		this.wsServer = new WebSocket.Server({ host: this.cfg.websocket.host, port: this.cfg.websocket.port });
		this.wsServer.on('connection', (ws, request) => {
			!this.cfg.log.info ? null : console.log(LOGTAG.INFO, "[connection]", `Client connected from ${request.connection.remoteAddress}`);
			ws.on('message', (data) => {
				// !this.cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[onMessage]", `Message of type ${typeof data} received`);
				if (typeof data == "object") {
					const msg: Buffer = <Buffer>data;
					const x = msg.readInt16BE(0);
					const y = msg.readInt16BE(2);
					const map = msg.slice(4);

					this.sendRenderingJobToWorker(x, y, map);
					this.rotationIndex++;
				}
			});
			ws.on("close", (code, reason) => {
				!this.cfg.log.info ? null : console.log(LOGTAG.INFO, "[connection]", `Client ${request.connection.remoteAddress} disconnected with code ${code} and reason ${reason}`);
			})
		});
	}

	protected sendRenderingJobToWorker(x: number, y: number, map: Buffer) {
		const Worker = this.rendererList[this.rotationIndex];
		if (!Worker) {
			this.rotationIndex = -1;
			this.mapQueue.push([x, y, map]);
			return;
		}
		const mapHash = createHash("sha256").update(map).digest("hex");
		!this.cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[sendRenderingJobToWorker:MapTile]", `MapTile for ${x} ${y} <${mapHash}>`);
		// Save map file to cache folder
		const cacheDir = resolve(__dirname, '..', 'cache');
		const cacheFile = resolve(__dirname, '..', 'cache', mapHash);
		try {
			mkdirSync(cacheDir, { recursive: true });
		} catch (error) {

		}

		try {
			writeFileSync(cacheFile, map);
		} catch (error) {
			console.log(LOGTAG.ERROR, "[sendRenderingJobToWorker:initWorker]", error);
			return;
		}

		Worker.send({ type: 'job', x: x, y: y, hash: mapHash });
	}

	protected initWorker(): void {

		this.rendererList = this.rendererList.filter(v => v.process.connected);
		// const curWorker = Object.keys(workers).length;
		if (this.rendererList.length >= cfg.renderer.nodes) {
			return;
		}


		let W: clusterWorker = null;
		const type = "maprenderer";
		setupMaster({
			exec: process.argv[1] + "/../worker.js",
			args: [type] //, x + '', y + '', mapHash
		});
		W = forkChild();

		this.rendererList.push(W);

		W.on("exit", (c: number, s: string) => {
			!this.cfg.log.warn ? null : console.log(LOGTAG.WARN, '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: exited`);
		});

		W.on("close", (c: number, s: string) => {
			!this.cfg.log.warn ? null : console.log(LOGTAG.WARN, '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: closed`);
		}).on("disconnect", () => {
			!this.cfg.log.warn ? null : console.log(LOGTAG.WARN, '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: disconnected`);
		}).on("error", (e: Error) => {
			!this.cfg.log.warn ? null : console.log(LOGTAG.WARN, '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: error ${e.toString()}`);
		}).on("message", (msg: any) => {
			!this.cfg.log.debug ? null : console.log(LOGTAG.DEBUG, '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: ${msg}`);
		}).on("online", () => {
			!this.cfg.log.info ? null : console.log(LOGTAG.INFO, '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: online`);
		});
	}
}