import type {
    ConnectionStats,
    ImageGeneratedMessage,
    ImageMetadata,
    PixelSocketOptions,
} from "./types.ts";

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

    constructor(options: PixelSocketOptions) {
        this.options = {
            autoReconnect: true,
            reconnectDelay: 5000,
            maxReconnectAttempts: 10,
            saveDirectory: "./images", // More explicit default directory name
            onImage: () => { },
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

                if (
                    this.shouldReconnect &&
                    this.options.autoReconnect &&
                    this.stats.reconnectAttempts < this.options.maxReconnectAttempts
                ) {
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
                // Binary data - treat as image
                const imageData = new Uint8Array(event.data);
                await this.processImage(imageData);
            } else if (typeof event.data === "string") {
                // Text data - parse JSON message
                try {
                    const parsed = JSON.parse(event.data);

                    if (parsed.type === "image-generated" && parsed.data) {
                        // Validate the message structure before processing
                        if (this.isValidImageGeneratedMessage(parsed)) {
                            await this.handleImageGeneratedMessage(parsed as ImageGeneratedMessage);
                        } else {
                            console.warn("[PixelSocket] Received invalid image-generated message structure");
                        }
                    } else if (parsed.image && parsed.metadata) {
                        // Legacy format: Image data with metadata in JSON format
                        const imageData = this.base64ToUint8Array(parsed.image);
                        await this.processImage(imageData, parsed.metadata);
                    } else {
                        console.log("[PixelSocket] Received message:", parsed);
                    }
                } catch (parseError) {
                    // Not JSON, might be base64 encoded image
                    console.log("[PixelSocket] Message is not JSON, attempting base64 decode");
                    try {
                        const imageData = this.base64ToUint8Array(event.data);
                        await this.processImage(imageData);
                    } catch (decodeError) {
                        console.error("[PixelSocket] Failed to decode message:", decodeError);
                    }
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
     * Validate image-generated message structure
     */
    private isValidImageGeneratedMessage(msg: unknown): boolean {
        if (typeof msg !== "object" || msg === null) return false;

        const message = msg as Record<string, unknown>;
        if (message.type !== "image-generated") return false;

        const data = message.data as Record<string, unknown>;
        if (!data || typeof data !== "object") return false;

        // Check required fields
        return (
            typeof data.base64Data === "string" &&
            typeof data.mimeType === "string" &&
            typeof data.timestamp === "number"
        );
    }

    /**
     * Handle image-generated message format
     */
    private async handleImageGeneratedMessage(
        message: ImageGeneratedMessage,
    ): Promise<void> {
        const { data } = message;

        // Decode base64 image data
        const imageData = this.base64ToUint8Array(data.base64Data);

        // Extract format from MIME type
        const format = data.mimeType.split("/")[1] || "png";

        // Build metadata object
        const metadata: ImageMetadata = {
            timestamp: new Date(data.timestamp || Date.now()),
            format,
            mimeType: data.mimeType,
            filename: data.imageInfo?.filename,
            width: data.params?.width,
            height: data.params?.height,
            params: data.params,
            promptId: data.promptId,
            imageIdx: data.imageIdx,
            imageLength: data.imageLength,
            mode: data.mode,
        };

        await this.processImage(imageData, metadata);
    }

    /**
     * Process received image data
     */
    private async processImage(
        imageData: Uint8Array,
        metadata?: Partial<ImageMetadata>,
    ): Promise<void> {
        const fullMetadata: ImageMetadata = {
            timestamp: new Date(),
            ...metadata,
        };

        this.stats.imagesReceived++;
        this.stats.bytesReceived += imageData.length;

        console.log(
            `[PixelSocket] Received image #${this.stats.imagesReceived} (${imageData.length} bytes)`,
        );

        // Call user callback
        this.options.onImage(imageData, fullMetadata);

        // Save to file if directory is specified
        if (this.options.saveDirectory) {
            await this.saveImage(imageData, fullMetadata);
        }
    }

    /**
     * Save image to disk
     */
    private async saveImage(
        imageData: Uint8Array,
        metadata: ImageMetadata,
    ): Promise<void> {
        try {
            // Create directory if it doesn't exist
            await Deno.mkdir(this.options.saveDirectory, { recursive: true });

            // Generate filename based on timestamp
            const timestamp = metadata.timestamp.getTime();
            const format = metadata.format || this.detectImageFormat(imageData);
            const filename = `${timestamp}.${format}`;
            const filepath = `${this.options.saveDirectory}/${filename}`;

            await Deno.writeFile(filepath, imageData);
            console.log(`[PixelSocket] Saved image to ${filepath}`);
        } catch (error) {
            const err = error instanceof Error
                ? error
                : new Error("Failed to save image");
            console.error("[PixelSocket] Error saving image:", err);
            this.options.onError(err);
        }
    }

    /**
     * Detect image format from binary data
     */
    private detectImageFormat(data: Uint8Array): string {
        // Check magic bytes for common image formats
        if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
            return "jpg";
        }
        if (
            data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E &&
            data[3] === 0x47
        ) {
            return "png";
        }
        if (
            data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 &&
            data[3] === 0x46
        ) {
            return "webp";
        }
        if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
            return "gif";
        }
        return "bin";
    }

    /**
     * Convert base64 string to Uint8Array
     */
    private base64ToUint8Array(base64: string): Uint8Array {
        try {
            // Remove data URL prefix if present
            const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");

            // Validate base64 string
            if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
                throw new Error("Invalid base64 string");
            }

            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        } catch (error) {
            const err = error instanceof Error
                ? error
                : new Error("Failed to decode base64 data");
            console.error("[PixelSocket] Base64 decode error:", err);
            throw err;
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
        console.log(
            `[PixelSocket] Reconnecting in ${this.options.reconnectDelay}ms (attempt ${this.stats.reconnectAttempts}/${this.options.maxReconnectAttempts})`,
        );

        this.reconnectTimeout = setTimeout(() => {
            this.connect().catch((error) => {
                console.error("[PixelSocket] Reconnection failed:", error);
            });
        }, this.options.reconnectDelay);
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
}
