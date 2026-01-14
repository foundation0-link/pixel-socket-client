import { PixelSocket } from "./pixel_socket.ts";
import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";

const env = await load();
const url = env.PIXEL_SOCKET_URL || "wss://vite-based-comfyui-web-interface/ws/streaming";
const saveDirectory = env.SAVE_DIRECTORY || "./images";

const client = new PixelSocket({
    url,
    saveDirectory,
    onImage: (imageData, metadata) => {
        console.log(`Received image: ${imageData.length} bytes`);
    },
    onConnect: () => {
        console.log("Connected to WebSocket server");
    },
});

await client.connect();
