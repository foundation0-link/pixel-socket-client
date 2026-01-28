import type {
    ConnectionStats,
    NotificationFromPixelSocket,
    PixelSocketOptions,
} from "./types.ts";
import { init as zstdInit, decompress as zstdDecompress } from "@bokuweb/zstd-wasm";
import { decode as msgpackDecode } from "@msgpack/msgpack";

/**
 * PixelSocket - A WebSocket client for collecting image streams
 */
export class PixelSocket {
    private socket: WebSocket | null = null;
    private options: Required<PixelSocketOptions>;
    private stats: ConnectionStats;
    private reconnectTimeout: number | null = null;
    private pingTimeout: number | null = null;
    private shouldReconnect = true;
    private zstdInitialized = false;

    constructor(options: PixelSocketOptions) {
        this.options = {
            autoReconnect: true,
            reconnectDelay: 5000,
            maxReconnectAttempts: 10,
            saveDirectory: "./received_images", // More explicit default directory name
            onImageReceived: () => { },
            onConnect: () => { },
            onDisconnect: () => { },
            onError: () => { },
            ...options,
        };

        this.stats = {
            imagesReceived: 0,
            bytesReceived: 0,
            isConnected: false,
            reconnectAttempts: 0,
        };
    }

    /**
     * Connect to the WebSocket server
     */
    async connect(): Promise<void> {
        try {
            console.log(`[PixelSocket] Connecting to: ${this.options.url}`);
            this.socket = new WebSocket(this.options.url);
            this.socket.binaryType = "arraybuffer";

            this.socket.onopen = () => {
                this.stats.isConnected = true;
                this.stats.connectedAt = new Date();
                this.stats.reconnectAttempts = 0;
                console.log(`[PixelSocket] Connected to ${this.options.url}`);

                // Send subscription message to the server
                const subscribeMessage = JSON.stringify({
                    type: 'subscribe',
                    mode: 'all',
                });
                this.socket!.send(subscribeMessage);

                // Start keep-alive ping
                this.startPingInterval();

                this.options.onConnect();
            };

            this.socket.onmessage = async (event) => {
                await this.handleMessage(event);
            };

            this.socket.onerror = (event) => {
                const error = new Error(
                    `WebSocket error: ${(event as ErrorEvent).message || "Unknown error"}`,
                );
                console.error(`[PixelSocket] Error:`, error);
                this.options.onError(error);
            };

            this.socket.onclose = (event) => {
                this.stats.isConnected = false;
                console.log(
                    `[PixelSocket] Disconnected: ${event.code} - ${event.reason}`,
                );
                this.options.onDisconnect(event.code, event.reason);

                if (this.shouldReconnect && this.options.autoReconnect) {
                    this.scheduleReconnect();
                }
            };
        } catch (error) {
            const err = error instanceof Error
                ? error
                : new Error("Failed to connect");
            this.options.onError(err);
            throw err;
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    private async handleMessage(event: MessageEvent): Promise<void> {
        try {
            if (event.data instanceof ArrayBuffer) {
                const object = await this.decompressAndUnpack(event.data);

                // デコード失敗時の処理
                if (!object) {
                    console.error('[Client] Failed to decompress or unpack message');
                    return;
                }

                // Pixel Socketからのメッセージの処理
                if (object.type === 'notification-from-pixel-socket') {
                    const payload = object.payload as NotificationFromPixelSocket;
                    await this.processImage(payload);
                }
            }
        } catch (error) {
            const err = error instanceof Error
                ? error
                : new Error("Failed to process message");
            console.error("[PixelSocket] Error processing message:", err);
            this.options.onError(err);
        }
    }

    /**
     * Process received image data
     */
    private async processImage(payload: NotificationFromPixelSocket): Promise<void> {
        this.stats.imagesReceived++;
        this.stats.bytesReceived += payload.imageLength;

        console.log(
            `[PixelSocket] Received image #${this.stats.imagesReceived} (${payload.imageLength} bytes)`,
        );

        // Save to file if directory is specified
        if (this.options.saveDirectory && payload.blobData) {
            try {
                // Create directory if it doesn't exist
                await Deno.mkdir(this.options.saveDirectory, { recursive: true });

                // Generate filename based on timestamp
                const timestamp = payload.timestamp || Date.now();
                const filename = `${timestamp}_${payload.jobId}.${payload.fileExtension}`;
                const filepath = `${this.options.saveDirectory}/${filename}`;

                await Deno.writeFile(filepath, payload.blobData);
                console.log(`[PixelSocket] Saved image to ${filepath}`);
            } catch (error) {
                const err = error instanceof Error
                    ? error
                    : new Error("Failed to save image");
                console.error("[PixelSocket] Error saving image:", err);
                this.options.onError(err);
            }
        }
    }

    /**
     * Schedule a reconnection attempt
     */
    private scheduleReconnect(): void {
        if (this.reconnectTimeout !== null) {
            clearTimeout(this.reconnectTimeout);
        }

        this.stats.reconnectAttempts++;

        // Determine delay: use reconnectDelay until maxReconnectAttempts, then use 60 seconds
        const delay = this.stats.reconnectAttempts <= this.options.maxReconnectAttempts
            ? this.options.reconnectDelay
            : 60000; // 1 minute after maxReconnectAttempts

        const attemptText = this.stats.reconnectAttempts <= this.options.maxReconnectAttempts
            ? `attempt ${this.stats.reconnectAttempts}/${this.options.maxReconnectAttempts}`
            : `attempt ${this.stats.reconnectAttempts} (ongoing)`;

        console.log(
            `[PixelSocket] Reconnecting in ${delay}ms (${attemptText})`,
        );

        this.reconnectTimeout = setTimeout(() => {
            this.connect().catch((error) => {
                console.error("[PixelSocket] Reconnection failed:", error);
            });
        }, delay);
    }

    /**
     * Start keep-alive ping interval (20 seconds)
     */
    private startPingInterval(): void {
        if (this.pingTimeout !== null) {
            clearInterval(this.pingTimeout);
        }

        this.pingTimeout = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                const pingMessage = JSON.stringify({ type: 'ping' });
                try {
                    this.socket.send(pingMessage);
                    console.log('[PixelSocket] Sent ping');
                } catch (error) {
                    console.error('[PixelSocket] Error sending ping:', error);
                }
            }
        }, 20000); // 20 seconds
    }

    /**
     * Send data to the WebSocket server
     */
    send(data: string | ArrayBuffer | Uint8Array): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected");
        }
        this.socket.send(data);
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect(): void {
        this.shouldReconnect = false;
        if (this.reconnectTimeout !== null) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.pingTimeout !== null) {
            clearInterval(this.pingTimeout);
            this.pingTimeout = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.stats.isConnected = false;
    }

    /**
     * Get connection statistics
     */
    getStats(): ConnectionStats {
        return { ...this.stats };
    }

    /**
     * Check if currently connected
     */
    isConnected(): boolean {
        return this.stats.isConnected;
    }

    /**
     * Zstd初期化（1回のみ実行）
     */
    private async ensureZstdInit(): Promise<void> {
        if (!this.zstdInitialized) {
            try {
                await zstdInit();
                this.zstdInitialized = true;
            } catch (err) {
                console.error('[Zstd] Initialization failed:', err);
                throw err;
            }
        }
    }

    /**
     *  zstd展開 + unpack
     * @param compressed
     * @returns object | undefined
     */
    private async decompressAndUnpack(compressed: ArrayBuffer): Promise<any | undefined> {
        try {
            await this.ensureZstdInit();
            const uint8Array = new Uint8Array(compressed);
            const decompressed = zstdDecompress(uint8Array).slice();
            return msgpackDecode(decompressed, {
                rawStrings: false,
                useBigInt64: true,
            });
        } catch (err) {
            console.error("[decompressAndUnpack] Failed to decompress or unpack message:", {
                error: err,
                message: err instanceof Error ? err.message : String(err),
                bufferSize: compressed.byteLength,
            });
        }
        return undefined;
    }
}
