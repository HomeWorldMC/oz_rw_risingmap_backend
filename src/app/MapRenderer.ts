import { Canvas, createCanvas, loadImage, Image } from 'canvas';
import { accessSync, createWriteStream, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { resolve } from "path";
import { gunzipSync } from "zlib";
import { cfg } from '../config';
import { LOGTAG } from '../lib/models/Config';
import { WorkerProcess } from './WorkerProcess';

export interface RawTile {
	z: number,
	x: number,
	y: number,
	raw: Buffer,
	client: string
};

export interface MapTile {
	z: number,
	x: number,
	y: number,
	image: Canvas,
	client: string
}

export interface ZoomCoords {
	x: number, 			// Tile x
	y: number, 			// Tile y
	sx: number, 		// Tile-Sub-x
	sy: number, 		// Tile-Sub-y
	factor: number 		// Zoom Factor
}

export class MapRenderer extends WorkerProcess {
	protected static highlander: MapRenderer = null;
	public static getInstance(): MapRenderer {
		if (!MapRenderer.highlander) {
			MapRenderer.highlander = new MapRenderer();
		}
		return MapRenderer.highlander;
	}

	private get originZoom(): number {
		return 4;
	}

	private get mapTargetPath(): string {
		return cfg.map.destinationPath;
	}

	private jobQueue: [number, number, string, string][] = [];
	private timer: NodeJS.Timer = null;

	/**
	 *
	 *
	 * @readonly
	 * @type {number}
	 * @memberof MapRenderer
	 */
	public get jobs(): number {
		return this.jobQueue.length;
	}

	/**
	 *Creates an instance of MapRenderer.
	 * @memberof MapRenderer
	 */
	private constructor() {
		super();
		this.timer = setTimeout(() => {
			this.run();
		}, cfg.renderer.tick);
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof MapRenderer
	 */
	protected async run() {
		if (this.jobs) {
			const [x, y, map, client] = this.jobQueue.shift();
			const MT = await this.startRendering(x, y, map, client);
		}
		this.timer.refresh();
	}

	/**
	 *
	 *
	 * @param {number} x
	 * @param {number} y
	 * @param {string} hash
	 * @memberof MapRenderer
	 */
	public addJob(x: number, y: number, hash: string, client: string) {
		this.jobQueue.push([x, y, hash, client]);
	}

	/**
	 *
	 *
	 * @private
	 * @param {number} x
	 * @param {number} y
	 * @param {string} hash
	 * @returns {Promise<MapTile>}
	 * @memberof MapRenderer
	 */
	private async startRendering(x: number, y: number, hash: string, client: string): Promise<MapTile> {
		const cacheFile = resolve(process.cwd(), 'cache', hash);
		try {
			accessSync(cacheFile);
			const frs = readFileSync(cacheFile);
			const raw = gunzipSync(frs);
			let Layer = this.convertRawTile({
				z: this.originZoom,
				x: -Number(x),
				y: -Number(y),
				raw: raw,
				client: client
			});
			let z = this.originZoom;
			do {
				Layer = await this.saveTile(Layer, z);

				z--;
			} while (z >= 0);
			unlinkSync(cacheFile);
			return Layer;
		} catch (error) {
			console.log(LOGTAG.ERROR, error);
			return null;
		}
	}

	// public loadRawFileSync(filename: string): RawTile {
	// 	const [_, px, py] = filename.split("_");
	// 	const tilePath = resolve(this.mapRootPath, filename);
	// 	try {
	// 		accessSync(tilePath);
	// 		const frs = readFileSync(tilePath);
	// 		const raw = gunzipSync(frs);

	// 		return {
	// 			z: this.originZoom,
	// 			x: -Number(px),
	// 			y: -Number(py),
	// 			raw: raw
	// 		}
	// 	} catch (error) {
	// 		throw error;
	// 	}
	// }

	/**
	 *
	 *
	 * @param {RawTile} rt
	 * @returns {MapTile}
	 * @memberof MapRenderer
	 */
	public convertRawTile(rt: RawTile): MapTile {
		const C: Canvas = createCanvas(256, 256);
		const ctx = C.getContext('2d');

		let offset = 0;
		let index = 0;
		let x = 0, y = 0;
		while (offset < rt.raw.byteLength) {

			const red = rt.raw.readUInt8(offset + 0);
			const green = rt.raw.readUInt8(offset + 1);
			const blue = rt.raw.readUInt8(offset + 2);
			const alpha = rt.raw.readUInt8(offset + 3);

			y = 255 - Math.floor(index / 256);
			x = index % 256;

			const idata: ImageData = ctx.getImageData(x, y, 1, 1);

			idata.data[0] = red;
			idata.data[1] = green;
			idata.data[2] = blue;
			idata.data[3] = alpha;
			ctx.putImageData(idata, x, y);

			index++;
			offset = index * 4;
		}

		return {
			z: rt.z,
			x: rt.x,
			y: rt.y,
			image: C,
			client: rt.client
		}
	}

	/**
	 *
	 *
	 * @param {MapTile} mt
	 * @param {number} zoomLevel
	 * @returns {Promise<MapTile>}
	 * @memberof MapRenderer
	 */
	public async saveTile(mt: MapTile, zoomLevel: number): Promise<MapTile> {
		const coords = zoomLevel < mt.z ? this.translateCoords(mt, zoomLevel) : {
			x: mt.x,
			y: mt.y,
			sx: 0,
			sy: 0,
			factor: 1
		};

		const zoomPath = resolve(this.mapTargetPath, mt.client, zoomLevel + '');
		const xPath = resolve(zoomPath, coords.x + '');
		const targetImagePath = resolve(xPath, coords.y + ".png");
		const targetLockFilePath = resolve(xPath, coords.y + ".lock");

		try {
			accessSync(xPath);
		} catch (e) {
			mkdirSync(xPath, { recursive: true });
		}

		try {
			accessSync(targetLockFilePath);
			!cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[saveTile]", `Waiting for ${targetImagePath}`);
			return new Promise<MapTile>((resolve) => {
				setTimeout(() => {
					resolve(this.saveTile(mt, zoomLevel));
				}, 250);
			});
		} catch (error) {
			writeFileSync(targetLockFilePath, "");
			!cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[saveTile]", `wrote lockfile ${targetLockFilePath}`);
		}
		!cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[saveTile]", `Saving ${targetImagePath}`);
		const tCanvas = await this.loadTargetTileImage(targetImagePath);
		!tCanvas.getContext ? console.log(tCanvas) : null;
		// process.exit();

		const ctx = tCanvas.getContext('2d');
		const dSize = coords.factor * 256;
		// console.log(mt);
		ctx.drawImage(mt.image, coords.sx * 256, coords.sy * 256, dSize, dSize);

		const stream = tCanvas.createPNGStream({});

		const imageFileStream = createWriteStream(targetImagePath);
		stream.pipe(imageFileStream);

		return new Promise<MapTile>((resolve) => {
			const MT: MapTile = { image: tCanvas, x: coords.x, y: coords.y, z: zoomLevel, client: mt.client };
			imageFileStream.on('finish', () => {
				resolve(MT);
				try {
					unlinkSync(targetLockFilePath);
					!cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[saveTile]", `unlinked lockfile ${targetLockFilePath}`);
				} catch (error) {
					console.log(LOGTAG.ERROR, '[saveTile]', `Could not delete lockfile ${targetLockFilePath}`)
				}
			});
		});
	}

	/**
	 *
	 *
	 * @param {string} sourcePath
	 * @returns {Promise<Canvas>}
	 * @memberof MapRenderer
	 */
	public async loadTargetTileImage(sourcePath: string): Promise<Canvas> {

		const tCanvas = createCanvas(256, 256);
		try {
			const image = await loadImage(sourcePath);
			const ctx = tCanvas.getContext('2d');
			ctx.drawImage(image, 0, 0);
		} catch (error) {
			// just return empty Canvas
		}
		return tCanvas;
	}

	/**
	 *
	 *
	 * @param {MapTile} mt
	 * @param {number} zoomLevel
	 * @returns {ZoomCoords}
	 * @memberof MapRenderer
	 */
	public translateCoords(mt: MapTile, zoomLevel: number): ZoomCoords {

		const zoom = mt.z - zoomLevel;
		const factor = (2 * zoom); // 2 4 8 16 32
		let tx = mt.x / factor;
		let rx = tx % 1;
		let ty = mt.y / factor;
		let ry = ty % 1;
		tx = Math.floor(tx); //mt.x > 0 ? Math.floor(tx) : Math.ceil(tx);
		ty = Math.floor(ty);
		return {
			x: tx,
			y: ty,
			// sx: Math.abs(Math.abs(rx)-1+(1/factor)),
			// sy: Math.abs(Math.abs(ry)-1+(1/factor)),
			sx: Math.abs(rx),//mt.x > 0 ? Math.abs(rx) : Math.abs(Math.abs(rx) - 1 + (1 / factor)),
			sy: Math.abs(ry), //mt.y < 0 ? Math.abs(Math.abs(ry) - 1 + (1 / factor)) :
			// factor 4 = 0.25
			// 0.00 = 0.00-1.00 = -1.00+0.25 => Abs(0.75)
			// 0.25 = 0.25-1.00 = -0.75+0.25 => Abs(0.50)
			// 0.50 = 0.50-1.00 = -0.50+0.25 => Abs(0.25)
			// 0.75 = 0.75-1.00 = -0.25+0.25 => Abs(0.00)
			//
			factor: 1 / factor	// 0.5^zoom  -> 0.5, 0.25, 0.125, ...
		};
	}

	public async destroy(): Promise<boolean> {
		return true;
	}
}