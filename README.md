# PixelSocket

A Deno TypeScript WebSocket client for collecting image streams from WebSocket servers.

## Features

- 🚀 **Easy to use** - Simple API for connecting to WebSocket servers
- 📸 **Image stream handling** - Automatically receives and processes image data
- 💾 **Auto-save** - Optionally save received images to disk
- 🔄 **Auto-reconnect** - Automatic reconnection with configurable retry logic
- 📊 **Statistics tracking** - Monitor connection stats and image metrics
- 🎯 **Format detection** - Automatic detection of image formats (PNG, JPEG, WebP, GIF)
- 🔧 **Customizable** - Extensive configuration options and callbacks
- 🛡️ **Type-safe** - Full TypeScript support with detailed types

## Requirements

- [Deno](https://deno.land/) v1.30.0 or higher

## Quick Start

### Basic Usage

```typescript
import { PixelSocket } from "./pixel_socket.ts";
const client = new PixelSocket({
    url: "ws://your-pixel-socket-server/ws",
    saveDirectory: "./received_images",
    onImageReceived: (payload) => {
        console.log(`Received image: ${payload.imageLength} bytes`);
    },
    onConnect: () => {
        console.log("Connected to WebSocket server");
    },
});

await client.connect();
```

## API Documentation

### Constructor Options

```typescript
interface PixelSocketOptions {
  // Required
  url: string;                           // WebSocket server URL

  // Optional
  saveDirectory?: string;                // Directory to save images (default: "./received_images")
  autoReconnect?: boolean;               // Auto-reconnect on disconnect (default: true)
  reconnectDelay?: number;               // Delay between reconnects in ms (default: 5000)
  maxReconnectAttempts?: number;         // Max reconnection attempts (default: 10)
  
  // Callbacks
  onImageReceived?: (payload: NotificationFromPixelSocket) => void;
  onConnect?: () => void;
  onDisconnect?: (code: number, reason: string) => void;
  onError?: (error: Error) => void;
}
```

### Methods

#### `connect(): Promise<void>`
Connect to the WebSocket server.

```typescript
await client.connect();
```

#### `disconnect(): void`
Disconnect from the WebSocket server and stop auto-reconnection.

```typescript
client.disconnect();
```

#### `send(data: string | ArrayBuffer | Uint8Array): void`
Send data to the WebSocket server.

```typescript
client.send("Hello, server!");
client.send(new Uint8Array([1, 2, 3]));
```

#### `getStats(): ConnectionStats`
Get current connection statistics.

```typescript
const stats = client.getStats();
console.log(`Images received: ${stats.imagesReceived}`);
console.log(`Bytes received: ${stats.bytesReceived}`);
```

#### `isConnected(): boolean`
Check if currently connected to the server.

```typescript
if (client.isConnected()) {
  console.log("Connected!");
}
```

### Types

#### `NotificationFromPixelSocket`
```typescript
interface NotificationFromPixelSocket {
  jobId: string;                // Unique job identifier
  blobData: Uint8Array | null;  // Image binary data (null if stored in Object Storage)
  imageLength: number;          // Size of image in bytes
  fileExtension: string;        // File extension (png, jpg, webp, gif, etc.)
  mimeType: string;             // MIME type (e.g., "image/png")
  objectUrl: string | null;     // Object Storage URL (if applicable)
  secretToken: string;          // Secret token for authentication
  timestamp: number;            // Timestamp when image was received
  promptParams?: [key: string, value: any][]; // Custom prompt parameters
}
```

#### `ConnectionStats`
```typescript
interface ConnectionStats {
  imagesReceived: number;      // Total images received
  bytesReceived: number;       // Total bytes received
  connectedAt?: Date;          // Connection start time
  isConnected: boolean;        // Current connection status
  reconnectAttempts: number;   // Number of reconnection attempts
}
```

## Advanced Usage

### Understanding Message Format

PixelSocket receives messages in a binary format:

1. **Transport** - Binary WebSocket messages (ArrayBuffer)
2. **Compression** - Zstandard (zstd) compression
3. **Serialization** - MessagePack format
4. **Content** - Notification messages containing image data and metadata

#### Message Structure

After decompression and unpacking, messages have this structure:

```json
{
  "type": "notification-from-pixel-socket",
  "payload": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "blobData": <binary data>,
    "imageLength": 45678,
    "fileExtension": "png",
    "mimeType": "image/png",
    "objectUrl": null,
    "secretToken": "token_xyz",
    "timestamp": 1768307710712,
    "promptParams": [["seed", "7419854775631041493"], ["width", 1024]]
  }
}
```

PixelSocket automatically handles decompression and unpacking, providing the payload in the `onImageReceived` callback.

### Custom Image Processing

```typescript
const client = new PixelSocket({
  url: "ws://your-pixel-socket-server/ws",
  saveDirectory: "./received_images",
  onImageReceived: (payload) => {
    // Custom processing
    if (payload.imageLength > 10000) {
      console.log("Large image received!");
      // Process large images differently
    }
    
    // Access payload data
    console.log(`Format: ${payload.fileExtension}`);
    console.log(`MIME type: ${payload.mimeType}`);
    console.log(`Timestamp: ${payload.timestamp}`);
    console.log(`Job ID: ${payload.jobId}`);
    
    // Access generation parameters (if available)
    if (payload.promptParams) {
      const params = Object.fromEntries(payload.promptParams);
      console.log(`Seed: ${params.seed}`);
      console.log(`Width: ${params.width}`);
    }
  },
});
```

### Handling Disconnections

```typescript
const client = new PixelSocket({
  url: "ws://your-pixel-socket-server/ws",
  autoReconnect: true,
  reconnectDelay: 3000,
  maxReconnectAttempts: 5,
  onDisconnect: (code, reason) => {
    console.log(`Disconnected: ${code} - ${reason}`);
  },
});
```

### Sending Data to Server

```typescript
const client = new PixelSocket({
  url: "ws://your-pixel-socket-server/ws",
  onConnect: () => {
    // Send a subscription message when connected
    client.send(JSON.stringify({ type: "subscribe", mode: "all" }));
  },
});
```

## Image Format Support

PixelSocket supports various image formats through the `fileExtension` field in the notification payload:
- **PNG** - Portable Network Graphics
- **JPEG/JPG** - Joint Photographic Experts Group
- **WebP** - Web Picture format
- **GIF** - Graphics Interchange Format
- And other image formats supported by the server

Images are saved with the file extension provided by the server in the format: `{timestamp}_{jobId}.{fileExtension}`

## Error Handling

```typescript
const client = new PixelSocket({
  url: "ws://your-pixel-socket-server/ws",
  onError: (error) => {
    console.error(`Error occurred: ${error.message}`);
    // Handle error appropriately
  },
});

try {
  await client.connect();
} catch (error) {
  console.error("Failed to connect:", error);
}
```

## Use Cases

- **Video streaming** - Collect frames from video streams
- **Surveillance systems** - Receive images from security cameras
- **Real-time image processing** - Process images as they arrive
- **Image archival** - Save images from remote sources
- **Machine learning** - Collect training data
- **Remote sensing** - Receive images from IoT devices

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/0nyx-networks/pixel-socket/issues) on GitHub.
