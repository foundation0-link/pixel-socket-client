#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    source .env
else
    echo "Error: .env file not found"
    exit 1
fi

# Create a temporary copy of app.ts with values replaced
cp app.ts app.tmp.ts
sed -i "s|__PIXEL_SOCKET_URL__|${PIXEL_SOCKET_URL}|g" app.tmp.ts
sed -i "s|__SAVE_DIRECTORY__|${SAVE_DIRECTORY}|g" app.tmp.ts

# Compile with the temporary file
deno compile \
    --target x86_64-pc-windows-msvc \
    --output pixel-socket.exe \
    --icon pixel-socket.ico \
    --allow-net \
    --allow-read \
    --allow-write="./received_images" \
    app.tmp.ts

# Clean up temporary file
rm app.tmp.ts

echo "Build complete: pixel-socket.exe"
