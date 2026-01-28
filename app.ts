import { PixelSocket } from "./pixel_socket.ts";

const url = "__PIXEL_SOCKET_URL__";
const saveDirectory = "__SAVE_DIRECTORY__";
console.log("[Config] Using URL:", url);
console.log("[Config] Using save directory:", saveDirectory);

const client = new PixelSocket({
    url,
    saveDirectory,
    onConnect: () => {
        console.log("Connected to WebSocket server");
    },
});

await client.connect();
