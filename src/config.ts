import { Config } from "./lib/models/Config";
import { ConfigLoader } from "./lib/tools/ConfigLoader";
import { resolve } from "path";

export interface BaseConfig extends Config {
	map: {
		isGameServer: boolean,		// if true then rawPath is used with FSWatch, if false we use WebSocket Server
		rawPath: string,			// root path of raw mt* files
		destinationPath: string		// path to the converted map images
	},
	websocket: {					// WebSocket settings
		host: string,
		port: number
	},
	renderer:{
		nodes: number,
		tick: number
	}
}

var C = ConfigLoader.getInstance<BaseConfig>(resolve(__dirname, "..", "config"));

export var cfg: BaseConfig = C.cfg;