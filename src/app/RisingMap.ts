import { Logger, Loglevel } from "@/util";
import { fork as forkChild, setupMaster, Worker as clusterWorker } from "cluster";
import { createHash } from "crypto";
import { FSWatcher, mkdirSync, readFileSync, watch as watchFs, writeFileSync } from "fs";
import { resolve } from "path";
import * as WebSocket from "ws";
// import { WorkerProcess } from "./WorkerProcess";
import { ExtendedWebSocket } from "../models/ExtendedWebSocket";
import { cwd } from "process";

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
		if ([true, 1, 'true', '1'].includes(process.env.MAP_GAMESERVER.toLowerCase())) {
			Logger(Loglevel.DEBUG, 'RisingMap', "[RisingMap] => initFSWatch");
			this.initFSWatch();
		}
		if ([true, 1, 'true', '1'].includes(process.env.APP_WSS_ENABLED.toLowerCase())) {
			Logger(Loglevel.DEBUG, 'RisingMap', "[RisingMap] => initWSServer");
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
		Logger(Loglevel.INFO, 'RisingMap', "[initWSServer]", `Starting WebSocket Server @${process.env.APP_WSS_HOST}:${process.env.APP_WSS_PORT}`);
		this.wsServer = new WebSocket.Server({ host: process.env.APP_WSS_HOST, port: Number(process.env.APP_WSS_PORT) });
		this.wsServer.on('connection', (ws: ExtendedWebSocket, req) => {
			const [, type, client] = req.url.split("/");

			const remoteAddr = req.headers['x-forwarded-for'] + '' || req.connection.remoteAddress;

			ws.clientData = ws.clientData || { clientId: null, type: null };
			ws.clientData.type = type;
			ws.clientData.clientId = createHash("sha256").update(remoteAddr).digest("hex");

			// TODO refactor, save whitelist somewhere else
			const whitelist = [];

			if (whitelist.length > 0 && !whitelist.includes(remoteAddr)) {
				ws.send(Buffer.from([0x00, "Your client is not whitelisted, bye"]));
				ws.terminate();
			} else {
				const response = Buffer.from(ws.clientData.clientId);
				ws.send(Buffer.concat([Buffer.of(0x02), response]));
				Logger(Loglevel.INFO, 'RisingMap', "[connection]", `Client <${type}> connected from ${remoteAddr}`);

				if (type == "rmp") {
					this.setupMapPluginClient(ws);
				} else if (type == "rmf") {
					// this.setupMapFrontendClient(ws);
				}

				ws.on("close", (code, reason) => {
					Logger(Loglevel.INFO, 'RisingMap', "[connection]", `Client ${remoteAddr} of type <${type}> disconnected with code ${code} and reason ${reason}`);
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
				Logger(Loglevel.WARNING, 'RisingMap', "[setupMapPluginClient]", "non buffer message: ", data);
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
		Logger(Loglevel.INFO, 'RisingMap', "[initFSWatch]", `Watching ${process.env.MAP_RAW_PATH}`);
		this.fsw = watchFs(process.env.MAP_RAW_PATH, (event: string, f: string) => {
			// console.log(event, f);
			if (f.startsWith("mt")) {

				if (!this.WatchMap.has(f)) {
					const T = setTimeout(() => {
						const [_, px, py] = f.split("_");
						const mapFilePath = resolve(process.env.MAP_RAW_PATH, f);
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
		Logger(Loglevel.DEBUG, 'RisingMap', "[sendRenderingJobToWorker:MapTile]", `MapTile ${x} ${y} <${mapHash}> for <${client}>`);
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
			Logger(Loglevel.ERROR, 'RisingMap', "[sendRenderingJobToWorker:writeFileSync]", error);
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
		if (this.rendererList.length >= Number(process.env.RENDERER_NODES)) {
			return;
		}


		let W: clusterWorker = null;
		const type = "maprenderer";
		setupMaster({
			exec: cwd() + "/dist/worker.js",
			args: [type] //, x + '', y + '', mapHash
		});
		W = forkChild();

		this.rendererList.push(W);

		W.on("exit", (c: number, s: string) => {
			Logger(Loglevel.WARNING, 'RisingMap', '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: exited`);
		});

		W.on("close", (c: number, s: string) => {
			Logger(Loglevel.WARNING, 'RisingMap', '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: closed`);
		}).on("disconnect", () => {
			Logger(Loglevel.WARNING, 'RisingMap', '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: disconnected`);
		}).on("error", (e: Error) => {
			Logger(Loglevel.WARNING, 'RisingMap', '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: error ${e.toString()}`);
		}).on("message", (msg: any) => {
			Logger(Loglevel.DEBUG, 'RisingMap', '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: ${msg}`);
		}).on("online", () => {
			Logger(Loglevel.INFO, 'RisingMap', '[RisingMap:initWorker]', `Worker[${W.id}/${type}]: online`);
		});
	}

	public destroy() {
		this.fsw.close();
	}
}