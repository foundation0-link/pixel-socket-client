# Quick Start Guide

## Installation

Ensure you have [Deno](https://deno.land/) installed (v1.30.0 or higher).

## Usage

### Option 1: Configure Connection Settings

```bash
# Copy the example configuration
cp .env.example .env

# Edit .env with your server settings
editor .env
```

### Option 2: Run the Application

```bash
# Run with Deno (requires --allow-net and --allow-write permissions)
deno run --allow-net --allow-write app.ts
```

### Option 3: Use in Your Own Code

```typescript
import { PixelSocket } from "./pixel_socket.ts";

const client = new PixelSocket({
  url: "ws://your-pixel-socket-server/ws",
  saveDirectory: "./received_images",
  onImageReceived: (payload) => {
    console.log(`Image received: ${payload.imageLength} bytes`);
    
    // Access payload data
    console.log(`Job ID: ${payload.jobId}`);
    console.log(`Format: ${payload.fileExtension}`);
    console.log(`Timestamp: ${payload.timestamp}`);
    
    // Access custom parameters
    if (payload.promptParams) {
      const params = Object.fromEntries(payload.promptParams);
      console.log(`Parameters:`, params);
    }
  },
});

await client.connect();
```

## What Gets Saved?

Images are automatically saved to the `saveDirectory` with filenames based on timestamp and job ID:

```
./received_images/
  ├── 1768307710712_550e8400-e29b-41d4-a716-446655440000.png
  ├── 1768307720834_4a4ac21c-8c41-4f09-9a79-e2e5d3b74c8f.png
  └── 1768307730956_7f5d6c3e-2b1a-4e8c-9d6e-5f4c3b2a1d0e.png
```

## Message Format

The WebSocket server sends binary messages (Zstandard-compressed MessagePack) with this structure:

```json
{
  "type": "notification-from-pixel-socket",
  "payload": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "blobData": <binary image data>,
    "imageLength": 45678,
    "fileExtension": "png",
    "mimeType": "image/png",
    "objectUrl": null,
    "secretToken": "token_xyz",
    "timestamp": 1768307710712,
    "promptParams": [["seed", "7419854775631041493"], ["width", 1024], ["workflowName", "novaAnimeXL.json"]]
  }
}
```

PixelSocket automatically:
- Decompresses Zstandard-compressed data
- Unpacks MessagePack format
- Extracts image binary data and metadata
- Saves images with proper file extensions
- Provides all information in callbacks

## Common Use Cases

### Collecting AI-Generated Images

```typescript
const client = new PixelSocket({
  url: "ws://your-pixel-socket-server/ws",
  saveDirectory: "./ai_images",
  onImageReceived: (payload) => {
    console.log(`New image received: ${payload.jobId}`);
    
    if (payload.promptParams) {
      const params = Object.fromEntries(payload.promptParams);
      console.log(`Workflow: ${params.workflowName}`);
    }
  },
});
```

### Filtering Images by Size

```typescript
const client = new PixelSocket({
  url: "ws://your-pixel-socket-server/ws",
  onImageReceived: (payload) => {
    if (payload.imageLength > 100000) {
      console.log("Large high-quality image received!");
    }
  },
});
```

### Processing with Custom Logic

```typescript
const client = new PixelSocket({
  url: "ws://your-pixel-socket-server/ws",
  saveDirectory: undefined, // Don't auto-save to disk
  onImageReceived: async (payload) => {
    if (payload.blobData) {
      // Custom processing
      await processWithML(payload.blobData);
      await uploadToCloud(payload.blobData, payload);
    }
  },
});
```

## Troubleshooting

### Connection Issues

- Ensure you have network access to the WebSocket server
- Check that the URL uses `wss://` for secure connections
- Verify your firewall allows WebSocket connections

### Permission Errors

Make sure to grant the necessary permissions:
- `--allow-net` for network access
- `--allow-write` for saving images to disk

### No Images Received

- Check that the WebSocket server is actively broadcasting
- Enable error callbacks to see detailed error messages
- Verify the server is sending data in a compatible format

## Next Steps

- Read the [full documentation](README.md)
- Check out the [examples directory](examples/)
- Review the [TypeScript types](types.ts) for detailed API information
