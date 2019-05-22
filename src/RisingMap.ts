import { fork as forkChild, setupMaster, Worker as clusterWorker, workers } from "cluster";
import { createHash } from "crypto";
import * as WebSocket from "ws";
import { BaseConfig, cfg as config, cfg } from "./config";
import { LOGTAG } from "./lib/models/Config";
import { resolve } from "path";
import { mkdirSync, writeFileSync, FSWatcher, watch as watchFs, readFileSync, statSync } from "fs";
// import { WorkerProcess } from "./WorkerProcess";

import { ExtendedWebSocket } from "./models/ExtendedWebSocket";

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

	private fsw: FSWatcher = null;
	private WatchMap: Map<string, NodeJS.Timer> = new Map<string, NodeJS.Timer>();
	// private MapCache: Map<string, Buffer> = new Map<string, Buffer>();
	private wsServer: WebSocket.Server = null;

	private mapQueue: [number, number, Buffer, string][] = [];
	private timer: NodeJS.Timer = null;

	private rendererList: clusterWorker[] = [];
	private rotationIndex = 0;

	/**
	 *Creates an instance of RisingMap.
	 * @memberof RisingMap
	 */
	private constructor() {
		if (cfg.map.isGameServer) {
			!this.cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[RisingMap] => initFSWatch");
			this.initFSWatch();
		}
		if (cfg.websocket.enabled) {
			!this.cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[RisingMap] => initWSServer");
			this.initWSServer();
		}
		this.timer = setTimeout(() => {
			this.run();
		}, 25);
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof RisingMap
	 */
	protected run() {
		if (this.mapQueue.length > 0) {
			const [x, y, map, client] = this.mapQueue.shift();
			this.sendRenderingJobToWorker(x, y, map, client);
			this.rotationIndex++;
		}
		this.initWorker();
		this.timer.refresh();
	}

	/**
	 * this method is used when this app is not installed on the game server
	 *
	 * @protected
	 * @memberof RisingMap
	 */
	protected initWSServer(): void {
		!this.cfg.log.info ? null : console.log(LOGTAG.INFO, "[initWSServer]", `Starting WebSocket Server @${this.cfg.websocket.host}:${this.cfg.websocket.port}`);
		this.wsServer = new WebSocket.Server({ host: this.cfg.websocket.host, port: this.cfg.websocket.port });
		this.wsServer.on('connection', (ws: ExtendedWebSocket, req) => {
			const [, type, client] = req.url.split("/");

			ws.clientData = ws.clientData || { clientId: null, type: null };
			ws.clientData.type = type;
			ws.clientData.clientId = createHash("sha256").update(req.connection.remoteAddress).digest("hex");

			if (cfg.websocket.whitelist.length > 0 && !cfg.websocket.whitelist.includes(req.connection.remoteAddress)) {
				ws.send(Buffer.from([0x00, "Your client is not whitelisted, bye"]));
				ws.terminate();
			} else {

				!this.cfg.log.info ? null : console.log(LOGTAG.INFO, "[connection]", `Client <${type}> connected from ${req.connection.remoteAddress}`);

				if (type == "rmp") {
					this.setupMapPluginClient(ws);
				} else if (type == "rmf") {
					// this.setupMapFrontendClient(ws);
				}

				ws.on("close", (code, reason) => {
					!this.cfg.log.info ? null : console.log(LOGTAG.INFO, "[connection]", `Client ${req.connection.remoteAddress} of type <${type}> disconnected with code ${code} and reason ${reason}`);
				});
			}
		});
	}

	/**
	 *
	 *
	 * @protected
	 * @param {WebSocket} ws
	 * @memberof RisingMap
	 */
	protected setupMapPluginClient(ws: ExtendedWebSocket): void {
		ws.on('message', (data) => {
			if (!Buffer.isBuffer(data)) {
				!cfg.log.warn ? null : console.log(LOGTAG.WARN, "[setupMapPluginClient]", "non buffer message: ", data);
			}
			const code = (<Buffer>data).byteLength > 0 ? (<Buffer>data).readInt8(0) : null;
			const rawData = (<Buffer>data).byteLength > 0 ? Buffer.from((<Buffer>data).subarray(1)) : null;
			switch (code) {
				case 0x01: // A map tile sent from plugin
					const x = rawData.readInt32BE(0);
					const y = rawData.readInt32BE(4);
					const map = Buffer.from(rawData.subarray(8));
					this.sendRenderingJobToWorker(x, y, map, ws.clientData.clientId);
					// console.log(`x: ${x}, y:${y} map:${map.length}`);
					this.rotationIndex++;
					break;

				default:
					console.log(`Unknown data <${data.toString()}> <${(<Buffer>data).byteLength}>`);
					break;
			}
		});
		// const debug = setTimeout(() => {
		// 	console.log(`Sending debug text/buffer`);
		// 	ws.send("Hello Text");
		// 	ws.send(Buffer.from("Hello Buffer"));
		// 	debug.refresh();
		// }, 5000);
	}

	/**
	 * this method is used when this app is directly installed on the game server
	 *
	 * @protected
	 * @memberof RisingMap
	 */
	protected initFSWatch() {
		!this.cfg.log.info ? null : console.log(LOGTAG.INFO, "[initFSWatch]", `Watching ${this.cfg.map.rawPath}`);
		this.fsw = watchFs(this.cfg.map.rawPath, (event: string, f: string) => {
			// console.log(event, f);
			if (f.startsWith("mt")) {

				if (!this.WatchMap.has(f)) {
					const T = setTimeout(() => {
						const [_, px, py] = f.split("_");
						const mapFilePath = resolve(this.cfg.map.rawPath, f);
						const mapFile = readFileSync(mapFilePath);
						this.sendRenderingJobToWorker(Number(px), Number(py), mapFile, "localhost");
						this.rotationIndex++;

					}, 2000);
					this.WatchMap.set(f, T);
				}
				this.WatchMap.get(f).refresh();
			}
		});
	}

	/**
	 *
	 *
	 * @protected
	 * @param {number} x
	 * @param {number} y
	 * @param {Buffer} map
	 * @returns
	 * @memberof RisingMap
	 */
	protected sendRenderingJobToWorker(x: number, y: number, map: Buffer, client: string) {
		const Worker = this.rendererList[this.rotationIndex];
		if (!Worker) {
			this.rotationIndex = -1;
			this.mapQueue.push([x, y, map, client]);
			return;
		}
		const mapHash = createHash("sha256").update(map).digest("hex");
		!this.cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[sendRenderingJobToWorker:MapTile]", `MapTile ${x} ${y} <${mapHash}> for <${client}>`);
		// Save map file to cache folder
		const cacheDir = resolve(process.cwd(), 'cache');
		const cacheFile = resolve(process.cwd(), 'cache', mapHash);
		try {
			mkdirSync(cacheDir, { recursive: true });
		} catch (error) {

		}

		try {
			writeFileSync(cacheFile, map);
		} catch (error) {
			console.log(LOGTAG.ERROR, "[sendRenderingJobToWorker:writeFileSync]", error);
			return;
		}

		Worker.send({ type: 'job', x: x, y: y, hash: mapHash, client: client });
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {void}
	 * @memberof RisingMap
	 */
	protected initWorker(): void {

		this.rendererList = this.rendererList.filter(v => v.process.connected);
		// const curWorker = Object.keys(workers).length;
		if (this.rendererList.length >= cfg.renderer.nodes) {
			return;
		}


		let W: clusterWorker = null;
		const type = "maprenderer";
		setupMaster({
			exec: __dirname + "/worker.js",
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

	public destroy() {
		this.fsw.close();
	}
}