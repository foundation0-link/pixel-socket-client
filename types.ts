/**
 * Configuration options for the PixelSocket client
 */
export interface PixelSocketOptions {
    /**
     * WebSocket server URL to connect to
     */
    url: string;

    /**
     * Directory to save received images (optional)
     * @default "./received_images"
     */
    saveDirectory?: string;

    /**
     * Whether to automatically reconnect on connection loss
     * @default true
     */
    autoReconnect?: boolean;

    /**
     * Reconnection delay in milliseconds
     * @default 5000
     */
    reconnectDelay?: number;

    /**
     * Maximum number of reconnection attempts
     * @default 10
     */
    maxReconnectAttempts?: number;

    /**
     * Callback function when connection is established
     */
    onConnect?: () => void;

    /**
     * Callback function when connection is closed
     */
    onDisconnect?: (code: number, reason: string) => void;

    /**
     * Callback function when an error occurs
     */
    onError?: (error: Error) => void;
}

/**
 * Statistics for the PixelSocket connection
 */
export interface ConnectionStats {
    /**
     * Total number of images received
     */
    imagesReceived: number;

    /**
     * Total bytes received
     */
    bytesReceived: number;

    /**
     * Connection start time
     */
    connectedAt?: Date;

    /**
     * Current connection status
     */
    isConnected: boolean;

    /**
     * Number of reconnection attempts
     */
    reconnectAttempts: number;
}

/**
 * ComfyUI(Pixel Socket) からの通知メッセージ
 */
export interface NotificationFromPixelSocket {
    jobId: string;
    blobData: Uint8Array | null;
    imageLength: number;
    fileExtension: string;
    mimeType: string;
    objectUrl: string | null; // Object Storageに保管されている場合に付与
    secretToken: string;
    timestamp: number;
    promptParams?: [key: string, value: any][]; // 任意のプロンプトパラメータ
}
