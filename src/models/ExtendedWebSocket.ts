import * as WebSocket from "ws";

export interface ExtendedWebSocket extends WebSocket {
    clientData?: {
        type: string,
        clientId: string,
        [key: string]: any
    }
}